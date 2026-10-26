-- App Surtido de Línea: tablas con prefijo sl_, separadas de la app de asistencia.
-- Ya aplicada en el proyecto alkukgmfwiwxymwezedl el 2026-10-25.
create table public.sl_equipos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  creado timestamptz not null default now()
);

create table public.sl_gafetes  (id text primary key, data jsonb not null, actualizado timestamptz not null default now());
create table public.sl_bom      (id text primary key, data jsonb not null, actualizado timestamptz not null default now());
create table public.sl_plan     (id text primary key, data jsonb not null, actualizado timestamptz not null default now());
create table public.sl_config   (id text primary key, data jsonb not null, actualizado timestamptz not null default now());
create table public.sl_surtidos (id text primary key, data jsonb not null, actualizado timestamptz not null default now());

create index sl_plan_fecha_idx     on public.sl_plan     ((data->>'fecha'));
create index sl_surtidos_fecha_idx on public.sl_surtidos ((data->>'fecha'));

-- Solo las cuentas de equipo dadas de alta en sl_equipos pueden usar la app.
create or replace function public.sl_autorizado() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.sl_equipos where user_id = (select auth.uid())) $$;
revoke execute on function public.sl_autorizado() from public, anon;
grant execute on function public.sl_autorizado() to authenticated;

alter table public.sl_equipos  enable row level security;
alter table public.sl_gafetes  enable row level security;
alter table public.sl_bom      enable row level security;
alter table public.sl_plan     enable row level security;
alter table public.sl_config   enable row level security;
alter table public.sl_surtidos enable row level security;

create policy sl_equipos_propio on public.sl_equipos for select to authenticated using (user_id = (select auth.uid()));

create policy sl_gafetes_rw on public.sl_gafetes for all to authenticated using ((select public.sl_autorizado())) with check ((select public.sl_autorizado()));
create policy sl_bom_rw     on public.sl_bom     for all to authenticated using ((select public.sl_autorizado())) with check ((select public.sl_autorizado()));
create policy sl_plan_rw    on public.sl_plan    for all to authenticated using ((select public.sl_autorizado())) with check ((select public.sl_autorizado()));
create policy sl_config_rw  on public.sl_config  for all to authenticated using ((select public.sl_autorizado())) with check ((select public.sl_autorizado()));
-- Un surtido confirmado no se edita ni se borra desde la app.
create policy sl_surtidos_leer     on public.sl_surtidos for select to authenticated using ((select public.sl_autorizado()));
create policy sl_surtidos_insertar on public.sl_surtidos for insert to authenticated with check ((select public.sl_autorizado()));

revoke all on public.sl_equipos, public.sl_gafetes, public.sl_bom, public.sl_plan, public.sl_config, public.sl_surtidos from anon;
grant select on public.sl_equipos to authenticated;
grant select, insert, update, delete on public.sl_gafetes, public.sl_bom, public.sl_plan, public.sl_config to authenticated;
grant select, insert on public.sl_surtidos to authenticated;

alter publication supabase_realtime add table public.sl_gafetes, public.sl_bom, public.sl_plan, public.sl_config, public.sl_surtidos;
