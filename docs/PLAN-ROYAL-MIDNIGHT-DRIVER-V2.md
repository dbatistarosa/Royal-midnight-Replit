# Plan de implementación — Royal Midnight Driver v2

## Estado

Implementación iniciada sobre `artifacts/driver-app-v2`. La app anterior permanece intacta como respaldo. Backend, API, Supabase/Postgres y datos no se borran ni se migran destructivamente.

## Fases

1. **Base móvil aislada** — Expo SDK 57, Expo Router, React Native, cliente HTTP local y React Query; conservar `com.royalmidnight.driver` y el proyecto EAS existente.
2. **Experiencia de conductor** — Home, Rides, Earnings, Alerts y Profile; ofertas, aceptación de viajes, ciclo activo, ubicación, documentos, pagos, soporte y notificaciones in-app.
3. **Push Android** — registrar el paquete Android en Firebase; usar Expo Push Token respaldado por FCM y persistirlo mediante `/drivers/:id/push-token`. La clave privada FCM V1 ya fue generada en Firebase y asignada en EAS al paquete `com.royalmidnight.driver`; `GOOGLE_SERVICES_JSON` también quedó cargado como archivo secreto del entorno `preview`.
4. **Entornos** — el cliente acepta `EXPO_PUBLIC_API_BASE_URL`; el fallback público verificado es `https://www.royalmidnight.com/api`. El preview Vercel responde correctamente a `/api/healthz` mediante su protección OIDC, pero requiere autenticación; por eso no se incrusta en el APK ni se añade un bypass secreto. Para QA móvil hace falta publicar un endpoint staging seguro o mantener temporalmente producción.
5. **Calidad y entrega** — TypeScript, export Android, Expo Doctor, instalación limpia desde `package-lock.json`, auditoría de dependencias y build EAS interno APK. Como el cliente vive dentro de un monorepo Windows, el build debe ejecutarse con `EAS_NO_VCS=1` y `EAS_PROJECT_ROOT` apuntando a `artifacts/driver-app-v2`; así el archivo subido contiene solo la app. La auditoría actual reporta 14 vulnerabilidades moderadas transitorias y 0 altas/críticas; `npm audit fix --force` no se aplicará porque propone cambios mayores de Expo incompatibles con esta versión del cliente. La prueba manual Android de login/oferta/viaje/ubicación/push queda pendiente de una APK SDK57 descargable y de una cuenta de conductor de QA.

Build de entrega generado: EAS `2eec04f0-1fae-4f84-a578-02d09f09c769` (perfil `preview`, SDK57, Android APK, versionCode 16). APK: `https://expo.dev/artifacts/eas/Owx9YSIv8hXWJj90d85QsLABU7S6znpoZaLSKeqQu08.apk`; SHA-256 local: `CE81FF922483FD838FACC3DE83F6CD9776744182A0DD2E7F8B29B2D0EF4E1338`. La APK contiene `assets/app.config` con `com.royalmidnight.driver`, el API de producción, el proyecto EAS y los valores Firebase FCM; la ejecución visual en Android y los flujos autenticados siguen pendientes de la verificación en Appetize/dispositivo y de una cuenta de conductor de QA. Los builds SDK56 anteriores se conservan como evidencia histórica, no como entrega final.

## Servicios gratuitos recomendados de free-for.dev

| Necesidad | Opción | Uso en este proyecto |
|---|---|---|
| Distribución interna | EAS Build + InstallOnAir o Diawi | EAS genera el APK; el segundo puede servirlo temporalmente para QA sin Play Store. |
| Monitoreo | UptimeRobot o Better Stack | Vigilar `GET /api/healthz` y avisar si el API cae. |
| Errores | Bugsink o Embrace free tier | Capturar fallos móviles después de la prueba física; no incluir secretos en eventos. |
| Testing visual | Appetize | Smoke tests rápidos en Android virtual cuando no haya dispositivo físico. |
| Mapas/geocodificación | Geoapify free tier | Solo si el backend requiere una cuota separada; conservar el proveedor existente mientras funcione. |
| CI/CD | GitHub Actions free tier | Typecheck, export y auditoría en cada cambio; EAS se reserva para APK. |
| Seguridad | `npm audit` y Semgrep free tier | Revisar dependencias y patrones peligrosos antes de cada entrega. |
| Diseño | Figma free tier | Mantener el sistema visual navy/gold a partir de los mockups proporcionados; no es necesario instalar Figma para compilar. |

## Regla de seguridad

No subir `google-services.json`, service-account keys, tokens EAS, claves Stripe, Supabase service-role ni archivos `.env` al repositorio. Las credenciales se cargan por el gestor de secretos de EAS o por el entorno local de build.
