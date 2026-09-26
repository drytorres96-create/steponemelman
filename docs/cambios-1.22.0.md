# 1.22.0 — Visión a futuro: la meta de 60 días

Publicado el 26 de septiembre de 2026. La «Visión a futuro» de **Cómo va todo** deja
de repartir el corpus en diez semanas y pasa a ser la meta de 60 días que eligió
Yoel: **510 conceptos dominados y 255 preguntas NBME entre el 25 de septiembre y el
23 de noviembre**. Enseña cuánto lleva, dónde va la línea y adónde le lleva el ritmo,
sin pedir nunca más de lo que Hoy da en un día.

## Por qué

La sección repartía todo lo que quedaba del material —2.045 conceptos y 407
preguntas— en diez semanas, cargando las primeras. Esta semana pedía 372 conceptos y
74 preguntas, cuando los techos de Hoy dan unos 80 y 40. Una meta que el día no puede
cumplir sólo sirve para sentirse detrás, y eso es justo lo contrario de los anillos.

## Qué cambia

**La meta.** Del viernes 25-sep al lunes 23-nov: 60 días. Las cuatro semanas
siguientes, hasta el examen, quedan para consolidar.

- **510 conceptos dominados.** Es la meta calibrada de la 1.21.0 y ya descuenta los
  días que no se cumplen: no pide cerrar Hoy todos los días.
- **255 preguntas NBME.** Yoel pidió que tuvieran meta propia. Su techo es justo la
  mitad del de conceptos (5 y 10 frente a 10 y 20), así que su meta es la mitad.

**Dos barras**, una por meta, con lo hecho desde el 25-sep y una marca donde va la
línea.

**La línea** es el camino a la meta al paso de los techos de Hoy: nada el viernes, el
doble el fin de semana, y llega a la meta el 23-nov. En conceptos va una semana por
detrás, lo que tarda uno en quedar dominado (la exposición y tres cajas a 1, 2 y 3
días); una pregunta cuenta el mismo día en que se responde. Nunca va más deprisa que
los techos: avanza a un 84 % de lo que dan en conceptos y a un 74 % en preguntas, y
por eso ya cuenta con días malos.

**Cómo vas**, en una línea bajo cada barra: «Vas 13 por delante», «Vas en la línea»
o «Vas 21 por debajo». Un margen del 10 % —tres como poco— cuenta como ir en la
línea: un día flojo o un sábado todavía por hacer no es ir detrás. Ir por debajo no
lleva color ni aviso; sólo la distancia.

**La proyección**: «Si sigues como la última semana: ~411 el 23 nov». Sale a partir
del 9 de octubre: la primera semana la infla lo que ya venía en camino de antes del
25-sep, y antes de dos semanas no hay ritmo que proyectar. Se calcula con lo hecho
hasta el principio de hoy, así que no cambia a lo largo del día.

**La tabla**: dónde va la línea al terminar cada semana, hasta el 23-nov, con la
semana de hoy marcada. Ninguna semana pide más de lo que dan los techos en esa
semana. En el teléfono va en tres columnas para que quepa a lo ancho.

## Decisiones de detalle

- **Qué cuenta como dominado:** cumplir los criterios de dominio, igual que una caja
  cerrada en Hoy, con la primera vez que se cumplieron dentro de la ventana. Un repaso
  FSRS vencido no lo descuenta: Hoy no ofrece esos repasos, y la cifra bajaría sin
  nada que hacer para evitarlo. La sección anterior sí lo descontaba.
- Lo dominado antes del 25-sep no cuenta, ni lo que llegue después del 23-nov.
- Una pregunta cuenta la primera vez que se responde, si está publicada y es
  calificable. Repetir una antigua no suma.
- Si no quedara material para cumplir una meta, la meta baja a lo que existe: nunca
  pide algo que no hay.
- Mientras carga el banco NBME, la meta de preguntas no se recorta a cero; sale
  «Cargando las preguntas NBME…».
- Nada se guarda: como el estado del día, sale del historial y de la fecha.

## Lo que se retiró

El reparto en diez semanas: `src/lib/plan-horizonte.ts`, `ProgresoHorizonte.tsx` y
sus 9 pruebas de `plan-horizonte.test.ts`.

## Cómo está hecho

- `src/lib/meta.ts`: la ventana, las metas, la línea, el rumbo, la proyección y la
  tabla, en funciones puras de la fecha y el historial. `primerasRespuestasNbme` saca
  la primera respuesta de cada pregunta publicada.
- `src/screens/ProgresoMeta.tsx`: la sección, dentro de **Cómo va todo**.
- `src/hoy.css`: las barras y la marca de la línea. `editorial.css` y `cinema.css`
  conservan el estilo de la tabla con su nombre nuevo.

## Pruebas

- `meta.test.ts` (15): la ventana del 25-sep al 23-nov con el corte de las 3:00 y
  las cuatro semanas de consolidación; 510 y 255, con la cuenta que obliga a
  recalibrar si cambian los techos; la línea sigue los techos, se para el viernes,
  dobla el fin de semana, va una semana por detrás en conceptos y nunca va más
  deprisa que los techos; el margen del rumbo; sólo cuenta lo de la ventana y lo que
  ya pasó; la primera respuesta de cada pregunta; la proyección espera dos semanas,
  sigue el ritmo de la última y no baila con lo de hoy; la tabla semana a semana; la
  meta baja si no hay material.
- `progreso-meta.test.tsx` (7): las dos metas, el día y lo hecho; la línea y la
  distancia, sin alarma por debajo; la proyección y cuándo sale; la tabla; un repaso
  vencido no descuenta un concepto dominado; el banco cargando; antes y después de la
  ventana.
- `hoy.test.tsx` y `ui-navigation.test.tsx`: **Cómo va todo** enseña la meta de 60
  días.

Total: 524 pruebas, 522 pasan y 2 omitidas (las de siempre). Build sin errores de
TypeScript.
