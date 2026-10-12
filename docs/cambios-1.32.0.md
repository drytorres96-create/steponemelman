# Meta reiniciada y día de arranque 1.32.0

Decidido por Yoel el 12-oct-2026, en el chat del proyecto, tras revisar con él cómo
iba la meta.

## Por qué

El 12-oct, día 18 de la ventana anterior (25-sep → 23-nov), «Cómo va todo» decía
«Vas 83 por debajo» en conceptos y «48 por debajo» en preguntas, con una proyección
de ~17 conceptos al 23-nov. La distancia no venía de los días sin estudiar: en la
racha del 3 al 7 de octubre, cinco días seguidos con unas 360 respuestas, la línea ya
iba por delante. La meta de 510 asumía los techos completos todos los días (10 nuevos,
40 cajas y 5 preguntas entre semana: 55 pasos, más de una hora solo de Melman), y con
los criterios de dominio vigentes —tres aciertos independientes separados 48 h— cada
concepto tarda de cinco a siete días en contar. Una meta así solo sirve para sentirse
detrás, y estaba haciendo que Yoel dejara de abrir la aplicación.

Además no encajaba con el papel que él le da a Melman en su plan: arranque diario de
cinco conceptos y mantener vivos los sistemas cerrados. Melman consolida; AMBOSS y los
simulacros miden.

## Qué cambia

- **Techos del día** (`src/lib/dia.ts`): entre semana 5 conceptos nuevos, 0 preguntas
  NBME nuevas y hasta 20 cajas; fin de semana 10, 5 y 35; el viernes sigue vacío.
  Cinco nuevos piden unas 20 cajas al día con los criterios actuales.
- **Ventana de la meta** (`src/lib/meta.ts`): del lunes 12-oct al lunes 23-nov, 43 días.
  El final no se mueve: siguen quedando cuatro semanas de consolidación antes del
  examen del 21-dic. Lo dominado antes del 12-oct queda como base («Dominio demostrado
  total») y no cuenta para esta meta, así que la línea arranca hoy en cero.
- **Metas**: 180 conceptos con dominio demostrado y 44 preguntas NBME respondidas.
  Misma regla que la calibración del 25-sep (docs/cambios-1.21.0.md): 510 sobre 690
  de techo, un 74 %, aplicado a los 245 de techo de la ventana nueva da 181, redondeado
  a 180; las preguntas guardan la proporción de sus techos (60 frente a 245) → 44.
- El retraso de dominio (7 días) y la espera de la proyección (14 días) no cambian.
- Preguntas frecuentes: las preguntas sólo avanzan el fin de semana.

## Qué no cambia

Criterios de dominio, escalera de cajas 24/48/72 h, escalera de preguntas NBME,
planificador, historial de intentos, corpus y banco. Ningún dato guardado se reescribe:
la meta, como el estado del día, sale del historial y de la fecha.

## Efecto conocido

Entre semana no entran preguntas nuevas, así que «Ponerme al día» no puede ofrecer
preguntas de lunes a jueves; si solo la línea de preguntas va por debajo, ese día
ofrece cajas o conceptos y la de preguntas se recupera el fin de semana.
