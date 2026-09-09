-- StepOneMelman: esquema declarativo para un proyecto Supabase vacío.
-- El corpus se carga por administración; no se incluye en el repositorio público.
-- Ejecutar todo como propietario del proyecto. No es un archivo de migración CLI.

begin;

create table public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.corpus_assets (
  path text primary key check (length(path) between 1 and 512),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.study_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  generation uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  -- Validación superficial en BD; el cliente valida cada intento antes de usarlo.
  -- IS TRUE rechaza también claves ausentes, que producirían NULL en un CHECK.
  constraint study_state_shape check ((
    jsonb_typeof(state) = 'object'
    and state -> 'version' = '1'::jsonb
    and jsonb_typeof(state -> 'corpus_version') = 'string'
    and length(state ->> 'corpus_version') between 1 and 64
    and jsonb_typeof(state -> 'progreso') = 'object'
    and jsonb_typeof(state -> 'sesiones') = 'array'
    and jsonb_typeof(state -> 'criterios') = 'object'
    and jsonb_typeof(state -> 'reanudable') in ('object', 'null')
    and jsonb_typeof(state -> 'msEstudio') = 'number'
    and state -> 'msEstudio' >= '0'::jsonb
    and jsonb_typeof(state -> 'vistoAlguna') = 'boolean'
  ) is true),
  constraint study_state_size check (octet_length(state::text) <= 16777216)
);

alter table public.app_members enable row level security;
alter table public.corpus_assets enable row level security;
alter table public.study_state enable row level security;

-- No depender de los permisos implícitos de proyectos antiguos de Supabase.
revoke all on public.app_members, public.corpus_assets, public.study_state
  from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.app_members, public.corpus_assets to authenticated;
grant select, insert, update on public.study_state to authenticated;

create policy app_members_select_self on public.app_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy corpus_assets_select_members on public.corpus_assets
  for select to authenticated
  using (exists (
    select 1 from public.app_members m where m.user_id = (select auth.uid())
  ));

create policy study_state_select_own on public.study_state
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_members m where m.user_id = (select auth.uid()))
  );

create policy study_state_insert_own on public.study_state
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_members m where m.user_id = (select auth.uid()))
  );

create policy study_state_update_own on public.study_state
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_members m where m.user_id = (select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_members m where m.user_id = (select auth.uid()))
  );

-- Las escrituras de la aplicación pasan por estas RPC. RLS permite las
-- operaciones subyacentes porque SECURITY INVOKER conserva el rol del usuario.
-- Nunca se acepta user_id desde el navegador.
create function public.sync_study_state(
  p_state jsonb,
  p_expected_revision bigint,
  p_generation uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.study_state%rowtype;
begin
  if v_user_id is null or not exists (
    select 1 from public.app_members where user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'membership_required';
  end if;
  if p_state is null or p_expected_revision is null
    or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception using errcode = '22023', message = 'invalid_sync_arguments';
  end if;

  -- También serializa el primer guardado, cuando aún no existe una fila.
  -- Una colisión hash sólo serializa dos usuarios; nunca mezcla sus datos.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 78251));
  select * into v_row from public.study_state where user_id = v_user_id for update;

  if not found then
    if p_expected_revision <> 0 or p_generation is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'kind', 'missing', 'row', null);
    end if;
    insert into public.study_state (user_id, state)
      values (v_user_id, p_state)
      on conflict (user_id) do nothing
      returning * into v_row;
    if found then
      return pg_catalog.jsonb_build_object('ok', true, 'kind', 'saved', 'row', pg_catalog.to_jsonb(v_row));
    end if;
    -- Cubre asimismo una inserción directa concurrente hecha fuera de la RPC.
    select * into v_row from public.study_state where user_id = v_user_id for update;
    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'kind', 'missing', 'row', null);
    end if;
  end if;

  if p_generation is not null and p_generation <> v_row.generation then
    return pg_catalog.jsonb_build_object('ok', false, 'kind', 'reset', 'row', pg_catalog.to_jsonb(v_row));
  end if;
  if p_generation is null or p_expected_revision <> v_row.revision then
    return pg_catalog.jsonb_build_object('ok', false, 'kind', 'conflict', 'row', pg_catalog.to_jsonb(v_row));
  end if;

  update public.study_state
    set state = p_state, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where user_id = v_user_id
    returning * into v_row;
  if not found then
    raise exception using errcode = '42501', message = 'membership_required';
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'kind', 'saved', 'row', pg_catalog.to_jsonb(v_row));
end;
$$;

create function public.reset_study_state(
  p_expected_revision bigint,
  p_generation uuid,
  p_state jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.study_state%rowtype;
begin
  if v_user_id is null or not exists (
    select 1 from public.app_members where user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'membership_required';
  end if;
  if p_state is null or p_expected_revision is null
    or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception using errcode = '22023', message = 'invalid_sync_arguments';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 78251));
  select * into v_row from public.study_state where user_id = v_user_id for update;
  if not found then
    if p_expected_revision <> 0 or p_generation is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'kind', 'missing', 'row', null);
    end if;
    insert into public.study_state (user_id, state)
      values (v_user_id, p_state)
      on conflict (user_id) do nothing
      returning * into v_row;
    if found then
      return pg_catalog.jsonb_build_object('ok', true, 'kind', 'saved', 'row', pg_catalog.to_jsonb(v_row));
    end if;
    select * into v_row from public.study_state where user_id = v_user_id for update;
    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'kind', 'missing', 'row', null);
    end if;
  end if;

  if p_generation is not null and p_generation <> v_row.generation then
    return pg_catalog.jsonb_build_object('ok', false, 'kind', 'reset', 'row', pg_catalog.to_jsonb(v_row));
  end if;
  if p_generation is null or p_expected_revision <> v_row.revision then
    return pg_catalog.jsonb_build_object('ok', false, 'kind', 'conflict', 'row', pg_catalog.to_jsonb(v_row));
  end if;

  update public.study_state
    set state = p_state, revision = revision + 1,
      generation = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.clock_timestamp()
    where user_id = v_user_id
    returning * into v_row;
  if not found then
    raise exception using errcode = '42501', message = 'membership_required';
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'kind', 'saved', 'row', pg_catalog.to_jsonb(v_row));
end;
$$;

revoke all on function public.sync_study_state(jsonb, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.reset_study_state(bigint, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_study_state(jsonb, bigint, uuid) to authenticated;
grant execute on function public.reset_study_state(bigint, uuid, jsonb) to authenticated;

comment on table public.app_members is 'Acceso privado. Sólo administración agrega o revoca miembros.';
comment on table public.corpus_assets is 'Corpus privado; lectura para miembros y escritura sólo administrativa.';
comment on table public.study_state is 'Estado por usuario. La aplicación escribe mediante RPC con revisión y generación.';

commit;
