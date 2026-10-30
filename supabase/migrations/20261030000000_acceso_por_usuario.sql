-- Acceso por usuario con correo y contraseña. Cada cuenta de Supabase Auth se liga a su gafete
-- (sl_gafetes.data->>'user_id') y el rol del gafete define el acceso; "receptor" no entra a la app.
-- Quien se registra deja una solicitud en sl_solicitudes hasta que el administrador la aprueba.
--
-- Transición: las cuentas de equipo (sl_equipos) siguen funcionando, con permisos de administrador, mientras
-- se publica la nueva versión; una migración posterior las retira.
create index if not exists sl_gafetes_user_idx on public.sl_gafetes ((data->>'user_id'));

create or replace function public.sl_rol() returns text
language sql stable security definer set search_path = ''
as $$ select data->>'rol' from public.sl_gafetes where data->>'user_id' = (select auth.uid())::text limit 1 $$;

create or replace function public.sl_equipo() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.sl_equipos where user_id = (select auth.uid())) $$;

create or replace function public.sl_autorizado() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.sl_rol() <> 'receptor', false) or public.sl_equipo() $$;

create or replace function public.sl_es_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.sl_rol() = 'admin', false) or public.sl_equipo() $$;

revoke execute on function public.sl_rol(), public.sl_equipo(), public.sl_es_admin() from public, anon;
grant execute on function public.sl_rol(), public.sl_equipo(), public.sl_es_admin() to authenticated;

-- Gafetes: cada quien lee su propio registro; todos los autorizados leen el resto; solo el administrador escribe.
drop policy if exists sl_gafetes_rw on public.sl_gafetes;
create policy sl_gafetes_leer     on public.sl_gafetes for select to authenticated using ((select public.sl_autorizado()) or data->>'user_id' = (select auth.uid())::text);
create policy sl_gafetes_insertar on public.sl_gafetes for insert to authenticated with check ((select public.sl_es_admin()));
create policy sl_gafetes_editar   on public.sl_gafetes for update to authenticated using ((select public.sl_es_admin())) with check ((select public.sl_es_admin()));
create policy sl_gafetes_borrar   on public.sl_gafetes for delete to authenticated using ((select public.sl_es_admin()));

-- Solicitudes de acceso: una por cuenta, con el correo de la propia sesión.
create table public.sl_solicitudes (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null,
  gafete text not null,
  creado timestamptz not null default now()
);
alter table public.sl_solicitudes enable row level security;
create policy sl_solicitudes_crear on public.sl_solicitudes for insert to authenticated
  with check (user_id = (select auth.uid()) and lower(email) = lower((select auth.jwt()->>'email')));
create policy sl_solicitudes_leer on public.sl_solicitudes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.sl_es_admin()));
create policy sl_solicitudes_borrar on public.sl_solicitudes for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.sl_es_admin()));
revoke all on public.sl_solicitudes from anon;
grant select, insert, delete on public.sl_solicitudes to authenticated;
alter publication supabase_realtime add table public.sl_solicitudes;
