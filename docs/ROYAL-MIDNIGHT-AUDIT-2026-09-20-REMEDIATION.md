# Auditoría y remediación — 2026-09-20

## Resultado

La remediación local queda compilable y probada. El código corregido todavía
requiere el deploy de producción y el smoke test remoto para certificar el
estado final del servicio.

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
  esquema acompañe al código que lo necesita.

## Verificación ejecutada

- `pnpm typecheck`: PASS en librerías, API, web, móvil, mockup y scripts.
- `pnpm test`: PASS — API 31 archivos/221 pruebas; web 1 archivo/3 pruebas.
- `pnpm build`: PASS — API, frontend y prerender.
- `pnpm audit --prod --audit-level high`: exit 0; quedan 2 avisos high
  ignorados por las excepciones SCA documentadas para `image-size` dentro de
  Metro/Expo (dependencia de tooling, no del runtime desplegado).
- `git diff --check`: PASS.

## Pendientes reales

1. Ejecutar el deploy de Vercel y comprobar que el build remoto aplica la
   migración con las variables de producción; después validar healthz, rutas
   públicas, login/admin, step-up, reveal auditado y una navegación web.
2. Push móvil real: hace falta una build EAS con credenciales APNs/FCM y un
   dispositivo para certificar entrega de notificaciones, permisos de ubicación
   y navegación nativa.
3. QA E2E autenticada con Stripe TEST y datos efímeros para cobro, propina,
   extras, extensión, GPS y Realtime/fallback; no se deben usar reservas reales.
4. Restauración de backup, RLS/pg_net y controles operativos de Supabase siguen
   dependiendo de acceso administrativo a la infraestructura y no se pueden
   certificar desde el workspace.

## Comparación con la auditoría anterior

Los hallazgos CN-001–CN-007 de la auditoría del 18/09 ya estaban corregidos o
quedaron reforzados en esta pasada. CN-008 deja de estar sin verificar: el
escaneo SCA respondió y su resultado actual es 2 high ignorados por las
excepciones explícitas del proyecto; no se afirma que sean cero vulnerabilidades.
