## PAUSA POR CUOTA — 2026-09-10, PR #9 borrador

Último código guardado f2160a9 en fix/royal-midnight-reliability.
PR #9 https://github.com/dbatistarosa/Royal-midnight-Replit/pull/9 DRAFT; no fusionado.
CI 34437836411 todavía in_progress al guardar; Preview Comments success.
Producción sigue 4476e242151f494aa437a00fb3725a546d31e850, PR #8 verificado.
Pruebas locales actuales: 196 API + 3 web PASS; tipos API PASS.

Para retomar, en este orden:
1. Revisar cuota y CI de f2160a9. No consumir resets sin instrucción.
2. Revisar transición de Stripe: producción solo muestra reserva 13 con extra_charge
   32.16, completada 2026-08-17 y extra_charge_payment_intent_id NULL. Eso NO prueba
   ausencia de un cargo externo. No cobrarla para verificar. La cuenta TEST disponible
   en conector es acct_1Svjs2G4saqVjBnZ; GetPaymentIntentsSearch ya descubierto (requiere
   query, limit opcional). NO se ejecutó aún búsqueda Stripe. No usar búsqueda eventual
   como garantía de consistencia para cargos nuevos; solo revisión histórica.
3. Completar collect-extra-time: update importes + desglose + referencia + outbox en una
   transacción. Actualmente saveOverageBreakdown usa db global y el correo sigue void;
   no publicar ese bloque parcial sin revisión y QA. Si cambian tarifas entre reintentos,
   el request hash actual bloquea la operación: conservar/reutilizar precio congelado
   explícitamente en el flujo final en vez de crear otro intento.
4. Validar reintentos/error DB/recuperación sin tarjeta y concurrencia admin-driver en
   staging; solo entonces merge/deploy del PR #9 y smoke posterior.

La factura TEST QA del PR #8 sigue retenida en la otra cuenta documentada más abajo;
DB staging limpia, ningún correo QA enviado. Preview sigue pk LIVE/sk TEST; producción
TEST. Mapbox preview sigue sin configurar (rechazo automático previo documentado).
No considerar completados tips, E2E tarjeta/3DS, push móvil, MFA ni restauración.
## ESTADO VERIFICADO 2026-09-10 — producción PR #8; siguiente bloque local

Producción 4476e242151f494aa437a00fb3725a546d31e850 confirmada por healthz 200.
Vercel dpl_48GzEPRkMKZ2YjUQQuBjFGZnAqE1 Ready. CI main 34437462700 PASS y
Post-Deploy Smoke Test 34437564336 PASS. payments/config 200 TEST; admin sin sesión 401.
Siguiente bloque: chargeExtraTime reutiliza booking_adjustments + payAddonCard
con metadata extra_time; collect-extra-time usa el lock payment de la reserva.
Tipo API PASS; suite completa 196 API + 3 web PASS. No nueva migración.
AÚN NO PUBLICAR ESTE SIGUIENTE BLOQUE: revisar transición de cargos antiguos sin
referencia local, pues la clave Stripe anterior extra-time-ID cambia a addon-intent-
extra-time:ID. También quedan escrituras del cobro/recibo separadas y void email;
completar aplicación transaccional y QA remoto antes de fusionar.
No cobrar reservas históricas para probar. Usar datos QA y mantener Stripe TEST.
## CHECKPOINT 2026-09-10 — PR #8 fusionado; verificar deploy

PR #8 https://github.com/dbatistarosa/Royal-midnight-Replit/pull/8 MERGED.
Main 4476e242151f494aa437a00fb3725a546d31e850. CI PR 34436956325 PASS;
CI main 34437462700 en curso al guardar. Preview dpl_6Znhi8QVeasTaS6zzxy1CkzwzjUw Ready.
Migración booking_adjustments aplicada en producción versión 20260910042959:
RLS true, sin permisos anon/authenticated. Archivo 20260910043000_booking_adjustments.sql.
QA remoto staging PASS: POST extras invoice 200, repetición 200 misma factura,
cantidad distinta/misma clave 409. Una operación, un extra, importe 100→110.70
una sola vez y un correo pending/0 intentos. Limpieza DB QA completada (usuario 6,
reserva 5, extra 1, sesión, ledger, extras, auditoría y correo); conteos verificados 0.
No se enviaron correos ni se cobraron tarjetas. Queda factura TEST
in_1UDzb9DItXPfYt5g9QjKUF5C, cuenta acct_1SvNVjDItXPfYt5g, auto_advance=false,
cliente QA addon-qa-20260910@example.invalid; no anulada porque el conector solo
expone otra cuenta TEST (acct_1Svjs2G4saqVjBnZ). No afirmar limpieza Stripe completa.
Preview /payments/config sigue 503 por pk LIVE/sk TEST. Producción debe seguir TEST.
Siguiente: comprobar CI main/smoke y healthz SHA 4476e24; guardar confirmación.
Luego chargeExtraTime/collect-extra-time: referencia durable antes de confirmación,
serialización, importe congelado y aplicación transaccional. Hoy create(confirm:true)
con clave extra-time-ID y escrituras separadas sigue siendo una ventana de duplicación.
# Royal Midnight — punto de recuperación, 2026-09-09

## REANUDACIÓN 2026-09-10 — estado que prevalece

PR #7 MERGED y publicado: producción 674851849930c5565eefe1f345e7ce7204fef4de.
CI main 34436490267 y Post-Deploy Smoke Test 34436591569 PASS. Cierre manual admin
usa contador/job transaccionales compartidos; reabrir/cerrar no duplica contador.

Bloque de extras en curso: booking_adjustments guarda solicitud y precios congelados,
referencias Stripe antes de confirmar/finalizar y respuesta aplicada. Misma clave
reutiliza intento/factura; extras, importes, recibo outbox y respuesta se confirman
en transacción. UI conserva Idempotency-Key en sessionStorage durante reintentos.
Migración 20260910043000_booking_adjustments.sql aplicada SOLO en staging;
PRODUCCIÓN AÚN NO TIENE ESA TABLA. Tipos workspace PASS y 7 pruebas de proveedor
simulado PASS; pendientes CI, prueba de factura TEST en staging, limpieza QA,
migración producción y deploy. No publicar este código antes de la migración.

## Estado vigente al cerrar este bloque: PR #5 y #6 publicados

Producción final **2e62471bd55e296579aa9fc6f57157da57aed1e0**, deployment
**dpl_7dXheWC2fG2ZoFjtYjjD9BPf7ieK** Ready con www.royalmidnight.com.
PR #6 https://github.com/dbatistarosa/Royal-midnight-Replit/pull/6 MERGED.
CI main **34370765641 PASS** y Post-Deploy Smoke Test **34370941486 PASS**;
CI del PR **34370522156 PASS**. Suite acumulada: 184 API + 3 web.
healthz 200 con SHA exacto; admin/system-health sin sesión 401; payments/config
200 TEST; webhook sin Stripe-Signature 400. No se cambiaron claves ni se hicieron
cobros. El cambio de webhooks se verificó con pruebas automatizadas y rechazo de
petición sin firma; NO se afirma un E2E completo con tarjeta/3DS/Stripe real.
Los cuatro esquemas/migraciones existentes siguen vigentes: este bloque no
añadió DDL. Checkpoint documental posterior guardado en la rama de reparación.

### Próximo bloque (pendiente, no implementado)

1. Llevar el cierre manual admin de PATCH /bookings/:id a la misma garantía de
   contador + job en la transacción; hoy conserva efectos separados tras el commit.
2. /admin/bookings/:id/extras necesita identificador de operación persistido y
   reintentos idempotentes: hoy crea cargos/facturas sin clave estable, inserta
   extras y precio por separado y aún usa void para desglose/recibos. Congelar
   cantidades/precio/impuestos por operación, serializar por reserva y guardar
   referencia Stripe antes de confirmar un cargo; confirmar extras y outbox juntos.
3. collect-extra-time y chargeExtraTime conservan ventana entre el éxito Stripe
   y la escritura de la referencia. La clave Stripe por reserva no sustituye un
   registro persistente fuera de la retención de idempotencia del proveedor.
   No reutilizar extra_charge_payment_intent_id para un intento sin cobrar: la UI
   interpreta su presencia como COBRADO; añadir estado/referencia de operación aparte.
4. Tip/checkout también permite crear varios intents; completar idempotencia,
   reconciliación de cargos/facturas, E2E TEST, push móvil, MFA y restauración.
No afirmar que todo el informe RM-01–20 está completado. Mantener pausa al 3 % y
no consumir créditos de reinicio sin petición explícita.

### Evidencia del PR #5

PR #5 MERGED y producción verificada en f0164dd3f5f0c396dcb4ef50093ca469b4f38122.
CI main 34370136413 y Post-Deploy Smoke Test 34370315788 PASS. CI del PR 34369647853
también PASS (173 pruebas API y 3 web). Prueba REAL de staging: POST complete dos
veces → 200/200; total_rides pasó de 1 a 2; un job trip-completion. Tras ejecutar
worker y forzar un reintento: dos intentos done, solo un recibo, un correo de
referido y un código premio. Se eliminaron los usuarios QA 4/5, conductor 1,
reservas 3/4, sesión, job, auditorías, premio y dos correos pendientes de staging.
No se enviaron correos ni se hicieron cobros. Las credenciales QA ya no son válidas.

PR #6 publicado: webhooks con metadata.type tip/extra_time/addon_extras
se registran en financial_events y no se comparan con el precio principal ni
modifican su intent/factura/estado o reenvían confirmaciones. 11 pruebas nuevas
PASS y tipos API PASS. CI y publicación completados según la evidencia superior.
No requiere DDL. Quedan pendientes cargos adicionales idempotentes, facturas,
respuesta Stripe perdida y completar también la ruta de cierre manual admin.

### Detalle del bloque de cierre (ya publicado)

Cambios locales preparados: transición completed, contador y desglose en una
transacción con job trip-completion; worker encola recibo con deduplicación.
Reintento de complete devuelve el viaje existente. Premio por referido usa lock
por usuario y transacción común para promo, marca de recompensa y mail_outbox;
tolera ejecución tardía después de una segunda reserva. 7 pruebas nuevas PASS
de rollback/reintento, tipos API PASS. CI/preview, staging, limpieza QA y publicación
completados según la evidencia superior. No requiere migración: usa las tablas ya aplicadas.
La referencia de cobro extra se espera antes de responder, pero aún quedan por
resolver la reconciliación de respuesta Stripe perdida y extras/facturas.
La información de producción anterior sigue vigente hasta completar el deploy.

## REANUDACIÓN 2026-09-09 — prevalece sobre las pausas históricas

### Cierre verificado del despliegue

PR #4 también MERGED. Producción sirve ahora **6fcde93baa2ff22a156de0ddc3caadefc3d4888f**,
deployment **dpl_6DwxVgLFGJdgGPEmGgthAyar62Gn**. CI de main **34319163545 PASS**
y Post-Deploy Smoke Test **34319282616 PASS**. El fallo de auditoría del merge
anterior queda resuelto por este parche; no se desactivó ninguna validación.
Verificación FINAL: healthz 200 con SHA exacto, admin/system-health sin sesión
401, payments/config 200 TEST y quote 200/40.62 USD. Workers comprobados 200 en
el primer despliegue y sus dos registros en cron_runs de producción son success.
No se enviaron correos de prueba a clientes ni se cobró ninguna tarjeta.
Expo config SDK 56 y serialización local Nodemailer también PASS. Builds locales
web/API e import del bundle terminaron correctamente (esbuild requiere ejecución
normal: el sandbox Windows deniega lectura al resolver directorios ascendentes).

GitHub: https://github.com/dbatistarosa/Royal-midnight-Replit/pull/3 y /pull/4.
El checkpoint documental posterior se guarda en fix/royal-midnight-reliability;
es normal que su SHA difiera de producción, porque solo añade esta evidencia.

**Siguiente bloque concreto, todavía NO corregido:** bookings.ts conserva
efectos después de res.json al finalizar viaje y cobrar extras (guardar desglose,
incrementar totalRides, recibos y recompensa por referido). No basta reemplazar
void por await: hacer transaccionales los registros locales y persistir los
efectos reintentables antes de responder; probar caída/reintento sin duplicar
cobros, extras, contadores o recibos. Referencias de esta revisión: secciones
end-trip ~2670–2760, collect-extra-time ~2890–2920 y add-extras ~3120–3185.
Mantener el bloqueo de pago por reserva y claves idempotentes en cualquier arreglo.
Después completar E2E TEST (tarjeta/3DS/webhooks) con configuración propia de
staging, push móvil/dispositivo, conciliación corporativa, MFA y restauración.
No declarar cerrado todo el informe RM-01–20 ni repetir migraciones ya aplicadas.

Las CUATRO migraciones ya se aplicaron correctamente en PRODUCCIÓN con la
autorización específica recibida. Versiones remotas: schema_baseline 20260909061016,
reliability_foundation 20260909061032, reliability_settlement 20260909061038 y
reliability_indexes 20260909061044. Checksums verificados; se mantienen 7 usuarios
y 15 reservas. Cero tablas públicas sin RLS y cero grants anon/authenticated.
Columnas de verificación y factura presentes. No hubo borrado de datos.

PR #3 MERGED; main ccd5d96c4420566a3806bccceba49d5a4b895f8d ya desplegado en
producción, deployment dpl_BiB545zDpXzxQCM7nyDaccDptDV8 Ready. Dominio canónico
https://www.royalmidnight.com/api/healthz devuelve ese SHA. Smoke test automático
34318250352 PASS. Workers booking-jobs/mail-outbox HTTP 200 con colas vacías.
Cotización MIA → Fontainebleau business HTTP 200, total 40.62 USD (sin reserva).
Inicio y formulario /book cargan sin errores de consola. Stripe config HTTP 200
en TEST: el propietario confirmó expresamente MANTENER PRUEBAS POR AHORA.
No habilitar cobros reales ni cambiar claves por iniciativa propia.

CI del head previo 0a8c93a PASS, pero CI de main 34318130454 detectó nuevas
alertas en dependencias. Corrección preparada: Nodemailer 9.1.1, qs 6.16.0,
js-yaml 4.3.2, xmldom 0.8.15/0.9.12 manteniendo sus ramas y fflate 0.8.3.
Auditoría local ahora exit 0: 1 moderate (decode-uri-component bajo Expo) y
2 high previamente exceptuadas (image-size/Metro). No se añadieron excepciones.
El parche sugerido decode-uri-component 0.4.3 no existe en npm; 0.5 implica
revisión de compatibilidad aparte. Tipos PASS; API 166/18 y web 3/1 PASS.
Estas pruebas y publicación quedaron completadas; ver cierre verificado arriba.

Supabase security advisor: 42 INFO RLS sin policies (tablas privadas de API;
sin acceso anon/authenticated) y 1 WARN extensión en public, sin errores.
Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
Conservar los pendientes funcionales históricos: checkout completo/3DS en entorno
de pruebas, notificaciones móviles reales, conciliación/payouts y restauración.
Mantener regla de pausa al 3 %; no usar créditos de reinicio sin autorización.

## PAUSA POR LÍMITE — ESTADO DEFINITIVO AL CERRAR

Se alcanzó exactamente 3 % restante en la ventana de cinco horas (97 % usado).
El propietario pidió detenerse en ese umbral. No iniciar más trabajo hasta que
haya uso disponible. No se consumieron créditos de reinicio.

El propietario RESPONDIÓ a la pregunta específica: **«Autorizar la migración de
producción»** para el baseline del PR #3. La autorización ya está dada; NO volver
a pedirla por el rechazo anterior. Al retomar, reintentar por el mecanismo normal
la migración baseline original, aportando esta autorización explícita y la prueba
de equivalencia. No se llegó a reintentar tras esa respuesta porque se alcanzó el
umbral. PRODUCCIÓN NO TIENE NINGUNA DE LAS CUATRO MIGRACIONES NUEVAS NI EL DEPLOY.

Resultado final del segundo bloque: **166 pruebas API en 18 archivos: PASS**;
3 pruebas web previamente PASS; tipos API/móvil PASS tras las últimas correcciones.
La prueba de caché ya terminó correctamente. Datos QA de staging completamente
limpiados. Revisar git log para el segundo commit y verificar CI de ese SHA antes
del merge; el CI aprobado anteriormente corresponde a c8d401b.

Próximas acciones: revisar uso; leer este estado; comprobar git/CI del PR #3;
aplicar las cuatro migraciones ordenadas en producción con la autorización ya
recibida; verificar esquema; completar build/preview del último SHA; publicar
solo esa versión comprobada y revisar el dominio, API y workers. Mantener el PR
en borrador mientras falten estos pasos. docs/OPERATIONS.md contiene comandos y
procedimiento. Conservar los pendientes de alcance descritos al final.

## ACTUALIZACIÓN MÁS RECIENTE — sustituye el estado histórico de abajo

- Checkpoint `c8d401b` ya está COMMITTEADO Y SUBIDO a GitHub. PR borrador #3:
  https://github.com/dbatistarosa/Royal-midnight-Replit/pull/3 . CI de ese commit
  terminó correctamente (run 34254247807). Leer git log/status para el segundo
  checkpoint, que se prepara después de esta actualización.
- Las pruebas remotas pendientes SÍ se completaron tras renovar la sesión QA:
  correo no verificado → 403; sesión con rol passenger → admin 403; emisión de
  verificación → 200; primer consumo del enlace → 200; segundo consumo → 400;
  reserva recuperada tras verificar → 200; cancelación repetida → 200 ambas veces;
  worker booking-jobs → 200 y job done con un solo intento.
- TODOS los datos QA fueron limpiados de staging: usuario 3, sesión, reserva 2,
  auditoría, jobs y los tres correos pendientes. Comprobación final: cero usuarios
  QA, cero reservas QA y cero correos en cola. El intento Stripe TEST fue cancelado
  por el worker; nunca se cobró una tarjeta.
- Hay ahora CUATRO migraciones locales y las cuatro están aplicadas en staging.
  Nueva: `20260908165211_reliability_indexes.sql`, conserva 21 índices operativos
  existentes en producción que no figuraban como constraints en el baseline.
  Se comprobaron índices únicos de itinerario, zonas por conductor y OTP.
- PRODUCCIÓN SIGUE SIN MIGRAR NI DESPLEGAR. La revisión automática rechazó:
  (1) ejecutar schema_baseline por DDL amplio en producción y (2) registrar
  baseline como metadatos aun verificando equivalencia. Ninguno se ejecutó.
  No repetir el segundo enfoque: fue expresamente rechazado como alternativa.
  Se envió una pregunta de autorización específica al propietario, aún pendiente
  al escribir este estado. Esperar su respuesta para la migración dependiente.
- Prueba de equivalencia del baseline: producción tiene exactamente las 380
  columnas y 63 restricciones capturadas, cero diferencias, todas sus tablas
  públicas con RLS y cero grants anon/authenticated. Esto no sustituye la aprobación
  automática requerida ni significa que las migraciones de funciones nuevas existan.
- Cambios adicionales locales: validación de pasajeros/extras/emails antes de
  cotizar, rechazo de extras duplicados/inactivos, controles de conductor y vehículo
  en reasignación admin, hidratación móvil protegida frente a logout concurrente,
  configuración del cliente en tarea GPS sin interfaz, límites de tiempo de Stripe
  y push, y separación Redis por entorno+identidad de base de datos.
- Última tanda completada: 163 pruebas API y tipos API/móvil PASS. Se añadieron
  después 3 pruebas de separación de caché: la ejecución de las 166 pruebas se
  inició y debe verificarse antes de dar por cerrado el segundo checkpoint.
- API build más reciente pasó antes del último ajuste Redis. Web pública previa
  a este deploy: portada y formulario de reservas cargaron en navegador sin errores
  de consola. No confundir esa revisión visual con probar los cambios nuevos.
- `scripts/migrate.mjs` y módulos nuevos fueron formateados. Scripts temporales
  remediate-step1..10 se eliminaron; NO hay que reejecutarlos.
- El pnpm local intentó reinstalar node_modules después de cambiar scripts de
  package.json y abortó sin TTY. Los comandos directos Node para tsc/vitest/build
  funcionan; CI limpio también pasó. No borrar dependencias como atajo.
- GitHub connector no tiene permiso para crear PR (403); se creó con la autenticación
  de git credential existente, sin exponer su token. Scripts temporales en .cache.
- Último uso consultado: 11 % restante en ventana de 5 horas, 70 % semanal.
  Guardar/commit/push antes del 3 % y detenerse. No gastar un reset.

El resto del documento conserva el inventario del primer checkpoint como referencia;
en caso de contradicción, prevalece esta actualización.

## Instrucción persistente

El propietario autorizó corregir la revisión por partes, verificar regresiones,
migrar, subir a GitHub y desplegar. Guardar avances continuamente. Consultar uso
periódicamente; si alguna ventana aplicable tiene 3 % o menos restante, guardar el
punto exacto y detenerse hasta el reinicio. No gastar créditos de reinicio sin petición.

## Estado real de publicación

- Rama local: `fix/royal-midnight-reliability`. Comprobar git status/log al retomar.
- Código guardado en disco. Todavía NO hay push de esta reparación, merge ni deploy
  de producción. Comprobar si se alcanzó a crear un commit de checkpoint posteriormente.
- Las tres migraciones están aplicadas SOLO en staging, no en producción.
- Supabase producción: `qpqmefenkleyzwnlleih`; staging: `tktdvxodcitwlcqcrssu`.
- GitHub: https://github.com/dbatistarosa/Royal-midnight-Replit
- Dominio: https://www.royalmidnight.com
- Último preview listo: https://royal-midnight-nku6ok6u3-dbatistarosas-projects.vercel.app
- Deployment: `dpl_GR1wvni4PNoLyP4jtSbxwsZNJ77X`.
- Vercel proyecto `prj_7qFi6uf1g5DwLurmTg9x5uMWXEv2`, equipo
  `team_XBPoblBJEATCWm6vAzUXBzJy`, CLI autenticada como `dbatistarosa`.
- Preview desplegado desde cambios sin commit. Su revision todavía muestra el
  SHA anterior `dfc16b39095002104d5d8b2fdfd670f365f88ed6`; no atribuir ese SHA al cambio.

## Implementación guardada

1. Verificación de correo con token consumible y vencimiento, normalización de
   email y prohibición de reclamar reservas por correo no verificado.
2. Reserva/extras/itinerario/precio/promoción en transacción, idempotencia de checkout.
3. Reutilización e idempotencia de Stripe; validación de importe/moneda/propietario;
   bloqueo por reserva compartido entre cobro, cancelación, aceptación y edición.
4. Inbox de eventos Stripe, transiciones condicionales, hechos financieros y
   reintentos duraderos. Reembolsos acumulados no retroceden con eventos desordenados.
   Captura ambigua se reconcilia antes de devolver una reserva a pendiente.
5. Facturas aisladas por reserva, sin eliminar partidas pendientes ajenas.
6. Outbox de email y app_jobs con deduplicación, lease, backoff y límite de intentos.
   Resend usa timeout de 8 segundos e idempotencia; SMTP tiene tiempos acotados.
7. Agenda por intervalo completo/charter/margen de una hora, bloqueo por conductor,
   validación de vehículos propios y capacidad. Edición admin conserva extras y
   desglose y cancela el intento no cobrado antes de cambiar la tarifa.
8. Comisión por reserva y cierre semanal America/New_York, incluido DST.
9. Web revalida sesiones, limpia caché entre cuentas y maneja 401. Logout móvil
   revoca sesión, limpia caché y detiene ubicación.
10. Portales/seguimiento/confirmación con carga diferida. Eliminadas reparaciones
    de identidad por nombre y migraciones automáticas de index.ts.
11. Publicador social reanudable con container_id/leases; sin espera de 180 segundos.
12. CI obligatorio para tipos, pruebas, builds y carga del bundle; Browserslist
    actualizado y preinstall portable. Arranque API corregido para Windows.
13. Endpoint admin system-health, registro cron y workers cada cinco minutos.
14. `scripts/migrate.mjs`: baseline, transacciones, bloqueo de migración y checksum
    del SQL. Identifica migraciones aplicadas por nombre+contenido, porque MCP asigna
    timestamps distintos. El runner requiere todavía ensayo con conexión directa.
    SQL/checksums sí se comprobaron por MCP. Retirado push-force del paquete db.

## Evidencia conseguida

- 151 pruebas API (16 archivos) y 3 web: PASS.
- Typecheck global API/web/móvil/mockup/scripts: PASS antes de los últimos cambios
  de scripts. Repetir al cierre.
- Builds web/API y segundo preview: PASS, 15 páginas prerenderizadas.
- JS inicial: aproximadamente 3.711 KB antes, 851 KB después; Mapbox separado.
- Audit producción: PASS con exclusiones previas; quedan 6 moderadas y 2 altas
  ignoradas de Expo/Metro. No afirmar que no hay vulnerabilidades.
- Staging: SQL con rollback verificó email único normalizado, reinicio de verificación
  tras cambio de email, actor de auditoría y deduplicación de outbox.
- Advisors staging: solo INFO RLS sin políticas en tablas de acceso exclusivo del
  servidor. Sin grants anon/authenticated; producción también carecía de esos grants.
- SQL remoto/local coincide normalizando CRLF y espacios externos. MD5 verificado:
  schema_baseline `b49e4d97035667bb474f4b2f8559e75d`;
  reliability_foundation `7c31a263e383a5b5c4e7c9cf5195e480`;
  reliability_settlement `5e9a675f59aa5deb73b5f33085278631`.
- Preview healthz y system-health autenticado: 200, staging correcto, Redis=true,
  cronConfigured=true. Email verificado de QA: false.
- Dos llamadas a create-intent devolvieron EL MISMO PaymentIntent TEST. No se
  confirmó, autorizó ni cobró ninguna tarjeta.
- Preflight producción: 7 usuarios, 15 reservas, cero duplicados normalizados de
  email, una zona de servicio y tres asignaciones de conductores aprobados sin hold.

## Configuración y bloqueos

- GitHub no tenía secretos Actions: ahora existe CRON_SECRET.
- Se agregó CRON_WORKER_SECRET a producción y preview Vercel, preservando el
  CRON_SECRET anterior. Código nuevo acepta ambos. Producción vieja aún NO acepta
  el nuevo: completar deploy para que los workflows funcionen.
- Credenciales solamente en archivos ignorados .vercel; no imprimir ni subir esa
  carpeta o .cache. Vercel MCP 403; CLI funciona. env pull devuelve [SENSITIVE].
- Preview mezcla publishable key Stripe LIVE con secret key TEST; config rechaza
  esa mezcla. Se necesita la publishable key TEST de la misma cuenta para el E2E UI.
- Preview no tiene Mapbox, email ni APP_URL propio. Cotización falla cerrada 422.
- Revisión automática RECHAZÓ ampliar tokens Mapbox de producción a preview por
  exposición del secreto a más despliegues. PATCH NO se ejecutó. No reintentarlo por
  otro canal. Usar configuración específica de staging o pedir autorización explicando
  el rechazo si fuera necesario; no desactivar la restricción geográfica para probar.
- Otra prueba remota fue rechazada por el límite de uso de la revisión automática,
  que indicó reintentar a las 8:02 AM. Medidor de cuenta consultado: 100 % restante
  en cinco horas y 84 % semanal. Son mecanismos diferentes.

## QA temporal pendiente de limpiar — SOLO staging

- Usuario id 3: `reliability-qa-20260908@example.invalid`. Actualmente passenger;
  antes fue admin para comprobar system-health. Sesión expira a dos horas. Bearer
  solo en `.vercel/.qa-admin-header`; token de base de datos está hasheado.
- Reserva id 2: awaiting_payment, sin user_id, mismo email QA, precio 100 USD.
  PaymentIntent TEST asociado sin cobro. No existen otras reservas creadas por esta
  tanda; la solicitud POST /bookings falló 422 antes de insertar.
- La tanda GET /bookings/2, GET /admin/system-health como passenger y POST
  /auth/email-verification fue bloqueada ANTES de ejecutarse. NO reportarla como PASS.
- `.cache/qa-request.mjs` prueba APIs de preview y redacta secretos al imprimir.
  Argumentos: URL, ruta, verbo, JSON/none, archivo header/none, archivo de salida.
- Al terminar: cancelar mediante API, procesar booking-jobs y limpiar solamente
  filas identificadas de QA en app_jobs/mail_outbox/payment_events/financial_events,
  sesiones/verificaciones de usuario 3, reserva 2, su auditoría y usuario QA. Revisar
  relaciones. No ejecutar correo hacia destinatarios reales de staging.

## Orden para retomar

1. Leer este archivo, git status/log y límites. Preservar cambios iniciales del
   propietario: itinerario, zonas, social y .env.example. Scripts remediate-step1..10
   ya se ejecutaron: NO repetirlos; se pueden retirar, son temporales del agente.
2. Completar permisos, verificación de email, cancelación repetida y workers con QA.
   Revisar visualmente la web mediante navegador. CUA inicializado, solo in-app iab.
3. Revisar pendientes: hydrate móvil concurrente con logout/background task;
   validar conductor y vehículo en PATCH admin de asignación; efectos aún void en
   extras/fin de viaje; restricciones débiles de cantidades en CreateBookingBody.
4. Tipos, tests, builds, bundle import, audit y revisión de secretos/diff. Guardar
   checkpoints Git por bloques cuando vuelva a funcionar la aprobación de comandos.
5. Aplicar las TRES migraciones de supabase/migrations en producción EN ORDEN;
   verificar columnas, índices, RLS y checksums. No usar el viejo journal Drizzle.
6. Commit/push, PR a main, esperar CI y publicar. Autorización ya dada por usuario.
7. Verificar dominio, cotización pública, permisos, Stripe config, workers/email
   y revisión desplegada. Limpiar QA y actualizar evidencia.

## Alcance todavía pendiente

No declarar el proyecto totalmente terminado. Push móvil necesita Firebase/APNs y
dispositivo real; falta E2E con tarjeta/3DS/webhook, registro completo de liquidaciones
y facturas corporativas, MFA, panel de excepciones y ensayo de restauración. Las
mejoras comerciales opcionales del informe no están implementadas.



## REANUDACION 2026-09-16 — PR #9 listo para QA remoto

El flujo de tiempo adicional ya guarda el PaymentIntent sin confirmar en
booking_adjustments, congela importe y minutos, y luego confirma Stripe. La
liquidacion local (importe, desglose, referencia, respuesta y recibo outbox) se
confirma en una sola transaccion. collect-extra-time usa el lock de la reserva.
Los viajes historicos sin operacion durable devuelven
OVERTIME_RECONCILIATION_REQUIRED y nunca se cobran automaticamente. La busqueda
TEST en acct_1Svjs2G4saqVjBnZ no encontro PaymentIntent extra_time para reserva
13, pero eso no descarta otra cuenta y por eso sigue bloqueada para conciliacion.
Tipos API PASS; suite 201 API + 3 web PASS. Pendiente: commit/push, CI y QA remoto
con fixture nuevo; luego merge/deploy/smoke. Produccion aun esta en 4476e24.
