# Royal Midnight Driver — expediente maestro para la siguiente sesión

Fecha de corte: 27 de septiembre de 2026. Leer COMPLETO antes de actuar.
Este expediente reemplaza las prioridades antiguas de los handoffs del 23, 24 y 26 de septiembre. Conserva esos archivos como historial; NO volver a empezar por build21.

## 1. Encargo vigente y reglas del usuario

El usuario quiere la aplicación de conductores terminada antes del 1 de octubre de 2026, visualmente fiel a las pantallas de referencia y funcional con la API real. No quiere otra app, un reinicio, un mockup presentado como producto ni un login bonito con pantallas internas rotas.

Última instrucción: guardar instrucciones exhaustivas para continuar en otra sesión sin repetir preguntas/investigaciones. En este turno solo se consolida estado y se consulta el build, no se amplía el desarrollo.

Reglas persistentes:
- Preservar TODOS los cambios existentes. Nada de git reset/clean, reinstalación destructiva ni sobrescribir fuentes desde staging.
- Corregir en el repositorio principal; staging es para dependencias/pruebas/build.
- No afirmar que funciona porque typecheck, export o EAS pasaron. Hace falta evidencia visual/funcional del APK exacto.
- No guardar, imprimir, pedir por chat ni mostrar contraseñas, bearer tokens, claves FCM o secretos. No capturar mientras el usuario escribe/muestra credenciales.
- No repetir preguntas ya contestadas: el usuario TIENE un teléfono Android y eligió probar allí. La cuenta sí puede entrar como conductor y finalmente logró login en build22.
- Respetar uso: consultar get_usage_limits; si queda MENOS DEL5% en alguna ventana, guardar estado exacto y pausar hasta reinicio. No consumir créditos de reset sin consentimiento explícito para cada crédito.
- Evitar builds duplicados y exploración irrelevante. Agrupar cambios verificados antes de construir.
- No prometer la fecha como garantizada ni declarar todo terminado si faltan flujos/datos/runtime.

## 2. Rutas y Git comprobados

Workspace: C:\Users\encue\OneDrive\Escritorio\Hermes
Repo principal: C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit
App activa: artifacts/driver-app-v2 (NO artifacts/driver-app antiguo).
Rama: fix/royal-midnight-reliability
HEAD: aa9add8 — docs: add persistent session handoff
Commit de login anterior: 08f06a3 — fix: rebuild driver login screen
Remoto conocido: https://github.com/dbatistarosa/Royal-midnight-Replit.git

Los cambios del 24–26 septiembre son LOCALES, SIN COMMIT/PUSH. Se confirmó git status al guardar este expediente. No confundir el commit con todo el contenido usado por EAS: se construyó desde un staging con cambios locales.

Staging: C:\Users\encue\OneDrive\Escritorio\Hermes\.codex-driver-build-current
Motivo: node_modules del monorepo estaba incompleto/corrupto. Allí se instalaron dependencias limpias, sin tocar el árbol principal. Última sincronización comprobó SHA iguales en47 archivos de app/src. Config/package también fueron copiados cuando se modificaron.

Para archivos [bookingId].tsx usar Get-Content/Copy-Item -LiteralPath: corchetes tienen significado wildcard en PowerShell.

## 3. Referencias visuales que YA existen; no pedirlas otra vez

Directorio: C:\Users\encue\OneDrive\Escritorio\Hermes\driver-app-screens
- 00-all-screens.png: composición de las7 pantallas; YA inspeccionada.
- 01-home.png
- 02-new-ride-offer.png
- 03-active-trip.png
- 04-my-rides.png
- 05-earnings.png
- 06-alerts.png
- 07-profile.png
- 08-splash.png
También existen en workspace royal-midnight-driver-app-screen-system.png y royal-midnight-driver-splash-concept.png.

Referencia: navy casi negro, dorado cálido, tarjetas oscuras borde fino, ruta con dos puntos, cabecera RM, tabs inferiores Home/Rides/Earnings/Alerts/Profile. Home con saludo/Online/estadísticas/ofertas; Rides con filtros/buscador; Earnings resumen y gráfico; Alerts por categoría; Profile avatar/vehículo/menú.

No sustituir datos reales por nombres/importes/ratings/ETA de la imagen. La API no ofrece todas las métricas decorativas de la referencia (ej. crecimiento porcentual, ETA de llegada a oferta o fecha de pago programada). No inventarlas ni poner controles sin comportamiento. La fidelidad exacta AÚN NO está aprobada visualmente.

Capturas de fallo aportadas por el usuario, 25sept, NO son el diseño objetivo:
C:\Users\encue\OneDrive\Imágenes\Capturas de pantalla\
- Screenshot 2026-09-25 095733.png: Home sin estilos
- Screenshot 2026-09-25 095743.png: Trips sin estilos
- Screenshot 2026-09-25 095747.png: Earnings sin estilos
- Screenshot 2026-09-25 095755.png: Alerts sin estilos
- Screenshot 2026-09-25 095801.png: Profile texto oscuro ilegible

## 4. Cronología comprobada y builds

### Build21 — runtime real, fallo del botón
EAS ID031d0381-aabc-4c25-81de-cb318f591167, v2.0.0/versionCode21.
APK: artifacts/driver-app-v2/dist-android/Royal-Midnight-Driver-v2.0.0-build21.apk
Bytes83458856. SHA256 A564D5739168828F9A97B8E07408741C09D39C9C518C729C882451C4FE549C23.
Appetize específico: https://appetize.io/app/b_72hgpjzye6wd2kqfldpmqrawsy
Instalado/ejecutado Pixel7 Android13. Logo y campos visibles; botón perdió fondo y dimensiones por style callback de Pressable a través de css-interop. Pulsar texto sí mostraba error de campos vacíos.
Evidencias docs/handoff/build21-runtime-evidence/01-login-initial.png y02-empty-validation-button-missing.png.

### Build22 — botón corregido, login válido, pantallas internas rotas
EAS ID054bafee-4047-4478-93a8-4afbfd3cc471, v2.0.0/build22, FINISHED.
EAS página: https://expo.dev/accounts/roalmidnight/projects/royal-midnight-driver/builds/054bafee-4047-4478-93a8-4afbfd3cc471
APK estable: https://expo.dev/artifacts/eas/LaD8b00-WYpW8S3q63jrFKFp7EU8_nGooMcqvlQL1y0.apk
Local: artifacts/driver-app-v2/dist-android/Royal-Midnight-Driver-v2.0.0-build22.apk
Bytes83459036. SHA256 562C50D6E31160DA9608DEA3A8FC8C6F4430077D0DAE8A8E57A594017FDE4DD4.
Appetize específico: https://appetize.io/app/b_eejplankoa3px2v6ytro7vlezy

Login corrigió callback style con array resuelto, estado loginPressed y onPressIn/onPressOut en app/(auth)/login.tsx. Se preservó este arreglo.
Pruebas REALES del agente en Pixel7 Android13:
- Logo, tarjeta, campos y botón dorado visible/pulsable.
- Campos vacíos -> Ingresa tu correo y contraseña.
- Correo inválido -> Ingresa un correo electrónico válido.
- Teclado de correo; Return mueve foco a contraseña.
- Contraseña ficticia enmascarada, ojo muestra y vuelve a ocultar; Return valida.
- Solicitar acceso abre /driver/onboarding y carga Chauffeur Application.
- Soporte abre /contact y carga Contact Us.
Siete PNGs en docs/handoff/build22-runtime-evidence, numerados01–07.

Al principio usuario reportó Invalid credentials; confirmó cuenta funcional en web como driver. Luego confirmó que SÍ pudo hacer login en APK y adjuntó capturas posteriores. No se determinó la causa del rechazo inicial. NO afirmar que hubo un arreglo de autenticación para ese caso.
Diagnóstico ya hecho: assets/app.config dentro del APK apunta a https://www.royalmidnight.com/api. Mobile POST/auth/login con X-RM-Client:driver-app. normalizeLoginCredentials cambia email, NO contraseña. Web usa mismo endpoint. Backend Invalid credentials ocurre antes de role/token. No volver a investigar esto sin nueva evidencia.
Advertencia Appetize: cua.typeText rellenó textarea puente pero NO transmitió texto al teléfono. pressKey sí transmitió teclas. La hipótesis de entrada incorrecta no fue confirmada como causa de rechazo real.

### Build23 — cambios actuales
ID f1ca474b-566d-4c6b-a94a-87de92198bee, versión2.0.0/versionCode23.
Página https://expo.dev/accounts/roalmidnight/projects/royal-midnight-driver/builds/f1ca474b-566d-4c6b-a94a-87de92198bee
Creado26sept desde staging, preview, EAS_NO_VCS=1, --non-interactive --no-wait. Subida1.9MB; keystore remoto existente.
Último estado ANTES del turno de handoff: IN_PROGRESS. Ver anexo final de este archivo para consulta27sept. NO crear otro build sin comprobar primero este.
No se ha instalado build23 ni visto sus pantallas. El directorio dist-android solo tenía builds19–22 al inicio del handoff.

## 5. Causa del fallo GENERAL de estilos y solución aplicada

package-lock de la app instalaba nativewind4.2.7 con css-interop0.2.7 anidado, mientras raíz fijaba react-native-css-interop0.2.6.
Metro style injection resolvía runtime/native/styles desde raíz; JSX a través de NativeWind resolvía otra copia. Los módulos mantienen reglas/estado locales. Identidad de resolvers falló reproduciblemente.

Cambios:
- package.json fija nativewind EXACTO4.2.6, compatible con css-interop0.2.6 existente.
- npm install --ignore-scripts --no-audit --no-fund en staging eliminó copia anidada y5 paquetes redundantes; lock resultante copiado al repo y revisado.
- pnpm-lock.yaml cambia SOLO specifier de nativewind del importer driver-app-v2 a4.2.6; ya resolvía4.2.6.
- test src/theme/nativewind-runtime.test.mjs verifica realpath idéntico para runtime de raíz y NativeWind.
- eas-build-post-install ejecuta ese test y evita builds futuros con instalación dividida.
- El test falló ANTES, pasó DESPUÉS. Esto verifica dependencia, no prueba visual Android.

## 6. Archivos cambiados y contenido

Además del login ya descrito:
- tailwind.config.js: background#060d1b, surface#0d1829, border#263b57, gold#d4af52, muted#9caabe, alineados con tema. Se conserva tipografía/fonts y colores status.
- src/components/ScreenContainer.tsx: flex1 y fondo explícitos nativos SafeAreaView; scroll y refresh existentes.
- Card.tsx: rounded-xl/borde/tarjeta.
- StatTile.tsx: tamaño compacto, cifras legibles autoajustables, label normal.
- NUEVO DriverUI.tsx: ScreenTitle/back, Segments accesibles, EmptyState con loading/retry, RouteStops con línea/puntos y direcciones.
- NUEVO src/theme/driverPresentation.ts: filterRides por estado+búsqueda+orden, notificationCategory.
- NUEVO driverPresentation.test.mjs: dos pruebas; hubo fallo de módulo inexistente antes de implementación.
- app/(app)/index.tsx: logo, campana funcional, saludo real, tarjeta disponibilidad, stats, estado activo, tarjetas con ruta/fecha/ganancia, error/loading/vacío y enlace My rides. Conserva lógica real de ubicación/status.
- trips/index.tsx: Upcoming/Completed/Cancelled, búsqueda, clear, refresh, estados de carga/error/vacío, tarjeta fecha/estado/ruta/ganancia del conductor, navegación a trip. No usar tarifa total como ganancia del driver.
- earnings/index.tsx: tabs período, resumen, estadísticas, loading/error, gráfico existente, empty y link Payout & Banking. No métricas falsas.
- notifications/index.tsx: filtros All/Bookings/System/Documents, icono/tipo/unread, fecha relativa, mark-read y destino booking/documents; error si marca leído falla.
- account/index.tsx: avatar/nombre/rating/membresía, vehículo navegable, menú agrupado, logout legible.
- account/_layout.tsx: navy, elimina cabecera Account duplicada en Profile.
- (app)/_layout.tsx: tab bar navy, tipografía, Trips pasa a Rides con icono auto.
- offer/[bookingId].tsx: título/back, scroll, ruta/fecha/earnings/necesidades/vehículo; pausa temporizador si carga/error/selector/aceptación. Aceptación sigue usando API real.
- trip/[bookingId].tsx: cabecera y pasajero; cancelled muestra detalle sin botón de completar. Acciones solo para estados conocidos. Conserva llamadas/navegación/ciclo de API.
- package.json: npm test incluye5 pruebas, eas-build-post-install, pin NativeWind.
- package-lock.json y pnpm-lock.yaml: sincronizados como arriba.

Todas estas modificaciones requieren revisión visual nativa. No presentarlas como reproducción pixel-perfect ni funcionalidad end-to-end aprobada todavía. Subpantallas Vehicle/Documents/Payout/Support conservan lógica/maquetación anterior y deben revisarse también; restaurar clases no sustituye esa revisión.

## 7. Pruebas ya realizadas; no repetir sin motivo

Staging:
- npm test:5 pass,0 fail. Son dos archivos previos (login/location),2 tests de presentación y1 de identidad runtime. NO son5 pruebas de UI Android.
- npm run typecheck:0.
- git diff --check en repo:0, warnings CRLF no fatales.
- SHA idénticos en47 archivos de app/src principal vs staging.
- npx expo export --platform android --output-dir dist-style-fixed --no-bytecode --source-maps --clear:0,2172 módulos.
- source map contiene exactamente1 ruta que endsWith('/runtime/native/styles.js'). Bundle contiene bg-background, text-gold, rounded-xl, Hello, y My Rides.

El primer contador usó includes y contó también stylesheet.js; filtro corregido dio1. No fue otro fallo del producto.
Export sin bytecode se hizo para auditoría, NO cambia el build release de EAS. El APK seguirá el build normal.
Warning MODULE_TYPELESS_PACKAGE_JSON no fatal; no introducir cambios de módulo para ocultarlo.

## 8. Herramientas y bloqueos actuales

Appetize cuenta del usuario: Free plan30/30, No minutes left CONFIRMADO26sept. El usuario eligió teléfono Android. NO volver a preguntarle cuál opción ni probar allí indefinidamente. No comprar un plan ni crear cuentas para eludir cuota.
Autorización previa: subir APK Royal Midnight Driver a su cuenta Appetize y gastar minutos gratuitos. Esto NO autoriza compras. Se resolvió permiso de archivos de extensión con Allow access to file URLs; no repetir investigación.
Última pestaña Chrome browser2/tab500658476 está en https://appetize.io/apps. Es información histórica: verificar tab antes de actuar. La pestaña IAB tiene URL firmada EXPIRADA del build22; no usarla como descarga actual ni evidencia23.
CUA: getTab con Chrome; usar documentación de herramienta. Native apps deshabilitadas. No cambiar a APIs UI no autorizadas. Capturas a disco posibles con tab.screenshot y fs desde CUA.
No había adb/SDK/emulador local en rutas habituales; EAS Simulator no disponible para cuenta en investigación anterior. No repetir búsquedas salvo cambio de entorno.

Red shell: npx EAS sin escalación dio EACCES en npm registry ANTES de crear build. require_escalated funcionó; no hubo rechazo de auto-review en ese reintento. Comandos npx pueden tardar sin salida; no iniciar duplicados por impaciencia. No imprimir JSON completo de build con URLs firmadas de logs; seleccionar campos seguros.

## 9. Secuencia exacta para continuar

1. Leer este documento y su anexo final. Inspeccionar git status/branch/HEAD preservando lo encontrado. Consultar uso.
2. Comprobar build23 actual. Si FINISHED, descargar artifacts.buildUrl/applicationArchiveUrl expuesto por EAS a dist-android/Royal-Midnight-Driver-v2.0.0-build23.apk. Guardar bytes y SHA256. Si error, leer logs de forma selectiva sin secretos y corregir causa; no asumir fallo por ausencia de archivo local.
3. Entregar enlace estable EAS y archivo local al usuario para instalar en SU TELÉFONO. Actualizar encima si firma compatible; no pedir desinstalar como primer paso porque borra sesión/datos.
4. Pedir capturas reales del build23 instalado: Home, Rides, Earnings, Alerts, Profile (sin credenciales ni datos financieros). Si existe acceso autorizado al teléfono, hacer pruebas directamente. No inventar acceso remoto disponible.
5. Comparar con PNGs de referencia. Confirmar estilos restaurados en todas las rutas, safe areas, contraste, fuentes, tarjetas, tab bar, teclado, scroll y tamaños. Corregir diferencias reales necesarias en repo; sincronizar staging; tests/typecheck/export/build nuevo SOLO si cambia código y requiere APK.
6. Probar búsqueda/filtros/refresh y navegación. Account->vehicle/documents/payout/support/notifications y volver. Estados de red vacíos/error. Datos reales, sin falsos controles.
7. Login/logout/persistencia sesión/Return/password toggle/teclado. Build22 estaba aprobado parcialmente; no arrastrar automáticamente resultado a23.
8. Offer/Active Trip requieren reserva de PRUEBA identificada: vehículo, aceptar, checklist/on-way/arrived/start/complete, errores/concurrencia; no operar viajes reales para ensayar. Las pruebas de status pueden activar ubicación: seguir alcance del driver y permisos del dispositivo.
9. Verificar pruebas restantes ubicación/permisos/notificaciones/FCM si se pretende entregar app completa. Registrar explícitamente no probado si no hay entorno; no afirmar que funcionan por tener código.
10. Guardar evidencia con número de build/dispositivo/fecha. Cuando esté verificado, revisar diff y cerrar cambios de forma trazable (commit/push según autorización vigente). No dar terminado antes de verificación real; deadline no es prueba.

## 10. Comandos útiles y contexto técnico

App API https://www.royalmidnight.com/api; preview channel. QA profile apunta a URL distinta: NO usar QA para esta entrega.
EAS account roalmidnight, project royal-midnight-driver, projectId caed6e0b-2b17-47d6-aaeb-1675e9cda7d4.
Expo57.0.24, RN0.86.3, React19.2.3, NativeWind4.2.6 y css-interop0.2.6. No volver a ^NativeWind sin verificar dependencia común.

PowerShell consulta segura:
```powershell
Set-Location 'C:\Users\encue\OneDrive\Escritorio\Hermes\.codex-driver-build-current'
$buildInfo = npx --yes eas-cli@latest build:view f1ca474b-566d-4c6b-a94a-87de92198bee --json 2>$null | ConvertFrom-Json
$buildInfo | Select-Object id,status,appVersion,appBuildVersion,artifacts | ConvertTo-Json -Depth 3
```

Pruebas desde staging:
```powershell
npm test
npm run typecheck
```
Solo si hay CAMBIOS NUEVOS que requieran build después de23:
```powershell
$env:EAS_NO_VCS='1'
npx --yes eas-cli@latest build --platform android --profile preview --non-interactive --no-wait
```
No convertir estos comandos en una instrucción de generar otro build al leer el expediente.

Skills usadas: expo-overview, eas-app-stores, eas-simulator (bloqueado), dogfood, react-native-testing, systematic-debugging, test-driven-development, verification-before-completion, computer-use; brainstorming para referencias existentes ya pedidas. No pedir aprobar otra vez el mismo diseño. Leer versiones disponibles si hace falta, no reinstalar skills por cambio de ruta/versionado.

## 11. Historial complementario

- royal-midnight-driver-session-handoff-2026-09-23.md: punto inicial; varias prioridades quedaron superadas.
- royal-midnight-build21-verification-2026-09-23.md: upload/autorización y primeras verificaciones.
- royal-midnight-driver-progress-2026-09-24.md: build21/22/login/runtime y diagnóstico credenciales.
- royal-midnight-driver-progress-2026-09-26.md: cambios de pantallas, test/build23 y QA.
Este expediente maestro es la entrada principal y contiene las conclusiones; recurrir al historial para detalle concreto, sin repetir investigaciones.

## 12. ANEXO FINAL — estado confirmado27sept; prevalece sobre estados anteriores

Build23 FINISHED confirmado directamente con EAS en este turno.
- Build ID: f1ca474b-566d-4c6b-a94a-87de92198bee
- Versión2.0.0 / build23
- URL estable APK: https://expo.dev/artifacts/eas/x4dDGqyjGhj_sOjjB5LxIT_fSrfZpaLvL6_W2MQTt4w.apk
- Local: C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-midnight-Replit\artifacts\driver-app-v2\dist-android\Royal-Midnight-Driver-v2.0.0-build23.apk
- Tamaño83467752 bytes
- SHA256: 9C4573DDA3A60BF9819DB4112E9E6846E30C90C13209892E65868672C0AC8A90
- Descarga completada, ZIP abierto y presencia de AndroidManifest.xml y assets/index.android.bundle comprobada.
- NO instalado ni probado en teléfono/emulador. EAS FINISHED y ZIP válido NO aprueban UI ni funcionalidades.

SIGUIENTE ACCIÓN EXACTA: entregar al usuario este APK23 para instalar/actualizar en el teléfono Android que YA confirmó tener; conseguir evidencia de sus pantallas y continuar la comparación visual/funcional. No volver a consultar estado ni descargar si el archivo y hash siguen disponibles. No construir24 sin cambios necesarios basados en hallazgos.

Este turno solo consolidó documentos, consultó EAS y descargó el APK. No modificó código de producto ni hizo commit/push. La lista de cambios de producto sigue siendo la descrita arriba.

## 13. Reanudación del 27 de septiembre — instalación pendiente

Se leyó de nuevo este expediente completo, incluido el anexo, antes de actuar. Se preservó el árbol local y se confirmó:
- Rama `fix/royal-midnight-reliability`, HEAD `aa9add8aca6e2e86671860a442b4d8cb636852ed`.
- Los cambios locales documentados continúan presentes; no se hizo reset, clean, reinstalación ni sincronización destructiva.
- El APK23 local sigue midiendo83467752 bytes y su SHA256 fresco sigue siendo `9C4573DDA3A60BF9819DB4112E9E6846E30C90C13209892E65868672C0AC8A90`.
- Uso al reanudar:46% restante en la ventana de5 horas y92% restante en la semanal. No se consumieron créditos de reinicio.
- Se creó `docs/handoff/build23-runtime-evidence/report.md` con la matriz de verificación; aún no contiene aprobación visual ni funcional.

SIGUIENTE ACCIÓN EXACTA: el usuario debe abrir en su teléfono Android la URL estable del APK23, instalarla/actualizarla sin desinstalar primero y confirmar que aparece versionCode23. Después se recopilarán Home, Rides, Earnings, Alerts y Profile, y se probarán los flujos enumerados en la matriz. No crear build24 antes de un hallazgo comprobado que requiera cambiar código.

### Pausa por dependencia del teléfono

Tras tres turnos consecutivos no apareció ninguna captura ni archivo nuevo en `docs/handoff/build23-runtime-evidence`, y esta sesión no tiene un dispositivo Android conectado o autorizado que pueda controlar. No existe una acción local que pruebe la UI o los flujos reales del APK23 sin sustituir indebidamente la evidencia del teléfono.

Estado al pausar:
- APK23 local intacto y previamente confirmado por tamaño/hash.
- Código de producto sin cambios adicionales; build24 no creado.
- Registro `docs/handoff/build23-runtime-evidence/report.md` preparado y aún pendiente de evidencia.
- Uso disponible:40% en la ventana de5 horas y91% en la semanal; no se consumieron créditos de reinicio.

Para reanudar: instalar/actualizar el APK23 desde la URL estable, responder `instalado` y adjuntar Home, Rides, Earnings, Alerts y Profile sin credenciales ni datos financieros. Esta pausa no constituye aprobación ni terminación del producto.

### Reanudación — fallo de instalación informado

El usuario reanudó el objetivo porque el teléfono no le permite instalar el APK descargado desde el enlace estable. Se comprobó el enlace directamente siguiendo redirecciones: terminó en HTTP200 con `Content-Length:83467752`, tipo binario y nombre de archivo APK; el tamaño coincide exactamente con el APK local verificado. Esto descarta por ahora un enlace caído, pero no identifica aún la causa en Android. Se solicitó el texto exacto o una captura del mensaje del instalador. No desinstalar, borrar datos, regenerar APK ni cambiar firma hasta conocer ese mensaje.

El usuario aportó dos capturas, conservadas en `docs/handoff/build23-runtime-evidence/screenshots/01-chrome-download-failed.jpg` y `02-chrome-download-complete-not-finalized.jpg`. Chrome llega a83.47MB/83.47MB, no finaliza y después marca `0.00KB/83.47MB · failed`; no aparece el instalador. Diagnóstico actual: fallo en la finalización/registro de la descarga del navegador, anterior a cualquier validación del APK por Android. Próxima comprobación mínima: abrir la app Archivos del teléfono y revisar Descargas para saber si existe el APK completo o solo un temporal. No diagnosticar firma, permisos de instalación ni paquete hasta esa comprobación.

La primera captura de Archivos se guardó como `03-files-search-filtered-no-results.jpg`. Muestra una búsqueda por nombre con el filtro `Images +4`, así que `There's nothing here` no demuestra que el APK falte. Próximo paso exacto: cerrar la búsqueda, volver a la navegación principal de Archivos y entrar en Descargas sin filtros.

El usuario confirmó después que el APK no se guarda en Descargas. Se preparó una ruta alternativa sin reconstruir: `C:\Users\encue\OneDrive\Escritorio\Hermes\Royal-Midnight-Driver-build23.apk`, copia verificada de83.467.752 bytes y SHA256 `9C4573DDA3A60BF9819DB4112E9E6846E30C90C13209892E65868672C0AC8A90`. OneDrive está ejecutándose en el PC; falta confirmar que la copia sincronizada aparece en la app OneDrive del teléfono. Si no aparece, usar transferencia USB desde esa ruta local. No volver a insistir con el enlace de Chrome que ya falló.

El usuario mostró que OneDrive está congelado por falta de espacio; captura conservada como `04-onedrive-frozen.jpg`. La suposición de que la copia local se sincronizaría fue incorrecta. Por petición explícita del usuario se usó la conexión de Google Drive: la subida terminó y la lectura posterior de `Mi unidad` confirmó `Royal-Midnight-Driver-build23.apk`, ID `1-1GtEMUcG6YzJu5tdY_tBOXlnOdZGujc`, MIME APK, tamaño83467752 bytes, descarga habilitada y archivo privado. URL verificada: `https://drive.google.com/file/d/1-1GtEMUcG6YzJu5tdY_tBOXlnOdZGujc/view?usp=drivesdk`. Próxima acción: abrir este archivo con la misma cuenta Google en el teléfono y registrar el resultado del instalador.

### Build23 instalado — primeros hallazgos reales

El usuario confirmó instalación correcta y valoración visual positiva. Se conservaron `05-build23-home-duplicate-ride.jpg` y `06-build23-profile.jpg`. No se tocó código por instrucción explícita y por uso bajo.

Hallazgos registrados en `docs/handoff/build23-runtime-evidence/report.md`:
- Alta: una sola reserva de prueba aparece duplicada y el contador marca2; la web muestra una. Causa no diagnosticada todavía.
- Alta: no llegó notificación de la nueva reserva; faltan condiciones controladas de permiso/estado/FCM/Alerts antes de atribuir causa.
- Alta: `WELCOME20`, limitado a una vez por usuario, fue aceptado nuevamente para un usuario antiguo que ya lo había redimido.
- Baja: avatar vacío sin fallback en Profile.
- Baja: categoría de vehículo `business` se presenta en minúsculas.

Regla económica solicitada: el cupón descuenta el subtotal antes de impuestos y otros cargos; la ganancia del conductor se calcula sobre la base anterior al cupón y no se reduce; la compañía absorbe el descuento en su parte. Debe verificarse en cotización, cobro, reserva, Driver, recibos y liquidación, no solo visualmente.

Se añadió una matriz de revisión completa de13 áreas. Estado de uso al decidir no implementar:14% restante en ventana de5 horas y87% en semanal; no se usaron créditos. Próxima sesión: releer este bloque y el reporte, revisar evidencia actual y ejecutar la revisión controlada antes de corregir. No implementar cambios a partir de hipótesis ni crear build24 hasta agrupar fallos reproducidos.

Nueva evidencia: `07-build23-offer-detail-load-error.jpg`. Al pulsar una oferta disponible desde Home, el detalle no carga y muestra `Could not load this offer. Check your connection.` con `RETRY`; el usuario espera la misma información disponible en web. Se registró como ISSUE-006 de severidad alta. No se diagnosticó la causa ni se tocó código. Hipótesis pendientes de comprobar: identificador/ruta, autorización, respuesta/esquema del endpoint y posible relación con la reserva duplicada.

Pausa por uso: al guardar esta evidencia quedaba 4% en la ventana de5 horas. No se consumieron créditos de reinicio. Reanudar con el reporte del build23; no repetir la instalación ni las investigaciones ya cerradas.

## 14. Reanudación del 28 de septiembre — remediación implementada, publicación pendiente

El usuario confirmó nuevamente 100% de uso y autorizó continuar con todos los fallos informados y el full scan. Después añadió el requisito visual de reemplazar la apertura diminuta por una portada profesional y aclaró expresamente que Royal Midnight **no ofrece Mercedes Sprinter**.

Cambios implementados sin reset/clean y conservando todo el árbol local:

- Pool móvil: una sola consulta canónica, deduplicación por ID y Offer usa el mismo pool autorizado; distingue oferta tomada/expirada de un fallo de conexión.
- Push: tokens modernos `ExpoPushToken[...]` ya no se descartan; registro al montar y volver a foreground; taps en app activa o arranque frío abren Offer/Trip según el tipo.
- Promoción: límite histórico por cliente cuenta también reservas canceladas y migración idempotente fija `WELCOME20` a un uso por cliente.
- Precio: descuento sobre subtotal elegible antes de impuesto/cargo de tarjeta; se preserva la tarifa aeroportuaria no descontable; comisión del conductor sigue sobre la base previa al cupón.
- Profile/Trip: iniciales de avatar, clase legible y total completado igual a ganancia del conductor más propina.
- Sesión: una caída de red/500 al iniciar conserva la sesión guardada; solo 401/403 la descartan.
- Support: mensajes del conductor se registran con rol `driver`.
- Documents/Vehicle: eliminado el scroll vertical anidado.
- Apertura: nuevo fondo `assets/launch-background-v2.png`, logo oficial transparente y presentación de 1,8 s con sedán, SUV grande y crossover; sin Sprinter. La pantalla nativa previa usa logo oficial más grande.
- Expo SDK 57: ocho dependencias alineadas al parche recomendado por Expo Doctor; NativeWind permanece fijado exactamente en 4.2.6 para conservar el arreglo de estilos.

Verificación ejecutada:

- App Driver: 13/13 tests y typecheck PASS.
- API: 35/35 tests enfocados PASS.
- Expo Doctor: 21/21 PASS.
- `npm audit --omit=dev --audit-level=high`: exit 0, sin high/critical; 14 moderadas transitivas no se forzaron porque npm propone downgrades/rupturas incompatibles.
- Render móvil de portada verificado a 390×844; evidencia `docs/handoff/driver-reliability-prebuild-evidence/launch-screen-phone-preview.png`.
- Export Android/Hermes PASS: 2.178 módulos y nuevos assets incluidos.
- Repo→staging: 64 archivos, cero diferencias SHA-256.
- `git diff --check` PASS.
- Uso consultado al inicio de esta reanudación: 86% restante en 5 horas y 67% semanal; no se usaron créditos de reset.

Estado de publicación:

- Build24 **todavía no existe**.
- Los cambios de servidor/web/migración todavía **no están en producción**.
- El intento de desplegar producción fue rechazado por la protección de aprobación: requiere autorización explícita porque publica múltiples cambios y ejecuta una migración de base de datos.
- No rodear este bloqueo ni construir un APK apuntando a un servidor sin las correcciones.

Siguiente acción exacta: obtener autorización explícita del usuario para desplegar a producción servidor + web + migración idempotente de `WELCOME20`. Después verificar health/API/web, crear un solo build24 preview, descargarlo, verificar hash, subirlo a Google Drive y probarlo en el teléfono. No declarar terminado hasta completar la matriz real del APK24.

Pausa obligatoria por uso: la comprobación final mostró 99% consumido en la ventana de 5 horas (1% restante) y 47% consumido en la semanal (53% restante). Todo el estado y la evidencia quedaron guardados. No se consumió ninguno de los dos créditos de reinicio disponibles. Al reanudar, no repetir pruebas ni investigación; solicitar/usar primero la autorización explícita de despliegue productivo descrita arriba.

## 15. Autorización explícita y despliegue productivo — 28 de septiembre

El usuario respondió explícitamente `si` a la solicitud de autorización para publicar conjuntamente servidor, web y la migración idempotente de `WELCOME20`, y continuar después con un único build24.

Resultado del despliegue:

- Vercel deployment ID: `dpl_HrLejxbZ6kZgX65GMHHmyQ7U2U4Q`.
- Deployment listo: `https://royal-midnight-otamj9j3t-dbatistarosas-projects.vercel.app`.
- Alias productivo confirmado: `https://www.royalmidnight.com`.
- La migración `20260927123000_welcome20_once_per_customer.sql` quedó aplicada durante el despliegue.
- `https://www.royalmidnight.com/api/healthz` respondió `status: ok` y revisión `aa9add8aca6e2e86671860a442b4d8cb636852ed`.
- La página `/book` respondió correctamente.
- Una validación productiva no autenticada de `WELCOME20` devolvió la negativa esperada: exige iniciar sesión porque el código está limitado por cliente.
- Revisión de errores del deployment durante la hora posterior: Vercel no encontró logs de nivel `error`.

La primera llamada de comprobación del cupón desde la CLI llevaba JSON mal formado por el shell; se repitió inmediatamente con un cuerpo válido y produjo el resultado esperado. No fue un fallo de producción.

Estado actual: producción publicada y comprobada, pero build24 aún no creado en el momento de este registro. Siguiente acción exacta: crear una sola compilación Android preview desde el staging ya verificado, esperar su finalización, descargarla, comprobar tamaño/SHA-256/contenido, subirla a Google Drive y obtener evidencia real del teléfono. No declarar terminado por el despliegue ni por EAS.

Uso al reanudar esta fase: 81% restante en la ventana de 5 horas y 50% restante en la semanal. Los dos créditos de reinicio siguen intactos.

### Build 24 iniciado

Antes de compilar se consultó EAS: el build más reciente seguía siendo el 23 (`f1ca474b-566d-4c6b-a94a-87de92198bee`), por lo que no existía un build24 duplicado. Se lanzó exactamente una compilación Android con perfil `preview` desde `C:\Users\encue\OneDrive\Escritorio\Hermes\.codex-driver-build-current`:

- EAS build ID: `da62c741-4d17-497d-b498-fe8c8eebe734`.
- EAS confirmó incremento remoto de `versionCode` 23 a 24.
- Proyecto comprimido y subido correctamente; fingerprint calculado.
- Estado al escribir: build remoto en curso. No reenviar otro build.

Siguiente acción exacta: esperar este ID, descargar su APK cuando quede `FINISHED`, verificarlo y usar Google Drive para la entrega al teléfono.

EAS mantuvo el build en `IN_QUEUE` durante más de 18 minutos, sin mensaje de error y con todos los campos correctos (`ANDROID`, `preview`, `versionCode 24`, prioridad normal). El estado oficial de Expo reportó EAS Build operativo. Para evitar consultas manuales repetitivas y consumo innecesario se creó el heartbeat silencioso `Finalizar build 24 Driver` (`automationId: finalizar-build-24-driver`) cada diez minutos. Está limitado a este ID: no crea otro build; permanece silencioso mientras no cambie; si termina, descarga/verifica/sube a Google Drive y actualiza evidencia; si falla, documenta/notifica; y pausa si queda menos de 5% sin usar créditos.

Uso al delegar la espera al heartbeat: 51% restante en la ventana de 5 horas y 46% restante en la semanal. Los dos créditos de reinicio continúan sin usarse.

### Build 24 terminado, verificado y entregado por Google Drive

El heartbeat siguió exclusivamente el build `da62c741-4d17-497d-b498-fe8c8eebe734`; EAS lo marcó `FINISHED` el 28 de septiembre a las 21:09:46Z con `versionCode 24`. No se lanzó ninguna compilación adicional.

APK descargado y verificado:

- Ruta: `artifacts/driver-app-v2/dist-android/Royal-Midnight-Driver-v2.0.0-build24.apk`.
- Tamaño: 88.091.860 bytes.
- SHA-256: `AD5CB396B8341664A8F1AD2A59106C1A4CC14A4714A4B0C4CEAA25B283880804`.
- Archivo ZIP/APK abierto correctamente; 1.390 entradas.
- `AndroidManifest.xml`: presente.
- `assets/index.android.bundle`: presente.

Entrega verificada en Google Drive:

- Nombre: `Royal-Midnight-Driver-build24.apk`.
- ID: `1QzGLDDBfaNggUunLs6Y68SsWTAMCoKql`.
- URL: `https://drive.google.com/file/d/1QzGLDDBfaNggUunLs6Y68SsWTAMCoKql/view?usp=drivesdk`.
- MIME: `application/vnd.android.package-archive`.
- Tamaño leído de Drive: 88.091.860 bytes, igual al archivo local.
- Descarga habilitada; archivo privado, no compartido públicamente.

Esto confirma compilación, integridad estructural y entrega, **no** aprobación visual ni funcional. Próxima acción exacta: instalar/actualizar el build24 desde Google Drive en el teléfono y ejecutar la matriz real: portada nueva sin Sprinter, viaje único/contador, detalle de oferta, push en background/cierre, Profile, `WELCOME20` una sola vez con usuario histórico, economía del cupón y navegación/scroll/flujos de viaje.

## 16. Regresión web `/book` detectada después del build 24 — causa aislada y corrección local pendiente de publicar

Después de instalar/actualizar el build24, el usuario confirmó que la nueva portada sí aparece, pero informó que `https://www.royalmidnight.com/book` muestra la pantalla global `Something Went Wrong`. Este hallazgo corresponde a la web productiva; no demuestra un fallo del APK24.

Diagnóstico con evidencia de navegador móvil:

- La respuesta HTTP de `/book` es `200` y el HTML inicial es válido; los logs de servidor del deployment no muestran una excepción correspondiente.
- El navegador registra exactamente `Error: No QueryClient set, use QueryClientProvider to set one` en el bundle productivo.
- `App.tsx` sí contiene `QueryClientProvider`; por tanto, no faltaba el proveedor en el árbol de componentes.
- El workspace resolvía dos instancias de `@tanstack/react-query@5.90.21`: la web enlazada a React 19.1.0 y `@workspace/api-client-react` enlazada a React 19.2.3 por el workspace del Driver v2. El proveedor y los hooks terminaron usando contextos distintos.
- `vite.config.ts` ya deduplicaba `react` y `react-dom`, pero no `@tanstack/react-query`.

Corrección mínima aplicada localmente:

- `artifacts/royal-midnight/vite.config.ts`: se añadió `@tanstack/react-query` a `resolve.dedupe`.
- `artifacts/royal-midnight/src/viteDedupe.contract.mjs`: prueba contractual nueva para impedir que esta dependencia vuelva a separarse entre workspaces.

Verificación:

- La prueba contractual falló antes de la corrección y pasa después; ejecución fresca: 1/1 PASS.
- En un checkout web limpio temporal, la suite Vitest pasó 3/3 y el typecheck pasó después de reconstruir las declaraciones compartidas.
- Con servidor local y respuestas API estáticas seguras, `/book` renderizó en viewport móvil con `Reserve Your Ride`, campos de ruta/pasajero y `View Pricing`; desapareció el error `No QueryClient set`.
- Revisión de rutas públicas `/`, `/fleet`, `/pricing`, `/faq`, `/contact`, `/book`, `/privacy`, `/terms` y `/driver-agreement`: ninguna mostró el error boundary. Los únicos errores de consola fueron `401` esperados de `/api/auth/me` para un visitante sin sesión.
- Las rutas de acceso correctas son `/auth/login` y `/auth/signup`; los intentos iniciales `/login` y `/signup` mostraron correctamente el 404 y no constituyen una regresión.
- Un reintento posterior de Vitest/typecheck en el mismo temporal no llegó a ejecutar por un enlace interno faltante de `esbuild` tras la reorganización automática de `node_modules`; no modificó el repositorio ni sustituye las ejecuciones limpias exitosas anteriores.
- Dos builds locales transformaron 4.593 módulos y se detuvieron al final porque Windows mantuvo bloqueado un temporal `esbuild-*`; se clasifica como limitación ambiental local, no como aprobación de build.

Estado de publicación:

- La corrección **no se ha subido ni desplegado** porque la protección del entorno exige autorización explícita antes de enviar código del proyecto a Vercel.
- Producción continúa afectada hasta publicar y verificar el arreglo en el dominio real.
- Este cambio es solo de empaquetado web: no exige crear build25 del Driver.

SIGUIENTE ACCIÓN EXACTA: obtener autorización explícita para subir esta corrección a Vercel y desplegarla en producción; después verificar `/book` en una sesión móvil limpia, revisar consola/logs y volver a recorrer las rutas públicas. No declarar restaurada la web antes de esa comprobación productiva. La matriz real del APK24 sigue pendiente por separado.

## 17. `/book` restaurado y nuevo bloqueo de login móvil — 29 de septiembre

La corrección de React Query descrita en la sección 16 fue autorizada y publicada:

- Deployment Vercel: `dpl_9Tdi36VDnPETFr5F1o4q8JpNWoed` (`READY`).
- URL del deployment: `https://royal-midnight-7fpgasogn-dbatistarosas-projects.vercel.app`.
- Alias productivo confirmado: `https://www.royalmidnight.com`.
- Build remoto PASS: 4.593 módulos cliente, SSR y prerender de las 15 rutas públicas.
- Verificación real móvil de `/book`: `Reserve Your Ride`, formulario completo y cero errores de consola. El error `No QueryClient set` desapareció.
- Recorrido productivo de 11 rutas públicas: ninguna mostró `Something Went Wrong`.

El full scan posterior detectó advertencias de hidratación React #418 en FAQ, Login y Signup. Causas confirmadas:

- Vercel entrega el HTML prerenderizado de `/` como fallback inicial para rutas SPA de autenticación; `main.tsx` intentaba hidratarlo solo porque `#root` tenía hijos.
- La primera hipótesis para FAQ fueron los IDs dinámicos de Radix, por lo que se sustituyó el acordeón por `<details>/<summary>`. La comprobación productiva posterior demostró que esa no era la causa completa: el mismo #418 aparecía en todas las páginas con JSON-LD porque el prerenderizador extraía esos scripts del árbol antes de la hidratación.

Correcciones locales preparadas, aún no publicadas: marcador `data-prerendered-path`, hidratación solo cuando coincide con `window.location.pathname`, limpieza del fallback para rutas SPA y FAQ con `<details>/<summary>` nativos accesibles. Contrato de hidratación PASS.

### ISSUE-007: build24 no puede iniciar sesión — `Untrusted request origin`

Evidencia conservada en `docs/handoff/build23-runtime-evidence/screenshots/08-build24-login-untrusted-origin.jpg`. El portal web acepta la misma cuenta, pero el Driver build24 recibe `Untrusted request origin`.

Causa raíz confirmada:

- El login nativo ya envía `X-RM-Client: driver-app`.
- El servidor emite también una cookie HttpOnly al autenticar; Android puede conservarla aunque la app use el token bearer.
- En un login posterior, la presencia de esa cookie activaba la protección CSRF web. El origen nativo (`http://localhost`, `null` o ausente según runtime) no pertenece a los orígenes web permitidos, así que la solicitud se rechazaba antes de validar credenciales.

Corrección local:

- `app.ts` reconoce como cliente nativo únicamente el valor exacto ya definido por `isNativeClient`.
- `csrf.ts` exime ese cliente identificado aunque Android adjunte una cookie antigua.
- La protección web permanece: un origen externo con cookie sigue rechazado, y el sitio oficial sigue permitido. El encabezado personalizado provoca preflight CORS en navegadores, por lo que una web externa no puede aprovechar la excepción.

Verificación local:

- Reproducción antes del cambio: cliente nativo + cookie antigua devolvía `false`.
- Casos enfocados después del cambio: 3/3 PASS.
- Suites `csrf.test.ts` + `authResponse.test.ts`: 6/6 PASS.
- Contratos web de React Query e hidratación: 2/2 PASS.
- `git diff --check`: PASS.
- El typecheck no pudo reiniciarse en el árbol principal porque OneDrive dejó incompletos enlaces de `node_modules`; no apareció un error de tipos del cambio. La publicación remota debe conservarse como verificación de compilación antes de declarar la reparación terminada.

Este arreglo es de servidor. El build24 ya envía el encabezado correcto y **no requiere build25**.

SIGUIENTE ACCIÓN EXACTA: obtener autorización explícita para publicar juntas la corrección del login móvil y las correcciones secundarias de hidratación. Después verificar build remoto, health, `/book`, FAQ/Login/Signup sin error #418 y pedir al usuario reintentar el login en el mismo build24. No afirmar que el login funciona hasta esa prueba real en el teléfono.

## 18. Login nativo publicado y cierre de las advertencias de hidratación — 29 de septiembre

La corrección de `Untrusted request origin` y el marcador de rutas prerenderizadas fueron publicados primero en el deployment `dpl_4bYf1EnWZys4UvJMGYdBY5c11Cd8`. La comprobación productiva confirmó:

- `/api/healthz`: `status: ok`, revisión `aa9add8aca6e2e86671860a442b4d8cb636852ed`.
- Solicitud equivalente al Driver con `X-RM-Client: driver-app`, origen nativo y cookie antigua: HTTP 400 de validación de campos, lo que prueba que atravesó CSRF y llegó al login.
- Origen web externo con cookie y sin encabezado nativo: HTTP 403, por lo que la defensa web permanece activa.
- `/book`, `/auth/login` y `/auth/signup`: contenido correcto y cero errores de consola.

La primera publicación todavía dejó React #418 en FAQ. Se aisló la causa mediante comparación: `/faq` y `/services/airport-transfers` fallaban; ambas contienen JSON-LD, mientras Login/Signup ya estaban limpias. `PageSeo` producía el script dentro de Helmet y el prerenderizador lo sacaba del árbol SSR para colocarlo en `<head>`; React 19 esperaba encontrarlo en el árbol durante la hidratación.

Corrección final:

- Los metadatos Helmet (`title`, `meta`, `link`) continúan elevándose a `<head>`.
- El JSON-LD queda dentro del árbol renderizado, posición válida para datos estructurados, de modo que SSR y cliente hidratan exactamente el mismo contenido.
- El contrato de hidratación fue ampliado; se observó rojo antes del cambio y 1/1 PASS después.
- La compilación local completa no pudo arrancar por el enlace incompleto de `esbuild` ya atribuido al estado de `node_modules`/OneDrive. La compilación remota limpia sí terminó: 4.590 módulos cliente, 325 SSR y 15 rutas prerenderizadas.

Publicación final:

- Deployment: `dpl_At9iQXjqEkyySQK4aEVwHS6ZCVvY` (`READY`).
- URL: `https://royal-midnight-mjnxdk3q3-dbatistarosas-projects.vercel.app`.
- Alias: `https://www.royalmidnight.com`.
- Verificación en navegadores nuevos: FAQ (10 preguntas), Airport Transfers, Book, Login y Signup renderizan sin error boundary y con **cero errores de consola**. FAQ y Airport Transfers conservan sus scripts JSON-LD.
- Sondas posteriores al despliegue: cliente nativo con cookie HTTP 400; origen externo HTTP 403; health `ok`.

Estado real: el servidor ya contiene el arreglo de login y **no hace falta build25**. Aún no puede declararse validado el acceso del Driver hasta que el usuario vuelva a iniciar sesión en el teléfono con el mismo build24. La revisión funcional del APK24 (viaje único, detalle, push, cupón y economía) continúa pendiente de pruebas reales.

SIGUIENTE ACCIÓN EXACTA: el usuario debe abrir el build24 ya instalado e intentar iniciar sesión otra vez. Si entra, probar inmediatamente Home (contador/unicidad), abrir la oferta, y después crear una reserva de prueba para push y cupón. Si aparece otro mensaje, conservar una captura sin credenciales y registrar hora aproximada.

## 19. Build 24 entra al Driver; auditoría de paridad solicitada — 29 de septiembre

El usuario confirmó en teléfono Android real que el build24 ya inicia sesión y permitió recorrer Home, ofertas, viaje activo, viaje completado y Profile. Esto valida el arreglo de login de la sección 18, pero no valida todavía el producto completo.

Nueva evidencia preservada en `docs/handoff/build24-runtime-evidence/screenshots/`:

- `09-build24-active-trip-missing-details-action-error.jpg`.
- `10-build24-completed-trip-back-home.jpg`.
- `11-build24-profile-photo-black.jpg`.
- `12-build24-offer-countdown-23s.jpg`.
- `13-build24-hourly-offer-countdown-3s-missing-charter.jpg`.

Hallazgos del teléfono y del full scan comparativo:

- La oferta móvil contiene un temporizador fijo de 25 segundos no solicitado; al vencer ejecuta navegación atrás. Debe eliminarse.
- Las reservas por hora aparecen como `Executive Ride` y omiten horas, millas, términos, itinerario, extras y mapa.
- El viaje aceptado omite fecha/hora, mapa, distancia/duración, pasajeros/equipaje, vehículo, desglose, charter e itinerario.
- La API del detalle asignado no entrega actualmente las mismas preferencias e itinerario que la API de lista; es una diferencia confirmada de contrato.
- El móvil combina checklist y `On My Way`, no muestra los cinco controles y no conoce la ventana configurable del servidor; el error observado queda reducido a un mensaje genérico.
- El detalle completado fuerza `Back to Home` en lugar de volver al origen.
- La foto intenta renderizar directamente una ruta privada de almacenamiento y no tiene fallback, lo que explica el círculo negro.
- Faltan además paridad de estados del conductor, estadísticas/reseñas, varias funciones de ganancias y el Tax ID/SSN seguro de Payout.
- No se hallaron destinos estáticos inexistentes, aunque quedan pruebas runtime obligatorias de teléfono/mapas, permisos, documentos, offline y notificaciones.

Documentos creados, sin cambios de producto:

- Auditoría: `docs/handoff/driver-build24-parity-audit-2026-09-29.md`.
- Diseño: `docs/superpowers/specs/2026-09-29-driver-web-native-parity-design.md`.
- Plan: `docs/superpowers/plans/2026-09-29-driver-web-native-parity.md`.

Decisión arquitectónica propuesta: conservar la web sin modificaciones; normalizar en servidor una vista canónica y autorizada de reserva para el conductor; entregar configuración de ventanas y mapas/fotos protegidos; y reutilizar en móvil un manifiesto completo más una máquina de estados probada. La privacidad preaceptación permanece intacta.

Estado exacto: no se modificó código de producto durante esta auditoría. Se preservó el worktree sucio sobre `fix/royal-midnight-reliability` en `aa9add8aca6e2e86671860a442b4d8cb636852ed`. La implementación queda detenida esperando la luz verde explícita del usuario.

SIGUIENTE ACCIÓN EXACTA: después de la autorización, ejecutar el plan por fases comenzando por los contratos y pruebas del backend, luego manifiesto/estado/navegación móvil, paridad restante, verificación, un solo build candidato y matriz real de Android. No cambiar la web y no declarar terminado por compilación o EAS.
