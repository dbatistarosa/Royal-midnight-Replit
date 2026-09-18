# Royal Midnight — Memoria operativa permanente

Este archivo es el punto de continuidad para futuras sesiones de Codex. Debe leerse antes de modificar o desplegar el proyecto. Las instrucciones históricas más antiguas de `docs/RESUME.md` no sustituyen este documento ni sus checkpoints más recientes.

## Reglas del propietario

1. Continuar el trabajo pendiente sin detenerse hasta completar el ciclo actual.
2. Ejecutar todas las fases: inventario, revisión de código, seguridad, dependencias, UI/UX, pruebas, validación de producción y reporte.
3. Antes de cada bloque costoso revisar límites de uso. Si el uso restante llega a 3% o menos, detenerse, guardar checkpoint en `docs/RESUME.md`, dejar el árbol seguro y explicar exactamente dónde continuar. No consumir créditos de reset sin confirmación explícita.
4. Después de cada corrección repetir las pruebas y volver a buscar errores. Un hallazgo solo se cierra si la segunda búsqueda demuestra que no es el mismo problema ni una variante sin corregir.
5. Mantener Stripe en TEST durante QA. No crear cobros reales ni tocar datos históricos/producción con fixtures de prueba.
6. Desplegar a production solamente después de tests, typecheck, build/CI y smoke checks de dominio hayan pasado.

## Estado que ya funciona

- Production Vercel estaba estable en `45a6614cf10b134108ab368f55c08f939cb28fd2`.
- `GET /api/healthz` devuelve 200.
- `GET /api/payments/config` devuelve publishable key `pk_test_`.
- Cron sin autenticación devuelve 401.
- CI usa permisos mínimos, lockfile frozen y actions fijadas por SHA.
- Suite conocida: 27 archivos API/209 pruebas y 1 archivo web/3 pruebas.
- Typecheck conocido: libs, API, web, driver app, mockup y scripts.
- QA de staging anterior fue limpiado; no reutilizar usuarios, reservas, PaymentIntents o sesiones de QA antiguas.

## Correcciones ya aplicadas en este ciclo

- `artifacts/royal-midnight/src/pages/passenger/ride-detail.tsx`: el tracking funciona con cookie HttpOnly restaurada; el mapa no depende de un Bearer token en memoria, envía `credentials: include`, usa timestamp GPS del servidor, valida coordenadas y limpia map/markers al desmontar.
- `artifacts/royal-midnight/src/pages/home.tsx`: la grilla dinámica de pricing espera al montaje para evitar React error #418 por hidratación distinta.
- Navbar, footer, login, signup y reset-password usan el logo transparente.
- Asset de marca: `artifacts/royal-midnight/public/royal-midnight-logo-transparent.png`.
- Reporte detallado: `docs/ROYAL-MIDNIGHT-FULL-AUDIT-2026-09-18.md`.

## Fases obligatorias para cada continuación

### Fase 1 — Reconocimiento

Leer este archivo, `docs/RESUME.md`, `git status`, último commit, manifests, workflows, variables requeridas y lista de archivos. Separar cambios del propietario de cambios del agente. No borrar ni resetear trabajo existente.

### Fase 2 — Auditoría completa

Revisar API/rutas/auth, web pública y booking, passenger, driver, corporate, admin, app Expo, esquemas/migraciones, payments/webhooks, storage, cron/email, CI/CD, seguridad y accesibilidad. Priorizar código fuente y no repetir un hallazgo ya cerrado salvo que reaparezca con evidencia nueva.

### Fase 3 — UI/UX y producto

Revisar desktop/mobile, errores de consola, enlaces, imágenes, estados loading, empty/error, responsive, teclado, labels y flujos de booking. Considerar Royal Journey Live, Midnight Concierge, preferencias de lujo, flight-aware service, corporate travel center y confianza verificable.

### Fase 4 — Corrección

Aplicar cambios pequeños y verificables con `apply_patch`. No cambiar secretos, Stripe LIVE, datos productivos o migraciones irreversibles sin autorización específica. Para imágenes usar la skill `imagegen` y guardar el resultado dentro del workspace.

### Fase 5 — Verificación repetida

Ejecutar `pnpm run typecheck`, `pnpm test`, build de web/API, `git diff --check`, auditoría de dependencias/secrets y revisión de patrones peligrosos. Repetir la búsqueda del hallazgo original y verificar que no queden referencias antiguas. Si el build local falla por una dependencia opcional del entorno, comprobar CI o Vercel y documentar la limitación; no cambiar dependencias solo para ocultarla.

### Fase 6 — QA remoto seguro

Usar staging/preview con datos QA identificables y Stripe TEST. Para tracking, probar conductor online, permiso GPS, PATCH de ubicación, booking `on_way`, endpoint de ubicación y mapa passenger. Limpiar usuarios, sesiones, reservas, jobs, outbox, eventos y PaymentIntents de QA. No declarar PASS lo que no se pudo ejecutar.

### Fase 7 — Deploy production

Crear commit/PR, esperar CI, fusionar a `main` y verificar deployment Ready. Validar SHA exacto, dominio, healthz 200, payments TEST, cron protegido y logs de error. No hacer deploy directo saltándose CI salvo que el propietario lo pida.

### Fase 8 — Cierre

Actualizar este documento solo con hechos verificados, añadir checkpoint a `docs/RESUME.md`, generar/actualizar el reporte de auditoría y entregar resumen con archivos, pruebas, deployment, limitaciones y pendientes reales.

## Pendientes externos conocidos

- Prueba física iOS/Android de permisos background y ubicación real.
- E2E autenticada con fixture nueva para mapa, tarjeta TEST, propina, extras, extensión, 3DS y webhook.
- Push Firebase/APNs y MFA con credenciales/dispositivo reales.
- Ensayo de restauración, conciliación histórica y liquidación corporativa.
- Realtime para tracking con fallback polling, ETA/ruta y freshness indicator.

## Formato de checkpoint

```text
## CHECKPOINT YYYY-MM-DD HH:mm EDT
- Commit/branch:
- Cambios aplicados:
- Tests/typecheck/build:
- QA remoto y limpieza:
- Production/health/SHA:
- Hallazgos nuevos cerrados:
- Pendiente exacto:
- Uso restante observado:
```

