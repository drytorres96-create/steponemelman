# Recuperación dentro del recorrido NBME

La revisión usa la aplicación React y el proveedor NBME de producción con un backend y un corpus enteramente sintéticos. Ningún material privado ni dato de una cuenta real forma parte de las capturas o de los tests.

## Hallazgo comprobado antes del cambio

**Revisor adversarial / productividad:** una pregunta sintética con siete enlaces ofrecía únicamente los tres primeros. El botón abría el reproductor genérico, guardaba una cola sin origen NBME y, tras contestar sus tres conceptos, enviaba a Hoy. La sesión NBME quedaba pausada y el intento se conservaba, pero el usuario tenía que encontrarla de nuevo. Las capturas `antes/fallo-nbme-{390,1280}.png`, `antes/repaso-generico-{390,1280}.png` y los dos JSON `antes/flujo-*.json` documentan este recorrido a ambas anchuras.

**Coach / neurocognición:** el repaso debe recuperar el objetivo fallado y sus distinciones, con una pregunta por turno, una salida finita y retorno visible al contexto original. Compartir órgano no basta para ampliar recomendaciones. Reconocer una respuesta después de verla no debe acreditar dominio independiente.

## Contrato de revisión del cambio

- Los conceptos proceden del corpus actual; seis visibles con ampliación explícita. Mostrar recomendaciones no registra una presentación ni un intento.
- Practicar un concepto usa el evaluador y el registro de progreso habituales. Un concepto visto es una exposición; no equivale a una respuesta correcta ni a dominio.
- La generación de ejercicios requiere un botón manual, conserva la pregunta y revisión originales, respeta la cuota vigente y permite volver si falla.
- La práctica de IA se guarda por cuenta, pregunta, revisión, letra elegida e intento. Retomarla conserva cursor y respuestas; no reescribe el intento NBME ni el historial del corpus.
- Terminar permite volver al feedback original o avanzar una sola vez dentro de la sesión original. Nunca crea otra sesión NBME ni abre la biblioteca para completar el repaso.
- Desmontar, cerrar cuenta o cambiar de intento cancela solicitudes pendientes. Una respuesta tardía no puede aparecer en otra cuenta ni en otra pregunta.
- Borrar una sesión de la biblioteca la retira de la lista; conserva sus respuestas y el progreso. Ver sólo falladas usa las letras y revisiones de los errores en la primera vuelta, aunque se hayan corregido después.

## Ejecución

Los ocho tests de navegador nuevos están en `e2e/recuperacion-nbme.spec.ts`. Se ejecutan con `CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/recuperacion-nbme.spec.ts` cuando Chromium del sistema está disponible. Las rutas HTTP se interceptan antes de abrir la aplicación; los fixtures sólo contienen tokens, texto y progreso de demostración.

Para una revisión simultánea en equipo se compiló el arnés y se sirvió una copia inmutable. Así, una edición de otro agente no puede recargar la aplicación durante una prueba mediante HMR:

```sh
npx vite build --config e2e/arnes/vite.config.ts --outDir ../../../nbme-qa-dist
CHROMIUM_PATH=/usr/bin/chromium npx playwright test -c docs/flujo-recuperacion-nbme/playwright-qa.config.ts e2e/recuperacion-nbme.spec.ts
```

**Resultado: 8/8 aprobadas**, sin omisiones, a 390 y 1280 px (`E2E-RESULTADO.txt`). La prueba conceptual también conserva una cola general pendiente de tres pasos y comprueba que la recomendación, por sí sola, no marca nada como visto. La presentación real añade una vista; responder añade un único intento. Se comprobó persistencia de los cuatro formatos de IA al recargar, retorno al feedback original y avance a la siguiente pregunta sin nuevas sesiones ni alteración del primer resultado. Las ocho pruebas no contactaron ningún backend real.

**Puerta completa final: 93/93 aprobadas**, sin omisiones (`E2E-COMPLETO.txt`). Incluye los ocho contratos nuevos, las revisiones históricas y el resto de recorridos, después de corregir el tamaño de los campos. Sus cuatro variantes de foco y tipografía también se verificaron por separado antes del lote final (`TIPOGRAFIA-CORREGIDA.txt`).

## Defectos descubiertos y resueltos

**Revisor adversarial:** al devolver una pregunta histórica, el proveedor revalida su archivo exacto y retira momentáneamente el objeto del caché. Desmontar el panel de recuperación en ese intervalo cancelaba la devolución, perdía un aviso de cuota y dejaba sin efecto «Ir a la siguiente pregunta». El host ahora conserva únicamente la pregunta del mismo intento mientras está cargando. La validación de acceso sigue ejecutándose; una identidad distinta o una carga fallida no conserva el panel privado.

La resolución de la promesa de reanudación tampoco garantizaba que React hubiese publicado ya el contexto nuevo: cotejar el contexto intermedio rechazaba una reanudación correcta. La devolución ahora espera el contexto confirmado mediante un efecto, mantiene los controles bloqueados durante ese intervalo y ejecuta su destino una sola vez. Los tests de retorno original, siguiente pregunta y cuota permanecieron estrictos y pasaron después de ambos ajustes.

El lote general de 93 casos se detuvo para incorporar la auditoría posterior de meta y círculos. Su registro parcial (`E2E-PARCIAL-ANTES.txt`) no constituye una puerta verde: identificó dos expectativas antiguas de generación automática NBME, el label antiguo de razonamiento y una frontera temporal frágil del menú. Las pruebas NBME ahora exigen cero solicitudes antes del botón manual y conservan la comprobación de cuota, letra, revisión y continuidad. El caso de hover falló dos de tres repeticiones aisladas porque el reloj seguía avanzando entre acciones; pausarlo sólo en ese caso preservó los intervalos y todas sus aserciones, con tres de tres repeticiones aprobadas (`NAVBAR-REPRODUCCION.txt`, `NAVBAR-DETERMINISTA.txt`).

**Neurocognición / diseño web:** el primer panel de IA dejaba la lista de conceptos y sus controles visibles encima del ejercicio activo. Ahora se presenta un único ejercicio mientras la recuperación está abierta; la lista vuelve al regresar al NBME.

La prueba de foco del recorrido completo detectó que el textarea nuevo heredaba 13,6 px en las dos pieles y anchuras. Se corrigió el CSS del panel para mantener sus campos en `max(16px, 1rem)`, preservando la comprobación original de 16 px y evitando el zoom automático móvil. No se redujeron las aserciones de foco, contraste o geometría para aceptar el fallo.

## Capturas

`despues/` contiene fundamentos ampliados, cierre del repaso de conceptos, ejercicios de IA, retorno a la pregunta siguiente, biblioteca de sesiones y visor de falladas a ambas anchuras. El texto y progreso son sintéticos. `capturas.spec.ts` reproduce el recorrido y el contraste; las fuentes de los casos anteriores se conservaron en `CAPTURAS-FUENTES-ANTERIORES.txt` como evidencia, sin añadir omisiones a los ocho contratos nuevos.

La regeneración final aprobó ocho pruebas (`CAPTURAS-DESPUES.txt`); las dos capturas de meta se repitieron como página completa para conservar la navegación sin que una capa fija se superpusiera al recorte (`META-CAPTURAS-DESPUES.txt`). Se fija explícitamente movimiento reducido antes de abrir la app y se exige que los encabezados hayan terminado su decoración. `BUILD-EVIDENCIA.json` identifica los assets exactos y comprueba el CSS de contraste y el mínimo de 16 px.

Las capturas de contraste posteriores exigen, antes de fotografiar, el borde real de acierto de 2 px con color `rgb(146, 242, 199)` y la etiqueta visible con fondo `rgb(182, 246, 212)`. Esto comprueba que el arnés sirve el CSS nuevo. Acierto y error incluyen además texto y símbolos distintos; su interpretación no depende sólo del color. La compilación debe escribir en el mismo directorio que sirve el preview: `--outDir` se resuelve respecto de `e2e/arnes`, no respecto del directorio de ejecución.

La verificación de navegador prueba el recorrido, la persistencia local y las invariantes del progreso. La calidad médica de los ejercicios reales y el servicio autenticado de Cloudflare requieren sus verificaciones de servidor y publicación; estas capturas no los sustituyen.

`meta-capturas.spec.ts` guarda el día 13 de la meta y Hoy antes/después a las dos anchuras sobre la escena de progreso sintética existente. Sus cantidades no representan una cuenta real. Los JSON registran el texto visible y los valores accesibles de las barras para cotejar el cálculo con la presentación.

En esa escena se comprobó la distancia exacta NBME: 46 respuestas frente a una línea de 52, seis para igualarla, siete para superarla y 209 para completar la meta de 255. El anillo exterior dibujaba 1/12 con una leyenda de 1/14; ahora la suma de los avances dividida por la suma de sus pistas es 1/14 a diez decimales. El viewport no tiene desbordamiento horizontal en ninguna de las dos anchuras.
