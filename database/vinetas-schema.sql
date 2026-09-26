-- Viñetas de mecanismo, piloto de 1.25.0 (migración ai_vignettes_pilot).
-- Viñetas de práctica generadas por IA, sin revisión clínica: no alimentan el progreso,
-- las cajas ni el dominio. El contenido se carga por administración y no vive en el
-- repositorio. Lectura sólo para miembros; ningún rol de la aplicación puede escribir.
begin;

create table public.ai_vignettes (
  id text primary key check (length(id) between 1 and 128),
  set_id text not null check (length(set_id) between 1 and 64),
  position integer not null check (position between 0 and 9999),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 65536),
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (set_id, position)
);

alter table public.ai_vignettes enable row level security;
revoke all on public.ai_vignettes from public, anon, authenticated;
grant select on public.ai_vignettes to authenticated;

create policy ai_vignettes_select_members on public.ai_vignettes
  for select to authenticated
  using (exists (
    select 1 from public.app_members m where m.user_id = (select auth.uid())
  ));

comment on table public.ai_vignettes is 'Viñetas de práctica generadas por IA, sin revisión clínica. Lectura para miembros; escritura sólo administrativa. No alimentan el progreso.';

commit;

-- Comprobación (dentro de una transacción que se deshace):
--   miembro      → ve todas las filas del conjunto
--   no miembro   → 0 filas
--   anon         → sin permiso de lectura
--   authenticated → sin INSERT, UPDATE ni DELETE
