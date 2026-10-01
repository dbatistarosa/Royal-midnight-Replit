# Build 21 — verificación pendiente de runtime

Fecha: 2026-09-23. Este registro no certifica el funcionamiento de la aplicación Android.

## Límite de uso indicado por el usuario

El usuario pidió guardar el progreso cuando quede menos del 5 % de uso, para continuar cuando se reinicien los límites. Comprobar los límites durante el trabajo y, al alcanzar ese umbral en cualquiera de las ventanas, actualizar este expediente con estado, evidencia y siguiente acción antes de detener el trabajo. No consumir créditos de reinicio sin autorización explícita. Última consulta en esta sesión: 20 % restante en la ventana de cinco horas y 63 % en la semanal.

## Evidencia nueva

- Rama: `fix/royal-midnight-reliability`.
- HEAD inspeccionado: `aa9add8 docs: add persistent session handoff`; anterior: `08f06a3 fix: rebuild driver login screen`.
- Árbol limpio al iniciar. No se modificó código de la app.
- APK: `artifacts/driver-app-v2/dist-android/Royal-Midnight-Driver-v2.0.0-build21.apk`.
- SHA-256 recalculado: `A564D5739168828F9A97B8E07408741C09D39C9C518C729C882451C4FE549C23`.
- Se compararon por hash los 63 archivos versionados de la app con `.codex-driver-build-current`: ninguna diferencia.
- En ese staging, `npm test`: 2 pruebas aprobadas, 0 fallidas; `npm run typecheck`: salida 0. Node emitió avisos MODULE_TYPELESS_PACKAGE_JSON, sin fallar las pruebas.
- `npx --yes eas-cli@latest simulator:availability --json`: `available: false`, cuenta `roalmidnight`. No se creó una sesión EAS Simulator.
- No se encontró SDK/emulador Android en las ubicaciones habituales inspeccionadas ni adb/emulator en PATH. Esto no certifica la ausencia de cualquier instalación en otras ubicaciones.
- Appetize está autenticado y mostraba 15 minutos gratuitos disponibles. Se abrió Upload App, sin iniciar el build viejo.

## Autorización y bloqueo exacto

La revisión automática rechazó inicialmente la subida por falta de autorización específica para compartir el APK privado con Appetize. El usuario posteriormente autorizó expresamente: «Sí, autorizar la subida a Appetize», en respuesta a la pregunta que identifica el APK build 21, su cuenta Appetize, el emulador Android y los minutos gratuitos.

El intento posterior autorizado falló técnicamente con `fileChooser.setFiles failed`, código `-32000`, mensaje `Not allowed`. No hay evidencia de que el APK haya sido subido o instalado.

Al recibir «continua», se reintentó la selección del mismo APK autorizado y persistió `Not allowed`. Abrir `chrome://extensions/` mediante la herramienta también fue bloqueado por su política de URLs; el usuario debe abrir esa página manualmente. No se intentó eludir el bloqueo. La consulta de uso al retomar indicó 100 % restante en cinco horas y 62 % semanal.

La documentación de diagnóstico del navegador indica habilitar **Allow access to file URLs** en los detalles de la extensión ChatGPT de Chrome (`chrome://extensions`). Esa configuración requiere intervención del usuario. No volver a pedir autorización para subir este APK a Appetize: ya fue concedida.

## Pendiente

Tras habilitar ese permiso, retomar la carga del APK verificado en Appetize. Confirmar que la versión instalada es build 21 antes de iniciar la prueba. Capturar evidencia del logo, contraste, campos, botón, teclado, visibilidad de contraseña, Next/Return, validaciones, enlaces y, si hay credenciales de prueba disponibles, login y navegación posterior.

No se ejecutó ninguna prueba de runtime ni se capturaron pantallas de la app nueva. Ninguna comprobación visual, de enlaces, login válido o encabezado de red en runtime puede darse por aprobada. No se generó un APK adicional.

Build de origen: https://expo.dev/accounts/roalmidnight/projects/royal-midnight-driver/builds/031d0381-aabc-4c25-81de-cb318f591167
