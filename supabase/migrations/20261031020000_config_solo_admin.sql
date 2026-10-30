-- La configuración (parámetros, catálogo de líneas y permisos por rol) solo la cambia el administrador;
-- todos los usuarios autorizados la siguen leyendo.
drop policy if exists sl_config_rw on public.sl_config;
create policy sl_config_leer     on public.sl_config for select to authenticated using ((select public.sl_autorizado()));
create policy sl_config_insertar on public.sl_config for insert to authenticated with check ((select public.sl_es_admin()));
create policy sl_config_editar   on public.sl_config for update to authenticated using ((select public.sl_es_admin())) with check ((select public.sl_es_admin()));
create policy sl_config_borrar   on public.sl_config for delete to authenticated using ((select public.sl_es_admin()));
