-- My Q Bank phases 2–4. Additive: existing progress/RPCs and membership remain unchanged.
create table if not exists public.myqbank_annotations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint myqbank_annotation_shape check ((
    jsonb_typeof(payload) = 'object'
    and payload->>'material' in ('nbme', 'concept')
    and payload->>'kind' in ('highlight', 'flag')
    and length(payload->>'sourceId') between 1 and 512
    and length(payload->>'sourceRevision') between 1 and 512
    and jsonb_typeof(payload->'deleted') = 'boolean'
    and jsonb_typeof(payload->'changedAt') = 'number'
    and (payload->>'changedAt')::numeric between 0 and 9007199254740991
    and octet_length(payload::text) <= 16384
  ) is true)
);
alter table public.myqbank_annotations enable row level security;
revoke all on public.myqbank_annotations from anon;
grant select, insert, update on public.myqbank_annotations to authenticated;
create policy myqbank_annotations_owner_member on public.myqbank_annotations
for all to authenticated
using (user_id = (select auth.uid())
  and exists (select 1 from public.app_members m where m.user_id = (select auth.uid()))
  and (payload->>'material' = 'concept' or exists (select 1 from public.nbme_members n where n.user_id = (select auth.uid()))))
with check (user_id = (select auth.uid())
  and exists (select 1 from public.app_members m where m.user_id = (select auth.uid()))
  and (payload->>'material' = 'concept' or exists (select 1 from public.nbme_members n where n.user_id = (select auth.uid()))));

create or replace function public.sync_myqbank_annotation(p_id uuid, p_payload jsonb, p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.myqbank_annotations; current_row public.myqbank_annotations;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_revision = 0 then
    insert into public.myqbank_annotations(user_id, id, payload)
      values(auth.uid(), p_id, p_payload) on conflict do nothing returning * into saved;
  else
    update public.myqbank_annotations set payload = p_payload, revision = revision + 1, updated_at = now()
      where user_id = auth.uid() and id = p_id and revision = p_expected_revision
      -- Deletion is terminal for this ID. Re-highlighting uses a new UUID.
      and not (payload->>'deleted' = 'true' and p_payload->>'deleted' <> 'true')
      and payload->>'material' = p_payload->>'material'
      and payload->>'sourceId' = p_payload->>'sourceId'
      and payload->>'sourceRevision' = p_payload->>'sourceRevision'
      returning * into saved;
  end if;
  if saved.id is not null then return jsonb_build_object('ok', true, 'row', to_jsonb(saved)); end if;
  select * into current_row from public.myqbank_annotations where user_id = auth.uid() and id = p_id;
  return jsonb_build_object('ok', false, 'row', case when current_row.id is null then null else to_jsonb(current_row) end);
end $$;
revoke all on function public.sync_myqbank_annotation(uuid,jsonb,bigint) from public, anon;
grant execute on function public.sync_myqbank_annotation(uuid,jsonb,bigint) to authenticated;
comment on table public.myqbank_annotations is 'Private owner annotations. Tombstones and CAS protect offline multi-device edits.';
