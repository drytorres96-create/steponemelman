-- Incremental: aplicar DESPUÉS de database/schema.sql y database/nbme-schema.sql.
-- Sustituye exclusivamente los cuerpos de las dos RPC existentes, sin cambiar sus firmas,
-- permisos, RLS, controles de cuenta, revision, generation ni el historial de intentos.
-- archivedSessions y conceptosVistos sobreviven a un cliente anterior que omita esos campos.
-- Dentro de una nueva generation, reset_study_state conserva su comportamiento de reinicio.
-- Aplicado como preserve_learning_metadata; pruebas locales en docs/flujo-recuperacion-nbme/sql-compatibilidad.sql.

begin;

CREATE OR REPLACE FUNCTION public.sync_nbme_state(p_state jsonb, p_expected_revision bigint, p_generation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_row public.nbme_state%rowtype;
  v_next_state jsonb := p_state;
  v_archived jsonb;
begin
  if v_user_id is null
    or not exists (select 1 from public.nbme_members where user_id = v_user_id)
    or not exists (select 1 from public.app_members where user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'nbme_membership_required';
  end if;
  if p_state is null or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception using errcode = '22023', message = 'invalid_nbme_sync_arguments';
  end if;

  -- El campo opcional se valida antes de insertar o mezclar.
  if p_state ? 'archivedSessions' then
    if pg_catalog.jsonb_typeof(p_state->'archivedSessions') is distinct from 'object'
      or (select pg_catalog.count(*) from pg_catalog.jsonb_each(p_state->'archivedSessions')) > 20000 then
      raise exception using errcode = '22023', message = 'invalid_archived_sessions';
    end if;
    if exists (select 1 from pg_catalog.jsonb_each(p_state->'archivedSessions') e
      where e.key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' or pg_catalog.length(e.key) > 512 or e.key in ('prototype','__proto__','constructor','toString','toLocaleString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__')
        or case when pg_catalog.jsonb_typeof(e.value) = 'number'
          then (e.value #>> '{}')::numeric < 0 or (e.value #>> '{}')::numeric > 9007199254740991
          else true end) then
      raise exception using errcode = '22023', message = 'invalid_archived_sessions';
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 78252));
  select * into v_row from public.nbme_state where user_id = v_user_id for update;
  if not found then
    if p_expected_revision <> 0 or p_generation is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'kind', 'missing', 'row', null);
    end if;
    insert into public.nbme_state (user_id, state) values (v_user_id, p_state)
      on conflict (user_id) do nothing returning * into v_row;
    if found then
      return pg_catalog.jsonb_build_object('ok', true, 'kind', 'saved', 'row', pg_catalog.to_jsonb(v_row));
    end if;
    select * into v_row from public.nbme_state where user_id = v_user_id for update;
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

  -- Sólo dentro de la misma generation y después de los controles CAS.
  -- Un cliente antiguo puede omitir el campo; eso no restaura un bloque retirado.
  if v_row.state ? 'archivedSessions' or p_state ? 'archivedSessions' then
    select coalesce(pg_catalog.jsonb_object_agg(e.key, e.when_ms), '{}'::jsonb)
      into v_archived
      from (select merged.key, pg_catalog.max((merged.value #>> '{}')::numeric) as when_ms
        from (select * from pg_catalog.jsonb_each(coalesce(v_row.state->'archivedSessions', '{}'::jsonb))
          union all select * from pg_catalog.jsonb_each(coalesce(p_state->'archivedSessions', '{}'::jsonb))) merged
        group by merged.key) e;
    v_next_state := pg_catalog.jsonb_set(p_state, '{archivedSessions}', v_archived, true);
    if v_archived ? (v_next_state->>'activeSessionId') then
      v_next_state := pg_catalog.jsonb_set(v_next_state, '{activeSessionId}', 'null'::jsonb, true);
    end if;
  end if;
  update public.nbme_state set state = v_next_state, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where user_id = v_user_id returning * into v_row;
  if not found then raise exception using errcode = '42501', message = 'nbme_membership_required'; end if;
  return pg_catalog.jsonb_build_object('ok', true, 'kind', 'saved', 'row', pg_catalog.to_jsonb(v_row));
end;
$function$;


CREATE OR REPLACE FUNCTION public.sync_study_state(p_state jsonb, p_expected_revision bigint, p_generation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_row public.study_state%rowtype;
  v_next_state jsonb := p_state;
  v_views jsonb;
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

  if p_state ? 'conceptosVistos' then
    if pg_catalog.jsonb_typeof(p_state->'conceptosVistos') is distinct from 'object'
      or (select pg_catalog.count(*) from pg_catalog.jsonb_each(p_state->'conceptosVistos')) > 100000 then
      raise exception using errcode = '22023', message = 'invalid_concept_views';
    end if;
    if exists (select 1 from pg_catalog.jsonb_each(p_state->'conceptosVistos') e
      where pg_catalog.length(e.key) not between 1 and 512 or e.key in ('prototype','__proto__','constructor','toString','toLocaleString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__')
        or case when pg_catalog.jsonb_typeof(e.value) = 'object'
          and pg_catalog.jsonb_typeof(e.value->'primera') = 'number'
          and pg_catalog.jsonb_typeof(e.value->'ultima') = 'number'
          and pg_catalog.jsonb_typeof(e.value->'preguntaId') = 'string' then
          (e.value->>'primera')::numeric < 0
          or (e.value->>'ultima')::numeric < (e.value->>'primera')::numeric
          or (e.value->>'ultima')::numeric > 9007199254740991
          or pg_catalog.length(e.value->>'preguntaId') not between 1 and 512
          or e.value->>'preguntaId' in ('prototype','__proto__','constructor','toString','toLocaleString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__')
          else true end) then
      raise exception using errcode = '22023', message = 'invalid_concept_views';
    end if;
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

  -- MIN(primera), MAX(ultima), y el mismo desempate por preguntaId que el cliente.
  -- La clave de orden usa unidades UTF-16, incluso con caracteres fuera del BMP.
  if v_row.state ? 'conceptosVistos' or p_state ? 'conceptosVistos' then
    with entradas as (
      select * from pg_catalog.jsonb_each(coalesce(v_row.state->'conceptosVistos', '{}'::jsonb))
      union all select * from pg_catalog.jsonb_each(coalesce(p_state->'conceptosVistos', '{}'::jsonb))
    ), ordenadas as (
      select e.key, (e.value->>'primera')::numeric as primera, (e.value->>'ultima')::numeric as ultima,
        e.value->>'preguntaId' as pregunta_id,
        (select pg_catalog.string_agg(
          case when pg_catalog.ascii(ch) > 65535 then
            pg_catalog.lpad(pg_catalog.to_hex(55296 + (pg_catalog.ascii(ch) - 65536) / 1024), 4, '0') ||
            pg_catalog.lpad(pg_catalog.to_hex(56320 + (pg_catalog.ascii(ch) - 65536) % 1024), 4, '0')
          else pg_catalog.lpad(pg_catalog.to_hex(pg_catalog.ascii(ch)), 4, '0') end, '' order by pos)
          from pg_catalog.regexp_split_to_table(e.value->>'preguntaId', '') with ordinality as caracteres(ch, pos)) as orden_utf16
        from entradas e
    ), limites as (
      select key, pg_catalog.min(primera) as primera from ordenadas group by key
    ), ultimas as (
      select distinct on (key) key, ultima, pregunta_id from ordenadas
        order by key, ultima desc, orden_utf16 collate "C" desc
    )
    select coalesce(pg_catalog.jsonb_object_agg(l.key, pg_catalog.jsonb_build_object(
      'primera', l.primera, 'ultima', u.ultima, 'preguntaId', u.pregunta_id)), '{}'::jsonb)
      into v_views from limites l join ultimas u using (key);
    v_next_state := pg_catalog.jsonb_set(p_state, '{conceptosVistos}', v_views, true);
    if v_views <> '{}'::jsonb then
      v_next_state := pg_catalog.jsonb_set(v_next_state, '{vistoAlguna}', 'true'::jsonb, true);
    end if;
  end if;
  update public.study_state
    set state = v_next_state, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where user_id = v_user_id
    returning * into v_row;
  if not found then
    raise exception using errcode = '42501', message = 'membership_required';
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'kind', 'saved', 'row', pg_catalog.to_jsonb(v_row));
end;
$function$;

commit;
