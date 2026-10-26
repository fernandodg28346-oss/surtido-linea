# Surtido de Línea

App web para el surtido de materiales a líneas de producción: plan de producción, BOM por ensamble, cálculo de cada cuánto surtir cada NP por estación (punto de reorden mínimo 20 % según UPH), confirmación de surtido con gafete, estado de líneas y métricas por rol.

- **Frontend:** un solo archivo [`index.html`](index.html), publicado con GitHub Pages.
- **Datos:** Supabase (tablas `sl_*`), con actualización en tiempo real entre equipos.

## Cómo se usa

1. **Equipo:** cada tablet o PC inicia sesión una sola vez con una cuenta de equipo de Supabase.
2. **Gafete:** cada persona entra escaneando su gafete. El rol del gafete define qué pestañas ve.
3. **Surtido:** el materialista presiona **Confirmar surtido** y quien recibe en línea escanea su gafete. Con eso queda registrado quién surtió, quién recibió y a qué hora.

| Rol | Acceso |
|---|---|
| Administrador | Todo, incluidos Gafetes y ajustes |
| Planeador | Plan de producción, BOM, Líneas, Surtido, Métricas |
| Materialista | Líneas y Surtido (confirma surtidos) |
| Líder de línea | Líneas, Surtido, Métricas |
| Supervisor | Líneas, Métricas, Surtido, Plan (consulta) |
| Recibe material | No entra a la app; solo su gafete se usa para recibir |

## Puesta en marcha

### 1. Crear una cuenta de equipo en Supabase

En el panel de Supabase: **Authentication → Users → Add user → Create new user**, con un correo y una contraseña para el equipo (por ejemplo, `surtido-l1@tuempresa.com`). Marca **Auto Confirm User**.

### 2. Autorizar la cuenta para usar el surtido

En **SQL Editor**, ejecuta (cambia el correo y el nombre):

```sql
insert into public.sl_equipos (user_id, nombre)
select id, 'Tablet Línea 1' from auth.users where email = 'surtido-l1@tuempresa.com';
```

Una cuenta que inicia sesión pero no está en `sl_equipos` no puede leer ni escribir nada. Para quitarle el acceso a un equipo, borra su fila:

```sql
delete from public.sl_equipos where nombre = 'Tablet Línea 1';
```

### 3. Primer uso

Al abrir la app con un equipo autorizado y sin gafetes registrados, la app pide registrar al primer administrador. Él da de alta los demás gafetes en la pestaña **Gafetes**, uno por uno o desde Excel.

## Cargas desde Excel

Cada sección tiene un botón **Plantilla Excel** con las columnas esperadas:

- **Plan:** Fecha, Ensamble, Cantidad, Turno, Linea, UPH (opcional)
- **BOM:** Ensamble, UPH, NP, Descripcion, Estacion, CantidadPorUnidad, Empaque
- **Gafetes:** Gafete, Nombre, Area, Rol (`admin`, `planeador`, `materialista`, `lider`, `supervisor`, `receptor`)

## Cálculo del surtido

Para cada NP en su estación:

- Consumo por hora = UPH × cantidad por unidad
- Punto de reorden = empaque × % de reorden (mínimo 20 %, se ajusta en Gafetes y ajustes)
- Cantidad a surtir = empaque − punto de reorden
- Frecuencia = cantidad a surtir ÷ consumo por hora

El primer surtido es a la hora de inicio del turno, con la estación llena. Una línea está **al 100 %** cuando todos los surtidos cuya hora ya pasó están confirmados.

## Configuración

[`config.js`](config.js) tiene la URL del proyecto de Supabase y su clave pública (anon). Esa clave está hecha para ir en el navegador; los datos están protegidos por las reglas RLS. **Nunca** pongas la clave `service_role` en este repositorio.

El esquema de la base está en [`supabase/migrations/`](supabase/migrations/).
