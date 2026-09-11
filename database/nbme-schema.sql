-- Additive schema: private question bank, independent from conceptual progress.
-- Contains no copyrighted question text and grants no membership automatically.
begin;

create table public.nbme_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.nbme_assets (
  path text primary key check (length(path) between 1 and 512),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.nbme_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  generation uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  constraint nbme_state_shape check ((
    jsonb_typeof(state) = 'object'
    and state -> 'version' = '1'::jsonb
    and jsonb_typeof(state -> 'bankVersion') = 'string'
    and length(state ->> 'bankVersion') between 1 and 512
    and jsonb_typeof(state -> 'sessions') = 'object'
    and jsonb_typeof(state -> 'attempts') = 'object'
    and jsonb_typeof(state -> 'activeSessionId') in ('string', 'null')
    and jsonb_typeof(state -> 'activeChangedAt') = 'number'
    and state -> 'activeChangedAt' >= '0'::jsonb
    and jsonb_typeof(state -> 'filters') = 'object'
    and jsonb_typeof(state -> 'filtersChangedAt') = 'number'
    and state -> 'filtersChangedAt' >= '0'::jsonb
  ) is true),
  constraint nbme_state_size check (octet_length(state::text) <= 16777216)
);

alter table public.nbme_members enable row level security;
alter table public.nbme_assets enable row level security;
alter table public.nbme_state enable row level security;
revoke all on public.nbme_members, public.nbme_assets, public.nbme_state from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.nbme_members, public.nbme_assets to authenticated;
grant select, insert, update on public.nbme_state to authenticated;

create policy nbme_members_select_self on public.nbme_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy nbme_assets_select_authorized on public.nbme_assets
  for select to authenticated using (
    exists (select 1 from public.nbme_members where user_id = (select auth.uid()))
    and exists (select 1 from public.app_members where user_id = (select auth.uid()))
  );
create policy nbme_state_select_own on public.nbme_state
  for select to authenticated using (
    user_id = (select auth.uid())
    and exists (select 1 from public.nbme_members where user_id = (select auth.uid()))
    and exists (select 1 from public.app_members where user_id = (select auth.uid()))
  );
create policy nbme_state_insert_own on public.nbme_state
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.nbme_members where user_id = (select auth.uid()))
    and exists (select 1 from public.app_members where user_id = (select auth.uid()))
  );
create policy nbme_state_update_own on public.nbme_state
  for update to authenticated using (
    user_id = (select auth.uid())
    and exists (select 1 from public.nbme_members where user_id = (select auth.uid()))
    and exists (select 1 from public.app_members where user_id = (select auth.uid()))
  ) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.nbme_members where user_id = (select auth.uid()))
    and exists (select 1 from public.app_members where user_id = (select auth.uid()))
  );

create function public.sync_nbme_state(p_state jsonb, p_expected_revision bigint, p_generation uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.nbme_state%rowtype;
begin
  if v_user_id is null
    or not exists (select 1 from public.nbme_members where user_id = v_user_id)
    or not exists (select 1 from public.app_members where user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'nbme_membership_required';
  end if;
  if p_state is null or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception using errcode = '22023', message = 'invalid_nbme_sync_arguments';
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
  update public.nbme_state set state = p_state, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where user_id = v_user_id returning * into v_row;
  if not found then raise exception using errcode = '42501', message = 'nbme_membership_required'; end if;
  return pg_catalog.jsonb_build_object('ok', true, 'kind', 'saved', 'row', pg_catalog.to_jsonb(v_row));
end;
$$;
revoke all on function public.sync_nbme_state(jsonb, bigint, uuid) from public, anon, authenticated;
grant execute on function public.sync_nbme_state(jsonb, bigint, uuid) to authenticated;
comment on table public.nbme_members is 'Explicit private-bank entitlement; app membership alone does not grant access.';
comment on table public.nbme_assets is 'Private versioned question assets and catalog; administrative writes only.';
comment on table public.nbme_state is 'Question practice state, independent from study_state and conceptual mastery.';
commit;
