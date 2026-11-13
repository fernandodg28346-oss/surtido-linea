# Surtido de Línea

App web para el surtido de materiales a líneas de producción: plan de producción, BOM por ensamble, cálculo de cada cuánto surtir cada NP por estación (punto de reorden mínimo 20 % según UPH), confirmación de surtido con gafete, estado de líneas y métricas por rol.

- **Frontend:** HTML, CSS y JavaScript sin compilación (ver [Estructura](#estructura)), publicado con GitHub Pages.
- **Datos:** Supabase (tablas `sl_*`), con actualización en tiempo real entre equipos.

## Cómo se usa

1. **Solicitar acceso:** en la pantalla de inicio, quien no tiene acceso presiona **Solicitar acceso** y captura nombre, gafete, correo y área. No necesita cuenta.
2. **Aprobación:** el administrador revisa la solicitud en **Usuarios** y la aprueba con un rol y una **contraseña inicial** que le entrega a la persona; la app crea la cuenta y la liga a su gafete. En su primer ingreso, la app le pide crear su propia contraseña. Cualquiera puede cambiarla después con **Contraseña** en el menú.
3. **Surtido:** el materialista o el líder de línea presiona **Confirmar surtido** y quien recibe en línea escanea su gafete. Con eso queda registrado quién surtió, quién recibió y a qué hora.

En el menú, cada quien tiene **Avisos**, **Contraseña**, **Claro/Oscuro** (tema; sin elegir, sigue al del equipo, y cada equipo recuerda el que eligió) y **Salir**. En escritorio el menú es una barra angosta de íconos que se expande al pasar el cursor; en celular va arriba, con las pestañas en una fila deslizable.

Estos son los permisos por defecto; el administrador los ajusta en **Ajustes → Permisos por rol**.

| Rol | Acceso |
|---|---|
| Administrador | Todo, incluidos Usuarios y Ajustes |
| Planeador | Plan de producción, BOM, Líneas, Surtido, Métricas |
| Gerencia | Plan de producción (aprueba cambios dentro del plazo), Líneas, Surtido, Métricas |
| Materialista | Líneas y Surtido (confirma surtidos) |
| Líder de línea | Líneas, Surtido (confirma surtidos), Métricas |
| Supervisor | Líneas, Métricas, Surtido, Plan (consulta) |
| Recibe material | No entra a la app; solo su gafete se usa para recibir |

## Puesta en marcha

### 1. Primer administrador

El primer administrador se liga a su gafete desde **SQL Editor** de Supabase (su cuenta debe existir en **Authentication → Users**; cambia el correo y el número de gafete):

```sql
update public.sl_gafetes g
set data = g.data || jsonb_build_object('user_id', u.id::text, 'email', u.email, 'rol', 'admin')
from auth.users u
where u.email = 'tu-correo@empresa.com' and g.id = 'NUMERO_DE_GAFETE';
```

A partir de ahí, el administrador aprueba las solicitudes en **Usuarios**. El registro abierto de Supabase ("Allow new users to sign up") se mantiene desactivado porque el proyecto lo comparte otra app; las cuentas las crea la función `sl-aprobar-acceso` al aprobar.

### Función de aprobación

**Restablecer contraseña:** si a alguien no le llega el correo de recuperación (sin SMTP propio solo llega a los miembros del proyecto de Supabase), el administrador presiona **Restablecer contraseña** en **Usuarios**: la cuenta recibe una contraseña temporal que el administrador le entrega, y al entrar la app le pide crear la suya. Lo hace la función [`sl-restablecer-contrasena`](supabase/functions/sl-restablecer-contrasena/index.ts), que solo responde a un administrador y solo toca cuentas ligadas a un gafete de Surtido. La cuenta es la misma de Control de Personal, así que la contraseña nueva aplica en las dos apps.

[`supabase/functions/sl-aprobar-acceso`](supabase/functions/sl-aprobar-acceso/index.ts) es una Edge Function de Supabase. Solo responde a un administrador (lo comprueba con `sl_es_admin()`), crea la cuenta con la contraseña inicial (o usa la que ya existe con ese correo), la liga al gafete y marca la solicitud como aprobada. Usa la llave de servicio que Supabase da a sus funciones; esa llave nunca está en el navegador.

### 2. Usuarios y permisos

- Una cuenta solo entra si está ligada a un gafete con un rol distinto de "Recibe material"; las demás cuentas del proyecto de Supabase no ven ningún dato.
- Solo el administrador puede crear, editar o dar de baja gafetes; lo valida la base de datos (`sl_es_admin()`), no solo la app.
- **Quitar acceso** desliga la cuenta y conserva el gafete para recibir material.
- Quien solo recibe material no necesita cuenta: registra su gafete en **Usuarios**, a mano o desde Excel.
- Las solicitudes quedan en `sl_solicitudes_acceso` (pendiente, aprobada o rechazada). Cualquiera puede enviar una sin sesión, pero solo el administrador las ve y las revisa.

### 3. Correos de Supabase

El enlace de "¿Olvidaste tu contraseña?" regresa a la app. El servicio de correo incluido en Supabase solo envía a los miembros del equipo del proyecto; para que llegue a todo el personal hace falta configurar un SMTP propio. Con la sesión abierta, cada quien puede cambiar la suya con **Contraseña**. En Supabase, **Authentication → URL Configuration**, agrega la dirección de la app publicada en **Redirect URLs** (la **Site URL** la comparte con Control de Personal; ver [Base de datos compartida](#base-de-datos-compartida)).

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

## Permisos por rol

En **Ajustes → Permisos por rol** el administrador decide qué pestañas ve cada rol (Líneas, Surtido, Plan de producción, BOM, Métricas) y qué acciones puede hacer: modificar el plan, aprobar cambios al plan, editar el BOM, confirmar surtidos, y paros/reconteos/inicio de ensamble. Se guardan en `sl_config` (documento `permisos`) y solo el administrador puede cambiarlos (lo valida la base).

- El administrador siempre tiene todo y es el único con **Usuarios** y **Ajustes**; "Recibe material" no entra a la app.
- Dar una acción también da su pestaña; quitar una pestaña quita las acciones que dependen de ella.
- Un rol sin pestañas no puede entrar (la app avisa antes de guardar).
- **Valores por defecto** regresa a los permisos de la tabla de roles de arriba.

## Catálogo de líneas y estaciones

Las líneas y sus estaciones se dan de alta desde el layout (solo administrador), para saber exactamente dónde está cada una:

- Al marcar una zona en **Líneas → Layout → Editar layout**, la línea y la estación se eligen de listas, con **+ Nueva línea…** y **+ Nueva estación…** para agregarlas al catálogo en ese momento (al escribir una estación nueva se sugieren las del BOM que aún no están en el catálogo).
- **Líneas y estaciones**, en la misma edición, agrega y quita líneas y estaciones sin marcarlas en un plano, y con un botón agrega al catálogo las zonas que ya estaban marcadas antes de existir el catálogo.
- **Ajustes → Líneas y estaciones** muestra el catálogo, avisa las estaciones del BOM que no están en él y lo carga desde Excel (columnas Linea, Estacion y Descripcion; agrega las que falten).

En el plan de producción la línea se elige del catálogo, también al editar; la carga de Excel del plan ignora las filas con una línea fuera del catálogo. En el BOM la estación de cada NP se elige de las estaciones del catálogo, y «Se produce en» ofrece las estaciones de la línea elegida; las estaciones del BOM que no están en el catálogo se marcan y la carga de Excel del BOM las avisa (se cargan igual). Mientras el catálogo no tenga líneas o estaciones, se escriben a mano. Quitar una línea o estación del catálogo no cambia el plan, el BOM ni el plano: solo deja de ofrecerse en las listas.

Se guarda en `sl_config` `lineas`: `items` con `nombre`, `descripcion` y `estaciones` (`[{nombre}]`) de cada línea.

## Work order (WO)

Cada ensamble del plan lleva su WO, obligatoria al agregarlo (a mano o por Excel) y editable con **Editar**: letras y números, con guion opcional, de 4 a 20 caracteres (p. ej. `CTI002647`); se guarda en mayúsculas. La WO aparece en el plan, en cada surtido, en las métricas y en los reportes, y queda guardada en cada surtido confirmado. Las filas de Excel sin WO válida se ignoran.

## Layout de planta (vista de Líneas)

La pestaña **Líneas** tiene dos vistas, que se eligen arriba a la derecha y cada equipo recuerda: **Tarjetas** (estado de cada línea con sus resurtidos pendientes) y **Layout**. La vista **Layout** muestra los mapas de planta (uno por site o área, se elige en **Mapa**) con cada estación de surtido marcada como un rectángulo, coloreado con su estado del día y turno elegidos (mismo cálculo que **Líneas**):

| Color | Estado |
|---|---|
| Rojo (parpadea) | Tiene surtidos vencidos; el número indica cuántos |
| Ámbar | Surtido en menos de 15 min, o línea detenida (rayado) |
| Verde | Al 100 % |
| Gris | Sin plan, esperando arranque o falta BOM/UPH |

Al tocar una estación se ven los NP pendientes y **Ir a surtir** abre la pestaña Surtido en esa estación.

**Configuración (solo administrador):** en **Editar layout**:

- **Nuevo mapa**, **Renombrar** y **Eliminar mapa** administran los mapas (el nombre suele ser el site o el área, p. ej. *GDL Norte · B2*). Eliminar un mapa borra su plano y sus estaciones.
- **Subir plano** / **Cambiar plano**: imagen JPG o PNG del mapa elegido; se reduce a 2400 px por lado.
- Se arrastra sobre el plano para marcar cada estación y se elige su línea y estación del catálogo (o se crean ahí mismo; *Toda la línea* = sin estación), con un nombre opcional. Una misma línea y estación no se puede marcar dos veces en un mapa. Las zonas se mueven arrastrándolas y cambian de tamaño desde la esquina; al tocar una se edita o se quita. **Guardar estaciones** aplica los cambios para todos.
- **Líneas y estaciones** abre el catálogo (ver *Catálogo de líneas y estaciones*).

Crear, renombrar o eliminar un mapa y subir su plano se guardan al momento. En el selector de mapa, cada uno indica cuántas estaciones tiene vencidas. Cada equipo recuerda el último mapa que eligió.

Se guarda en `sl_config`: `layout` (`mapas`: nombre, tamaño del plano y zonas de cada uno, en fracciones del plano, así que se conservan al cambiar la imagen) y un documento por imagen (`layout_img_<mapa>`; el primer mapa usa `layout_img`). Las imágenes no se leen con el resto de la configuración: solo la del mapa abierto en la pestaña. El formato anterior, de un solo plano, se lee como el mapa *Planta*.

### Flujo entre procesos

El flujo se define en el BOM: si el BOM de un ensamble tiene como NP a otro ensamble, ese **subensamble** se produce en su línea y se consume en la estación del ensamble que lo lleva. El ensamble final (empaque) es el que no es subensamble de ningún otro. Cada ensamble indica en su BOM **Se produce en** (línea y, opcional, estación); si no se captura, se toma la línea donde está planeado.

En la vista **Layout**, **Flujo** elige un ensamble final y dibuja flechas del lugar donde se produce cada subensamble al lugar donde se consume, con la tabla de pasos debajo (subensamble, dónde se produce y se consume, pza/u y empaque). Los pasos sin zona en el mapa se listan en gris.

**Editar el flujo (solo administrador):** en **Editar layout → Editar: Flujo** se toca la zona que produce y luego la que consume. Se elige el ensamble que consume, se marcan los subensambles que pasan de una a otra y se captura pza/u, empaque y, opcional, UPH. Al guardar se actualizan los NP del BOM del ensamble en esa estación y el **Se produce en** de cada subensamble. Tocar la etiqueta de una flecha abre la misma conexión para editarla. Los subensambles que llegan a esa estación desde otras líneas no se tocan.

**Flujo en vivo.** Lo que se planea producir de un subensamble se asigna a los planes que lo consumen, desde el turno en que se produce hasta el **fin del turno siguiente**, en el orden en que cada estación lo necesita (según el UPH y el punto de reorden de la estación que consume). Así se mueve directo a la siguiente estación, sin devolverlo al almacén para volver a pedirlo:

- **Surtido**: aviso «Deberás mover X pzs de producto terminado a la siguiente estación» y el panel **Producto terminado**, con cada destino, el siguiente movimiento (piezas y hora; *espera producción* si la línea aún no las tiene listas) y **Confirmar movimiento**, que registra el surtido de esa estación con el gafete de quien recibe. En la estación que consume, cada NP indica de qué línea viene y cuánto llega del almacén.
- **Plan de producción**: cada plan que produce un subensamble indica a qué línea pasa o, si no hay consumo en ese horizonte, «Sin consumo en las siguientes estaciones: N pzs → almacén» (o «Excedente N pzs → almacén» si sobra una parte).
- **Layout**: las flechas del flujo muestran las piezas por mover en la fecha y turno elegidos y la hora del siguiente movimiento.

## Avisos

La campana **Avisos** del menú muestra cuántos avisos sin leer tiene cada quien; al llegar uno nuevo aparece un mensaje. Al tocar un aviso se marca como leído y lleva a la pestaña donde se atiende.

| Aviso | Lo recibe |
|---|---|
| Cambio al plan por aprobar (alta, cambio o baja) | Administrador y quien tenga **Aprobar cambios al plan** (por defecto, Gerencia) |
| Cambio al plan aprobado o rechazado | Quien lo solicitó |
| Solicitud de acceso | Administrador |
| Línea detenida / reanudada | Administrador, planeadores, supervisores, líderes de línea y Gerencia |

Nadie recibe aviso de lo que hizo él mismo. Los generan disparadores de la base (migración `20261110180000_sl_avisos.sql`) en la tabla `sl_avisos`; cada usuario solo puede leer los suyos y marcarlos como leídos. Un error al generar un aviso nunca impide guardar el plan, el paro o la solicitud.

## Métricas

Una pestaña con dos secciones, **Resumen** y **Reportes**, que comparten los filtros: periodo por **día** (en vivo), **semana** (lunes a domingo, últimas 26 semanas) o **rango de fechas** (hasta 62 días), **turno** y **línea**.

- **Resumen:** cumplimiento, % a tiempo, no surtidos y retraso promedio; gráfica por día (en semana o rango); gráfica y resumen **por turno** y **por línea** (a tiempo, tarde, no surtidos); por materialista; **entregas tardías** ordenadas por retraso; bitácoras de surtidos, paros y reconteos.
- **Reportes:** cumplimiento por día y turno (con gráfica por día), surtidos confirmados, entregas tardías, paros y reconteos, y plan de producción con WO. Cada reporte se descarga completo en **Excel** o **CSV** con los filtros aplicados.
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

## Base de datos compartida

Este proyecto de Supabase también lo usa **Control de Personal** (repositorio `fernandodgwk-crypto/control-personal`). Antes de cambiar la base o la configuración de inicio de sesión, revisa que no afecte a esa app.

- **Cuentas:** las dos apps usan las mismas cuentas de Supabase. Una persona puede entrar a las dos con el mismo correo y la misma contraseña; si cambia su contraseña en una app, cambia en la otra.
- **Acceso:** Surtido de Línea da acceso por el gafete ligado en `sl_gafetes`; Control de Personal, por el rol en `perfiles`. Toda cuenta nueva recibe `sin_acceso` en `perfiles` (disparador `on_auth_user_created`), así que una cuenta creada desde una app no ve datos de la otra hasta que su administrador le da acceso.
- **Tablas:** Surtido de Línea usa solo tablas y funciones con prefijo `sl_`; todo lo demás es de Control de Personal. Ninguna app modifica tablas, funciones ni reglas de la otra.
- **Cerrar sesión:** cada app cierra la sesión solo en el equipo actual (`signOut({scope:"local"})`) y borra del navegador solo las claves `sb-<proyecto>-`. No uses el cierre global: sacaría a la persona de la otra app en todos sus equipos.
- **Authentication (una sola configuración para las dos):** *Allow new users to sign up* debe seguir desactivado. En *URL Configuration*, las direcciones de las dos apps deben estar en *Redirect URLs*: cada app manda el enlace de recuperación a su propia dirección y, si falta, Supabase usa la *Site URL*, que es la de una sola app. El SMTP y las reglas de contraseña aplican a las dos.
- **Cuentas desde Surtido de Línea:** la función `sl-aprobar-acceso` crea la cuenta o, si el correo ya tiene una, la liga al gafete sin cambiar su contraseña.
- **Restablecer contraseña desde Surtido de Línea:** `sl-restablecer-contrasena` solo cambia cuentas ligadas a un gafete de Surtido, pero como la cuenta es compartida, la contraseña temporal también aplica en Control de Personal. Las dos apps piden crear una contraseña propia al entrar (`debe_cambiar`).
- **Avisos:** cada app tiene su tabla (`sl_avisos` y `avisos`); ninguna escribe en la de la otra.

## Configuración

[`js/config.js`](js/config.js) tiene la URL del proyecto de Supabase y su clave pública (anon). Esa clave está hecha para ir en el navegador; los datos están protegidos por las reglas RLS. **Nunca** pongas la clave `service_role` en este repositorio.

El esquema de la base está en [`supabase/migrations/`](supabase/migrations/).

## Estructura

```
index.html            Estructura de la página y orden de carga de los scripts
img/                  Logotipo de la barra (logo.svg) e íconos de la pestaña y de la pantalla de inicio
css/estilos.css       Estilos (tema claro y oscuro, menú lateral, tablero)
js/
  config.js           URL y clave pública de Supabase
  almacen.js          Lectura y escritura en Supabase (tablas sl_*) con tiempo real
  estado.js           Estado de la app, parámetros, roles y permisos
  calculo.js          Cálculo del programa de surtido (paros, reconteos, arranque)
  flujo.js            Flujo entre procesos: subensambles, dónde se producen y se consumen
  sesion.js           Navegación, menú y usuario en sesión
  acceso.js           Inicio de sesión, solicitar acceso, primer ingreso y cambio de contraseña
  avisos.js           Avisos (campana): lista, leídos y aviso al llegar uno nuevo
  grafica.js          Gráfica de barras apiladas (a tiempo, tarde, no surtido)
  vistas/
    plan.js           Plan de producción (aprobación de Gerencia, editar, rolar)
    bom.js            BOM por ensamble
    lineas.js         Estado de líneas
    layout.js         Layout de planta: plano con el estado de cada estación y su edición
    surtido.js        Surtido por estación, paros, reconteos e inicio de ensambles
    metricas.js       Métricas: filtros de periodo, Resumen y Reportes
    reportes.js       Reportes de la sección Reportes de Métricas (tabla y descarga a Excel o CSV)
    gafetes.js        Usuarios: solicitudes de acceso, gafetes y roles
    ajustes.js        Parámetros de surtido, catálogo de líneas y permisos por rol
  utilidades.js       Guardado con manejo de errores, confirmaciones y Excel
  arranque.js         Inicia la app (va al final del orden de carga)
supabase/migrations/  Esquema de la base de datos
supabase/functions/   Edge Functions sl-aprobar-acceso (crea la cuenta al aprobar) y sl-restablecer-contrasena
```

Los scripts comparten funciones y variables globales, así que el orden de los `<script>` en `index.html` importa: `arranque.js` siempre va al último.
