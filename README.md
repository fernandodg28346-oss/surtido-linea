# Surtido de Línea

App web para el surtido de materiales a líneas de producción: plan de producción, BOM por ensamble, cálculo de cada cuánto surtir cada NP por estación (punto de reorden mínimo 20 % según UPH), confirmación de surtido con gafete, estado de líneas y métricas por rol.

- **Frontend:** HTML, CSS y JavaScript sin compilación (ver [Estructura](#estructura)), publicado con GitHub Pages.
- **Datos:** Supabase (tablas `sl_*`), con actualización en tiempo real entre equipos.

## Cómo se usa

1. **Equipo:** cada tablet o PC inicia sesión una sola vez con una cuenta de equipo de Supabase.
2. **Gafete:** cada persona entra escaneando su gafete. El rol del gafete define qué pestañas ve.
3. **Surtido:** el materialista o el líder de línea presiona **Confirmar surtido** y quien recibe en línea escanea su gafete. Con eso queda registrado quién surtió, quién recibió y a qué hora.

| Rol | Acceso |
|---|---|
| Administrador | Todo, incluidos Reportes, Gafetes y Ajustes |
| Planeador | Plan de producción, BOM, Líneas, Surtido, Métricas, Reportes |
| Gerencia | Plan de producción (aprueba cambios dentro del plazo), Líneas, Surtido, Métricas, Reportes |
| Materialista | Líneas y Surtido (confirma surtidos) |
| Líder de línea | Líneas, Surtido (confirma surtidos), Métricas, Reportes |
| Supervisor | Líneas, Métricas, Reportes, Surtido, Plan (consulta) |
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

- **Plan:** Fecha, Ensamble, WO (obligatoria, p. ej. `CTI002647`), Cantidad, Turno, Linea (del catálogo, si hay), UPH
- **Líneas** (Ajustes): Linea, Descripcion
- **BOM:** Ensamble, NP, Descripcion, Estacion, CantidadPorUnidad, Empaque, UPH (opcional; normalmente va en el plan)
- **Gafetes:** Gafete, Nombre, Area, Rol (`admin`, `planeador`, `gerente`, `materialista`, `lider`, `supervisor`, `receptor`)

## Cálculo del surtido

Para cada NP en su estación:

- Consumo por hora = UPH del plan × cantidad por unidad del BOM (si el plan no trae UPH, se usa el del BOM)
- Punto de reorden = empaque × % de reorden (mínimo 20 %, se ajusta en Ajustes)
- Cantidad a surtir = empaque − punto de reorden
- Frecuencia = cantidad a surtir ÷ consumo por hora

El surtido de cada ensamble arranca cuando alguien presiona **Iniciar ensamble** en Surtido; el primer surtido es a esa hora, con la estación llena. Una línea está **al 100 %** cuando todos los surtidos cuya hora ya pasó están confirmados.

## Catálogo de líneas

En **Ajustes → Catálogo de líneas** el administrador da de alta las líneas (a mano o desde Excel, con descripción opcional). En el plan de producción la línea se elige de esa lista, también al editar; la carga de Excel del plan ignora las filas con una línea fuera del catálogo. Mientras el catálogo esté vacío, la línea se escribe a mano. Quitar una línea del catálogo no cambia los planes que ya la usan.

## Work order (WO)

Cada ensamble del plan lleva su WO, obligatoria al agregarlo (a mano o por Excel) y editable con **Editar**: letras y números, con guion opcional, de 4 a 20 caracteres (p. ej. `CTI002647`); se guarda en mayúsculas. La WO aparece en el plan, en cada surtido, en las métricas y en los reportes, y queda guardada en cada surtido confirmado. Las filas de Excel sin WO válida se ignoran.

## Métricas y reportes

- **Métricas** (por fecha): cumplimiento, gráfica y resumen **por turno** (a tiempo, tarde, no surtidos), por línea, por materialista, **entregas tardías** ordenadas por retraso, y bitácoras de surtidos, paros y reconteos.
- **Reportes** (periodo de hasta 62 días, con filtros de turno y línea): cumplimiento por día y turno (con gráfica de barras por día), surtidos confirmados, entregas tardías, paros y reconteos, y plan de producción con WO. Cada reporte se descarga completo en **Excel** o **CSV**.
- "Tarde" = confirmado después de la tolerancia (10 min por defecto); "No surtido" = ya tocaba y no se confirmó.

## Anticipación y aprobación del plan

El plan se postea con anticipación al **inicio del turno** del plan: 24 horas por defecto. El administrador lo cambia en **Ajustes → Anticipación del plan (horas)**; con 0 no se pide aprobación.

- Altas, cambios (**Editar**: cantidad, UPH, turno, línea) y bajas (**Quitar**) de un plan cuyo turno inicia dentro de ese plazo, o ya inició, se envían a **aprobación de Gerencia**. Con 24 h y el T1 a las 07:00, el plan del T1 de mañana entra directo si se postea antes de hoy a las 07:00. Al editar, cambiar a un turno que inicia dentro del plazo también requiere aprobación.
- Mientras está pendiente, el plan vigente no cambia y un alta pendiente no genera surtidos.
- Gerencia y el administrador ven la cuenta de pendientes en la pestaña del plan y los aprueban o rechazan; sus propios cambios se aplican directo. Quien solicitó puede cancelar la solicitud.
- Cada plan guarda un historial de quién solicitó y quién aprobó o rechazó.
- **Rolar:** un plan que se posteó en tiempo (con la anticipación requerida respecto a su turno original) se recorre a un turno posterior **sin aprobación**, mientras no haya arrancado (sin surtidos confirmados ni ensamble iniciado). La fila muestra desde qué turno se roló. Para mover un plan que no se posteó en tiempo se usa **Editar**, que pide aprobación.

Esta regla la aplica la app según el gafete con el que se entra, igual que los demás roles.

## Ajustes al programa de surtido

En la pestaña **Surtido**, el panel **Control de línea** y cada NP tienen estas opciones (admin, planeador, materialista y líder de línea):

- **Línea detenida / Reanudar línea:** mientras la línea está detenida, los surtidos siguientes quedan en pausa y no se pueden confirmar. Al reanudar, los pendientes se recorren el tiempo que estuvo detenida. También está en cada tarjeta de **Líneas**.
- **Iniciar ensamble:** ningún ensamble genera surtidos hasta que alguien lo inicia; el primer surtido queda a esa hora. (Los planes anteriores a este cambio que arrancaban al inicio del turno conservan ese arranque; si alguno no arrancó y aún no tiene surtidos confirmados, **No ha arrancado** lo deja en espera.)
- **Recontar material:** cuando otra área entrega material (purga, etc.) o el conteo no coincide, se captura lo que realmente hay en la estación. Los surtidos confirmados se conservan y los pendientes se recalculan con lo contado: el siguiente surtido es cuando lo contado baja al punto de reorden, y el total por surtir se reduce en lo que ya estaba en la estación.

Los paros y reconteos se guardan en `sl_eventos` y aparecen en **Métricas → Paros y reconteos**. No se borran desde la app; un reconteo equivocado se corrige con otro reconteo.

En **BOM**, las casillas de la lista de ensambles y **Seleccionar todos** permiten eliminar varios ensambles a la vez.

## Configuración

[`js/config.js`](js/config.js) tiene la URL del proyecto de Supabase y su clave pública (anon). Esa clave está hecha para ir en el navegador; los datos están protegidos por las reglas RLS. **Nunca** pongas la clave `service_role` en este repositorio.

El esquema de la base está en [`supabase/migrations/`](supabase/migrations/).

## Estructura

```
index.html            Estructura de la página y orden de carga de los scripts
css/estilos.css       Estilos (tema claro y oscuro, menú lateral, tablero)
js/
  config.js           URL y clave pública de Supabase
  almacen.js          Lectura y escritura en Supabase (tablas sl_*) con tiempo real
  estado.js           Estado de la app, parámetros, roles y permisos
  calculo.js          Cálculo del programa de surtido (paros, reconteos, arranque)
  sesion.js           Sesión del equipo, gafete, menú y navegación
  grafica.js          Gráfica de barras apiladas (a tiempo, tarde, no surtido)
  vistas/
    plan.js           Plan de producción (aprobación de Gerencia, editar, rolar)
    bom.js            BOM por ensamble
    lineas.js         Estado de líneas
    surtido.js        Surtido por estación, paros, reconteos e inicio de ensambles
    metricas.js       Métricas por fecha: por turno, por línea, tardías y bitácoras
    reportes.js       Reportes por periodo con descarga a Excel o CSV
    gafetes.js        Registro de gafetes y roles
    ajustes.js        Parámetros de surtido y catálogo de líneas
  utilidades.js       Guardado con manejo de errores, confirmaciones y Excel
  arranque.js         Inicia la app (va al final del orden de carga)
supabase/migrations/  Esquema de la base de datos
```

Los scripts comparten funciones y variables globales, así que el orden de los `<script>` en `index.html` importa: `arranque.js` siempre va al último.
