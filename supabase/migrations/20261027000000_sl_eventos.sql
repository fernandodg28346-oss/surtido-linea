-- Paros de línea y reconteos de material: ajustan el programa de surtido.
create table public.sl_eventos (id text primary key, data jsonb not null, actualizado timestamptz not null default now());
create index sl_eventos_fecha_idx on public.sl_eventos ((data->>'fecha'));

alter table public.sl_eventos enable row level security;
-- No se borran desde la app: un paro se cierra (update) y un reconteo equivocado se corrige con otro reconteo.
create policy sl_eventos_leer       on public.sl_eventos for select to authenticated using ((select public.sl_autorizado()));
create policy sl_eventos_insertar   on public.sl_eventos for insert to authenticated with check ((select public.sl_autorizado()));
create policy sl_eventos_actualizar on public.sl_eventos for update to authenticated using ((select public.sl_autorizado())) with check ((select public.sl_autorizado()));

revoke all on public.sl_eventos from anon;
grant select, insert, update on public.sl_eventos to authenticated;

alter publication supabase_realtime add table public.sl_eventos;
