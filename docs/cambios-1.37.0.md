# Claude siempre accesible y eliminación de bloques · 1.37.0

Categoría: diseño web. Cambio solicitado por Yoel el 17-oct-2026.

La captura de producción mostraba «Finish your Test block to update the daily goal»:
`pendingTest` ocultaba las dos tarjetas de Claude aunque el bloque ofrecido para
retomar fuera un Tutor más reciente. Además, `Hoy` ocultaba el asistente con el día
completo, el viernes y durante la carga semanal. No había una acción para quitar
los bloques guardados de MyQBank.

## Comportamiento

- **Ask Claude for a session** siempre aparece en el dashboard, con bloques Tutor
  o Test pendientes, día completo, viernes o catálogo todavía cargando. Se puede
  pedir y abrir otra sesión sin terminar las anteriores.
- **Reinforce today** conserva su lugar. Si no hay refuerzo, ya se abrió, se descartó
  o aún está cargando, muestra ese estado. Se mantienen la selección, la frecuencia
  de una vez al día, el máximo de cinco ítems y el viernes sin sugerencia automática.
- **Saved blocks → Remove** permite quitar cualquier bloque pendiente o terminado.
  La confirmación explica que cierra el bloque y lo retira de la lista, conservando
  respuestas y progreso; las preguntas sin responder no reciben nota. La fila incluye
  fecha y hora de creación para distinguir títulos repetidos. Escape cancela; tras
  quitarlo, el foco vuelve a «Saved blocks».
- El cálculo de la meta diaria, los techos, el dominio, los intentos y el modo Test
  conservan sus reglas. El asistente no usa los resultados de un Test aún abierto
  para inferir fallos o recomendar material. Las sesiones que se abran desde el chat
  siguen registrando intentos normales.

## Estructura y persistencia

`AsistenteDashboard` prepara los datos del asistente con las funciones compartidas
de cajas e inventario; no monta `Hoy`, no carga el plan semanal y no decide si el
usuario puede abrir Claude según su progreso. `Hoy` conserva su pantalla y su meta.
Si se pide NBME mientras falta el catálogo, el chat informa de la carga y permite
reintentar; no presenta una lista vacía como si no hubiera preguntas.

`SavedBlocks` añade la confirmación y reutiliza `archivedAt`, `completedAt` y los
mecanismos de mezcla existentes. Los intentos no se eliminan. Para NBME se cierra y
archiva también la sesión asociada sin activarla ni descargar preguntas. Si ambas
copias llegan en distinto orden desde otro dispositivo, la marca de eliminación se
aplica cuando llega la copia NBME. No se cambia ningún esquema ni RPC.

## Comprobación en la aplicación

URL: https://steponemelman.yoeltorres.workers.dev/?workspace=myqbank#dashboard

1. Con un Test sin terminar, abrir «Open chat», pedir una sesión y empezar el nuevo
   bloque. El Test anterior conserva su posición y sus respuestas.
2. Volver al dashboard; en «Saved blocks», quitar un bloque. Comprobar la
   confirmación, la retirada de la fila y que la recarga no lo hace reaparecer.
3. Con el día completo, comprobar que el mensaje de cierre de la meta permanece y
   que el chat sigue accesible. La tarjeta de refuerzo explica su disponibilidad.
4. Tras publicar, Ajustes debe mostrar 1.37.0. Este PR no publica por sí solo.

## Evidencia visual

Datos sintéticos, orden de CSS de producción y movimiento reducido. Ninguna captura
contiene el progreso real del usuario ni material del corpus.

| Vista | Antes | Después | Confirmación |
| --- | --- | --- | --- |
| 390 px | [Antes](myqbank-independent/before-390.png) | [Después](myqbank-independent/after-390.png) | [Quitar bloque](myqbank-independent/remove-390.png) |
| 1280 px | [Antes](myqbank-independent/before-1280.png) | [Después](myqbank-independent/after-1280.png) | [Quitar bloque](myqbank-independent/remove-1280.png) |

## Validación

La regresión «con un Test sin terminar puede pedir y abrir otra sesión sin cerrar el
Test» falla en `706459f` a 390 y 1280 px: no existe «Ask Claude for a session». La
misma prueba pasa con este cambio. Se conservan las pruebas de foco, teclado,
conversación y creación de bloques; las expectativas de ocultación se actualizan a
la regla solicitada. Se añaden comprobaciones de eliminación, mezcla entre
dispositivos, carga pendiente y día completo.

Puertas locales, en orden con Node 22.23.3:

```text
npm ci
added 170 packages in 2s

npm test
Test Files  115 passed | 1 skipped (116)
Tests       1362 passed | 2 skipped (1364)

npm run build
tsc -b && vite build
233 modules transformed.
built in 3.63s
```

Las dos omisiones son las esperadas. La revisión visual generó 28 capturas a
390 y 1280 px, en claro y oscuro, sin errores de página ni desbordamientos
horizontales. El PR registra además el resultado final de Playwright y de CI
sobre el commit publicado en la rama.
