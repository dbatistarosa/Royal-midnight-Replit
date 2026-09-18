# Royal Midnight — Auditoría integral y plan de mejora

Fecha: 2026-09-18  
Alcance: website público, booking, portal passenger, portal driver, driver app Expo, dashboards admin/corporate, API, base de datos, CI/CD, configuración y activos de marca.

## Resumen ejecutivo

La plataforma tiene una base sólida: la suite actual pasa, la autenticación y autorización están presentes en las rutas sensibles, el pipeline usa permisos mínimos y las acciones de GitHub están fijadas por SHA. Encontré y corregí dos fallos funcionales visibles:

1. El mapa de ubicación del conductor no aparecía después de recargar la sesión del pasajero porque la interfaz exigía un token Bearer en memoria, aunque la sesión real se mantiene con cookie HttpOnly.
2. El home producía `React error #418` durante hidratación cuando las clases de vehículos llegaban dinámicamente desde pricing.

También se añadió el logo oficial con fondo transparente en la navegación, footer y pantallas de autenticación.

## Cobertura y evidencia

- 730 archivos fuera de dependencias/generados; 509 archivos TypeScript/TSX; 35 archivos de prueba.
- Revisión de API, rutas, middleware, esquemas, web, app móvil, workflows y configuración.
- Revisión visual de `/`, `/about`, `/services`, `/fleet`, `/pricing`, `/faq`, `/contact`, `/book`, `/auth/login` y `/driver/onboarding` en production.
- Suite: 27 archivos API + 209 pruebas; 1 archivo web + 3 pruebas: todo PASS.
- Typecheck completo de libs, API, driver app, mockup, web y scripts: PASS.
- CI/CD: permisos mínimos y acciones fijadas por commit SHA.
- Herramientas externas Semgrep, Trivy y Gitleaks no están instaladas en el entorno local; el análisis de seguridad de patrones se hizo de forma nativa y el workflow sí ejecuta `pnpm audit`.
- El build local quedó limitado por la ausencia del binario opcional Windows de `lightningcss`; el lockfile no se modificó y los builds de CI/Vercel habían pasado anteriormente.

## Hallazgos corregidos

### RM-001 — Mapa en vivo invisible tras renovar sesión

- Severidad: Alta funcionalidad / impacto alto en experiencia.
- Área: passenger portal, detalle de viaje.
- Causa: `PassengerRideDetail` renderizaba `DriverTrackingMap` solo si existía `token`. Las sesiones restauradas por `/auth/me` usan cookie HttpOnly, por lo que `token` es `null` tras una recarga.
- Corrección: el mapa ahora se muestra para cualquier pasajero autenticado, usa `credentials: "include"` y conserva Bearer solo cuando existe. También muestra la hora GPS enviada por el servidor, valida coordenadas numéricas y destruye el mapa/marker al desmontar.
- Archivo: `artifacts/royal-midnight/src/pages/passenger/ride-detail.tsx`.

### RM-002 — Error React #418 durante hidratación del home

- Severidad: Media.
- Área: marketing website.
- Causa: la grilla de vehículos depende de pricing cargado dinámicamente y podía diferir entre el HTML prerenderizado y el primer render del navegador.
- Corrección: la grilla se habilita después del primer montaje del cliente, manteniendo idéntico el primer árbol server/client.
- Archivo: `artifacts/royal-midnight/src/pages/home.tsx`.

### RM-003 — Logo de marca con fondo oscuro y texto poco legible

- Severidad: Media visual/branding.
- Corrección: se añadió `artifacts/royal-midnight/public/royal-midnight-logo-transparent.png` y se reemplazaron las referencias en navbar, footer, login, signup y reset-password.
- El PNG conserva corona, escudo, monograma RM y el texto legible “ROYAL MIDNIGHT” sin rectángulo de fondo.

## Riesgos y tareas recomendadas

### Alta prioridad

1. Hacer una prueba E2E autenticada del flujo completo de tracking: driver online → permiso de ubicación → `PATCH /drivers/:id/location` → booking `on_way` → mapa passenger con actualización menor a 30 segundos.
2. Añadir una prueba de contrato para `/bookings/:id/driver-location` usando cookie HttpOnly, no solo Authorization Bearer.
3. Verificar en dispositivos físicos iOS y Android los permisos Always/background. La app declara los permisos correctamente, pero el comportamiento depende de la build nativa y de la decisión del usuario.
4. Instalar Semgrep/Trivy/Gitleaks en CI o documentar sus equivalentes de CI para aumentar la cobertura SAST, secretos y SCA.

### Media prioridad

1. Reemplazar el polling de 10 segundos del pasajero por Supabase Realtime/WebSocket con fallback a polling. Esto reduce latencia y carga.
2. Entregar al mapa pickup, destino y ruta estimada para que el pasajero vea no solo el vehículo sino también el contexto del trayecto.
3. Añadir indicador de frescura: “Actualizado hace X segundos”, estado “señal débil” y alerta si la última posición supera 60 segundos.
4. Añadir pruebas visuales responsive para 375px, 768px y desktop; el sitio público fue revisado en desktop, pero los portales privados requieren una sesión QA dedicada.
5. Mantener `DB_TLS_INSECURE` ausente en production. Es un escape hatch documentado y debe permanecer desactivado salvo incidente controlado.

## Sugerencias para diferenciar Royal Midnight

### 1. Royal Journey Live

Una pantalla de viaje con mapa, ETA, nombre del chauffeur, vehículo, placa parcial, estado de privacidad y un botón de concierge. El diseño puede mostrar una línea de progreso: reservado → chauffeur en camino → llegada → viaje en curso → completado.

### 2. Midnight Concierge

Un concierge persistente dentro del portal para solicitar ayuda, cambiar instrucciones, añadir una parada autorizada o contactar al equipo sin abandonar el viaje. Todas las acciones deben quedar auditadas.

### 3. Preferencias de lujo

Guardar preferencias como temperatura, música, silencio, tipo de agua, asistencia con equipaje y idioma del chauffeur. Presentarlas al conductor antes de la recogida y permitir que el pasajero las reutilice.

### 4. Flight-aware service

Convertir el seguimiento de vuelo en una experiencia visible: hora estimada, terminal, buffer recomendado, estado del meet-and-greet y reprogramación automática con confirmación.

### 5. Corporate travel center

Añadir centros de costo, viajeros autorizados, reglas de aprobación, facturas consolidadas, reportes descargables y reservas recurrentes para empresas.

### 6. Confianza verificable

Mostrar credenciales del chauffeur, última inspección del vehículo, nivel de servicio y política de privacidad de ubicación. Esto diferencia la marca por transparencia sin sacrificar discreción.

### 7. Accesibilidad y conversión

Añadir navegación por teclado completa, foco visible consistente, mensajes de error asociados a campos, `aria-live` para estados de quote/booking y CTA “Reserve in under 2 minutes”.

## Plan de remediación sugerido

### Fase 1 — estabilidad inmediata

- Ejecutar E2E autenticada del mapa en un dispositivo real.
- Confirmar `VITE_MAPBOX_TOKEN` y `MAPBOX_ACCESS_TOKEN` en cada ambiente.
- Añadir cobertura de cookie-session para tracking.
- Mantener CI bloqueando merges cuando fallen typecheck, tests, build o audit high.

### Fase 2 — tracking premium

- Realtime con fallback.
- Ruta, ETA, pickup/destination y freshness indicator.
- Manejo de permisos y estado offline en driver app.
- Historial de pings con retención definida y controles de privacidad.

### Fase 3 — diferenciación comercial

- Royal Journey Live.
- Midnight Concierge.
- Preferencias persistentes.
- Corporate travel center.
- Mejoras de accesibilidad, SEO y conversión.

## Estado final de esta revisión

- Correcciones aplicadas: tracking con cookie, cleanup del mapa, timestamp real de GPS, hidratación estable, logo transparente.
- Validación: tests y typecheck PASS.
- Pendiente de validación externa: dispositivo físico, permisos nativos background, prueba E2E autenticada de una reserva activa y verificación final de Mapbox en cada ambiente.

## Continuación — mejoras aplicadas después del primer cierre

En la segunda pasada se buscaron regresiones y variantes de los hallazgos anteriores antes de añadir cambios. Se encontraron y corrigieron dos pendientes distintos:

### RM-004 — Acciones del viaje fallaban después de recargar la sesión

- Severidad: Alta funcionalidad.
- Área: detalle de viaje del pasajero.
- Causa: cancelar, guardar chauffeur, consultar datos del chauffeur, propina y rating enviaban solo el Bearer en memoria. Después de una recarga el usuario seguía autenticado por cookie HttpOnly, pero esas acciones podían responder 401.
- Corrección: todas esas llamadas usan `authHeaders(token)` y conservan el Bearer cuando existe, permitiendo que la cookie de sesión sea la fuente de autenticación tras recargar.
- Archivo: `artifacts/royal-midnight/src/pages/passenger/ride-detail.tsx`.

### RM-005 — Tracking público no refrescaba el estado y omitía estados activos

- Severidad: Media funcional/UX.
- Área: `/track/:token`.
- Causa: la página cargaba una sola vez y trataba `on_way`/`on_location` como estados desconocidos en la línea de progreso.
- Corrección: refresco seguro cada 15 segundos con `cache: no-store`, etiquetas de estado legibles, colores para estados activos y timeline coherente para llegada/en ruta.
- Archivo: `artifacts/royal-midnight/src/pages/track.tsx`.

### RM-006 — Mapa podía arrebatar el control al pasajero y no indicaba señal atrasada

- Severidad: Media UX/accesibilidad.
- Área: mapa de tracking autenticado.
- Corrección: el mapa centra al conductor solo en el primer ping, añade control “Center”, marca señal con más de 60 segundos como atrasada y expone el estado mediante `aria-live` y etiqueta accesible del mapa.
- Archivo: `artifacts/royal-midnight/src/pages/passenger/ride-detail.tsx`.

### Verificación de la continuación

- Typecheck focalizado de web: PASS.
- Web: 3 pruebas PASS.
- API: 27 archivos y 209 pruebas PASS.
- `git diff --check`: PASS.
- Build local: limitado por `lightningcss.win32-x64-msvc.node` ausente en el entorno Windows/OneDrive; sin cambios de lockfile. El build de CI/Vercel es la compuerta de despliegue.
- Se volvió a buscar el patrón de Bearer-only en el detalle de viaje: solo queda el header condicional interno del mapa, que conserva compatibilidad con Bearer y usa cookie mediante `credentials: include`.
