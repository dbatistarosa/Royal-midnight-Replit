# Royal Midnight — Guía para entregar lo que falta

Fecha: 2026-09-18  
Propósito: reunir todo lo necesario para completar las pruebas externas y las mejoras que todavía dependen de credenciales, dispositivos, decisiones de producto o servicios externos.

## Regla de seguridad

No envíes contraseñas, claves privadas, tokens completos, secretos de Stripe,
`SUPABASE_SERVICE_ROLE_KEY`, archivos `.p8`, JSON de cuentas de servicio ni
PaymentIntents por este chat.

La forma correcta es configurar cada secreto directamente en su proveedor y
entregarme solamente el nombre, ID, ambiente y confirmación de que quedó
configurado. Si necesitas que revise un archivo privado, colócalo temporalmente
fuera del repositorio, por ejemplo en:

```text
C:\Users\encue\OneDrive\Escritorio\Hermes-private\
```

Nunca lo guardes dentro de Git, `artifacts/`, `.env`, `docs/` o una carpeta que
se vaya a subir. Antes de usar cualquier archivo privado, confirmaré que no esté
rastreado por Git y lo retiraré después de la prueba.

Stripe debe permanecer en modo TEST hasta que el propietario autorice
explícitamente lo contrario.

---

## 1. Lo mínimo que necesito primero: entorno QA seguro

Esto desbloquea la prueba E2E del conductor, GPS, reserva y mapa del pasajero.

### 1.1 Proyecto Supabase de staging

Obtenerlo en:

- [Supabase Dashboard](https://supabase.com/dashboard)
- Crear un proyecto separado de producción o una rama de staging.

Configurar allí:

1. Crear el proyecto `royal-midnight-staging`.
2. Abrir `Connect` → `Transaction pooler` y copiar la cadena PostgreSQL de staging.
3. Abrir `Settings` → `Database` → `SSL Configuration` si se necesita el CA.
4. Ejecutar las migraciones del repositorio en orden; no usar `drizzle push-force`.
5. Crear un usuario QA pasajero y un usuario QA conductor, nunca usuarios reales.
6. Crear o asignar un chauffeur aprobado y un vehículo de prueba.
7. Confirmar que las tablas `bookings`, `drivers` y `driver_locations` existen.

Entregarme:

```text
SUPABASE_STAGING_URL=https://...supabase.co
SUPABASE_STAGING_PROJECT_REF=...
DATABASE_STAGING_CONFIGURED=true/false
STAGING_MIGRATIONS_VERIFIED=true/false
QA_PASSENGER_EMAIL=qa-passenger@dominio-de-prueba.com
QA_DRIVER_EMAIL=qa-driver@dominio-de-prueba.com
QA_BOOKING_ID=si ya existe; de lo contrario: CREATE_NEW
```

No entregarme la service-role key. Debe quedar guardada solamente en el entorno
Preview de Vercel o en el administrador de secretos correspondiente.

### 1.2 Vercel Preview aislado

Obtenerlo en:

- [Vercel Dashboard](https://vercel.com/dashboard)
- Proyecto `royal-midnight` → `Settings` → `Environment Variables`.

Crear las variables para `Preview`, usando exclusivamente staging:

```text
DATABASE_URL                  -> PostgreSQL de Supabase staging
SUPABASE_URL                  -> URL de Supabase staging
SUPABASE_SERVICE_ROLE_KEY    -> solo en Vercel Preview
STRIPE_SECRET_KEY             -> sk_test_...
STRIPE_PUBLISHABLE_KEY        -> pk_test_...
STRIPE_WEBHOOK_SECRET         -> webhook TEST de Preview
APP_URL                       -> URL exacta del Preview
ALLOWED_ORIGINS               -> dominio permitido para Preview
CRON_SECRET                   -> secreto aleatorio de Preview
FIELD_ENCRYPTION_KEY         -> clave aleatoria distinta a producción
```

Entregarme solamente:

```text
VERCEL_PREVIEW_CONFIGURED=true/false
PREVIEW_URL=https://...
PREVIEW_ENV_USES_STRIPE_TEST=true/false
PREVIEW_ENV_USES_STAGING_DATABASE=true/false
```

### 1.3 Stripe TEST

Obtenerlo en:

- [Stripe Dashboard](https://dashboard.stripe.com/test/dashboard)
- Activar el interruptor `Test mode`.

Pasos:

1. Crear o seleccionar una cuenta de prueba separada de Live.
2. Obtener las claves en `Developers` → `API keys`.
3. Crear el webhook de Preview en `Developers` → `Webhooks`.
4. Usar como destino la URL del Preview más `/api/webhooks/stripe`.
5. Suscribirse a los eventos de pagos y checkout que ya usa el proyecto.
6. Guardar el signing secret `whsec_...` directamente en Vercel Preview.
7. Usar tarjetas de prueba oficiales; nunca tarjetas reales.

Entregarme:

```text
STRIPE_TEST_ACCOUNT_READY=true/false
STRIPE_TEST_WEBHOOK_URL=https://.../api/webhooks/stripe
STRIPE_TEST_WEBHOOK_CONFIGURED=true/false
TEST_CARD_TO_USE=por ejemplo 4242 4242 4242 4242
```

Nunca enviar las claves `sk_test_...` o `whsec_...` por chat.

### 1.4 Mapbox para mapa, rutas y autocomplete

Obtenerlo en:

- [Mapbox Account Tokens](https://account.mapbox.com/access-tokens/)
- [Mapbox Tokens documentation](https://docs.mapbox.com/accounts/guides/tokens/)

Pasos:

1. Crear un token público restringido para el frontend con los scopes mínimos.
2. Crear o usar un token server-side separado para Directions y Geocoding.
3. Restringir el token público al dominio de Preview y producción.
4. Configurar:

```text
VITE_MAPBOX_TOKEN=token_publico   # Vercel Preview y Production; se embebe en build
MAPBOX_ACCESS_TOKEN=token_servidor # Vercel Preview y Production; nunca frontend
```

Entregarme solamente:

```text
MAPBOX_PUBLIC_TOKEN_CONFIGURED=true/false
MAPBOX_SERVER_TOKEN_CONFIGURED=true/false
MAPBOX_PREVIEW_DOMAIN_RESTRICTED=true/false
```

La prueba que ejecutaré será: autocomplete → quote → mapa → actualización GPS.

---

## 2. Prueba completa de ubicación del conductor

Cuando la sección 1 esté lista, necesito estos datos de prueba:

```text
QA_DRIVER_ID=...
QA_BOOKING_ID=...
QA_PASSENGER_USER_ID=...
QA_DRIVER_USER_ID=...
QA_DRIVER_IS_APPROVED=true
QA_DRIVER_IS_ONLINE=true
QA_BOOKING_STATUS=confirmed
```

Secuencia que ejecutaré:

1. El conductor QA inicia sesión en la app.
2. Se concede ubicación “Always”/background.
3. Se asigna una reserva QA al conductor.
4. Se cambia la reserva a `on_way` mediante el flujo normal.
5. La app envía `PATCH /api/drivers/:id/location`.
6. Se comprueba que `location_updated_at` cambie.
7. El pasajero QA abre el detalle de la reserva.
8. Se verifica `GET /api/bookings/:id/driver-location` con cookie HttpOnly.
9. Se comprueba que el mapa actualice la posición en menos de 30 segundos.
10. Se limpia la reserva, sesiones, jobs, outbox y eventos de QA.

No crearé la prueba usando reservas históricas, pasajeros reales ni PaymentIntents
de producción.

---

## 3. Dispositivo Android físico

Para probar background location se necesita un teléfono Android real; un navegador
o simulador no es suficiente.

Qué obtener:

1. Un teléfono Android 10 o superior.
2. Una cuenta QA de conductor.
3. La APK interna generada por EAS.
4. Permitir ubicación precisa y ubicación en segundo plano.
5. Desactivar temporalmente el ahorro de batería para la app durante la prueba.

La APK se genera con:

```text
eas build --profile preview --platform android
```

Cuenta y documentación:

- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Android build](https://docs.expo.dev/build-reference/apk/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging/android/get-started)

Entregarme:

```text
ANDROID_DEVICE_READY=true/false
ANDROID_MODEL=...
ANDROID_OS=...
APK_INSTALLED=true/false
LOCATION_ALWAYS_GRANTED=true/false
PUSH_TEST_DEVICE_TOKEN=solo si vamos a probar push; no es contraseña
```

No necesito el PIN del teléfono ni la contraseña de Google.

---

## 4. Dispositivo iPhone físico y Apple/APNs

Para probar ubicación bloqueada/background y push en iOS se necesita un iPhone real
y una cuenta Apple Developer activa.

Obtenerlo en:

- [Apple Developer Program](https://developer.apple.com/programs/)
- [Apple Developer Keys](https://developer.apple.com/account/resources/authkeys/list)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Expo EAS iOS credentials](https://docs.expo.dev/app-signing/app-credentials/)

Pasos:

1. Registrar el Bundle ID `com.royalmidnight.driver`.
2. Crear o confirmar la app en App Store Connect.
3. Obtener el `Apple Team ID`.
4. Obtener el `App Store Connect App ID` numérico.
5. Crear una clave APNs con permiso de Push Notifications si se va a probar push.
6. Guardar el archivo `.p8` en EAS Secrets o en el gestor de secretos; no subirlo a Git.
7. Generar una build interna o TestFlight con el perfil `testflight`.
8. En el iPhone, conceder ubicación “Always” y probar con pantalla bloqueada.

Entregarme solamente:

```text
IOS_DEVICE_READY=true/false
IOS_MODEL=...
IOS_VERSION=...
APPLE_ID_EMAIL=...          # solo email, nunca contraseña
APPLE_TEAM_ID=...
APP_STORE_CONNECT_APP_ID=...
APPLE_BUNDLE_ID=com.royalmidnight.driver
APNS_KEY_CONFIGURED_IN_EAS=true/false
TESTFLIGHT_BUILD_READY=true/false
```

La clave privada `.p8` se crea en Apple Developer → Certificates, Identifiers &
Profiles → Keys. Apple no permite volver a descargarla después; guárdala de forma
segura y configúrala directamente en EAS.

---

## 5. Push notifications: Firebase y APNs

La app tiene la base nativa, pero falta comprobar credenciales, registro de tokens,
envío y recepción en dispositivos reales.

### Android / FCM

Obtenerlo en:

- [Firebase Console](https://console.firebase.google.com/)
- [FCM server environment](https://firebase.google.com/docs/cloud-messaging/server-environment)

Pasos:

1. Crear un proyecto Firebase separado para staging.
2. Registrar el paquete `com.royalmidnight.driver`.
3. Habilitar Firebase Cloud Messaging API.
4. Crear una service account para el servidor o configurar el proveedor oficial.
5. Guardar el JSON en un gestor de secretos, no en Git.
6. Instalar la app en el teléfono y obtener un token FCM.
7. Enviar una notificación de prueba desde Firebase Console.

Entregarme:

```text
FIREBASE_STAGING_PROJECT_ID=...
FIREBASE_ANDROID_APP_REGISTERED=true/false
FCM_API_ENABLED=true/false
FCM_SERVER_SECRET_CONFIGURED=true/false
ANDROID_PUSH_RECEIVED=true/false
```

### iOS / APNs

Entregarme los mismos datos de la sección Apple, más:

```text
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_PRIVATE_KEY_CONFIGURED_IN_EAS=true/false
IOS_PUSH_RECEIVED=true/false
```

Si todavía no existe código de envío para alguno de los dos proveedores, marcarlo
como `NOT_IMPLEMENTED`; no inventar una confirmación de entrega.

---

## 6. Email transaccional

Esto permite probar verificación de email, confirmaciones de reserva, cambios de
estado y notificaciones de workers.

Recomendación: Resend.

- [Resend Dashboard](https://resend.com/overview)
- [Resend Domains](https://resend.com/domains)

Pasos:

1. Crear una cuenta o proyecto de staging.
2. Verificar un dominio remitente, por ejemplo `mail.royalmidnight.com`.
3. Crear una API key con el alcance mínimo.
4. Configurar en Vercel Preview:

```text
RESEND_API_KEY=re_...
SMTP_FROM=Royal Midnight <noreply@dominio-verificado.com>
APP_URL=https://preview-...
```

5. Usar solamente correos QA.

Entregarme:

```text
EMAIL_PROVIDER=resend/smtp
EMAIL_DOMAIN_VERIFIED=true/false
QA_EMAIL_INBOX=...
EMAIL_PREVIEW_CONFIGURED=true/false
```

Nunca enviar `RESEND_API_KEY` o contraseñas SMTP por chat.

---

## 7. MFA para administrador y pasajeros

Para probar MFA hace falta definir primero el alcance.

El propietario debe elegir:

```text
MFA_SCOPE=admin-only/passenger-and-admin/driver-and-admin
MFA_METHOD=TOTP/email-code/SMS
MFA_REQUIRED_ON=login/high-risk-actions/both
MFA_RECOVERY_POLICY=...
```

Para una primera prueba segura recomiendo `admin-only` + `TOTP`:

1. Crear un administrador QA separado.
2. Instalar Google Authenticator, 1Password o Microsoft Authenticator.
3. Registrar el secreto TOTP mediante QR.
4. Guardar códigos de recuperación en el gestor de contraseñas.
5. Probar alta, login, código incorrecto, reintento, logout y recuperación.

Entregarme únicamente:

```text
MFA_QA_ADMIN_EMAIL=...
AUTHENTICATOR_APP_READY=true/false
MFA_PRODUCT_DECISION=...
```

No enviar el secreto TOTP ni códigos de recuperación.

---

## 8. Sentry y diagnóstico de errores

Esto permite verificar errores reales del navegador, API y builds móviles.

Obtenerlo en:

- [Sentry](https://sentry.io/)

Pasos:

1. Crear proyectos separados para `royal-midnight-web`, `royal-midnight-api` y,
   si corresponde, `royal-midnight-driver`.
2. Copiar el DSN de cada proyecto.
3. Configurar `SENTRY_DSN` para API y `VITE_SENTRY_DSN` para frontend.
4. Mantener los DSN separados entre Preview y Production cuando sea posible.
5. Crear una alerta de error nueva y probarla con una ruta QA.

Entregarme:

```text
SENTRY_WEB_PROJECT=...
SENTRY_API_PROJECT=...
SENTRY_DSN_CONFIGURED=true/false
SENTRY_ALERT_OWNER=...
```

El DSN puede compartirse solo si el propietario lo considera aceptable; no enviar
tokens de organización ni credenciales de Sentry.

---

## 9. Backups y ensayo de restauración

Falta certificar que una restauración funciona. Necesito:

1. Un proyecto Supabase de restauración separado.
2. Un backup exportado o PITR disponible.
3. Una ventana de mantenimiento aprobada.
4. Un responsable que confirme qué datos se pueden restaurar.
5. Una lista de tablas que deben coincidir después de restaurar.

Obtenerlo en:

- [Supabase Dashboard](https://supabase.com/dashboard)
- `Project Settings` → `Database` → backups/PITR según el plan.

Entregarme:

```text
RESTORE_PROJECT_REF=...
BACKUP_TIMESTAMP=...
RESTORE_WINDOW_APPROVED=true/false
RESTORE_OWNER=...
TABLES_TO_VERIFY=bookings,drivers,driver_locations,payment_events,mail_outbox
```

Nunca restaurar directamente sobre producción durante la prueba.

---

## 10. Realtime, ETA y ruta

El sistema actual usa polling. Para cambiar a Realtime necesito una decisión de
producto y configuración de Supabase.

Entregarme:

```text
REALTIME_SCOPE=driver_locations/booking_status/both
REALTIME_FALLBACK_SECONDS=10
ETA_PROVIDER=mapbox/other
SHOW_PICKUP_AND_DROPOFF=true/false
SHOW_DRIVER_ROUTE=true/false
LOCATION_RETENTION_DAYS=...
```

Después configuraré una publicación Realtime para `driver_locations`, mantendré
polling como fallback y comprobaré que no se exponga ubicación de otra reserva.

---

## 11. Concierge y preferencias de lujo

Aquí no faltan credenciales: faltan decisiones del propietario.

Entregarme esta tabla completada:

```text
CONCIERGE_EMAIL=...
CONCIERGE_PHONE=...
CONCIERGE_AVAILABILITY=...
CONCIERGE_ALLOWED_ACTIONS=help,notes,extra-stop,change-instructions
REQUIRE_ADMIN_APPROVAL_FOR_EXTRA_STOP=true/false
PREFERENCES=temperature,music,silence,water,luggage,language
PREFERENCE_VISIBLE_TO_DRIVER=true/false
PREFERENCE_EDIT_CUTOFF_MINUTES=...
AUDIT_ALL_CONCIERGE_ACTIONS=true/false
```

No se implementará una acción que modifique una reserva, precio o ruta sin que el
propietario defina aprobación, auditoría y límites.

---

## 12. Corporate travel y conciliación

Para terminar el centro corporativo necesito decisiones y datos de prueba:

```text
CORPORATE_BILLING_MODE=central-card/invoice/both
APPROVAL_REQUIRED=true/false
COST_CENTER_REQUIRED=true/false
MONTHLY_INVOICE_EMAIL=...
REPORT_FIELDS=traveler,route,date,cost-center,amount,status
RETENTION_DAYS=...
CORPORATE_QA_ACCOUNT=...
```

Usar únicamente la cuenta Stripe TEST y viajeros QA. No entregar facturas ni datos
de empleados reales.

---

## 13. Seguridad automatizada adicional

No necesito credenciales para esto. Si autorizas incluirlo en CI, marcar:

```text
ENABLE_SEMGREP_CI=true/false
ENABLE_TRIVY_CI=true/false
ENABLE_GITLEAKS_CI=true/false
FAIL_ON_HIGH_OR_CRITICAL=true/false
```

La configuración se añadirá a GitHub Actions con versiones fijadas. Si la
organización usa reglas propias, entregar el archivo de política sin secretos.

---

## 14. Qué debes entregarme en un solo mensaje

Puedes copiar esta plantilla y completar solo valores no secretos:

```text
QA_STAGING_READY=true/false
PREVIEW_URL=https://...
STRIPE_TEST_READY=true/false
MAPBOX_READY=true/false
QA_PASSENGER_EMAIL=...
QA_DRIVER_EMAIL=...
QA_BOOKING_ID=...
ANDROID_DEVICE_READY=true/false
IOS_DEVICE_READY=true/false
APPLE_TEAM_ID=...
APP_STORE_CONNECT_APP_ID=...
FIREBASE_PROJECT_ID=...
PUSH_READY=true/false
EMAIL_READY=true/false
MFA_DECISION=...
SENTRY_READY=true/false
RESTORE_PROJECT_READY=true/false
REALTIME_DECISION=...
CONCIERGE_DECISION=...
CORPORATE_DECISION=...
ENABLE_SECURITY_SCANNERS=true/false
```

Después de recibir esta lista, continuaré en este orden:

1. Confirmar que los ambientes están aislados.
2. Ejecutar E2E de reserva, conductor, GPS y mapa.
3. Probar email, pagos TEST y webhooks TEST.
4. Probar Android e iOS en dispositivos reales.
5. Implementar Realtime, ETA, concierge, preferencias o MFA según tus decisiones.
6. Repetir tests, typecheck, build, auditoría y búsqueda de regresiones.
7. Fusionar a `main`, publicar a production y verificar health, logs y consola.
8. Limpiar todos los datos de QA y actualizar `docs/RESUME.md`.

## Estado actual

Ya están implementados y publicados: tracking con cookie HttpOnly, actualización
del tracking público, indicador de frescura del mapa, recentrado, corrección de
hidratación React y logo transparente.

Los pendientes enumerados aquí son los que requieren recursos que no puedo
inventar: cuentas del propietario, claves configuradas en proveedores, un entorno
QA aislado, dispositivos físicos y decisiones de producto.
