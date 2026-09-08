# Royal Midnight — punto de recuperación, 2026-09-08

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
