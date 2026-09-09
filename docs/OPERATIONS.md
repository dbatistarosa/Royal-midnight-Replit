# Operación y desarrollo

## Servicios

La web Vite y el API Express se publican juntos en Vercel. El API usa PostgreSQL
mediante Drizzle; la aplicación no usa las políticas de Supabase Auth para sus
sesiones propias. Las tablas son privadas para anon/authenticated. Contraseñas:
bcrypt; sesiones: tokens aleatorios cuyo hash SHA-256 se guarda en PostgreSQL.
Web usa cookie HttpOnly; móvil utiliza SecureStore y Authorization Bearer.

## Arranque local

Usar Node 24 y pnpm 11. Instalar con `pnpm install --frozen-lockfile`.
Configurar las variables de `.env.example` en el entorno de cada terminal o
cargarlas explícitamente. Copiar un archivo .env no garantiza que Express lo cargue.

API: `pnpm --filter @workspace/api-server dev`, con PORT=8080.
Web, en otra terminal: `pnpm --filter @workspace/royal-midnight dev`, con PORT=3000.
No hay creación de administrador, seed ni reparación de datos al arrancar.

Comprobar con `pnpm typecheck`, `pnpm test`, los builds web/API y
`pnpm audit --prod --audit-level high`. La CI también importa el bundle del API
para detectar dependencias ausentes en el arranque serverless.

## Migraciones

La fuente canónica es `supabase/migrations`. El directorio `lib/db/drizzle` es
histórico: su journal incompleto no debe usarse para reconstruir producción.

Con DATABASE_URL del entorno correcto, `pnpm db:check` verifica qué falta y el
contenido de las migraciones aplicadas; `pnpm db:migrate` las aplica en orden.
No editar SQL ya aplicado. Crear el siguiente archivo con Supabase CLI, probar en
staging y conservar el resultado de las comprobaciones. No usar drizzle push-force.

MCP asigna timestamps propios. El runner compara nombre y checksum del SQL para
reconocer el mismo cambio entre entornos, conservando sus historiales anteriores.
Si detecta contenido distinto, se detiene. La adopción del baseline de producción
está pendiente de aprobación: consultar RESUME.md antes de ejecutar.

## Notificaciones y diagnóstico

`GET /api/admin/system-health` requiere administrador y muestra colas, cron,
entorno, base de datos y configuración; no devuelve secretos. Los workers son
`POST /api/cron/booking-jobs` y `POST /api/cron/mail-outbox`. Autenticarlos con
CRON_SECRET o CRON_WORKER_SECRET. GitHub Actions ejecuta ambos cada cinco minutos.

Los errores de proveedor mantienen el trabajo pendiente con backoff y hasta ocho
intentos. Investigar last_error antes de habilitar un reintento adicional. No borrar
recibos de Stripe ni claves de idempotencia para intentar cobrar de nuevo.

Configurar SMTP/Resend y APP_URL en cada entorno. En staging, usar destinatarios
de prueba y claves Stripe TEST de una misma cuenta. No compartir secretos de
producción por defecto. La caché Redis separa entornos y proyectos de base de datos.

## Publicación y recuperación

Aplicar migraciones compatibles antes de publicar el código que las requiere.
Esperar CI, comprobar preview, publicar y verificar healthz, permisos, cotización
y workers. No probar compras con tarjetas reales como smoke test.

Para revertir código, volver al deployment compatible anterior de Vercel. Las
migraciones de esta reparación son aditivas: conservar columnas/tablas al revertir.
Una restauración de datos requiere un respaldo real y un ensayo separado en staging;
no se ha realizado ni certificado un ensayo de restauración en esta reparación.
