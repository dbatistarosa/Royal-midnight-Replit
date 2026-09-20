# Auditoría y remediación — 2026-09-20

## Resultado

La remediación local queda compilable, probada y desplegada. Vercel dejó READY
el deployment `dpl_71ipxfqQioLChXTLsGLsxpUCdfS8`; la migración nueva se aplicó
durante el build y el dominio principal quedó actualizado.

La revisión posterior de dependencias eliminó el último residuo SCA: Metro/Expo
queda resuelto a `image-size@2.0.4`, compatible con la API default que Metro
consume, y el gate de producción ya no requiere excepciones ignoradas.

## Hallazgos corregidos

- Propinas: bloqueo por booking, verificación de propietario y metadata,
  idempotency keys estables, reintentos seguros, CAS y confirmación derivada
  del importe real de Stripe.
- Reseñas: el conductor se deriva de la reserva, rating limitado a 1–5,
  comentario limitado, duplicados bloqueados bajo lock y listado público
  paginado/sin identificadores sensibles.
- Vehículos: el catálogo completo quedó restringido a administración; los
  clientes de conductor conservan sus rutas propias.
- Acciones de reserva: `bookingAction` entrega una transacción explícita y los
  locks secundarios usan la misma transacción; las rutas de aceptación,
  edición, completion, extras y extensión ya no escapan sus lecturas/escrituras
  críticas al pool global.
- Datos sensibles: tokens de reset y setup se almacenan como SHA-256 con
  compatibilidad de migración única; payout legacy se cifra de nuevo al leerse;
  revelar datos bancarios requiere step-up de contraseña de 10 minutos y deja
  auditoría durable.
- Seguridad de base: `DB_TLS_INSECURE=1` falla fuera de desarrollo local; se
  añadió la migración de `sessions.step_up_until`, auditoría sensible e índice
  de reseñas.
- Validación y flujo: límites de soporte, OpenAPI/Zod y push notifications del
  driver app quedaron implementados; la app registra el token Expo y enruta
  ofertas/asignaciones hacia la pantalla correcta.
- Deploy: Vercel ejecutará `pnpm db:migrate` antes de compilar, para que el
  esquema acompañe al código que lo necesita. El remoto tiene deriva histórica
  en el backfill idempotente de capacidad; el guard sigue siendo estricto por
  defecto y Vercel solo permite explícitamente ese archivo ya aplicado.

## Verificación ejecutada

- `pnpm typecheck`: PASS en librerías, API, web, móvil, mockup y scripts.
- `pnpm test`: PASS — API 31 archivos/221 pruebas; web 1 archivo/3 pruebas.
- `pnpm build`: PASS — API, frontend y prerender.
- `pnpm audit --prod --audit-level high`: PASS; `No known vulnerabilities found`
  después de fijar `image-size@2.0.4` para Metro/Expo.
- `pnpm install --frozen-lockfile`: PASS; el lockfile conserva la política de
  supply chain y resuelve `image-size@2.0.4`.
- `git diff --check`: PASS.
- Smoke remoto: `/api/healthz` 200 con revisión `62588a0`, home y `/book` 200,
  `/api/reviews` 200, `/api/vehicles` 401 sin sesión, `/api/auth/me` 401 y
  cron protegido 401; headers CSP/HSTS/X-Frame-Options presentes.
- UI remota: home y `/book` con contenido, formulario y navegación; sin
  overlay de error ni errores de consola de la aplicación.

## Pendientes reales

1. Push móvil real: hace falta una build EAS con credenciales APNs/FCM y un
   dispositivo para certificar entrega de notificaciones, permisos de ubicación
   y navegación nativa.
2. QA E2E autenticada con Stripe TEST y datos efímeros para cobro, propina,
   extras, extensión, GPS y Realtime/fallback; no se deben usar reservas reales.
3. Restauración de backup, RLS/pg_net y controles operativos de Supabase siguen
   dependiendo de acceso administrativo a la infraestructura y no se pueden
   certificar desde el workspace.

## Comparación con la auditoría anterior

Los hallazgos CN-001–CN-007 de la auditoría del 18/09 ya estaban corregidos o
quedaron reforzados en esta pasada. CN-008 queda resuelto en el árbol actual:
el escaneo SCA devuelve `No known vulnerabilities found` y ya no existe una
excepción `ignoreGhsas` para `image-size`.
