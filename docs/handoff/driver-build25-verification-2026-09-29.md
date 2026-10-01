# Driver App build 25 — verification handoff

Fecha: 29 de septiembre de 2026  
Estado: correcciones de código verificadas en aislamiento; APK, despliegue y teléfono real todavía pendientes.

## Alcance corregido

- Flujo de viaje separado en checklist de cinco elementos, `On My Way`, llegada, inicio y finalización.
- Errores de acciones de viaje conservan el mensaje/estado del servidor y refetch después de conflictos.
- Ventanas de confirmación se leen desde configuración autenticada del servidor.
- Oferta sin cuenta atrás fija; manifiesto completo, filtros de vehículo compatible y soporte de viajes por hora.
- Manifiesto reutilizable para oferta, viaje activo e histórico, con mapa protegido y fallback textual.
- Preferencias, extras, charter, itinerario, desglose de ganancias y reseñas asignadas.
- Historial con retorno al origen, estados Available/On Break/Unavailable/On Duty y perfil con foto autorizada/fallback.
- Earnings con rangos personalizados/all-time, comisión, propinas, promedio, gráfica y exportación PDF.
- Earnings rechaza fechas de calendario imposibles o invertidas sin enviar una consulta al servidor.
- Payout con Tax ID/SSN y datos bancarios enmascarados; los secretos se envían solo al actualizar y se limpian después.
- Documents acepta imágenes y PDF, conserva el MIME para visualización, firma los objetos antes de abrirlos y muestra siempre la última entrega por tipo.
- Expiraciones de documentos se validan como fechas reales tanto en la app como en el API; se agregó migración para conservar el tipo de archivo.
- Las solicitudes nativas tienen timeout de 15 segundos y las pantallas principales muestran estados de carga/error/reintento.
- Enlaces de teléfono, mapas, onboarding y soporte muestran un aviso si el dispositivo no puede abrirlos.

## Evidencia local

- Driver App en workspace aislado: `npm run typecheck` correcto.
- Driver App: suite completa, 33 pruebas correctas, 0 fallos.
- API en workspace aislado: Vitest, 38 archivos y 241 pruebas correctas.
- Sintaxis Babel de los archivos de earnings modificados: correcta.
- Expo Android export aislado: correcto con `--no-bytecode`; Metro agrupó 2,203 módulos, generó el bundle Android de 3.6 MB y recolectó 79 assets.
- API aislado: `tsc` pasó después de compilar el esquema DB; la suite Vitest completa pasó con 38 archivos y 241 pruebas, incluyendo las fechas/MIME de documentos.
- `git diff --check`: correcto; las advertencias restantes son conversiones normales de LF/CRLF de Windows.
- Los checks puros de vista de reserva/mapa y privacidad permanecen en verde.
- El paquete nativo no declara ni instala RNTL/Jest; por eso no se inventó un harness de componentes dentro de esta corrección. La cobertura disponible es typecheck, export de Metro y las pruebas puras/Node existentes.

## Limitaciones conocidas

- El typecheck completo del router API todavía muestra diagnósticos preexistentes de versión de Stripe y augmentación de `req.log`; no provienen de los helpers nuevos de reserva/mapa.
- La sincronización del lockfile raíz de pnpm ya terminó correctamente e incluye `expo-document-picker`, `expo-print` y `expo-sharing`; la carpeta de módulos de OneDrive sigue mostrando enlaces bloqueados al intentar recrearla.
- El export normal con Hermes llegó a Metro pero Windows rechazó la ejecución de `hermesc.exe` en la carpeta temporal; el export JavaScript sin bytecode sí terminó. Esto no se trató como una APK ni como una aprobación de dispositivo.
- No se hizo despliegue, prueba de producción, prueba de dispositivo Android ni APK nueva. El criterio de terminación exige esas verificaciones y autorización explícita para desplegar.
- La automatización solicitada para reanudar a las 7:35 PM America/New_York fue intentada, pero el programador rechazó la ejecución única y también rechazó crear una recurrencia diaria como sustituto; no quedó ninguna automatización activa.

## Próximo gate obligatorio

Antes de una única APK candidata: consultar de nuevo el límite de uso, confirmar que no existe otra build en curso, y solo continuar si el límite permite completar build, hash y verificación. La matriz real de Android debe ejecutarse después de ese build; compilar por sí solo no equivale a aprobación.
