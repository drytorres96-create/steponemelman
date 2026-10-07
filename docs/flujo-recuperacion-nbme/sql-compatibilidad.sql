-- SOLO para una base PostgreSQL local VACÍA y desechable. No ejecutar contra Supabase.
-- UUID de fixture sintéticos: no contiene datos ni identificadores de cuentas reales.
set app.user_id='11111111-1111-4111-a111-111111111111';
do $test$
declare r jsonb; g uuid; s jsonb; before_attempts jsonb;
begin
  r:=public.sync_nbme_state('{"version":1,"attempts":{"S1:0":{"correct":false}},"sessions":{"S1":{}},"activeSessionId":"S1","archivedSessions":{"S1":300}}',0,null);
  if r->>'kind'<>'saved' then raise exception 'initial save'; end if;
  g:=(r->'row'->>'generation')::uuid;
  before_attempts:=r->'row'->'state'->'attempts';
  -- An old client omits the optional field and attempts to reactivate S1.
  r:=public.sync_nbme_state('{"version":1,"attempts":{"S1:0":{"correct":false}},"sessions":{"S1":{}},"activeSessionId":"S1"}',1,g);
  s:=r->'row'->'state';
  if s->'archivedSessions'<>'{"S1":300}'::jsonb or s->>'activeSessionId' is not null then raise exception 'old client restored archive'; end if;
  if s->'attempts'<>before_attempts then raise exception 'attempts changed'; end if;
  -- Lower timestamps never replace an archive. Other fields still use existing sync.
  r:=public.sync_nbme_state(s||'{"archivedSessions":{"S1":200,"S2":400}}'::jsonb,2,g);
  if r->'row'->'state'->'archivedSessions'<>'{"S1":300,"S2":400}'::jsonb then raise exception 'max archive failed'; end if;
  r:=public.sync_nbme_state(s,1,g);
  if r->>'kind'<>'conflict' or (r->'row'->>'revision')::int<>3 then raise exception 'CAS changed'; end if;
  r:=public.sync_nbme_state(s,3,'22222222-2222-4222-a222-222222222222');
  if r->>'kind'<>'reset' then raise exception 'generation check changed'; end if;
  begin
    perform public.sync_nbme_state(s||'{"archivedSessions":{"S1":-1}}'::jsonb,3,g);
    raise exception 'invalid archive accepted';
  exception when invalid_parameter_value then null; end;

  r:=public.sync_study_state('{"progreso":{"C1":{"intentos":[]}},"vistoAlguna":true,"conceptosVistos":{"C1":{"primera":100,"ultima":300,"preguntaId":"QZ"}}}',0,null);
  g:=(r->'row'->>'generation')::uuid;
  r:=public.sync_study_state('{"progreso":{"C1":{"intentos":[]}},"vistoAlguna":false}',1,g);
  s:=r->'row'->'state';
  if s->'conceptosVistos'<>'{"C1":{"primera":100,"ultima":300,"preguntaId":"QZ"}}'::jsonb or s->>'vistoAlguna'<>'true' then raise exception 'old client dropped views'; end if;
  r:=public.sync_study_state(s||'{"conceptosVistos":{"C1":{"primera":80,"ultima":200,"preguntaId":"QA"},"C2":{"primera":150,"ultima":150,"preguntaId":"Q2"}}}'::jsonb,2,g);
  if r->'row'->'state'->'conceptosVistos'<>'{"C1":{"primera":80,"ultima":300,"preguntaId":"QZ"},"C2":{"primera":150,"ultima":150,"preguntaId":"Q2"}}'::jsonb then raise exception 'view extrema failed'; end if;
  s:=r->'row'->'state';
  r:=public.sync_study_state(s||'{"conceptosVistos":{"C1":{"primera":90,"ultima":300,"preguntaId":"QZZ"}}}'::jsonb,3,g);
  if r->'row'->'state'->'conceptosVistos'->'C1'->>'preguntaId'<>'QZZ' then raise exception 'view tie failed'; end if;
  -- UTF-16 ordering: U+E000 > U+1F600 in JavaScript string comparison.
  s:=r->'row'->'state';
  r:=public.sync_study_state(s||jsonb_build_object('conceptosVistos',jsonb_build_object('C3',jsonb_build_object('primera',100,'ultima',300,'preguntaId',chr(57344)))),4,g);
  s:=r->'row'->'state';
  r:=public.sync_study_state(s||jsonb_build_object('conceptosVistos',jsonb_build_object('C3',jsonb_build_object('primera',90,'ultima',300,'preguntaId',chr(128512)))),5,g);
  if r->'row'->'state'->'conceptosVistos'->'C3'->>'preguntaId'<>chr(57344) then raise exception 'UTF16 tie failed'; end if;
  if r->'row'->'state'->'progreso'<>'{"C1":{"intentos":[]}}'::jsonb then raise exception 'concept progress changed'; end if;
  begin
    perform public.sync_study_state(s||'{"conceptosVistos":{"C1":{"primera":200,"ultima":100,"preguntaId":"Q1"}}}'::jsonb,6,g);
    raise exception 'invalid view accepted';
  exception when invalid_parameter_value then null; end;
  -- A reset starts a new generation; old views are never restored by the sync RPC.
  update public.study_state set state='{"progreso":{},"vistoAlguna":false}',generation=gen_random_uuid(),revision=7 where user_id=auth.uid();
  r:=public.sync_study_state(s,7,g);
  if r->>'kind'<>'reset' or r->'row'->'state' ? 'conceptosVistos' then raise exception 'reset inherited views'; end if;
end;
$test$;
select 'RPC archive/view compatibility checks passed' as result;
