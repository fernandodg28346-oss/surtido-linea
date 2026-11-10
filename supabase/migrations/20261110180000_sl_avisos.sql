-- Avisos de Surtido de Línea (campana en la app). Los generan solo los disparadores de esta migración; cada usuario
-- lee los suyos y los marca como leídos. Tabla propia de Surtido: no usa ni modifica la tabla avisos de Control de Personal.
create table public.sl_avisos (
  id uuid primary key default gen_random_uuid(),
  para uuid not null references auth.users(id) on delete cascade,
  tipo text not null,                -- plan | acceso | paro
  titulo text not null,
  detalle text not null default '',
  ref text not null default '',      -- id del registro que lo originó
  leido boolean not null default false,
  creado timestamptz not null default now()
);
create index sl_avisos_para on public.sl_avisos (para, creado desc);
alter table public.sl_avisos enable row level security;
create policy sl_avisos_leer   on public.sl_avisos for select to authenticated using (para = (select auth.uid()));
create policy sl_avisos_marcar on public.sl_avisos for update to authenticated using (para = (select auth.uid())) with check (para = (select auth.uid()));
revoke all on public.sl_avisos from anon, authenticated;
grant select on public.sl_avisos to authenticated;
grant update (leido) on public.sl_avisos to authenticated;
alter publication supabase_realtime add table public.sl_avisos;

-- Cuentas de Surtido con alguno de los roles, o con el permiso indicado en Ajustes → Permisos por rol (p_defaults: roles
-- que lo tienen si no se ha configurado). Nunca incluye a quien hizo el cambio.
create or replace function public.sl_cuentas(p_roles text[], p_permiso text default null, p_defaults text[] default '{}')
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct (g.data->>'user_id')::uuid
  from public.sl_gafetes g
  where g.data->>'user_id' ~ '^[0-9a-fA-F-]{36}$'
    and (g.data->>'user_id')::uuid is distinct from auth.uid()
    and (g.data->>'rol' = any(p_roles)
      or (p_permiso is not null and g.data->>'rol' <> 'receptor' and coalesce(
            ((select c.data from public.sl_config c where c.id = 'permisos')->'roles'->(g.data->>'rol')->>p_permiso)::boolean,
            g.data->>'rol' = any(p_defaults))))
$$;
create or replace function public.sl_cuenta_de_gafete(p_gafete text)
returns uuid language sql stable security definer set search_path = '' as $$
  select (g.data->>'user_id')::uuid from public.sl_gafetes g
  where g.data->>'gafete' = p_gafete and g.data->>'user_id' ~ '^[0-9a-fA-F-]{36}$'
    and (g.data->>'user_id')::uuid is distinct from auth.uid()
  limit 1
$$;
create or replace function public.sl_avisar(p_para uuid[], p_tipo text, p_titulo text, p_detalle text, p_ref text)
returns void language sql security definer set search_path = '' as $$
  insert into public.sl_avisos (para, tipo, titulo, detalle, ref)
  select distinct u, p_tipo, p_titulo, coalesce(p_detalle, ''), coalesce(p_ref, '') from unnest(p_para) u where u is not null
$$;
revoke execute on function public.sl_cuentas(text[], text, text[]), public.sl_cuenta_de_gafete(text),
  public.sl_avisar(uuid[], text, text, text, text) from public, anon, authenticated;

-- Plan: una solicitud nueva avisa a quien puede aprobar; al resolverse, avisa a quien la pidió.
create or replace function public.sl_avisos_plan() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := case when tg_op = 'DELETE' then null else new.data end;
  o jsonb := case when tg_op = 'INSERT' then null else old.data end;
  p jsonb := coalesce(n, o);
  rid text := case when tg_op = 'DELETE' then old.id else new.id end;
  que text := concat_ws(' · ', p->>'ensamble', p->>'linea', concat_ws(' ', p->>'fecha', p->>'turno'));
  tipos jsonb := '{"alta":"Alta","cambio":"Cambio","baja":"Baja"}';
  q jsonb; ult jsonb; res text; quien text;
begin
  if n ? 'pendiente' and (o is null or o->'pendiente' is distinct from n->'pendiente') then
    q := n->'pendiente';
    perform public.sl_avisar(array(select public.sl_cuentas(array['admin'], 'approve', array['gerente'])), 'plan',
      coalesce(tipos->>(q->>'tipo'), 'Cambio') || ' al plan por aprobar', que || ' · solicitó ' || coalesce(q->>'porNombre', ''), rid);
  elsif o ? 'pendiente' and (n is null or not n ? 'pendiente') then
    q := o->'pendiente';
    if n is null then
      res := case q->>'tipo' when 'baja' then 'aprobada' else 'rechazada' end;
      quien := (select g.data->>'nombre' from public.sl_gafetes g where g.data->>'user_id' = auth.uid()::text limit 1);
    else
      ult := n->'historial'->-1;
      res := case when ult->>'accion' like 'aprobó%' then 'aprobada' when ult->>'accion' like 'rechazó%' then 'rechazada' end;
      quien := ult->>'porNombre';
    end if;
    if res is not null then
      perform public.sl_avisar(array[public.sl_cuenta_de_gafete(q->>'por')], 'plan',
        coalesce(tipos->>(q->>'tipo'), 'Cambio') || ' al plan ' || res, que || coalesce(' · por ' || quien, ''), rid);
    end if;
  end if;
  return null;
-- Un aviso nunca debe impedir guardar el plan, el paro o la solicitud.
exception when others then
  raise warning 'sl_avisos: %', sqlerrm; return null;
end $$;
create trigger sl_avisos_plan after insert or update or delete on public.sl_plan
  for each row execute function public.sl_avisos_plan();

-- Solicitud de acceso nueva: al administrador.
create or replace function public.sl_avisos_acceso() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sl_avisar(array(select public.sl_cuentas(array['admin'])), 'acceso', 'Solicitud de acceso',
    concat_ws(' · ', new.nombre, 'gafete ' || new.gafete, nullif(new.area, ''), new.email), new.id::text);
  return null;
-- Un aviso nunca debe impedir guardar el plan, el paro o la solicitud.
exception when others then
  raise warning 'sl_avisos: %', sqlerrm; return null;
end $$;
create trigger sl_avisos_acceso after insert on public.sl_solicitudes_acceso
  for each row execute function public.sl_avisos_acceso();

-- Línea detenida y reanudada: a planeadores, supervisores, líderes, Gerencia y administrador.
create or replace function public.sl_avisos_paro() returns trigger language plpgsql security definer set search_path = '' as $$
declare dest uuid[];
begin
  if new.data->>'tipo' <> 'paro' then return null; end if;
  dest := array(select public.sl_cuentas(array['admin', 'planeador', 'supervisor', 'lider', 'gerente']));
  if tg_op = 'INSERT' then
    perform public.sl_avisar(dest, 'paro', 'Línea ' || coalesce(new.data->>'linea', '') || ' detenida',
      concat_ws(' · ', nullif(new.data->>'motivo', ''), 'registró ' || (new.data->>'porNombre')), new.id);
  elsif old.data->>'fin' is null and new.data->>'fin' is not null then
    perform public.sl_avisar(dest, 'paro', 'Línea ' || coalesce(new.data->>'linea', '') || ' reanudada',
      'Detenida ' || round(((new.data->>'fin')::numeric - (new.data->>'inicio')::numeric) / 60000) || ' min'
        || coalesce(' · ' || nullif(new.data->>'motivo', ''), ''), new.id);
  end if;
  return null;
-- Un aviso nunca debe impedir guardar el plan, el paro o la solicitud.
exception when others then
  raise warning 'sl_avisos: %', sqlerrm; return null;
end $$;
create trigger sl_avisos_paro after insert or update on public.sl_eventos
  for each row execute function public.sl_avisos_paro();
