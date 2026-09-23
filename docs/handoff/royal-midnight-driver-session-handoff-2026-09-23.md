# Royal Midnight Driver App — expediente persistente de sesión

Fecha de corte: 2026-09-23  
Propósito: permitir que otra sesión continúe exactamente desde este punto sin repetir investigaciones ni asumir que algo funciona sin comprobarlo.

## 1. Instrucción principal

La sesión actual fue detenida deliberadamente por solicitud del usuario. No continuar programando desde este expediente hasta que una nueva sesión lea este archivo. El usuario exige evidencia real antes de afirmar que algo funciona: no decir “listo”, “completo”, “arreglado” o equivalente sin haber ejecutado las verificaciones correspondientes y, para la aplicación Android, sin haberla instalado y probado realmente en un dispositivo o emulador.

El usuario no quiere reportes de cada paso. La siguiente sesión debe trabajar de forma autónoma y entregar únicamente el resultado verificable, incluyendo fallos pendientes si los hubiera.

## 2. Ubicación y estado Git exactos

- Workspace: `C:\Users\encue\OneDrive\Escritorio\Hermes`
- Repositorio: `C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit`
- Remoto: `https://github.com/dbatistarosa/Royal-midnight-Replit.git`
- Rama: `fix/royal-midnight-reliability`
- HEAD al detener: `08f06a3 fix: rebuild driver login screen`
- Commit anterior importante: `06805e5 fix: prerender from a production SSR bundle`
- El commit `08f06a3` ya fue enviado al remoto.
- La fuente de verdad del código es el repositorio principal. No copiar cambios desde el staging salvo que una verificación lo requiera.

## 3. Objetivo del producto

Aplicación móvil Android para conductores de Royal Midnight, con una experiencia visual profesional alineada con las referencias entregadas por el usuario: fondo azul marino casi negro, detalles dorados, logo RM, tarjetas oscuras, tipografía clara y navegación de conductor.

El problema reportado por el usuario era que la aplicación solo mostraba campos sin diseño legible ni botón funcional de inicio de sesión. El alcance inmediato implementado fue rehacer la pantalla de login de forma nativa y verificable. La app completa todavía requiere prueba de ejecución en Android antes de declarar que el flujo funciona.

## 4. Cambios implementados en el último trabajo

### Pantalla de login

Archivo: `artifacts/driver-app-v2/app/(auth)/login.tsx`

La pantalla fue reemplazada por componentes `StyleSheet` nativos, evitando depender de clases NativeWind para el contraste. Incluye:

- Fondo navy y tratamiento de marca dorado.
- Logo existente desde `../../assets/icon.png`.
- Título `Royal Midnight` y subtítulo `PORTAL DE CONDUCTORES`.
- Tarjeta de bienvenida `Bienvenido de nuevo`.
- Campo visible de correo electrónico con icono.
- Campo visible de contraseña con icono.
- Botón dorado real de inicio de sesión con `testID="login-submit"`.
- Botón para mostrar/ocultar contraseña con `testID="toggle-password"`.
- `onSubmitEditing` en contraseña para iniciar sesión.
- Return/Next del correo mueve el foco al campo de contraseña usando `useRef<TextInput>`.
- Mensajes de validación visibles en una caja de error roja.
- Enlace `¿Aún no tienes cuenta? Solicitar acceso como conductor` que abre `https://www.royalmidnight.com/driver/onboarding`.
- Enlace de soporte que abre `https://www.royalmidnight.com/contact`.
- Estados de carga y prevención de envíos repetidos.

### Validación aislada

- `artifacts/driver-app-v2/src/auth/loginValidation.ts`
  - `normalizeLoginCredentials`
  - `validateLoginCredentials`
- `artifacts/driver-app-v2/src/auth/loginValidation.test.mjs`
  - normalización de correo
  - credenciales válidas
  - correo vacío
  - correo inválido
  - contraseña vacía
- `artifacts/driver-app-v2/package.json`
  - El script `test` ejecuta las pruebas de location lifecycle y login validation.

### Tema

Archivo: `artifacts/driver-app-v2/src/theme/colors.ts`

Se agregaron los colores explícitos del tema: `#060d1b`, `#122039`, `#0d1829`, `#0b1627`, `#2b3b54`, `#263b57`, `#30445f`, `#d4af52`, `#f0cf7a`, `#9caabe`, `#71819a` y `#c4cedc`.

### API y autenticación

Ya existía y se conserva el encabezado nativo:

```text
X-RM-Client: driver-app
```

La aplicación usa la API configurada con valor predeterminado `https://www.royalmidnight.com/api` y el endpoint de login existente `/auth/login`. El resultado debe corresponder a un usuario con rol de conductor. No se agregó un registro móvil simplificado que pudiera crear usuarios incompletos: el enlace de acceso conduce al onboarding existente del sitio.

Archivos relacionados ya revisados:

- `artifacts/driver-app-v2/src/api/client.ts`
- `artifacts/driver-app-v2/src/api/driverApi.ts`

## 5. Verificaciones que sí se ejecutaron

### TDD de validación

Primero se ejecutó la prueba antes de crear el módulo y falló correctamente con `ERR_MODULE_NOT_FOUND`. Luego se creó la implementación y la prueba pasó.

### Pruebas locales

En el staging limpio:

```text
npm test
2 tests, 2 pass, 0 fail

npm run typecheck
sin errores

npx expo config --json
pasó
```

El `node_modules` del árbol principal estaba incompleto/corrupto y fallaba al cargar `@expo/config-plugins` y otras dependencias de Expo. Para no alterar el árbol principal se usó este staging temporal:

`C:\Users\encue\OneDrive\Escritorio\Hermes\.codex-driver-build-current`

En el staging se hizo una instalación limpia con `npm install --ignore-scripts --no-audit --no-fund`, y allí pasaron typecheck, tests y configuración Expo. El staging tiene dependencias instaladas y un repositorio Git local; no es la fuente de verdad.

### Build EAS Android

Se construyó con `EAS_NO_VCS=1` desde el staging porque el `node_modules` principal estaba incompleto.

- Build ID: `031d0381-aabc-4c25-81de-cb318f591167`
- URL: `https://expo.dev/accounts/roalmidnight/projects/royal-midnight-driver/builds/031d0381-aabc-4c25-81de-cb318f591167`
- Cuenta EAS: `roalmidnight`
- Proyecto EAS ID: `caed6e0b-2b17-47d6-aaeb-1675e9cda7d4`
- Perfil: `preview`
- Estado del build observado: succeeded
- Versión de la app: `2.0.0`
- Android versionCode/build: `21`
- El build reportó éxito en instalación de dependencias, configuración Expo, Expo Doctor, prebuild, bundle JS, Gradle y subida del artefacto.

APK descargado y copiado a:

`C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit\artifacts\driver-app-v2\dist-android\Royal-Midnight-Driver-v2.0.0-build21.apk`

Metadatos comprobados:

- Tamaño: `83,458,856` bytes
- SHA-256: `A564D5739168828F9A97B8E07408741C09D39C9C518C729C882451C4FE549C23`
- El archivo contiene `AndroidManifest.xml`, `assets/index.android.bundle` y librerías nativas `arm64-v8a` y `x86_64`.

## 6. Lo que todavía NO se debe afirmar

No se completó una prueba real de interfaz del APK nuevo en un teléfono Android o emulador. Por tanto, todavía no hay evidencia de que el botón, el logo, los colores, el teclado, el enlace, el login válido y la navegación posterior se comporten correctamente en runtime.

La siguiente sesión debe completar esa prueba antes de entregar el producto. Si falla, debe aplicar depuración sistemática, corregir el código en el repositorio principal, repetir las pruebas y generar un nuevo APK comprobado.

La URL pública anterior de Appetize corresponde al build viejo y no sirve como evidencia del build 21:

- Public key vieja: `rvi45dz4ji6m4pbdzvl6v44d4m`
- URL vieja: `https://appetize.io/app/rvi45dz4ji6m4pbdzvl6v44d4m`
- El intento de subir el APK nuevo quedó bloqueado porque `fileChooser.setFiles` no estaba permitido. No decir que el build 21 fue probado allí.

## 7. Checklist obligatorio para la siguiente sesión

1. Leer este archivo completo.
2. Inspeccionar `git status`, `git log -1 --oneline` y los archivos de la app. Preservar cambios existentes.
3. Instalar/abrir el APK build 21 en un dispositivo o emulador Android usando las skills disponibles (`dogfood`, `expo-dev-client` o la herramienta de dispositivo que esté disponible).
4. Capturar evidencia visual de la pantalla inicial y comprobar:
   - logo visible
   - texto legible
   - campos visibles
   - botón dorado visible y pulsable
   - contraste correcto
   - teclado no tapa el botón
   - mostrar/ocultar contraseña funciona
   - Return/Next funciona
   - validación de campos vacíos y correo inválido funciona
5. Probar los enlaces de onboarding y soporte.
6. Probar login con un driver de prueba real si las credenciales están disponibles localmente; nunca imprimir ni guardar contraseñas o tokens.
7. Comprobar que un login válido navega al área de conductor y que la API responde con el encabezado `X-RM-Client: driver-app`.
8. Si algo falla, usar depuración sistemática: reproducir, capturar evidencia, localizar la causa, corregir, probar de nuevo.
9. Ejecutar nuevamente typecheck y tests; luego generar un nuevo build EAS si el código cambió.
10. Solo entregar el resultado con rutas, hash, URL de build, pruebas ejecutadas y evidencia de runtime. Si no se puede comprobar, declarar exactamente el bloqueo y no usar lenguaje de finalización.

## 8. Conexiones, cuentas y secretos

Conexiones conocidas:

- GitHub: `dbatistarosa/Royal-midnight-Replit`
- EAS/Expo: cuenta `roalmidnight`, proyecto `royal-midnight-driver`
- API pública: `https://www.royalmidnight.com/api`
- Sitio: `https://www.royalmidnight.com`

No copiar a este expediente, al repositorio ni al prompt ningún token de API, token de EAS, clave privada FCM, contraseña de Gmail, contraseña de driver o secreto de proveedor. Si una herramienta pide autenticación, usar el almacén seguro/estado autenticado de la sesión y no pegar secretos en archivos. El usuario indicó previamente que autorizaba generar una clave privada FCM y cargarla en EAS, pero esa operación no debe darse por verificada aquí sin evidencia fresca y sus credenciales no deben escribirse en este archivo.

## 9. Skills e investigación ya utilizada

Se revisaron y aplicaron estas instrucciones relevantes:

- Expo: `expo-overview`
- Pruebas React Native: `react-native-testing`
- Exploración móvil: `dogfood`
- Mejores prácticas React Native: `react-native-best-practices`
- TDD: `superpowers:test-driven-development`
- Verificación antes de afirmar finalización: `superpowers:verification-before-completion`
- Brainstorming y ejecución de planes: `superpowers:brainstorming`, `superpowers:executing-plans`

La decisión técnica actual es mantener Expo/React Native con EAS para Android y reutilizar la API existente de Royal Midnight. La pantalla de login debe permanecer con estilos nativos explícitos mientras no exista una prueba que demuestre que la configuración de clases/NativeWind mantiene contraste correcto en el APK.

## 10. Comandos de recuperación rápida

Leer todo el expediente:

```powershell
Get-Content -Raw 'C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit\docs\handoff\royal-midnight-driver-session-handoff-2026-09-23.md'
```

Inspeccionar el repositorio:

```powershell
Set-Location 'C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit'
git status
git log -1 --oneline
Get-FileHash 'artifacts\driver-app-v2\dist-android\Royal-Midnight-Driver-v2.0.0-build21.apk' -Algorithm SHA256
```

## 11. Prompt exacto para la próxima sesión

Copiar y pegar este prompt completo:

```text
Lee primero y completamente este expediente persistente antes de hacer cualquier otra cosa:

Get-Content -Raw 'C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit\docs\handoff\royal-midnight-driver-session-handoff-2026-09-23.md'

Continúa el trabajo de Royal Midnight Driver desde el punto exacto descrito allí. No repitas investigaciones ya documentadas, no reinicies el proyecto, no borres cambios existentes y no me hagas las mismas preguntas otra vez. La prioridad pendiente es instalar y probar realmente el APK Android build 21 en un dispositivo o emulador, porque el build EAS fue comprobado pero la interfaz de runtime todavía no.

Usa las skills disponibles de Expo, dogfood, React Native testing, debugging sistemático y verificación antes de completar. Inspecciona primero el repositorio, la rama y el commit. Comprueba visual y funcionalmente el login: logo, contraste, campos, botón, teclado, mostrar/ocultar contraseña, validaciones, enlaces, login de un driver de prueba y navegación posterior. Captura evidencia real. Si encuentras un fallo, reproduce el fallo, determina la causa, corrige solo lo necesario en el repositorio principal y repite typecheck, tests, build y prueba de runtime. Nunca afirmes que algo funciona solo porque compila o porque EAS dice succeeded.

No guardes ni muestres contraseñas, tokens, claves FCM o secretos. No uses la URL vieja de Appetize como evidencia del build nuevo. Si necesitas un nuevo APK, genera uno con EAS y reporta la URL, build ID, ruta local y SHA-256. Entrega una respuesta final únicamente después de contar con evidencia de runtime; incluye exactamente qué se comprobó, qué comandos pasaron, qué APK se debe instalar y cualquier bloqueo real restante. Si algo no pudo comprobarse, dilo claramente y no lo presentes como terminado.
```

Este archivo es la memoria persistente de trabajo para la siguiente sesión; no depende de que el historial temporal del chat siga disponible.
