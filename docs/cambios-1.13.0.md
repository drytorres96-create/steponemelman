# 1.13.0 — La IA gratuita llega al concepto, no solo al resumen

Publicado el 14 de septiembre de 2026. Pedido por Yoel el 14-sep-2026: implementar
las tres funciones propuestas, con su versión de la tercera —cómo caería un
concepto en un ítem real de examen y qué patrón sacarle— y sin el repaso en audio.

## 1. Con qué te confundiste

Nueva línea en la corrección de una respuesta escrita fallada, y ruta
`POST /api/confusion`.

Saber que fallaste ya lo dice el veredicto; lo que no dice es **hacia dónde te
fuiste**. Esto compara lo que escribiste con los textos que el propio concepto
trae —la respuesta buena, sus sinónimos, los distractores declarados, las
confusiones conocidas, las opciones incorrectas y los conceptos vecinos— y nombra
el más cercano, con su origen y su porcentaje de parecido.

Es el modo que **no puede inventarse nada**: el modelo solo convierte textos en
vectores y el Worker mide la distancia. Todos los textos comparados salen del
corpus. Si nada pasa del 55 % de parecido, no dice nada: peor que callar es
sugerir una confusión que no existe.

Usa `@cf/baai/bge-m3`, a **1 075 neuronas por millón de tokens** frente a las
26 668 del modelo de texto. Comparar dos docenas de candidatos cuesta del orden
de una neurona, así que se pide solo, sin botón. Su techo de presupuesto es el
mismo que el de corregir: el 100 %.

## 2. Que la IA juzgue una respuesta sin evaluar

Nuevo botón cuando el corrector propio no supo decidir.

`evaluarTexto` devuelve «revisión» como caso por defecto: cualquier respuesta que
no sea idéntica, ni un distractor conocido, ni un contraste, ni una errata. Ese
intento **no cuenta ni como acierto ni como fallo**, y en el historial de Yoel
eran **30 de 161 — el 19 %**, ninguno pasado por IA. Casi siempre porque la IA no
estaba disponible en ese momento, con el tope antiguo de veinte ayudas al día.

El botón reescribe **el mismo intento**, no crea otro, así que el esfuerzo
original es el que acaba contando. Si la IA sigue sin poder, la respuesta se queda
como estaba y se dice por qué.

## 3. Cómo caería en el examen

Nuevo desplegable en la corrección de cualquier pregunta, acierto o fallo, y ruta
`POST /api/aplicar`.

Convierte el concepto en el ítem que lo preguntaría: una viñeta al estilo NBME
—paciente, hallazgos, valores y pregunta—, el dato del enunciado que decide la
respuesta, dos a cuatro distractores plausibles con su motivo, un patrón
reutilizable con la forma «si ves X + Y, piensa en Z», y para qué sirve
reconocerlo en la práctica.

Aparece **siempre**, no solo al fallar: existe para el problema contrario al de la
ayuda. Un concepto que parece cien por cien teórico se vuelve útil cuando ves en
qué ítem cae y qué hallazgo lo delata.

**Es el único sitio de la aplicación donde se muestra contenido que el modelo
escribe en vez de reordenar el del corpus.** Workers AI no navega: no consulta
UWorld, AMBOSS ni la web; se apoya en el material real del concepto y en su propio
conocimiento de cómo se examina. Por eso no se puede verificar contra la fuente
como sí se verifica la ayuda, y por eso **no se califica, no cuenta como intento y
no mueve el dominio ni los repasos**. La pantalla lo dice sin letra pequeña.

Lo que sí se comprueba es que llegue entero: una viñeta de menos de 120
caracteres no es una viñeta —es la pregunta que el concepto ya traía— y no se
enseña; una trampa sin motivo se cae sola mientras queden dos completas.

## Presupuesto

| modo | techo | por qué |
|---|---|---|
| corregir | 100 % | decide el veredicto que se guarda |
| confusión | 100 % | cuesta calderilla y no genera texto |
| lectura de la semana | 85 % | semanal y barata |
| explicar | 70 % | cara y prescindible |
| viñeta de examen | 60 % | la más cara y lo más opcional |

## Archivos

| archivo | qué |
|---|---|
| `src/server/worker.ts` | rutas `/api/aplicar` y `/api/confusion`, modos `examen` y `confusion`, coseno y candidatos |
| `src/server/neuronas.ts` | tarifa de embeddings y techos de los dos modos nuevos |
| `src/lib/examen-ia.ts`, `src/components/ExamenIA.tsx` | la viñeta |
| `src/lib/confusion-ia.ts`, `src/components/ConfusionIA.tsx` | el parecido |
| `src/screens/Reproductor.tsx` | los tres puntos de entrada |

## Qué mirar en la aplicación

1. Responde una pregunta escrita **mal, con una palabra parecida a un distractor**:
   bajo el veredicto debe salir «Te fuiste hacia: …».
2. Escribe una respuesta larga o rara que el corrector no sepa decidir: sale
   «Que la IA juzgue mi respuesta», y al pulsarlo el intento pasa a contar.
3. En cualquier corrección, despliega **«Cómo caería en el examen»** y pulsa el
   botón: viñeta, dato clave, trampas, patrón y utilidad.

## Pruebas

`src/server/worker.test.ts` pasa a 38; `src/server/neuronas.test.ts` a 9;
`src/__tests__/calificacion-ia.test.tsx` a 6; nuevo
`src/__tests__/examen-confusion.test.tsx` (4).

Total: 443 pruebas pasan, 2 omitidas, build sin errores de TypeScript.
