# 1.14.0 — Preguntar sobre la pregunta

Publicado el 14 de septiembre de 2026. Pedido por Yoel el 14-sep-2026, con un
caso concreto: en una predicción direccional sobre tirotoxicosis facticia,
quería poder preguntar **por qué la captación de yodo estaría baja**, sin salir
de la aplicación y sin que fuera para todos los ítems, solo donde tenga la duda.

## El problema

La explicación de un concepto responde la pregunta que el material decidió
responder. La duda real suele ser otra y más pequeña: una fila de la tabla, una
opción que parecía buena, un mecanismo que no termina de encajar. Hasta ahora esa
duda obligaba a salir a buscarla fuera, que es donde se pierde la sesión.

## Chat del concepto

Nuevo desplegable **«Preguntar sobre esta pregunta»** en la corrección, y ruta
`POST /api/preguntar`.

Solo aparece **después de responder**: preguntar antes sería pedirle la
respuesta.

**Las sugerencias salen del ítem, no de la IA.** Cada fila de una predicción
direccional se convierte en «¿Por qué *captación de yodo* baja en este caso?»;
cada opción incorrecta en «¿Por qué no es …?»; cada confusión declarada en
«¿Cómo lo distingo de …?». La primera pregunta está a un toque y no hay que
redactarla.

**Cada respuesta dice de dónde sale.** El modelo declara si se apoya en el
material del concepto (📗) o en fisiología general que no está en él (💡), y la
pantalla lo enseña distinto. No es lo mismo leer algo que está en la fuente que
leer algo que suena bien. Cuando sale natural, la respuesta cierra con un patrón
reutilizable.

La conversación viaja como **turnos con su rol** —`user` y `assistant`—, no
pegada dentro del prompt: es lo que hace que una pregunta se lea como pregunta.
El material lo pone el corpus, con el ítem completo: enunciado, opciones con su
motivo, flechas, confusiones y distractores.

Como la viñeta de examen, esto **no se califica, no cuenta como intento y no mueve
el dominio ni los repasos**.

### Límites

Ocho turnos de contexto como mucho, preguntas de 400 caracteres, respuestas de
650 tokens. Cada turno cuesta del orden de 135 neuronas; su techo es el 75 % del
presupuesto, por encima de explicar y de la viñeta: una duda concreta en el
momento en que aparece vale más que cualquier texto preparado de antemano.

### Diseño

Vive dentro de la corrección, así que no compite con ella: mismo papel, burbujas
que se abren con un gesto corto, tres puntos mientras piensa, chips redondeados
para las sugerencias. El color solo donde dice algo —quién habla y de dónde sale
lo que dice—. Todo el movimiento se desactiva con `prefers-reduced-motion`, y en
móvil el hilo baja a 340 px con el campo a ancho completo.

El autoscroll es opcional por diseño: donde `scrollIntoView` no exista, el hilo
sigue funcionando igual.

## Archivos

| archivo | qué |
|---|---|
| `src/server/worker.ts` | ruta `/api/preguntar`, modo `chat`, validación de la respuesta y del historial |
| `src/lib/chat-ia.ts` | cliente |
| `src/lib/sugerencias-chat.ts` | las preguntas que salen del propio ítem |
| `src/components/ChatConcepto.tsx` | el hilo |
| `src/editorial.css` | estilos del chat |

## Qué mirar en la aplicación

1. Responde cualquier pregunta y despliega **«Preguntar sobre esta pregunta»**.
2. En una predicción direccional deben salir los chips por fila: «¿Por qué
   captación de yodo baja en este caso?».
3. Pulsa uno: aparece tu burbuja, los tres puntos, y la respuesta con su origen
   (material o fisiología general) y su patrón.
4. Pregunta otra cosa seguida: la segunda respuesta tiene en cuenta la primera.

## Pruebas

`src/server/worker.test.ts` pasa a 42 (validación de la respuesta, historial con
rol conocido, los turnos que llegan al modelo y el rechazo de lo que no es una
pregunta); nuevo `src/__tests__/chat-concepto.test.tsx` (5), que cubre las
sugerencias derivadas del ítem, el origen declarado, el hilo encadenado y un
fallo que no contamina la conversación siguiente.

Total: 452 pruebas pasan, 2 omitidas, build sin errores de TypeScript.
