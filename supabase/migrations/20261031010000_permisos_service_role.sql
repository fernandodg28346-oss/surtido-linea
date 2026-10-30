-- La función sl-aprobar-acceso usa service_role. En este proyecto las tablas nuevas no reciben permisos
-- automáticos, así que se los da explícitamente (service_role ya ignora RLS; esto es solo el permiso de tabla).
grant select, insert, update on public.sl_solicitudes_acceso to service_role;
grant select, insert, update on public.sl_gafetes to service_role;
