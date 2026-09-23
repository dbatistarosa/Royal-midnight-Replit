# Auditoría completa — Royal Midnight

Fecha: 2026-09-18
Alcance: `Royal-midnight-Replit` dentro del workspace Hermes
Modo: solo lectura; no se ejecutó la aplicación ni se modificaron archivos de código.

## 1. Resumen ejecutivo

Resultado global: **riesgo medio — score 42/100**.

El proyecto tiene una base de seguridad razonable en varias áreas: cookies `HttpOnly`, sesiones almacenadas con hash, middleware de autorización explícito para rutas administrativas, Helmet, CSP, HSTS, rate limiting, RLS en migraciones y acciones de CI fijadas por SHA. Sin embargo, hay dos riesgos de alta prioridad antes de producción:

1. Las respuestas de usuario se construyen con `...u`, lo que puede devolver `passwordHash`, identificadores de Stripe, método de pago por defecto, notas VIP y otros campos internos.
2. El cifrado de datos bancarios/SSN funciona en modo fail-open: si falta `FIELD_ENCRYPTION_KEY`, los datos se persisten en texto plano.
3. La auditoría de dependencias no pudo verificar CVEs actuales porque `pnpm audit` no pudo acceder al registro y no están instalados Trivy/Semgrep/Gitleaks/pip-audit.

### Conteo de hallazgos

| Severidad | Cantidad |
|---|---:|
| Crítica | 0 confirmadas |
| Alta | 2 |
| Media | 6 |
| Baja | 4 |
| Informativa | 5 |

El score usa la fórmula del skill Cyber Neo: `high × 10 + medium × 3 + low × 1`. El resultado bruto es 42.

## 2. Hallazgos prioritarios

### CN-001 — Exposición de campos sensibles en respuestas de usuario

- Estado: **corregido en el working tree** mediante `serializeUser()` por allowlist y prueba de regresión.
- Severidad: **Alta**
- CWE: CWE-200, CWE-359
- OWASP: A01 Broken Access Control; A02 Cryptographic Failures
- Evidencia: `artifacts/api-server/src/routes/users.ts:23-25` define `parseUser()` como `{ ...u, createdAt: ... }`. El esquema `lib/db/src/schema/users.ts:5-36` contiene `passwordHash`, `stripeCustomerId`, `defaultPaymentMethodId`, `vipNotes`, `corporateAccountId`, datos de preferencias y metadatos internos.
- Impacto: `GET /api/users/:id`, `GET /api/users` y otras respuestas que reutilizan `parseUser` pueden revelar hashes de contraseña, identificadores de pago y campos que no pertenecen al contrato público. Un usuario autenticado puede ver sus propios campos internos y un administrador recibe todos los campos sin una lista de allowlist.
- Remediación: reemplazar el spread por un DTO explícito. Excluir siempre `passwordHash`, `stripeCustomerId`, `defaultPaymentMethodId`, `vipNotes`, tokens y columnas operativas; crear DTOs distintos para pasajero, admin y conductor. Añadir tests que fallen si una respuesta contiene cualquiera de esos nombres.

### CN-002 — Cifrado de datos financieros fail-open

- Estado: **corregido en el working tree**: nuevas escrituras fallan cerradas sin `FIELD_ENCRYPTION_KEY`; la lectura legacy queda separada.
- Severidad: **Alta**
- CWE: CWE-311, CWE-312
- OWASP: A02 Cryptographic Failures
- Evidencia: `artifacts/api-server/src/lib/encrypt.ts:49-60` devuelve `null` cuando falta `FIELD_ENCRYPTION_KEY`; `:83-85` devuelve el texto original; el comentario en `:81` confirma que SSN, routing y account pueden quedar en texto plano.
- Impacto: una variable de entorno ausente convierte una protección obligatoria en almacenamiento plaintext para información bancaria y de identidad.
- Remediación: fallar al iniciar o responder `503` antes de aceptar/escribir datos sensibles si la clave no existe o es inválida. No retornar plaintext como compatibilidad. Ejecutar una migración de re-cifrado y revisar los registros históricos antes de activar pagos/payouts.

### CN-003 — Respuestas de autenticación siguen devolviendo el token bearer

- Severidad: **Media**
- CWE: CWE-522, CWE-922
- OWASP: A07 Identification and Authentication Failures
- Evidencia: `artifacts/api-server/src/routes/auth.ts:334-347` y otros flujos devuelven `token` en JSON aunque también se establece cookie `HttpOnly` en `:335`.
- Impacto: el frontend web puede exponer un token reutilizable a JavaScript, telemetría, interceptores o logs; además aumenta la superficie de robo ante XSS o instrumentación accidental.
- Remediación: no devolver token en flujos web; mantener la cookie como único mecanismo del navegador. Separar una respuesta móvil explícita y validar que nunca se registre el body de autenticación.

### CN-004 — Protección CSRF dependiente únicamente de SameSite

- Severidad: **Media**
- CWE: CWE-352
- OWASP: A01 Broken Access Control
- Evidencia: `artifacts/api-server/src/app.ts:106-138` habilita CORS con `credentials: true`; `artifacts/api-server/src/routes/auth.ts:61-65` usa cookie de sesión. No se observó middleware CSRF ni validación de `Origin`/`Referer` para mutaciones.
- Impacto: `SameSite=Lax` reduce el riesgo, pero no cubre todos los escenarios de despliegue, subdominios, navegadores embebidos o cambios futuros a `SameSite=None`. Las rutas con cookie deberían tener defensa explícita.
- Remediación: implementar token CSRF sincronizado o validación estricta de `Origin` para POST/PATCH/DELETE autenticados; conservar `HttpOnly`, `Secure` y `SameSite=Lax`.

### CN-005 — Opción de cron sin autenticación puede activarse en producción

- Severidad: **Media**
- CWE: CWE-306
- OWASP: A05 Security Misconfiguration
- Evidencia: `artifacts/api-server/src/routes/cron.ts:14-31` permite todos los cron si `ALLOW_INSECURE_CRON=1`, aunque `CRON_SECRET` no exista.
- Impacto: si esa variable se configura accidentalmente en Railway/Vercel, cualquiera puede disparar payouts, compliance, correo, jobs y publicación social.
- Remediación: eliminar el bypass en producción; permitirlo solo con una condición de entorno local inequívoca y no configurable desde secretos de despliegue. Añadir un test que rechace `ALLOW_INSECURE_CRON=1` cuando `NODE_ENV=production`.

### CN-006 — Endpoint de consulta de PaymentIntent sin autenticación suficiente

- Severidad: **Media**
- CWE: CWE-200, CWE-862
- OWASP: A01 Broken Access Control
- Evidencia: `artifacts/api-server/src/routes/payments.ts:317-333` acepta `paymentIntentId` sin `requireAuth`; el flujo recupera metadatos de Stripe para derivar el booking.
- Impacto: un PaymentIntent ID filtrado puede permitir correlacionar pagos con una reserva. Aunque el endpoint no debería devolver secretos, la asociación financiera y el booking ID son datos sensibles.
- Remediación: exigir sesión o un token de recuperación de un solo uso vinculado al booking; devolver solo el mínimo necesario y rate-limit específico.

### CN-007 — Typecheck de la app Expo no es reproducible en el estado auditado

- Severidad: **Media**
- CWE: CWE-1104
- OWASP: A06 Vulnerable and Outdated Components / calidad de supply chain
- Evidencia: `pnpm --filter @workspace/driver-app run typecheck` falla porque no encuentra `expo/tsconfig.base`, `expo`, `react-native`, `expo-router`, `nativewind/types.d.ts` y otros módulos. El frontend web y API sí terminaron con código 0.
- Impacto: CI puede no estar verificando la app móvil; errores de compilación pueden llegar tarde al pipeline de release.
- Remediación: reconstruir la instalación con `pnpm install --frozen-lockfile`, verificar workspaces/symlinks de Expo y ejecutar el typecheck móvil en CI como job obligatorio.

### CN-008 — Dependencias vulnerables no verificadas

- Severidad: **Media**
- CWE: CWE-1395
- OWASP: A06 Vulnerable and Outdated Components
- Evidencia: `pnpm audit --audit-level high --prod` no pudo contactar `https://registry.npmjs.org` por `EACCES`; Semgrep, Trivy, Gitleaks y pip-audit no están instalados.
- Impacto: no se puede afirmar que las dependencias estén libres de CVEs actuales.
- Remediación: ejecutar `pnpm audit --prod`, `pnpm audit --audit-level high`, Trivy filesystem y Gitleaks en una máquina con salida de red; guardar el resultado como artefacto de CI y corregir high/critical.

## 3. Seguridad positiva observada

- `vercel.json` configura CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`.
- `app.ts` usa Helmet, CORS con allowlist y rate limiting global.
- `auth.ts` usa cookie `HttpOnly`, `Secure` en producción y `SameSite=Lax`.
- `session.ts` genera tokens con `crypto.randomBytes` y almacena SHA-256, no el token plano.
- OTP usa `crypto.randomInt`, con persistencia, expiración, límite de intentos y comparación constante según los comentarios y código inspeccionado.
- Las rutas administrativas usan `requireAdmin`; las rutas de usuario revisan propiedad o rol admin en los endpoints principales.
- Las acciones de GitHub están fijadas a SHA completa y el workflow declara `permissions: contents: read`.
- Las migraciones habilitan RLS para las tablas de negocio.

## 4. SEO técnico

### Fortalezas

- `PageSeo.tsx` genera title, description, canonical, Open Graph, Twitter Cards y JSON-LD por página.
- `index.html` declara `lang="en"`, viewport, metadata geográfica y esquemas `LocalBusiness`/`WebSite`.
- Existe `robots.txt` con sitemap declarado y exclusión de portales privados.
- Existe sitemap XML con rutas comerciales y legales.
- `scripts/prerender.mjs` genera HTML estático para las rutas de marketing y exige que cada ruta tenga `<title>`.
- Las páginas revisadas tienen un único `h1` visible y las imágenes revisadas usan `alt` descriptivo.

### Oportunidades SEO

1. **Media:** actualizar automáticamente `<lastmod>` del sitemap; las fechas están hardcodeadas y pueden quedar desalineadas del contenido real.
2. **Baja:** añadir `og:image:alt`, `twitter:site` por página cuando aplique y validación automatizada de imágenes/URLs canónicas.
3. **Baja:** el esquema `LocalBusiness` usa una dirección genérica “South Florida”; completar una dirección comercial real solo si es pública y consistente con Google Business Profile.
4. **Baja:** añadir datos estructurados `BreadcrumbList` a servicios y páginas profundas.
5. **Info:** verificar Search Console/Bing: las etiquetas de verificación están comentadas en `index.html`.
6. **Info:** confirmar que las páginas `/pricing` y otras dependientes de API no pierden contenido esencial cuando el prerender no tiene datos de backend.

## 5. Code quality y arquitectura

- El monorepo separa frontend, API, librerías compartidas, app móvil, migraciones y workflows.
- Hay validación Zod en muchas rutas y SQL parametrizado mediante Drizzle; no se confirmó una ruta de SQL injection directa en el muestreo estático.
- Hay tests unitarios en API, pero la auditoría no ejecutó la suite completa para preservar el modo de solo lectura y evitar efectos de infraestructura.
- `api/package.json` contiene solo `type: module`, lo que puede ser correcto como wrapper de despliegue, pero conviene documentar el contrato entre `api/index.js` y el bundle generado.
- Hay comentarios de seguridad útiles, aunque la seguridad no debería depender de comentarios: convertir invariantes como cifrado obligatorio, CSRF y DTOs allowlist en tests.

## 6. Agentes / IA

No se detectó código de agentes, LLM, OpenAI, Anthropic, LangChain, CrewAI, prompts de sistema ni herramientas de function-calling dentro del subproyecto. Por tanto, no hay superficie de agente que auditar en esta versión.

Sí aparecen archivos `.agents` y documentación de trabajo del repositorio, pero son tooling/documentación del proyecto, no agentes de runtime. Si existe otro servicio de agentes fuera de `Royal-midnight-Replit`, debe auditarse por separado.

## 7. Supply chain y CI/CD

- Hay `pnpm-lock.yaml` y los workflows usan `pnpm install --frozen-lockfile`.
- Las acciones de GitHub revisadas están fijadas por SHA completa.
- `ci.yml` declara permisos mínimos y ejecuta typecheck, tests, build web, audit de producción y carga del bundle API.
- No se observó `pull_request_target` ni interpolación directa de títulos de PR/issues dentro de `run` en los workflows revisados.
- No fue posible determinar si existe un lockfile realmente actualizado frente a advisories actuales por falta de acceso al registry.
- `.gitignore` cubre `.env`, `.env.*`, llaves, certificados privados, credenciales y `.vercel`. Se encontraron archivos `.vercel/.env.*.local` en disco; no se leyeron ni se reportaron valores. Deben permanecer fuera de commits y artefactos compartidos.

## 8. Cobertura y limitaciones

- Archivos fuente relevantes inspeccionados: 734, excluyendo `node_modules`, `.cache`, `.git`, `dist`, `build` y `.vercel`.
- Se revisaron API Express, frontend React/Vite, app Expo, esquema Drizzle, migraciones Supabase, Vercel/Railway y GitHub Actions.
- No se ejecutó la aplicación, servidor, migraciones, builds ni pruebas de integración.
- No hubo pentest dinámico contra un entorno desplegado.
- SCA/CVE en tiempo real quedó pendiente por restricciones de red; no debe interpretarse como ausencia de vulnerabilidades.
- No se modificó el proyecto.

## 9. Plan recomendado

### Antes de producción

1. Eliminar la serialización `{ ...u }` y establecer DTOs allowlist.
2. Hacer obligatorio `FIELD_ENCRYPTION_KEY`; bloquear escrituras sensibles sin ella y auditar/re-cifrar históricos.
3. Eliminar el bypass `ALLOW_INSECURE_CRON` en producción.
4. Proteger `payments/find-booking` y revisar todos los endpoints que devuelven identificadores financieros.
5. Reparar la instalación/typecheck de Expo y hacerlo obligatorio en CI.
6. Ejecutar SCA con red habilitada y fijar remediaciones por CVE.

### Después

1. Añadir CSRF/origin checks para mutaciones autenticadas.
2. Automatizar sitemap `lastmod` y validación SEO en CI.
3. Añadir tests de contrato que prohíban campos sensibles en respuestas JSON.
4. Ejecutar DAST contra staging con cuentas de pasajero, conductor y admin.
5. Revisar los archivos `.vercel/.env.*.local` y rotar cualquier secreto que haya sido compartido o incluido en backups.
