# Royal Midnight Driver — estilos y pantallas, 26 septiembre 2026

## Estado y criterio de entrega

Repositorio principal Royal-midnight-Replit, rama fix/royal-midnight-reliability, HEAD aa9add8. Cambios existentes preservados. No commit/push todavía. Usuario confirmó login válido en build22 y aportó cinco capturas de las pantallas internas sin estilos. No quedó demostrada la causa del rechazo de credenciales anterior; no se cambió autenticación por ese reporte.

Objetivo: reproducir las referencias de `../driver-app-screens/00-all-screens.png` y pantallas 01 a 07 con datos y acciones reales. Navy, dorado, tarjetas oscuras y contraste legible. No declarar listo sin runtime.

## Causa encontrada y corrección

package-lock.json instalaba NativeWind4.2.7 con react-native-css-interop0.2.7 anidado, mientras la app fijaba css-interop0.2.6 en raíz. La inyección de estilos y lookup desde JSX resolvían módulos distintos; las reglas se almacenan en estado local del módulo. La prueba de identidad de ambos resolvers falló antes del cambio.

Se fijó nativewind a4.2.6 (usa css-interop0.2.6), se regeneró package-lock y se actualizó únicamente specifier del importer driver-app-v2 en pnpm-lock. No se tocaron dependencias del resto del monorepo. Un único motor ahora, prueba aprobada. Se añadió eas-build-post-install para impedir builds con motores duplicados.

## Cambios implementados, pendientes de comprobar visualmente en Android

- Tema Tailwind alineado con colors.ts; ScreenContainer usa fondo y flex nativos explícitos.
- Card redondeada, StatTile compacta y legible; nuevos ScreenTitle, Segments, EmptyState, RouteStops.
- Home: logo, notificaciones, saludo real, disponibilidad, estadísticas, tarjetas de trayecto y estados de carga/error/vacío.
- Rides: Upcoming/Completed/Cancelled, búsqueda pickup/destination, tarjetas con fecha/estado/ruta/ganancia real, abrir detalles, refrescar.
- Earnings: períodos, resumen y estadísticas, error/carga, gráfico existente y acceso a datos de payout. Sin números o fechas de pago inventados.
- Alerts: All/Bookings/System/Documents, iconos/indicador no leído, destinos de booking/documentos, error/carga/vacío.
- Profile: avatar/nombre/rating/datos reales, tarjeta vehículo, menú agrupado y logout legible. Cabecera Account duplicada eliminada.
- Offer: título, ruta, fecha, pasajero/equipaje/vehículo y botones existentes; scroll para evitar truncado. Temporizador pausado durante carga/error/selector de vehículo.
- Trip: título y pasajero. Viajes cancelados muestran detalle sin acción de completar. Acciones solo para estados de viaje conocidos.

## Verificación ejecutada

- npm test: 5 aprobadas, 0 fallidas (validaciones login, location lifecycle, filtros de viajes, categorías de notificaciones y identidad de runtime estilos).
- npm run typecheck: salida0.
- git diff --check: salida0, avisos CRLF no fatales.
- 47 archivos app/src principal vs staging verificados idénticos por hash.
- `npx expo export --platform android --output-dir dist-style-fixed --no-bytecode --source-maps --clear`: salida0, Android2172 módulos.
- Source map contiene exactamente UN `/runtime/native/styles.js`; bundle contiene bg-background, text-gold, rounded-xl y marcadores de pantallas nuevas.
- El primer contador también incluyó stylesheet.js por un filtro demasiado amplio; se corrigió a endsWith('/runtime/native/styles.js') y pasó. No confundir con un segundo runtime.

Staging de pruebas/build: ../.codex-driver-build-current. Fuente de verdad siempre main repo. Export es comprobación de bundle, NO evidencia runtime.

## Runtime y próximo paso

Appetize Chrome tab500658476 browser2 confirma Free plan30/30, No minutes left. Usuario eligió instalar siguiente APK en su teléfono Android. No comprar minutos ni crear cuentas alternativas.

Se inició comando EAS desde staging con EAS_NO_VCS=1, perfil preview, --non-interactive --no-wait. En el momento de escribir no había respuesta/ID; proceso exec1492 seguía esperando. Comprobar ese proceso y listado EAS antes de iniciar otro para evitar duplicados.

Al terminar: descargar APK, registrar build ID, URL, ruta y SHA256. Entregar al usuario para instalar EN SU TELÉFONO y solicitar capturas de Home/Rides/Earnings/Alerts/Profile con credenciales siempre ocultas; comparar con referencias. Pendiente prueba visual nativa de todos estos cambios y pruebas funcionales reales de navegación, filtros, disponibilidad y viajes (estas últimas necesitan datos de prueba y no deben afectar viajes reales).

Uso consultado26sept: 98% disponible cinco horas y69% semanal. Regla del usuario: guardar y pausar por debajo del5%; no gastar créditos de reset.

## Build 23 iniciado

El primer intento falló en npm por EACCES al acceder al registro, antes de iniciar EAS. Se repitió con acceso de red autorizado y terminó correctamente la subida.

EAS asignó versionCode23, ID f1ca474b-566d-4c6b-a94a-87de92198bee. URL https://expo.dev/accounts/roalmidnight/projects/royal-midnight-driver/builds/f1ca474b-566d-4c6b-a94a-87de92198bee . Subida1.9MB, firma remota existente. No iniciar build duplicado. Falta comprobar FINISHED, descargar, hash y runtime.

Usuario confirmó que tiene teléfono Android para instalar el APK. La prueba de runtime debe continuar allí debido al saldo Appetize agotado.

## Guía de prueba del build 23 en teléfono real (pendiente)

1. Instalar como actualización sobre el APK anterior para conservar la sesión; comprobar versión/build23 en el instalador/ajustes.
2. Home: fondo navy, logo, saludo del usuario, tarjeta Online/Offline, estadísticas y tarjetas/vacío. Refrescar sin tocar viajes reales.
3. Rides: alternar Upcoming/Completed/Cancelled; verificar que cancelled no cae en upcoming; buscar parte de un origen/destino y limpiar búsqueda. Abrir un viaje cancelado solo en modo lectura: no debe ofrecer completar viaje.
4. Earnings: Today/This Week/This Month, cifras de API, estado sin ganancias o gráfico; abrir Payout & Banking y volver sin editar datos bancarios.
5. Alerts: alternar categorías y comprobar el estado vacío con fondo/tipografía legible. Si hay una notificación de prueba, verificar destino correcto.
6. Profile: avatar/nombre/rating reales; filas Vehicle/Documents/Payout/Support/Notifications navegan correctamente; volver con botón Android. No capturar datos financieros o documentos privados.
7. Login: cuando sea oportuno, logout/login y verificar sesión persistente al cerrar/abrir, con contraseña siempre oculta en capturas.
8. Offer/Active Trip: solo con reserva de prueba explícita, comprobar selección de vehículo, aceptación y ciclo. No cambiar estado de viajes reales para ensayar.

Comparar cinco capturas principales con ../driver-app-screens/00-all-screens.png. No confundir un mockup o un export web con evidencia del APK Android. Falta confirmar el resultado visual; las diferencias conocidas con los ejemplos son los datos reales, estados vacíos, ausencia de métricas de crecimiento/ETA/payout programado que la API no proporciona y ningún dato de demostración inventado.

Actualización27sept: expediente maestro completo en royal-midnight-driver-session-handoff-2026-09-27.md. Build23 FINISHED, descargado y SHA verificado; consultar anexo12 del maestro. El runtime sigue pendiente en teléfono Android del usuario.
