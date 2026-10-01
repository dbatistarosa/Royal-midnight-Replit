# Auditoría de paridad Web Driver ↔ Driver App — build 24

Fecha: 29 de septiembre de 2026  
Estado: análisis y planificación terminados; corrección acotada del flujo de checklist/On My Way aplicada; paridad completa pendiente
Referencia funcional: portal Web Driver productivo  
Objetivo móvil: reproducir en Android toda la información y las reglas autorizadas del portal, adaptadas a móvil, sin cambiar el portal web que ya funciona.

## Línea base preservada

- Rama: `fix/royal-midnight-reliability`.
- Commit base: `aa9add8aca6e2e86671860a442b4d8cb636852ed`.
- Se conservaron todos los cambios locales existentes; no se ejecutó reset, clean ni checkout destructivo.
- APK probado por el usuario: build 24, EAS `da62c741-4d17-497d-b498-fe8c8eebe734`.
- APK local: `artifacts/driver-app-v2/dist-android/Royal-Midnight-Driver-v2.0.0-build24.apk`.
- SHA-256: `AD5CB396B8341664A8F1AD2A59106C1A4CC14A4714A4B0C4CEAA25B283880804`.
- El usuario confirmó en teléfono real que el build 24 instala, abre, presenta la nueva portada e inicia sesión.
- En esta auditoría no se modificó código de producto, servidor ni web.

## Evidencia nueva del teléfono

Las cinco capturas originales quedaron copiadas en `docs/handoff/build24-runtime-evidence/screenshots/`:

1. `09-build24-active-trip-missing-details-action-error.jpg`: viaje activo con información incompleta y error genérico al avanzar.
2. `10-build24-completed-trip-back-home.jpg`: viaje terminado que obliga a volver a Home.
3. `11-build24-profile-photo-black.jpg`: fotografía de perfil vacía/negra.
4. `12-build24-offer-countdown-23s.jpg`: oferta con temporizador no solicitado.
5. `13-build24-hourly-offer-countdown-3s-missing-charter.jpg`: reserva por hora presentada como viaje ejecutivo, sin datos de charter.
6. El usuario reportó una reproducción adicional en una reserva ya agendada: al confirmar el checklist y avanzar con `On My Way`, la pantalla mostró `Something went wrong. Please try again.` y no permitió continuar. La evidencia corresponde al flujo existente de `Driver App`; no se copian al repositorio los datos privados visibles en la captura.

## Hallazgos confirmados y causas

### P0 — flujo de ofertas y viajes

1. **Temporizador de oferta no solicitado y expulsión automática.** Confirmado en teléfono y código. La pantalla móvil define una ventana fija de 25 segundos, descuenta cada segundo y ejecuta navegación atrás al llegar a cero. Esto explica la expulsión; al reabrir, el estado de navegación queda incoherente hasta forzar el cierre. La web no tiene este temporizador.

2. **Reserva por hora identificada como `Executive Ride`.** La vista móvil decide casi todo con una condición vuelo/no vuelo y no usa `charterMode`. No muestra horas contratadas, millas incluidas, tarifa por hora, límite por hora, regla de gracia de 20 minutos, sobretiempo, paradas ni destino final de itinerario.

3. **Detalle de oferta incompleto.** La API de ofertas ya entrega `extras` e `itinerary`, pero el tipo móvil no los declara y la pantalla los ignora. También faltan mapa, distancia, duración, tipo de servicio correcto y detalles de vehículo compatible.

4. **Selección de vehículo menos segura que en web.** El portal filtra por clase, pasajeros y equipaje; la app puede presentar vehículos incompatibles y depender de un rechazo genérico del servidor.

5. **Viaje aceptado incompleto.** Faltan fecha y hora, mapa y ruta, distancia/duración, pasajeros/equipaje, vehículo/clase, desglose de ganancias, extras, charter, itinerario y varias preferencias.

6. **Datos inconsistentes entre lista y detalle.** `GET /bookings` adjunta preferencias, extras e itinerario para el conductor; `GET /bookings/:id`, usado por el detalle móvil, solo adjunta extras. Esta diferencia confirma por qué una pantalla puede mostrar información que otra pierde.

7. **Preferencias parciales.** Aunque la app recibiera el objeto completo, solo representa temperatura, música, bebida y notas VIP. Omite título de dirección, viaje silencioso y preferencia de abrir la puerta.

8. **Botón de estado viola la secuencia del portal.** `CONFIRM CHECKLIST & ON MY WAY` marca una lista como completa sin mostrar sus cinco controles y envía inmediatamente `On My Way`. La web separa checklist y transición, y aplica la ventana configurada.

9. **Error genérico al avanzar.** La app oculta el motivo devuelto por el servidor. La captura es compatible con intentar `On My Way` fuera de la ventana permitida. La regla real usa `driver_confirm_window_minutes`, configurable en servidor; la app no la conoce ni explica cuándo se habilitará el botón.
   La reproducción adicional confirma que este no es solo un caso teórico: cuando el primer paso de la acción combinada puede completarse pero `On My Way` es rechazado, el conductor queda frente al mismo mensaje genérico y sin una recuperación clara. Deben registrarse el estado, la ventana y el cuerpo de la respuesta para distinguir ventana horaria, conflicto de estado, autorización y red.

10. **Itinerario por hora no operativo en móvil.** La web permite marcar llegada/salida de cada parada y solo completar tras el destino final. La app no presenta ni acciona el itinerario.

11. **Temporizador legítimo de charter ausente.** Debe distinguirse del temporizador incorrecto de oferta: la web sí tiene un reloj de servicio por hora después de comenzar el viaje, con tiempo contratado, gracia y sobretiempo. Ese reloj falta en móvil.

### P1 — navegación, historial, perfil y medios

12. **Viaje completado siempre vuelve a Home.** La acción móvil está codificada como reemplazo de la ruta raíz. Debe volver a la lista y pestaña de origen —por ejemplo, Completed Rides— y conservar búsqueda/filtro cuando sea posible.

13. **Histórico terminado reducido a recibo.** No conserva el manifiesto completo ni muestra calificación/reseña como el portal.

14. **Foto de perfil negra.** La app pasa `profilePicture` directamente a `Image`, pero ese valor es una ruta privada de almacenamiento. La web obtiene primero una URL autorizada. Falta además un fallback visible cuando la imagen falla.

15. **Perfil móvil incompleto.** Faltan edición de teléfono/foto, estadísticas de rendimiento y reseñas ya disponibles en el portal. El API móvil ya tiene parte de las operaciones, pero la interfaz no las expone.

16. **Estado del conductor simplificado.** La app ofrece solo Online/Offline; el portal distingue Available, On Break, Unavailable y el estado derivado On Duty.

### P2 — ganancias, pagos y robustez

17. **Ganancias sin paridad.** La app tiene Today/Week/Month; la web también ofrece rango personalizado, all time, comisión y porcentaje, promedio, viajes históricos, gráfica diaria y PDF.

18. **Payout incompleto.** La web administra Tax ID/SSN de forma enmascarada; la app no ofrece el campo ni el estado correspondiente.

19. **Errores de enlaces del sistema no visibles.** Llamadas telefónicas y apertura de mapas no comunican fallos de `Linking` al usuario.

20. **Estados vacío/error/offline inconsistentes.** Varias mutaciones convierten respuestas específicas del servidor en `Something went wrong`, impidiendo corregir la acción sin adivinar.

## Matriz de paridad

| Área | Web Driver | Driver build 24 | Acción planificada |
|---|---|---|---|
| Ofertas | Tipo correcto, mapa, fecha/hora, distancia, duración, extras, charter, vehículo compatible, aceptar/rechazar sin cuenta atrás | Datos mínimos y temporizador de 25 s | Manifiesto común; eliminar temporizador; filtro compatible |
| Privacidad preaceptación | Identidad/contacto/preferencias sensibles ocultos | Ocultos | Mantener exactamente este límite |
| Viaje asignado | Identidad autorizada, mapa, manifiesto, preferencias, checklist y reglas de estado | Nombre/teléfono/ruta y acción combinada | Paridad completa y máquina de estados |
| Por hora | Horas, millas, política, itinerario, extras, reloj durante servicio | Presentado como Executive Ride | Componentes y acciones de charter completos |
| Historial | Datos completos, ganancias, propina, total y rating | Resumen corto; vuelve a Home | Detalle de solo lectura y retorno al origen |
| Perfil | Foto autorizada y editable, contacto, rendimiento, reseñas | Foto rota y datos básicos | URL autenticada, fallback, edición y métricas |
| Estado | Available / On Break / Unavailable / On Duty | Online / Offline | Igualar estados y reglas |
| Ganancias | Rango libre, desglose, promedio, gráfica y PDF | Rangos fijos | Completar funciones móviles |
| Payout | Datos bancarios y Tax ID/SSN enmascarado | Sin Tax ID/SSN | Completar con tratamiento seguro |
| Vehículos | CRUD, clase y capacidad | Cobertura amplia | Conservar y conectar compatibilidad de oferta |
| Documentos | Estado, vencimiento, rechazo, carga/visualización | Cobertura amplia | Conservar y probar permisos/offline |
| Alertas/soporte | Funciones equivalentes o menores | Extras móviles presentes | Conservar y validar enlaces/estados |

## Arquitectura aprobable

1. Crear una única representación autorizada de reserva para conductor en servidor y usarla tanto en lista como en detalle, evitando que campos desaparezcan según el endpoint.
2. Mantener una vista de oferta pública para conductores aprobados con identidad y preferencias sensibles en `null` hasta aceptar.
3. Exponer de forma autenticada y sin secretos las ventanas vigentes del flujo de conductor; la app nunca debe codificar minutos fijos.
4. Añadir un mapa de ruta autenticado y limitado a reservas visibles por ese conductor. El servidor conserva la credencial de mapas; el móvil recibe una imagen de ruta con pickup, paradas y destino, sin exponer tokens.
5. Construir en móvil un `DriverBookingManifest` reutilizable para oferta, viaje activo e histórico, con secciones según autorización y estado.
6. Modelar las acciones del viaje con una máquina de estados pura, reglas probables y mensajes específicos antes de presentar botones.
7. Pasar explícitamente el origen al abrir oferta/detalle y aplicar retorno a la pestaña y contexto correctos.
8. Servir la foto mediante descarga autenticada o URL firmada, con fallback a iniciales y flujo de actualización.

## Límites que no deben romperse

- No cambiar componentes ni comportamiento del portal web; solo se usa como referencia.
- Los cambios de servidor serán aditivos o de normalización para el Driver y no reducirán respuestas usadas por web.
- No exponer email, teléfono, preferencias ni notas sensibles antes de que el viaje sea asignado.
- No exponer tokens de mapas, credenciales, rutas privadas de objetos ni secretos en logs o capturas.
- Los descuentos del cliente no reducen las ganancias pactadas del conductor; todo desglose móvil debe usar los importes autorizados del servidor.
- Ninguna compilación o despliegue equivale a aprobación: el cierre exige pruebas en teléfono real.

## Auditoría de enlaces y superficie

- Todos los destinos estáticos actuales de Expo Router encontrados en Home, Rides, Earnings, Alerts, Profile, Vehicles, Documents, Payout y Support existen.
- Los enlaces externos de login a onboarding y contacto existen en la web.
- No se encontró un enlace estático roto por ausencia de ruta.
- Sí quedan riesgos de ejecución que solo pueden cerrarse después de implementar: llamada telefónica sin app compatible, apertura de mapas, permisos de fotos, descarga/visualización de documentos, modo offline, notificación abierta desde app cerrada y retorno Android por hardware.

## Criterio de terminación futuro

La corrección solo podrá declararse terminada cuando: pruebas automatizadas estén en verde; servidor productivo esté verificado; un nuevo APK tenga hash y evidencia; y el usuario o una sesión real de Android recorra oferta normal, oferta por hora, aceptación, checklist, ventanas de botones, paradas, finalización, historial, perfil, ganancias, payout, documentos, alertas, soporte, notificación en background/cierre y navegación atrás. Compilar no basta.
