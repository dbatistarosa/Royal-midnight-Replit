# Plan de reinicio investigado — Royal Midnight Driver Android

## Estado de este reinicio

La compilación EAS pendiente fue cancelada. No se reanudará la programación ni se entregará un APK hasta que cada gate de esta guía tenga evidencia verificable. El backend, Supabase/Postgres, Storage, Stripe y los datos existentes se conservan; no se hará una migración destructiva.

La investigación fue realizada en solo lectura por agentes separados de arquitectura, UX, QA, seguridad y herramientas. Se usaron las guías oficiales de Expo y las skills de React Native de Callstack. No se modificó el cliente durante la investigación.

## Hallazgos que cambian el plan

1. El cliente objetivo es `artifacts/driver-app-v2`, Expo 57.0.24, React Native 0.86.3 y Expo Router 57.0.22. El cliente legado SDK 56 se conserva únicamente como referencia.
2. El APK histórico SDK57 probado contiene solo `lib/arm64-v8a`; el emulador x86_64 puede fallar aunque `app.config.ts` declare ARM64 y x86_64. La configuración y el binario deben reconciliarse inspeccionando el APK generado, no leyendo solamente la fuente.
3. TypeScript pasa, pero todavía no existe evidencia reproducible de autenticación, ciclo de viaje, ubicación en segundo plano, notificaciones push, modo offline ni regresión visual en el binario objetivo.
4. La app utiliza API propia y SecureStore; no se migrará innecesariamente a Firebase Auth o Supabase Auth. La ubicación requiere development/release build, no Expo Go.
5. La arquitectura tiene dos riesgos de operación: una sesión de ubicación puede quedar activa aunque falle el cambio de disponibilidad, y el backend de push debe procesar tickets/receipts y limpiar tokens inválidos.
6. La auditoría de seguridad exige verificar que ninguna Edge Function sensible retirada siga desplegada y accesible. Esto se comprueba en el entorno real antes de la entrega.
7. La referencia visual es alcanzable con la base existente, pero requiere una paleta navy/gold más consistente, controles de 48 px, estados de carga/error/empty y pruebas de safe-area, teclado y accesibilidad.

## Fases y gates

### Fase 0 — Congelación y procedencia

- Separar claramente cliente legado y cliente objetivo.
- Crear una referencia Git limpia para la app v2 sin borrar cambios del usuario.
- Definir qué archivos entran en el build y excluir `node_modules`, secretos, APKs históricos y credenciales.
- Registrar `package.json`, lockfile, app config, fingerprint, commit y SHA-256 de cada binario.

**Gate:** no se inicia un build si la procedencia del artefacto no puede reconstruirse.

**Evidencia incorporada:** `artifacts/driver-app-v2` conserva su configuración
Expo/EAS aislada, el `google-services.json` local permanece excluido y el
pipeline registra typecheck, pruebas, exportación, paquete Android, API y ABI
resuelta. La carpeta todavía no tiene una referencia Git limpia porque el
cliente v2 y los documentos de reinicio son cambios de trabajo deliberados;
por eso el artefacto se identificará además por fingerprint y SHA-256.

### Fase 1 — Entorno QA y backend

- Crear o confirmar un endpoint staging seguro; no usar un bypass de Vercel ni ocultar un token en el APK.
- Crear un conductor QA no productivo con rol y datos mínimos: vehículo, documento aprobado, payout de prueba y una reserva controlada.
- Confirmar que cada ruta valida el usuario autenticado: driver, booking, ubicación, documentos, push y payout.
- Comprobar que las Edge Functions sensibles que ya no forman parte del código no siguen desplegadas.

**Gate:** login, `/auth/me`, logout, expiración, 401/403 y datos de QA funcionan sin tocar datos reales.

**Evidencia incorporada:** Supabase confirmó un proyecto saludable de staging
`royal-midnight-staging` (`tktdvxodcitwlcqcrssu`) con las tablas principales y
sin Edge Functions desplegadas. Producción confirmó únicamente
`check-reservation-status` como función `ACTIVE`; las cuatro funciones
históricamente sensibles ya no aparecen en el listado desplegado. Falta todavía
un backend Preview conectado a staging y una cuenta QA de conductor, por lo que
este gate funcional sigue abierto.

### Fase 2 — Sistema visual y accesibilidad

- Aplicar tokens navy/gold semánticos: `#0A0A0F`, `#071322`, `#111D2D`, `#16253A`, `#2B425C`, `#D4AF37`, `#F4CE67`, `#F3F3F3`, `#A7B2C1`, `#20D3A2`, `#F2BA4B`, `#FF5C59`, `#2C8ED9`.
- Mantener Playfair Display para marca/totales e Inter para operación diaria.
- Garantizar botones de mínimo 48 px, contraste, labels accesibles, safe areas, teclado, loading, empty, error y retry.
- Baseline visual de login, home, offer, active trip, rides, earnings, alerts, profile y gates.

**Gate:** cada pantalla crítica tiene criterio visual y accesible comprobable en Android.

### Fase 3 — Flujos del conductor

- Auth y gates de aprobación/compliance.
- Home online/offline y ofertas con expiración.
- Aceptar/rechazar oferta y ciclo activo del viaje.
- Rides, earnings, alerts, perfil, vehículo, documentos, payout y soporte.
- Invalidación de React Query y manejo centralizado de 401.
- Ubicación: permiso denegado/aceptado, background, pantalla bloqueada, cleanup al logout/offline y confirmación de PATCH real.
- Push: permiso Android 13, registro token, entrega foreground/background/terminated y deep link a booking.
- Offline: error legible, retry, no duplicación de mutaciones y recuperación al volver online.

**Gate:** cada flujo tiene prueba positiva, negativa y de recuperación; no se infiere éxito desde el código.

### Fase 4 — Build reproducible Android

- Generar APK desde la app v2 con ARM64 y x86_64 explícitos.
- Inspeccionar el ZIP del APK y exigir `lib/arm64-v8a` y `lib/x86_64` para las librerías nativas relevantes.
- Verificar package, versionCode, API, EAS project ID, Firebase config no sensible y ausencia de secretos.
- Ejecutar `typecheck`, `expo export`, Expo Doctor, instalación limpia y auditoría de dependencias.

**Gate:** un APK nuevo, ligado a un commit/fingerprint, instala y abre en un emulador x86_64 y en un dispositivo ARM64.

### Fase 5 — CI y pruebas móviles gratuitas

- Usar GitHub Actions para repositorio público o los límites disponibles del repositorio actual.
- Android SDK/emulador oficial + `reactivecircus/android-emulator-runner` para build y smoke.
- Gradle/Expo local en CI para APK; guardar APK, manifest, ABI, fingerprint y SHA-256 como artefactos.
- Maestro CLI para smoke/E2E local; `agent-device` para snapshots, logs y evidencia exploratoria cuando esté disponible.
- Reservar EAS Free para builds puntuales, no como único gate, por cola, baja prioridad y cuota.
- Usar Appetize solo para smoke visual corto; no contarlo como prueba de GPS/background/FCM físico.

**Gate:** el pipeline falla si typecheck, export, ABI, instalación, cold launch o smoke no pasan.

**Evidencia incorporada:** `.github/workflows/ci.yml` ahora incluye gates del
cliente v2 para instalación bloqueada, typecheck, prueba de regresión, export
Android y comprobación de paquete/API/ABI declarado. La inspección del APK y
la instalación en emulador siguen siendo gates posteriores.

### Fase 6 — Verificación real

- Cold launch: splash → login, sin red screen, crash ni error de Metro.
- Auth completa con cuenta QA y persistencia después de relaunch.
- Oferta → aceptación → viaje activo → estados terminales.
- Ubicación en foreground/background/lock-screen con servidor recibiendo posiciones.
- Push en foreground/background/terminated y tap con/sin bookingId.
- Offline y recuperación.
- Capturas comparadas con baseline en el mismo device/OS.

**Gate:** la APK no se entrega si falta una prueba física o reproducible de ubicación y push.

### Fase 7 — Entrega interna

- Entregar únicamente APK/AAB cuyo SHA-256, versionCode, commit y reporte de pruebas coincidan.
- Preferir Firebase App Distribution o GitHub Release para testers internos; Play Store se considera una fase separada.
- Mantener un reporte de fallos, pasos de reproducción y rollback.
- No afirmar funcionamiento general si solo se comprobó el shell de login.

## Herramientas seleccionadas

| Área | Selección | Motivo |
|---|---|---|
| Framework | Expo SDK 57 + React Native | Ya coincide con el cliente objetivo y permite CNG/native config. |
| Diseño | Tokens propios + Figma opcional | La fuente visual ya existe; Figma no es requisito de compilación. |
| CI | GitHub Actions + Android emulator runner | Build, ABI y smoke reproducibles con coste cero en repos públicos. |
| E2E | Maestro CLI | Flujo YAML simple para auth y navegación. |
| Exploración | agent-device cuando esté disponible | Snapshots, screenshots, logs y reproducción. |
| Smoke visual | Appetize | Útil para sesiones cortas; no sustituye hardware real. |
| Backend | API propia + SecureStore | Evita una migración de auth innecesaria. |
| Push | Expo Push respaldado por FCM inicialmente | Menor cambio; requiere tickets/receipts y prueba física. |
| Seguridad | Security best practices, threat model, npm audit/Semgrep | Gates separados de funcionalidad. |

## Skills incorporadas

- Expo: `expo-overview`, `expo-dev-client`, `expo-upgrade`, `eas-simulator`, `eas-app-stores`.
- React Native: `react-native-best-practices`, `react-navigation`, `github-actions`, `react-native-testing`, `dogfood`.
- Diseño: `figma`, `figma-create-design-system-rules`, `figma-implement-design`.
- Seguridad: `security-best-practices`, `security-threat-model`.

## Regla de reanudación

La siguiente acción técnica es conectar un backend Preview a
`royal-midnight-staging` y crear los datos QA mínimos sin tocar producción.
Después se reconstruye el APK multi-ABI y se ejecuta la matriz de Fases 4–6.
No se usa el APK histórico build16 como entrega.
