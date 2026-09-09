-- Ejecutar como postgres/administración DESPUÉS de schema.sql.
-- Crea tres usuarios de prueba únicamente dentro de esta transacción.
-- No usa la API Auth ni envía correos. ROLLBACK elimina todos los fixtures.
-- Un error de aserción invalida la transacción: ejecutar ROLLBACK igualmente.

begin;

do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('app_members', 'corpus_assets', 'study_state')
      and not c.relrowsecurity
  ) then raise exception 'RLS must be enabled'; end if;

  if has_table_privilege('anon', 'public.corpus_assets', 'SELECT')
    or has_table_privilege('anon', 'public.study_state', 'SELECT')
    or has_table_privilege('authenticated', 'public.app_members', 'INSERT')
    or has_table_privilege('authenticated', 'public.corpus_assets', 'UPDATE')
    or has_table_privilege('authenticated', 'public.study_state', 'DELETE')
    or has_function_privilege('anon', 'public.sync_study_state(jsonb,bigint,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.reset_study_state(bigint,uuid,jsonb)', 'EXECUTE')
  then raise exception 'Unexpected privilege'; end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('sync_study_state', 'reset_study_state') and p.prosecdef
  ) then raise exception 'RPC must be SECURITY INVOKER'; end if;

  insert into auth.users (id, aud, role, email, created_at, updated_at)
    select u, 'authenticated', 'authenticated', 'schema-check-' || u || '@example.invalid', now(), now()
    from unnest(array[v_a, v_b, v_c]) as t(u);
  insert into public.app_members (user_id) values (v_a), (v_b);
  insert into public.corpus_assets(path, payload) values ('verify/' || v_a || '.json', '{"test":true}');
  perform set_config('steponemelman.verify_a', v_a::text, true);
  perform set_config('steponemelman.verify_b', v_b::text, true);
  perform set_config('steponemelman.verify_c', v_c::text, true);
  perform set_config('steponemelman.verify_state', '{"version":1,"corpus_version":"1.0.1","progreso":{},"sesiones":[],"criterios":{"recuperaciones":3,"sesiones":2,"separacionHoras":24,"exigirSinPistas":true,"exigirRecuperacionActiva":true,"ventanaConfusionDias":7},"reanudable":null,"msEstudio":0,"vistoAlguna":false}', true);
end;
$$;

set local role authenticated;

do $$
declare
  v_a uuid := current_setting('steponemelman.verify_a')::uuid;
  v_b uuid := current_setting('steponemelman.verify_b')::uuid;
  v_c uuid := current_setting('steponemelman.verify_c')::uuid;
  v_state jsonb := current_setting('steponemelman.verify_state')::jsonb;
  v_response jsonb;
  v_generation uuid;
  v_new_generation uuid;
  v_count integer;
begin
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_a then raise exception 'Auth fixture failed'; end if;
  if (select count(*) from public.app_members) <> 1 then raise exception 'Membership isolation failed'; end if;
  if not exists (select 1 from public.corpus_assets where path = 'verify/' || v_a || '.json') then
    raise exception 'Member cannot read corpus';
  end if;

  v_response := public.sync_study_state(v_state, 0, null);
  if v_response ->> 'ok' is distinct from 'true' or v_response #>> '{row,revision}' is distinct from '1'
    or v_response #>> '{row,user_id}' is distinct from v_a::text then raise exception 'First sync failed: %', v_response; end if;
  v_generation := (v_response #>> '{row,generation}')::uuid;
  if v_generation is null then raise exception 'Generation missing'; end if;

  v_response := public.sync_study_state(v_state || '{"msEstudio":99}', 0, null);
  if v_response ->> 'kind' is distinct from 'conflict' or v_response #>> '{row,state,msEstudio}' is distinct from '0' then
    raise exception 'Duplicate bootstrap overwrote state'; end if;

  v_response := public.sync_study_state(v_state || '{"msEstudio":10}', 1, v_generation);
  if v_response ->> 'ok' is distinct from 'true' or v_response #>> '{row,revision}' is distinct from '2' then
    raise exception 'Second sync failed'; end if;
  v_response := public.sync_study_state(v_state || '{"msEstudio":20}', 1, v_generation);
  if v_response ->> 'kind' is distinct from 'conflict' or v_response #>> '{row,state,msEstudio}' is distinct from '10' then
    raise exception 'Stale revision overwrote state'; end if;

  v_response := public.reset_study_state(1, v_generation, v_state);
  if v_response ->> 'kind' is distinct from 'conflict' then raise exception 'Stale reset accepted'; end if;
  v_response := public.reset_study_state(2, v_generation, v_state);
  v_new_generation := (v_response #>> '{row,generation}')::uuid;
  if v_response ->> 'ok' is distinct from 'true' or v_response #>> '{row,revision}' is distinct from '3'
    or v_new_generation is null or v_new_generation = v_generation
    or v_response #>> '{row,state,msEstudio}' is distinct from '0' then
    raise exception 'Reset did not advance generation'; end if;
  v_response := public.sync_study_state(v_state || '{"msEstudio":999}', 3, v_generation);
  if v_response ->> 'kind' is distinct from 'reset' or v_response #>> '{row,state,msEstudio}' is distinct from '0' then
    raise exception 'Old device resurrected reset progress'; end if;
  v_response := public.reset_study_state(3, v_generation, v_state);
  if v_response ->> 'kind' is distinct from 'reset' then raise exception 'Old device reset new generation'; end if;

  begin
    update public.study_state set state = '{}'::jsonb where user_id = v_a;
    raise exception 'Malformed state accepted';
  exception when check_violation then null; end;
  begin
    update public.study_state set state = v_state || jsonb_build_object('extra', repeat('x', 16777217)) where user_id = v_a;
    raise exception 'Oversized state accepted';
  exception when check_violation then null; end;
  begin
    update public.study_state set user_id = v_c where user_id = v_a;
    raise exception 'State ownership reassignment accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.app_members(user_id) values (v_c);
    raise exception 'Member self-enrollment accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.corpus_assets set payload = '{}'::jsonb;
    raise exception 'Client corpus mutation accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.study_state where user_id = v_a;
    raise exception 'Client hard deletion accepted';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.study_state) then raise exception 'User B can read user A state'; end if;
  update public.study_state set state = v_state where user_id = v_a;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'User B can update user A state'; end if;
  begin
    insert into public.study_state(user_id, state) values (v_c, v_state);
    raise exception 'User B can insert user C state';
  exception when insufficient_privilege then null; end;
  v_response := public.sync_study_state(v_state, 1, v_generation);
  if v_response ->> 'kind' is distinct from 'missing' or v_response -> 'row' is distinct from 'null'::jsonb then
    raise exception 'Unknown old device recreated missing state'; end if;
  v_response := public.reset_study_state(0, null, v_state);
  if v_response ->> 'ok' is distinct from 'true' or v_response #>> '{row,revision}' is distinct from '1' then
    raise exception 'First reset failed'; end if;

  perform set_config('request.jwt.claim.sub', v_c::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.corpus_assets) or exists (select 1 from public.study_state)
    or exists (select 1 from public.app_members) then raise exception 'Non-member access allowed'; end if;
  begin
    perform public.sync_study_state(v_state, 0, null);
    raise exception 'Non-member sync accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reset_study_state(0, null, v_state);
    raise exception 'Non-member reset accepted';
  exception when insufficient_privilege then null; end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.corpus_assets limit 1;
    raise exception 'Anon corpus access allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.sync_study_state('{}'::jsonb, 0, null);
    raise exception 'Anon RPC execution allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
select 'PASS: RLS, grants, CAS, shape, size, reset generation and user isolation' as verification;
rollback;

-- Concurrencia real: este archivo valida conflictos secuenciales y las políticas.
-- Para probar dos conexiones a la vez, usar DOS SESIONES SQL con el mismo UUID
-- de un miembro de prueba ya confirmado y sin study_state. No usar usuarios reales.
-- Sesión A: BEGIN; SET LOCAL ROLE authenticated; establecer ambos JWT como arriba;
--   SELECT sync_study_state(<estado válido>, 0, NULL); mantener transacción abierta.
-- Sesión B: BEGIN; SET LOCAL ROLE authenticated; mismo JWT;
--   SELECT sync_study_state(<otro estado válido>, 0, NULL); debe esperar el lock.
-- A: COMMIT. B: debe devolver kind='conflict', revision=1 y el estado de A; ROLLBACK.
-- Repetir con misma revisión/generación no-cero: un saved y un conflict.
-- Repetir reset en A / sync con generación vieja en B: B debe devolver kind='reset'.
-- Borrar únicamente el fixture de prueba como administración después de las pruebas.
