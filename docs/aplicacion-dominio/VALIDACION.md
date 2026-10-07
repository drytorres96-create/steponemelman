# Aplicación y retoma · 1.31.1

Validado el 7 de octubre de 2026 a 390 y 1280 px.

La práctica nueva de un mecanismo con respuesta extensa puede ofrecer un caso editorial
de aplicación después de un intento resuelto, si el criterio todavía exige evidencia
activa independiente. Preparar la cola no registra aciertos. La cola, la variante y la
posición se guardan una sola vez; reanudar o corregir conserva la pregunta exacta.

Los ejemplos de esta validación usan reglas inventadas de fichas y compuertas. Se ejecuta
la aplicación real con proveedores en memoria: sin cuentas reales, Supabase, Worker,
corpus médico ni llamadas externas.

## Puertas verificadas

| Puerta | Resultado |
| --- | --- |
| Unitarias completas, ejecutadas por root | 1039 aprobadas; 2 omisiones previstas |
| TypeScript y compilación de producción, ejecutados por root | Aprobados |
| Integraciones Mixta, Cajas y repaso NBME | 31 pruebas focales aprobadas |
| Navegador, seis recorridos a 390 y 1280 px | 12 aprobadas, 35.1 s, sin reintentos |
| Revisión adversarial de las tres integraciones | Sin hallazgos críticos, altos ni medios |
| Capturas sobre compilados | 4 antes y 8 después; sin errores de página ni desbordamiento |

La suite completa de navegador se ejecuta en CI sobre el commit final. El registro local
de los doce recorridos se conserva en [E2E-FOCALES.txt](E2E-FOCALES.txt).

## Contratos del navegador

- Cajas elige el caso menos visto al crear la cola. Pausar y retomar conserva caso,
  variante, sesión, posición y feedback, sin duplicar el intento.
- Un fallo de Cajas vuelve a mostrar ese mismo caso como corrección asistida. Se cuenta
  una sola caja y el segundo intento conserva la identidad del concepto.
- El repaso relacionado con NBME guarda el orden y los IDs de variante. Tras pausar,
  responder y retomar, devuelve el intento, revisión y posición originales del NBME.
- La primera presentación de un mecanismo extenso conserva las opciones base; el
  recuerdo breve conserva su respuesta escrita.
- Una cola antigua con variante `null` retoma la base exacta y la posición guardada. Una
  selección nueva elegible sí prepara el caso de aplicación.
- El examen y su corrección conservan la pregunta base. No se convierten en un caso
  diferente ni muestran feedback antes de terminar el examen.

Las comprobaciones comparan el historial anterior, la sesión, la cola guardada, los
criterios, el ID de pregunta y el ID de variante. Un acierto aislado o una corrección con
ayuda no concede dominio automático.

## Capturas

El antes procede de `src/` y `public/` del commit
`84d875998bcf29a3a01946ac4237152725d545fd`, extraídos en una copia aislada. Usa el mismo
arnés sintético nuevo para mostrar la pregunta base que se ofrecía en Cajas y la retoma
base guardada. El código de producción anterior no se modifica.

El después procede del código final 1.31.1 congelado, compilado en un directorio absoluto
separado. Ambos scripts rechazan HMR y comprueban que el HTML servido corresponde al
directorio compilado indicado. Las imágenes usan movimiento reducido, fecha sintética
fija, texto terminado, foco retirado y cursor apartado, sin modificar el producto.

| Estado | 390 px | 1280 px |
| --- | --- | --- |
| Antes: Cajas ofrece la base | [Imagen](antes/cajas-base-390.png) | [Imagen](antes/cajas-base-1280.png) |
| Antes: retoma base | [Imagen](antes/retoma-base-390.png) | [Imagen](antes/retoma-base-1280.png) |
| Después: nuevo caso de aplicación | [Imagen](despues/caso-390.png) | [Imagen](despues/caso-1280.png) |
| Después: corrección del mismo caso | [Imagen](despues/correccion-390.png) | [Imagen](despues/correccion-1280.png) |
| Después: retoma con feedback guardado | [Imagen](despues/retoma-390.png) | [Imagen](despues/retoma-1280.png) |
| Después: retoma base sin promoción | [Imagen](despues/mcq-390.png) | [Imagen](despues/mcq-1280.png) |

Los archivos `antes/evidencia.json` y `despues/evidencia.json` identifican el bundle y las
preguntas fotografiadas. Scripts reproducibles: [capturar-antes.mjs](capturar-antes.mjs) y
[capturar-despues.mjs](capturar-despues.mjs).

```sh
CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/aplicacion-dominio.spec.ts
npx vite build --config e2e/arnes/vite.config.ts --outDir /ruta/absoluta/compilado-final
python3 -m http.server 5319 --bind 127.0.0.1 --directory /ruta/absoluta/compilado-final
APLICACION_CAPTURE_URL=http://127.0.0.1:5319 APLICACION_CAPTURE_BUILD=/ruta/absoluta/compilado-final node docs/aplicacion-dominio/capturar-despues.mjs
```

La primera pasada encontró una expectativa incorrecta del propio test: el recomendador
ofrecía dos conceptos sintéticos válidos y el test esperaba uno. El test final comprueba
los dos y selecciona explícitamente el objetivo de aplicación; conserva todas las
aserciones de identidad, historial y devolución. No se modificó producción para resolver
esa discrepancia.
