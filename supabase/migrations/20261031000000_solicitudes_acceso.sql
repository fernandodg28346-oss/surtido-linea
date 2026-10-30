-- Solicitudes de acceso sin cuenta previa y retiro de las cuentas de equipo.
-- Cualquiera envía una solicitud (nombre, gafete, correo) desde la pantalla de inicio; el administrador la aprueba
-- en la app y la función sl-aprobar-acceso crea la cuenta (o liga la existente) y la liga a su gafete.

create table public.sl_solicitudes_acceso (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  gafete text not null check (char_length(btrim(gafete)) between 1 and 30),
  email text not null check (char_length(email) <= 120 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  area text check (area is null or char_length(area) <= 60),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  creado timestamptz not null default now(),
  revisado timestamptz,
  revisado_por text
);
-- Una sola solicitud pendiente por correo.
create unique index sl_solicitudes_acceso_pendiente on public.sl_solicitudes_acceso (lower(email)) where estado = 'pendiente';

alter table public.sl_solicitudes_acceso enable row level security;
-- Enviar: sin sesión (anon) o con sesión; siempre como pendiente.
create policy sl_sol_acceso_crear on public.sl_solicitudes_acceso for insert to anon, authenticated
  with check (estado = 'pendiente' and revisado is null and revisado_por is null);
-- Ver: el administrador todas; cada quien la de su correo.
create policy sl_sol_acceso_leer on public.sl_solicitudes_acceso for select to authenticated
  using ((select public.sl_es_admin()) or lower(email) = lower((select auth.jwt()->>'email')));
create policy sl_sol_acceso_revisar on public.sl_solicitudes_acceso for update to authenticated
  using ((select public.sl_es_admin())) with check ((select public.sl_es_admin()));
create policy sl_sol_acceso_borrar on public.sl_solicitudes_acceso for delete to authenticated
  using ((select public.sl_es_admin()));
grant insert on public.sl_solicitudes_acceso to anon;
grant select, insert, update, delete on public.sl_solicitudes_acceso to authenticated;
alter publication supabase_realtime add table public.sl_solicitudes_acceso;

-- La solicitud pendiente del esquema anterior pasa a la tabla nueva.
insert into public.sl_solicitudes_acceso (nombre, gafete, email, creado)
select nombre, gafete, email, creado from public.sl_solicitudes
on conflict do nothing;
drop table public.sl_solicitudes;

-- Retiro de las cuentas de equipo: el acceso depende solo del gafete ligado a la cuenta.
create or replace function public.sl_autorizado() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.sl_rol() <> 'receptor', false) $$;

create or replace function public.sl_es_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.sl_rol() = 'admin', false) $$;

drop function public.sl_equipo();
drop table public.sl_equipos;
