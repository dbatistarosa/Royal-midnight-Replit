# Royal Midnight Driver — 2026-09-24

Objetivo del usuario: producto comprobado antes del 1 de octubre de 2026. Guardar el progreso y pausar cuando quede menos del 5 % en una ventana de uso. Al iniciar esta continuación quedaba 88 % en cinco horas y 44 % semanal.

## Runtime real del build 21

Después de que el usuario habilitó el acceso a archivos de la extensión, la carga a Appetize funcionó. La autorización para subir el APK a su cuenta Appetize está concedida en esta conversación.

Appetize confirmó versión 2.0.0, build 21, cargado el 23 de septiembre a las 11:19 AM. Enlace específico: https://appetize.io/app/b_72hgpjzye6wd2kqfldpmqrawsy

Se instaló y arrancó en Pixel 7 / Android 13. El logo, la tarjeta, el texto y los campos se renderizan. Se reprodujo un fallo grave: el botón de login pierde el fondo dorado, dimensiones y distribución; su texto oscuro queda casi invisible sobre el fondo navy. Pulsar el texto sí muestra «Ingresa tu correo y contraseña» con la caja roja de validación.

Evidencia real:
- `build21-runtime-evidence/01-login-initial.png`
- `build21-runtime-evidence/02-empty-validation-button-missing.png`

No se aprobaron todavía teclado, Next/Return, mostrar/ocultar contraseña, correo inválido, enlaces, login válido ni navegación posterior. El intento de entrada de texto a través del navegador no produjo evidencia suficiente para afirmarlo.

## Corrección en curso

Fuente de verdad: repositorio principal, rama `fix/royal-midnight-reliability`. Se modificó exclusivamente `artifacts/driver-app-v2/app/(auth)/login.tsx`: el estilo del Pressable de login ahora es un array resuelto, con estado `loginPressed` y eventos `onPressIn/onPressOut`, en lugar de una función de estilo. Esto evita pasar una función por el procesamiento de estilos inline de react-native-css-interop 0.2.6. El resultado todavía requiere validación visual en un APK nuevo.

Se copió únicamente ese archivo desde el repositorio al staging `.codex-driver-build-current`. `npm test`: 2 aprobadas, 0 fallidas. `npm run typecheck`: salida 0. Persisten avisos no fatales MODULE_TYPELESS_PACKAGE_JSON.

Se inició desde el staging: `EAS_NO_VCS=1 npx --yes eas-cli@latest build --platform android --profile preview --non-interactive --no-wait`. EAS asignó el build 22, ID `054bafee-4047-4478-93a8-4afbfd3cc471`, observado `IN_PROGRESS`. URL: https://expo.dev/accounts/roalmidnight/projects/royal-midnight-driver/builds/054bafee-4047-4478-93a8-4afbfd3cc471 . No iniciar builds duplicados sin comprobar su estado.

Al retomar el navegador, la pestaña anterior devolvió `Debugger unattached`. Una pestaña nueva de Appetize mostró el login y posteriormente la conexión se interrumpió (`Detached while handling command`). Se solicitó al usuario reconectar la extensión e iniciar sesión en Appetize si lo pide. No hay aún una prueba del build 22.

## Build 22 terminado

EAS confirmó `FINISHED` para `054bafee-4047-4478-93a8-4afbfd3cc471`, versión 2.0.0, build 22. Descargado a `artifacts/driver-app-v2/dist-android/Royal-Midnight-Driver-v2.0.0-build22.apk`.

SHA-256: `562C50D6E31160DA9608DEA3A8FC8C6F4430077D0DAE8A8E57A594017FDE4DD4`.

Artefacto EAS: https://expo.dev/artifacts/eas/LaD8b00-WYpW8S3q63jrFKFp7EU8_nGooMcqvlQL1y0.apk

La causa en el código de la dependencia se concretó en `react-native-css-interop/src/runtime/native/native-interop.ts`, función `applyRules`: las declaraciones inline no-array se clonan con `{ ...declaration }`; una función de estilo se convierte así en un objeto sin las propiedades visuales que devuelve. El cambio evita enviar esa función a interop. Falta validar la corrección en Android.

La pestaña nueva Appetize fue reemplazada por `500658476` (browser `2`) y seguía en login. Dos intentos de seleccionarla agotaron 30 segundos y reiniciaron el kernel de la herramienta. No se cargó ni instaló build 22. No repetir intentos sin que cambie la conexión del navegador.

Pendiente: restablecer Chrome/extensión y la sesión Appetize, cargar build 22, repetir la prueba visual y funcional y actualizar este expediente. No declarar la app lista por typecheck o build. Los cambios de código y documentos permanecen locales, sin commit/push en esta continuación.

## Runtime del build 22 — continuación 24 septiembre, 23:12 EDT

Carga a Appetize completada y metadatos confirmados: versión 2.0.0, versionCode/build 22, 79.59 MB, arm64-v8a y x86_64. Enlace específico NUEVO: https://appetize.io/app/b_eejplankoa3px2v6ytro7vlezy . Instalado y ejecutado en Pixel 7 / Android 13.

Verificado visual y funcionalmente en el APK real:
- Logo, marca, campos y tarjeta renderizados.
- Botón dorado con texto oscuro, dimensiones y distribución restaurados; pulsación efectiva.
- Campos vacíos: mensaje «Ingresa tu correo y contraseña».
- Teclado de correo aparece; teclas físicas llegan al campo. `typeText` del navegador modifica el textarea puente pero no entrega texto al emulador; usar `pressKey` o teclado Android. No confundir esto con un fallo del APK.
- Return desde correo mueve el foco a contraseña; entrada ficticia enmascarada, toggle muestra texto ficticio y vuelve a ocultarlo.
- Return desde contraseña envía validación y muestra «Ingresa un correo electrónico válido» para correo sin formato válido.
- Solicitar acceso abre Chrome Android en /driver/onboarding y carga Chauffeur Application.
- Soporte abre /contact y carga Contact Us.

Evidencias: carpeta `build22-runtime-evidence`, archivos 01-login-initial, 02-empty-validation, 03-password-keyboard, 04-password-toggle-dummy, 05-invalid-email-validation, 06-onboarding-link, 07-support-link (PNG). Solo texto ficticio de prueba, sin contraseñas reales.

Pendiente: comprobar desplazamiento para acceder al botón con teclado abierto, login válido y navegación posterior. Usuario confirmó que puede iniciar sesión manualmente con driver de prueba; se devolvió el emulador al login y se solicitó que lo haga. NO capturar pantalla mientras escribe credenciales. Pestaña Chrome 500658476, browser 2, marcada handoff. No abrir otro build ni iniciar otra carga.

Rama y commit reconfirmados: fix/royal-midnight-reliability, aa9add8. Cambios locales preservados. Appetize indicaba 10 minutos restantes antes de estas pruebas (no necesariamente saldo final). Uso Codex cambió de 9 % restante a 82 % en cinco horas y 97 % semanal en consulta posterior; este agente no consumió créditos de reset.

## Login válido rechazado — 25 septiembre

El usuario reportó que ingresó sus datos correctos en build 22 y recibió credenciales inválidas; confirmó que la misma cuenta sí entra en la web como conductor. Por ahora el fallo es reportado por el usuario, no se ha capturado su pantalla ni leído credenciales.

Comprobaciones de diagnóstico:
- Se abrió el ZIP del APK build22 y se leyó únicamente `extra.apiBaseUrl` de assets/app.config: https://www.royalmidnight.com/api, versión2.0.0. No hay evidencia de apuntar a QA.
- driverApi.login envía POST /auth/login; client añade X-RM-Client: driver-app y JSON.
- normalizeLoginCredentials normaliza solo email; conserva password literalmente.
- Web usa /api/auth/login y JSON con email/password. Backend local retorna Invalid credentials cuando no encuentra usuario o no verifica password, antes de comprobar rol o construir bearer token. Header nativo solo decide incluir token después de autenticar.
- No se cambió código para este fallo ni se inició build duplicado.

Prueba pendiente solicitada al usuario: vaciar completamente ambos campos (se habían usado datos ficticios), escribir con teclado del teléfono virtual, revisar él mismo con ojo y ocultar antes de enviar. Esto contrasta la hipótesis de entrada/pegado de Appetize, que ya falló con typeText durante las pruebas. No tomar capturas mientras ingresa o muestra credenciales. Esperar resultado; si persiste, comparar nuevo inicio de sesión web en el mismo emulador y respuesta nativa sin registrar cuerpos ni secretos.
