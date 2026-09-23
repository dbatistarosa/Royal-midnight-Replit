# Auditoría y remediación — 2026-09-20

## Resultado

La remediación local queda compilable, probada y desplegada. Vercel dejó READY
el deployment final `dpl_3VWo64nSUmM4r69KfUmEhYkczdS3` desde `bf3a99b`; la
migración nueva se aplicó durante el build y el dominio principal quedó
actualizado en `https://www.royalmidnight.com`.

La revisión posterior de dependencias eliminó el último residuo SCA: Metro/Expo
queda resuelto a `image-size@2.0.4` mediante `patches/metro@0.84.4.patch`, y el
gestor queda fijado a pnpm 11.7.0.
El build limpio de Vercel confirmó instalación congelada y `pnpm audit` quedó
en `No known vulnerabilities found`.

Después de la auditoría inicial se detectó en navegador un React #418 de
hidratación. La causa era HTML inválido producido por botones dentro de links;
se corrigieron todos esos casos con `Button asChild` y un único elemento
interactivo.

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
- Validación y flujo: límites de soporte y OpenAPI/Zod quedaron implementados.
  El driver app ahora tiene un error boundary visible y el registro de push
  nativo queda explícitamente desactivado hasta contar con credenciales
  APNs/FCM, evitando fallos de arranque; el centro de notificaciones in-app
  sigue disponible.
- Hidratación y accesibilidad: se eliminaron los anidamientos `<a><button>`
  en home, fleet, navbar, confirmación, corporate y not-found; esto elimina el
  React #418 observado en producción y mantiene la semántica de teclado.
- Deploy: Vercel ejecutará `pnpm db:migrate` antes de compilar, para que el
  esquema acompañe al código que lo necesita. El remoto tiene deriva histórica
  en el backfill idempotente de capacidad; el guard sigue siendo estricto por
  defecto y Vercel solo permite explícitamente ese archivo ya aplicado.

## Verificación ejecutada

- `pnpm typecheck`: PASS en la verificación previa de librerías, API, web,
  móvil, mockup y scripts antes del commit final; la reinstalación posterior
  en OneDrive quedó limitada por un `EPERM` al renombrar `esbuild`.
- `pnpm test`: PASS — API 31 archivos/221 pruebas; web 1 archivo/3 pruebas.
- `pnpm build`: PASS — API, frontend y prerender; el build remoto final de
  Vercel también pasó en un filesystem limpio.
- `pnpm audit --prod --audit-level high`: PASS; `No known vulnerabilities found`
  después de fijar `image-size@2.0.4` para Metro/Expo.
- `pnpm install --frozen-lockfile`: PASS en Vercel con pnpm 11.7.0; el intento
  local posterior queda documentado como bloqueado por OneDrive/`esbuild`, no
  por el lockfile.
- `git diff --check`: PASS.
- Smoke remoto: `/api/healthz` 200 con revisión
  `bf3a99b4852b80716f44546d817405e11ab5a936`, home y `/book` 200,
  `/api/vehicles`, `/api/auth/me` y cron protegido 401 sin sesión; headers
  CSP/HSTS/X-Frame-Options presentes en las respuestas públicas.
- UI remota: home y `/book` con contenido, formulario y navegación; `a button`
  quedó en cero, sin overlay de error, sin React #418 y sin errores/warnings de
  consola de la aplicación.

## Pendientes reales

1. Push móvil real: hace falta una build EAS con credenciales APNs/FCM y un
   dispositivo para certificar entrega de notificaciones, permisos de ubicación
   y navegación nativa. El intento de export local quedó limitado por el error
   SHA-1 de Metro sobre `whatwg-fetch` en OneDrive; no se declara como PASS.
2. QA E2E autenticada con Stripe TEST y datos efímeros para cobro, propina,
   extras, extensión, GPS y Realtime/fallback; no se deben usar reservas reales.
3. Restauración de backup, RLS/pg_net y controles operativos de Supabase siguen
   dependiendo de acceso administrativo a la infraestructura y no se pueden
   certificar desde el workspace.

## Comparación con la auditoría anterior

Los hallazgos CN-001–CN-007 de la auditoría del 18/09 ya estaban corregidos o
quedaron reforzados en esta pasada. CN-008 queda resuelto en el árbol actual:
el escaneo SCA devuelve `No known vulnerabilities found` y ya no existe una
excepción `ignoreGhsas` para `image-size`. La comparación adicional detectó y
resolvió el React #418 que la auditoría anterior no había retenido; permanecen
solo pruebas que requieren infraestructura externa, credenciales o hardware.
