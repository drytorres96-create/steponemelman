-- SOLO para una base PostgreSQL local VACÍA y desechable. No ejecutar contra Supabase.
-- UUID de fixture sintéticos: no contiene datos ni identificadores de cuentas reales.
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
create table public.app_members(user_id uuid primary key);
create table public.nbme_members(user_id uuid primary key);
create table public.nbme_state(user_id uuid primary key,state jsonb not null,revision bigint not null default 1,generation uuid not null default gen_random_uuid(),updated_at timestamptz not null default now());
create table public.study_state(user_id uuid primary key,state jsonb not null,revision bigint not null default 1,generation uuid not null default gen_random_uuid(),updated_at timestamptz not null default now());
insert into public.app_members values ('11111111-1111-4111-a111-111111111111');
insert into public.nbme_members select user_id from public.app_members;
