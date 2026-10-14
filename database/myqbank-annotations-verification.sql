begin;
insert into auth.users(id) values ('d9000000-0000-4000-8000-000000000001'),('d9000000-0000-4000-8000-000000000002');
insert into public.app_members(user_id) values ('d9000000-0000-4000-8000-000000000001'),('d9000000-0000-4000-8000-000000000002');
insert into public.nbme_members(user_id) values ('d9000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','d9000000-0000-4000-8000-000000000001',true);
do $test$
declare r jsonb; p jsonb := '{"material":"nbme","kind":"highlight","sourceId":"SYNTHETIC-QA","sourceRevision":"r1","deleted":false,"changedAt":1}'::jsonb;
begin
 r := public.sync_myqbank_annotation('d9000000-0000-4000-8000-000000000003',p,0);
 if r->>'ok' <> 'true' or r#>>'{row,revision}' <> '1' then raise exception 'create failed'; end if;
 r := public.sync_myqbank_annotation('d9000000-0000-4000-8000-000000000003',p,0);
 if r->>'ok' <> 'false' then raise exception 'idempotent CAS failed'; end if;
 r := public.sync_myqbank_annotation('d9000000-0000-4000-8000-000000000003',p||'{"deleted":true,"changedAt":2}',1);
 if r->>'ok' <> 'true' then raise exception 'delete failed'; end if;
 r := public.sync_myqbank_annotation('d9000000-0000-4000-8000-000000000003',p,2);
 if r->>'ok' <> 'false' then raise exception 'tombstone resurrected'; end if;
end $test$;
select set_config('request.jwt.claim.sub','d9000000-0000-4000-8000-000000000002',true);
do $test$
declare n int; r jsonb;
begin
 select count(*) into n from public.myqbank_annotations where id='d9000000-0000-4000-8000-000000000003';
 if n <> 0 then raise exception 'cross-account read'; end if;
 update public.myqbank_annotations set payload=payload||'{"deleted":false}' where id='d9000000-0000-4000-8000-000000000003';
 get diagnostics n = row_count;
 if n <> 0 then raise exception 'cross-account update'; end if;
 begin
  insert into public.myqbank_annotations(user_id,id,payload) values ('d9000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000004','{"material":"concept","kind":"flag","sourceId":"QA","sourceRevision":"r1","deleted":false,"changedAt":1}');
  raise exception 'forged owner accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.sync_myqbank_annotation('d9000000-0000-4000-8000-000000000004','{"material":"nbme","kind":"flag","sourceId":"QA","sourceRevision":"r1","deleted":false,"changedAt":1}',0);
  raise exception 'NBME without membership accepted';
 exception when insufficient_privilege then null; end;
 r := public.sync_myqbank_annotation('d9000000-0000-4000-8000-000000000004','{"material":"concept","kind":"flag","sourceId":"QA","sourceRevision":"r1","deleted":false,"changedAt":1}',0);
 if r->>'ok' <> 'true' then raise exception 'concept member denied'; end if;
end $test$;
reset role;
delete from public.app_members where user_id='d9000000-0000-4000-8000-000000000002';
set local role authenticated;
do $test$
declare n int;
begin
 select count(*) into n from public.myqbank_annotations;
 if n <> 0 then raise exception 'revoked member read'; end if;
 begin
  perform public.sync_myqbank_annotation('d9000000-0000-4000-8000-000000000004','{"material":"concept","kind":"flag","sourceId":"QA","sourceRevision":"r1","deleted":true,"changedAt":2}',1);
  -- An invisible update returns no row; it must never succeed.
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
rollback;
select '10 RLS/CAS assertions completed; all synthetic users and annotations rolled back' as verification;
