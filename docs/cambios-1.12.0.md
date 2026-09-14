# 1.12.0 — La IA gratuita rinde lo que de verdad da

Publicado el 14 de septiembre de 2026. Pedido por Yoel el 14-sep-2026: sacarle
el mejor provecho posible a las herramientas gratuitas de IA e integrarlas
donde mejoren rendimiento, memorización y exactitud, sin entorpecer el estudio.

## El problema

La ayuda de IA se racionaba contando llamadas: 30 al día en total, 20 por
cuenta. Cloudflare no cobra llamadas: cobra **neuronas**, su unidad de cómputo,
y el plan gratuito regala 10 000 al día para toda la cuenta, con reinicio a las
00:00 UTC.

Contar llamadas obligaba a fijar el tope por el peor caso imaginable y dejaba la
mayor parte del regalo sin usar. Una corrección de una palabra y una explicación
larga gastaban «1» las dos, cuando la segunda cuesta casi el doble que la
primera. Con el material típico del corpus, aquellas 30 llamadas se quedaban
alrededor del 35 % del presupuesto diario.

## Presupuesto real, en neuronas

`src/server/neuronas.ts`, nuevo. Las tarifas publicadas del modelo del proyecto,
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`:

| concepto | neuronas |
|---|---|
| por millón de tokens de entrada | 26 668 |
| por millón de tokens de salida | 204 805 |
| regalo diario de la cuenta | 10 000 |
| reserva intocable | 15 % |
| presupuesto útil | 8 500 |

La salida pesa casi ocho veces más que la entrada: lo caro no es el material que
se manda, es lo que el modelo escribe. De ahí que corregir —160 tokens de
veredicto— salga por una fracción de lo que cuesta explicar.

**Reserva y liquidación.** Antes de llamar se reserva el peor caso, contando con
que el modelo agote su `max_tokens`. Cuando responde, Workers AI informa de lo
que consumió de verdad y la diferencia vuelve al bote. Una llamada que falla
conserva su reserva: si no, un modelo que falla en bucle saldría gratis.

**Techo por modo.** No todos los usos valen lo mismo para estudiar, así que no
todos pueden llegar igual de lejos:

| modo | hasta | por qué |
|---|---|---|
| corregir una respuesta libre | 100 % | decide el veredicto que se guarda, y de ahí salen el dominio y los repasos |
| leer la semana | 85 % | una vez por semana y barata |
| explicar una respuesta | 70 % | la más cara y la más prescindible: el concepto ya trae su explicación |

Así un día de muchas dudas no puede dejar sin corrector al día siguiente.

**En la práctica**: donde antes cabían 30 llamadas al día ahora caben del orden
de 70 correcciones, o unas 50 explicaciones, o la mezcla que salga. El límite
por cuenta pasa a ser el 90 % del presupuesto —para que un segundo miembro no se
encuentre el día agotado— más un corte de 300 llamadas contra un bucle del
cliente.

## Lectura de la semana

Nueva sección en **Progreso → «Lo que se te está mezclando»**, y ruta nueva
`POST /api/analizar`.

Agrupa los conceptos fallados de la semana en dos a cuatro patrones —conceptos
que se confunden entre sí, un mecanismo mal entendido que arrastra a varios, una
disciplina que cede— y dice por dónde empezar. Cada patrón trae un botón que
abre una sesión con esos conceptos: el análisis termina en repaso, no en un
párrafo.

Qué sale del navegador: **identificadores del corpus y tres cifras** por
concepto (fallos, aciertos, tipo de error de una lista cerrada). Ni una
respuesta escrita, ni un texto libre. El material —afirmación, tema, disciplina,
sistema y las confusiones que el propio corpus declara— lo resuelve el Worker
contra Supabase, igual que hace la ayuda. La tarjeta enseña de antemano, en un
desplegable, exactamente lo que enviaría.

Lo que vuelve se comprueba antes de pintarlo: un patrón que cite un concepto que
no estaba en la semana invalida la respuesta entera. La lectura se cachea siete
días, así que abrirla varias veces cuesta una sola llamada.

## Que no entorpezca

- La lectura está **detrás de un botón** y nunca se pide sola.
- No cambia el dominio, ni las calificaciones, ni el orden de la repetición
  espaciada. Solo ordena lo que ya ocurrió.
- Todas las cifras de Progreso se siguen calculando en local. Si la IA no
  responde, no falta nada que no estuviera ya.
- Con menos de dos conceptos fallados la tarjeta no ofrece nada que leer.

## Estado de la cuota

`GET /api/ia/estado` devuelve lo que queda del día, y se responde aunque la IA
esté apagada: saber que no queda cuota es parte de la respuesta. La lectura de
la semana lo muestra al pie en porcentaje.

## Archivos

| archivo | qué |
|---|---|
| `src/server/neuronas.ts` | tarifas, presupuesto, estimación y liquidación |
| `src/server/worker.ts` | contabilidad en neuronas, modo `analizar`, ruta de estado, autorización compartida |
| `src/lib/semana-fallos.ts` | qué conceptos se fallaron y con qué error |
| `src/lib/analisis-ia.ts` | cliente de la lectura y de la cuota |
| `src/screens/LecturaSemana.tsx` | la tarjeta de Progreso |

## Qué mirar en la aplicación

1. **Progreso**, con fallos de esta semana: aparece «Lo que se te está
   mezclando», con el desplegable de lo que se enviaría.
2. Pulsar **«Leer mi semana con IA»**: dos a cuatro patrones, el enfoque, y un
   botón «Repasar estos N» por patrón.
3. El pie dice qué porcentaje queda del presupuesto gratuito de hoy.
4. En una sesión con respuestas escritas, la corrección con IA debería fallar
   por cuota bastante más tarde que antes.

## Pruebas

`src/server/neuronas.test.ts` (7), ampliación de `src/server/worker.test.ts`
(26 en total: techo por modo, liquidación con consumo real, tope por cuenta,
reinicio diario, validación de la lectura y flujo completo contra un corpus
falso), `src/__tests__/semana-fallos.test.ts` (5) y
`src/__tests__/lectura-semana.test.tsx` (4).

Total: 422 pruebas pasan, 2 omitidas, build sin errores de TypeScript.
