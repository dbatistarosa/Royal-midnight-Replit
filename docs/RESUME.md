## VERIFICADO 2026-09-18 — QA autenticada completada y entorno estable

Se reparó el layout de dependencias regenerando únicamente `node_modules` desde
`pnpm-lock.yaml`; no se cambiaron versiones ni archivos fuente. Suite final:
`pnpm test` PASS con 27 archivos/209 pruebas API y 1 archivo/3 pruebas web.
`pnpm run typecheck` PASS para librerías, API, web, móvil, mockup y scripts.

QA remota en preview `royal-midnight-14yj8lrdv-dbatistarosas-projects.vercel.app`
con Stripe TEST: se creó pasajero QA id 7 con correo `.invalid`, login PASS,
GET de tarjetas guardadas PASS con cero tarjetas y GET de reservas PASS sin
reservas. La cotización controlada devolvió 409 por capacidad de la categoría,
sin insertar reserva ni iniciar pago. No se creó PaymentIntent.

Limpieza verificada directamente en staging `tktdvxodcitwlcqcrssu`: usuario QA,
sesiones, reservas, jobs y correo quedaron en cero. Se eliminaron del disco los
archivos temporales que contenían contraseña/token QA y el respaldo de
dependencias incompletas. Producción no recibió escrituras.

El flujo de tarjeta guardada no puede certificar un cobro TEST porque la fixture
no tenía tarjeta guardada y el preview sigue mezclando claves LIVE/TEST para el
checkout UI. El mapa del conductor requiere una fixture aprobada con conductor,
viaje y Mapbox operativo. Siguen fuera de alcance verificado: push móvil con
credenciales/dispositivo, MFA, ensayo de restauración, conciliación histórica,
corporate settlement completo y E2E 3DS/webhook.

## VERIFICADO 2026-09-18 — staging limpio y producción estable

Se continuó desde `310b25b` respetando Stripe TEST, sin tocar producción con
datos QA y sin consumir resets. Staging `tktdvxodcitwlcqcrssu` quedó confirmado
limpio: 0 usuarios, 0 reservas, 0 app_jobs pendientes, 0 correos pendientes y
0 booking_adjustments.

Comprobación pública de producción: healthz 200 con revisión
`3335e6bc33dbf32b3c655cb500c0de53b005c631`, payments/config devuelve publishable
key `pk_test_` y el cron sin autenticación devuelve 401.

La fixture QA nueva aún no se creó. El intento de levantar el API local contra
staging fue detenido porque una reconstrucción de pnpm dejó incompletos los
enlaces del `node_modules`; `pnpm install --frozen-lockfile` reporta el lockfile
intacto pero no restaura los ejecutables. No se borraron archivos fuente ni se
modificaron dependencias declaradas. Resolver este entorno antes de crear filas
QA, para poder registrar y limpiar toda la prueba mediante el API.

Siguiente acción: reparar el layout local de dependencias, levantar el API con
la configuración preview/staging sin imprimir secretos, crear una fixture QA
identificable y ejecutar tarjeta guardada, propina, extras, extensión y mapa;
limpiar después todas sus filas, jobs, correos y PaymentIntents TEST.

## VERIFICADO 2026-09-17 11:51 EDT - programador reparado

PR #10 https://github.com/dbatistarosa/Royal-midnight-Replit/pull/10 MERGED.
Produccion 3335e6bc33dbf32b3c655cb500c0de53b005c631; Vercel deployment
dpl_F5SCQDZWW6jvPnFHCmVSDFJyhFCF Ready con www.royalmidnight.com.
CI PR 35242221391, CI main 35242436210 y smoke 35242654207: success.
healthz 200 con SHA exacto, payments/config TEST, cron sin autenticacion 401.

CRON_WORKER_SECRET exclusivo sincronizado en Vercel production y Vault
royal_midnight_worker_secret. GitHub CRON_SECRET conservado. La descarga de
variables de Vercel devolvio valores vacios; no usar .env.scheduler.local.
Vault no concede acceso a decrypted_secrets a anon/authenticated/PUBLIC.

SQL de scripts/configure-worker-cron.sql aplicado despues del despliegue y de
verificar worker autenticado 200. Schedules activos: trip-reminders jobid 2 cada
5 minutos, booking-jobs jobid 7 y mail-outbox jobid 8 cada minuto. Jobid 1 existente
check-reservation-status intacto. GitHub Actions queda como respaldo.

Prueba desde pg_net/Vault trip-reminders request 135409: HTTP 200. Primera
ejecucion automatica de workers 15:51 UTC: cron_runs success, respuestas pg_net
135410-135412 HTTP 200 sin timeout. Cero app_jobs pendientes y cero mail_outbox
pendientes; el review_request retenido se proceso por el worker normal.
No se crearon reservas ni cobros QA. Reservas historicas 15/16 canceladas y sus
jobs done/1 intento; cero reservas vencidas abiertas al revisar.

La revision automatica rechazo push directo a main. Se resolvio por PR #10 con
CI aprobado y merge normal mediante credenciales Git existentes (conector GitHub
solo lectura/403). No hace falta autorizacion adicional pendiente para este bloque.
Este checkpoint documental posterior queda en la rama de reparacion; no cambia
el codigo desplegado ni requiere otro build de aplicacion.

Siguiente: QA autenticado tarjeta guardada, propinas, cargos extras/extension y
mapa driver. Pendientes generales: push movil, MFA, restauracion y conciliacion.
Mantener Stripe TEST y no cobrar reserva historica 13. Respetar pausa al 3 %;
no consumir reset sin instruccion. No declarar el proyecto entero terminado.

## CONTINUACION 2026-09-17 - revision del programador

Base recuperada: produccion y rama en b038ca2. Reservas 15 y 16 canceladas,
jobs de cancelacion done/1 intento; cero reservas vencidas abiertas. Todos los
jobs observados done; un review_request pendiente esperando el worker de correo.
Actions success pero con intervalos de horas. Se descubrio un segundo programador
Supabase trip-reminders cada 5 minutos: SQL succeeded pero HTTP 401 persistente.

Preparada credencial exclusiva CRON_WORKER_SECRET en Vercel production y Vault
royal_midnight_worker_secret. CRON_SECRET de GitHub conservado. El archivo local
.vercel/.cron-worker-secret es obsoleto; no usarlo. Credencial nueva solo en archivo
ignorado .vercel/.supabase-worker-secret. No imprimir credenciales.

scripts/configure-worker-cron.sql verificado en transaccion con ROLLBACK. Repara
trip-reminders y programa booking-jobs/mail-outbox cada minuto usando Vault.
En este checkpoint falta: desplegar Vercel para cargar la variable, comprobar
autenticacion, aplicar SQL y verificar respuestas HTTP y colas. No considerar
cerrada la reparacion hasta registrar la evidencia posterior.

Siguiente bloque funcional: QA autenticado de tarjetas/propinas/extension y mapa
driver; luego push movil, MFA y restauracion. Mantener Stripe TEST, no cobrar
reserva historica 13, parar al 3 % restante y no consumir resets sin instruccion.

## CHECKPOINT 2026-09-16 09:40 EDT — `88b053a` publicado y cron reparado

Producción quedó publicada manualmente desde Vercel en `88b053a2ef75f74a33342c7b09071570dbdb6814`.
Deployment final `dpl_Anday9Vs8iG4Dic8C2KxrJ539jCv` Ready, alias aplicado a
`https://www.royalmidnight.com`. Verificación post-deploy: `/api/healthz` 200 con
SHA exacto `88b053a2ef75f74a33342c7b09071570dbdb6814`; `/api/payments/config` 200
con `pk_test_`, por lo que Stripe sigue en TEST.

Durante la revisión de logs apareció un `401` en `POST /api/cron/trip-reminders`.
Se corrigió rotando y sincronizando un secreto nuevo en Vercel production
(`CRON_SECRET` y `CRON_WORKER_SECRET`) y GitHub Actions (`CRON_SECRET`), sin imprimir
secretos. Se hizo redeploy para cargar las variables nuevas. Prueba manual del workflow
`trip-reminders-cron.yml` terminó `success` en GitHub Actions run `35103186724`,
head SHA `88b053a2ef75f74a33342c7b09071570dbdb6814`; logs Vercel confirmaron
`POST /api/cron/trip-reminders` 200 a las 09:38 EDT. No hubo cambios de código en esa
corrección externa de secretos.

Siguiente bloque: verificar con más detalle el estado de reservas vencidas/jobs desde
la app o con acceso seguro a base de datos si está disponible; continuar QA real de
tarjeta guardada, propinas, cargos extra y extensión por hora; revisar Mapbox en las
pantallas del conductor; después priorizar push móvil, MFA/admin security,
restauración/backups operativos y cobertura por zonas/conductores.

QA adicional del formulario público `/book`: `/api/quote` en producción rechazó
Classic Sedan con 3 pasajeros + 4 maletas (`409`) y aceptó SUV con la misma combinación
(`200`). En navegador, después de esperar datos de pricing, 3 pasajeros + 4 maletas
mostró solo Royal Luxury SUV; 3 pasajeros + 3 maletas mostró Classic Sedan y Royal
Luxury SUV. No se creó reserva ni se hizo cargo para esta prueba.

## CHECKPOINT 2026-09-16 02:10 EDT — tarjetas, mapa, compatibilidad SUV y extensión por hora

Producción permanece en `31c572f2a92345ddb52db2c83e882e9212753dcb`, con CI y smoke PASS,
Stripe TEST. El bloque nuevo está guardado en la rama `fix/royal-midnight-reliability`.
Incluye: Payment Element con CustomerSession para reutilizar tarjetas del propio pagador;
mapa/ruta, millas y tiempo en viajes del conductor; regla central direccional que permite
Premium SUV (`suv`) aceptar Classic Sedan (`business`) sin permitir lo inverso y conservando
capacidad de pasajeros/maletas; aviso por correo e interfaz 20 minutos antes de terminar un
charter; botón del pasajero para comprar una hora adicional con tarjeta guardada, precio
congelado, Stripe idempotente y actualización transaccional de horas/recibo.

Verificación: typecheck completo PASS, 209 pruebas API + 3 web PASS, build completo PASS.
No hay migración nueva en este bloque. No se hicieron cobros de prueba ni cambios en Stripe.
Antes de publicar: revisar el SHA del checkpoint, empujarlo si el push quedó pendiente por el
límite, esperar CI/preview, probar visualmente las pantallas y el flujo TEST en staging, luego
integrar a main, verificar deploy/healthz/smoke y comprobar el sweep de reservas #15/#16.
El límite de 5 horas marcó 100% usado; hay dos créditos de reset disponibles, NO consumirlos
sin autorización explícita del usuario.

## CONTINUACIÓN 2026-09-16 — disponibilidad real y vencimiento automático

Rama `fix/royal-midnight-reliability`, PR #9 todavía borrador. El commit publicado
`7ada4c8` contiene el cobro de sobretiempo durable y transaccional. Encima de ese
commit hay un bloque local verificado y pendiente de commit/push que:

- exige pasajeros y maletas simultáneamente en cotización y creación;
- muestra una categoría solo si hay conductor aprobado, zona, vehículo exacto y
  espacio real en su agenda, descontando otras reservas abiertas del mismo mercado;
- serializa todas las decisiones de cupo para evitar sobreventa entre categorías;
- cancela reservas sin conductor cuando ya pasó la recogida y crea un job durable
  para cancelar la autorización o devolver 100 %, más el aviso al pasajero;
- valida la categoría de conductor en admin, sincroniza su vehículo por defecto y
  filtra en el dashboard del conductor solamente vehículos compatibles;
- añade `20260916093000_backfill_default_vehicle_capacity.sql` para completar solo
  capacidades nulas de vehículos por defecto heredadas de perfiles antiguos.

Verificación local: typecheck workspace PASS, 206 pruebas API + 3 web PASS y build
completo PASS. Los avisos de sourcemap/chunks del frontend ya existían y no rompen
el build. Antes de publicar: revisar diff, commit/push, aplicar migración primero en
staging, probar cotización/cupo/vencimiento sin cargos reales, luego producción,
merge/deploy y smoke. Stripe debe seguir TEST. No cobrar reserva histórica #13.

Después continuar, en este orden: reutilización real de tarjeta guardada; mapa y
distancia/tiempo en viajes disponibles; aviso de fin de servicio por hora y extensión.

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
## VERIFICADO 2026-09-18 — suite completa del bloque de pagos y conductor

Se recuperó este resumen y se continuó con las mismas reglas: Stripe permanece
en TEST, no se cobró ninguna tarjeta, no se tocó la reserva histórica 13 y no se
usó ningún reset de cuota.

Verificación local completa después del checkpoint de producción `3335e6b`:
`pnpm test` PASS con 27 archivos/209 pruebas API y 1 archivo/3 pruebas web.
`pnpm run typecheck` PASS para librerías, API, web, móvil, mockup y scripts.
La suite dirigida del siguiente bloque también pasó: 9 archivos/70 pruebas para
tarjeta guardada/CustomerSession, propinas y pagos suplementarios, extras,
extensión por hora, disponibilidad/elegibilidad de flota y zonas de servicio.

No se ejecutó QA remoto de cobro en esta reanudación: no hay una fixture QA
autenticada vigente documentada y el preview disponible mezcla claves Stripe
LIVE/TEST, por lo que probar la UI de checkout allí no sería una verificación
válida. No se inventaron credenciales ni se reutilizaron reservas históricas.
El mapa del conductor queda pendiente de una fixture autenticada y un entorno
con Mapbox configurado; el código y el typecheck ya pasan.

El árbol conserva un cambio preexistente no relacionado en
`artifacts/mockup-sandbox/src/.generated/mockup-components.ts`; no se incluyó en
este checkpoint.

Siguiente acción autorizada: preparar una fixture QA nueva en staging con claves
Stripe TEST de la misma cuenta, ejecutar tarjeta guardada/propina/extras/
extensión y limpiar únicamente sus filas y objetos de prueba; después revisar
visualmente el mapa del conductor. Mantener Stripe TEST y no declarar terminado
el proyecto completo: siguen pendientes push móvil, MFA, restauración y
conciliación.
## CHECKPOINT 2026-09-18 — auditoría integral, tracking y marca

Se completó una segunda revisión del website, booking, passenger, driver, corporate, admin, driver app, API, seguridad, workflows y producción. Se corrigió el tracking del pasajero para sesiones con cookie HttpOnly, el cleanup/timestamp del mapa y el error React #418 de hidratación del home. Se añadió el logo oficial transparente en `artifacts/royal-midnight/public/royal-midnight-logo-transparent.png` y se reemplazaron sus usos principales.

`pnpm test` PASS: 27 archivos/209 pruebas API y 1 archivo/3 pruebas web. `pnpm run typecheck` PASS en todos los paquetes. El build local sigue limitado por el binario opcional Windows de `lightningcss`; no se modificó el lockfile. El reporte completo está en `docs/ROYAL-MIDNIGHT-FULL-AUDIT-2026-09-18.md` y las reglas permanentes en `docs/ROYAL-MIDNIGHT-CONTINUATION-RULES.md`.

PR #12 fue fusionado después de CI PASS. Production Vercel quedó Ready con revisión `1302fb77b52740f18f7b91c4e45da6a6b7f3bf34`. Smoke final: healthz 200, payments/config en Stripe TEST, cron sin autenticación 401, logo transparente visible en el home y consola del navegador sin errores. La búsqueda repetida no encontró de nuevo React #418 ni referencias activas al logo antiguo en las áreas actualizadas.

## CHECKPOINT 2026-09-18 — mejoras de journey tracking y resiliencia de sesión

Se continuó desde el checkpoint anterior sin repetir sus correcciones. Se corrigieron RM-004/RM-005/RM-006: las acciones del detalle de viaje ahora usan `authHeaders` y funcionan con cookie HttpOnly después de recargar; `/track/:token` actualiza el estado cada 15 segundos y reconoce `on_way`/`on_location`; el mapa autenticado centra una sola vez, ofrece recentrado, señal atrasada y estado accesible.

Commit de trabajo `c3d19cf76ca340427d2e057576894a293217bd31`; PR #14 pasó CI completo y fue fusionado a `main` como `cdf497076dd145a966f60d9377b9fa145cd47495`. Typecheck web PASS; 3 pruebas web PASS; 27 archivos/209 pruebas API PASS; `git diff --check` PASS. El build local continúa limitado exclusivamente por el binario opcional `lightningcss.win32-x64-msvc.node` ausente en Windows/OneDrive; CI/Vercel compiló correctamente.

Production Vercel quedó Ready en `https://royal-midnight-49ygv0ko7-dbatistarosas-projects.vercel.app`; dominio `www.royalmidnight.com` sirve revisión `cdf497076dd145a966f60d9377b9fa145cd47495`. Smoke final: healthz 200, payments/config `pk_test_`, cron sin autenticación 401, tracking público responde correctamente para token inválido y consola limpia. Logo transparente visible. No se pudo declarar E2E autenticada de mapa ni permisos nativos móviles porque requieren fixture/dispositivo real.

Siguiente pendiente exacto: fixture QA nueva con Stripe TEST para ejecutar E2E autenticada de conductor → GPS → booking `on_way` → mapa pasajero, prueba física iOS/Android, Realtime con fallback, concierge/preferencias persistentes y scanners SAST dedicados si se instalan en CI. Uso observado por encima del umbral de pausa; no se consumieron créditos de reset.

## CHECKPOINT 2026-09-20 — auditoría de seguridad y remediación continua

Se corrigieron las fallas encontradas en la auditoría de seguimiento: propinas
idempotentes con CAS/metadata, reseñas con propietario y rating canónico,
vehículos protegidos, transacciones de `bookingAction` realmente compartidas,
reset/setup tokens hasheados, step-up para datos bancarios con auditoría durable,
re-cifrado lazy de payout legacy, TLS inseguro bloqueado fuera de desarrollo,
validación de soporte y push notifications nativas.

También se añadió la migración
`supabase/migrations/20260920153000_sensitive_action_hardening.sql` y Vercel la
aplicó durante el build de producción. El deployment
`dpl_71ipxfqQioLChXTLsGLsxpUCdfS8` quedó READY y el dominio
`https://www.royalmidnight.com` fue actualizado. La documentación detallada está en
`docs/ROYAL-MIDNIGHT-AUDIT-2026-09-20-REMEDIATION.md`.

Verificado localmente: tests API 31/221, web 1/3, typecheck, build completo,
SCA high gate con 2 excepciones documentadas y `git diff --check`. Pendiente:
QA E2E Stripe TEST, build EAS con APNs/FCM, dispositivo físico y controles
Supabase operativos.

## CHECKPOINT 2026-09-19 — remediación CN-003 a CN-006 y SCA

Se continuó desde `AUDIT-COMPLETA-2026-09-18.md` y se corrigieron los siguientes
hallazgos sin desplegar a producción: las respuestas de autenticación web ya no
exponen bearer tokens; el driver app opta explícitamente con `X-RM-Client:
driver-app`; las mutaciones con cookie exigen Origin/Referer confiable; el
escape hatch de cron solo funciona en desarrollo local; y
`payments/find-booking` exige sesión propietaria/admin o el tracking token,
además de rate limit y respuesta sin caché. Se actualizó el contrato OpenAPI y
los tipos generados, y la recuperación 3DS admin envía la cookie HttpOnly.

La auditoría SCA con registro quedó en 0 críticas, 0 moderadas y 2 altas ya
cubiertas por las excepciones documentadas del proyecto. Se fijó
`decode-uri-component@0.5.0` y se restauraron los binarios Windows opcionales de
Lightning CSS/Tailwind Oxide para que el build local sea reproducible.

Verificación: `pnpm test` PASS (31 suites/221 pruebas API y 1 suite/3 pruebas
web), `pnpm typecheck` PASS, `pnpm build` PASS completo, y `git diff --check`
PASS. Stripe continúa en TEST; no se usaron créditos de reset, no se tocaron
datos externos y no se hizo deploy. El siguiente paso sigue siendo QA E2E con
fixture TEST autenticada y dispositivo físico, antes de considerar producción.
## CHECKPOINT 2026-09-20 — residuo SCA cerrado

La revisión de seguimiento eliminó la última excepción de dependencias: Metro
resuelve `image-size@2.0.4` mediante el override raíz y se retiró `auditConfig`
con los dos GHSA ignorados. Se verificó que la versión 2.0.4 conserva la API
default que Metro consume y que calcula correctamente una imagen PNG de 1×1.

Verificación posterior: `pnpm install --frozen-lockfile`, `pnpm typecheck`,
`pnpm test` (31 suites API/221 pruebas y 1 suite web/3 pruebas), `pnpm build` y
`pnpm audit --prod --audit-level high` PASS; este último devuelve
`No known vulnerabilities found`. El cambio está listo para commit, push y un
nuevo deploy de producción. Siguen pendientes únicamente las pruebas que
requieren infraestructura externa o hardware: EAS/APNs/FCM con dispositivo,
E2E autenticada Stripe TEST/GPS/Realtime y ensayo operativo de restauración,
RLS/pg_net de Supabase.
