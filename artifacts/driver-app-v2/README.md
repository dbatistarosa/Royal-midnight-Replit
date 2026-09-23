# Royal Midnight Driver v2

Cliente Android aislado para conductores. Mantiene el identificador `com.royalmidnight.driver`, el proyecto EAS existente y los endpoints del API; no modifica Supabase, Postgres ni las tablas existentes.

## Configuración

- `EXPO_PUBLIC_API_BASE_URL` permite apuntar a un preview/staging público sin cambiar código.
- El fallback actual es `https://www.royalmidnight.com/api` porque el preview de Vercel documentado requiere autenticación y no sirve como endpoint móvil.
- `google-services.json` es local y está ignorado por Git. El archivo descargado corresponde al proyecto Firebase `midnight-b42b7` y al paquete Android exacto; EAS lo recibe mediante la variable de archivo secreta `GOOGLE_SERVICES_JSON` del entorno `preview`. La credencial privada FCM V1 está asignada en EAS y no se guarda en el repositorio.

## Verificación local

```powershell
npm install --legacy-peer-deps
npm run typecheck
npx expo export --platform android --no-bytecode --no-minify --output-dir dist-android
```

El flag `--no-bytecode` solo se usa en Windows cuando `hermesc.exe` queda bloqueado por permisos; el APK de EAS usa la compilación nativa normal.

## Build interno

```powershell
npm run build:android:preview
```

El script establece `EAS_NO_VCS=1` y `EAS_PROJECT_ROOT` en esta carpeta. Es
importante porque el cliente vive dentro del repositorio del backend; sin esos
valores, EAS puede intentar enviar todo el monorepo en lugar de solo esta app.

El APK es para instalación interna y QA. La publicación en Google Play queda fuera de esta fase.
