# 1.21.0 — Hoy: el techo calibrado

Publicado el 26 de septiembre de 2026. Ajusta la portada de la 1.19.0 y la 1.20.0 al
encargo revisado: el techo diario ya no es el mismo todos los días, se calibró con
el estado real de la cuenta, y el recorrido de las cajas pierde la fricción entre un
ítem y el siguiente.

## Qué cambia

**El techo depende del tipo de día.**

| Día | Conceptos nuevos | Preguntas NBME | Cajas |
|---|---|---|---|
| Lunes a jueves | 10 | 5 | 40 |
| Sábado y domingo | 20 | 10 | 70 |
| Viernes | 0 | 0 | 0 |

El anillo interior suma los tres techos del día, ajustados a lo disponible: hasta
55 pasos entre semana y 100 el fin de semana. El día sigue empezando a las 3:00, así
que el sábado a las dos de la mañana todavía es viernes.

**El viernes va vacío a propósito.** Sale cerrado desde que amanece: sin botones,
sin cuentas, con una línea que lo dice. Lo que vence ese día no se pierde ni se
cuenta como deuda: entra en el techo del sábado, que por eso es más alto, y entra el
primero porque venció antes. Estudiar un viernes sigue siendo posible desde **Cuenta
y ajustes → Elegir contenido**, como cualquier otro extra.

**Las cajas pasan de 12 a 40 entre semana.** Si vencen más, el resto espera al día
siguiente en silencio, como hasta ahora: la pantalla no dice cuántas quedaron fuera.

## Por qué estos números

Salen de medir el progreso real el 25 de septiembre (175 conceptos tocados, 51
dominados, 674 intentos en 12 días activos, mejor día 117) y no se cambian a ojo:

- Con los criterios vigentes (3 recuperaciones, 2 sesiones, 48 h) un concepto cuesta
  una exposición nueva y tres de caja; unas 5,2 contando fallos.
- Con N conceptos nuevos al día, el estado estable pide unos 4 N repasos al día. El
  techo de cajas es el que gobierna todo: con 12, el motor se estrangulaba solo a
  tres o cuatro conceptos nuevos al día, por muy alto que estuviera el de lo nuevo.
- 10 nuevos entre semana piden 40 de caja; 20 el fin de semana piden 70, que además
  recogen lo que venció el viernes. Eso da unos 68–80 conceptos nuevos por semana y,
  con la adherencia real, unos 510 dominados en 60 días, que es la meta vigente.

## Las cajas, sin fricción

Un día entre semana son unos 55 ítems, unos 70 minutos. Los de caja son de
recuperación rápida, así que el paso de uno al siguiente tiene que ser inmediato:

- **Las preguntas NBME ya no descargan el catálogo entero en cada caja.** Antes, cada
  pregunta de caja pedía otra vez el catálogo del banco (~180 KB) antes de mostrarse.
  Ahora se reutiliza el que llegó hace menos de diez minutos. Fuera de las cajas,
  empezar un bloque sigue refrescándolo siempre, porque es la comprobación de que el
  banco no cambió entre medias.
- **Cada caja empieza arriba.** La explicación larga de la anterior ya no deja la
  siguiente pregunta fuera de la vista.
- **La cabecera no se mueve** mientras se prepara la caja siguiente; sólo cambia lo de
  debajo.
- **Con teclado no hace falta el ratón:** la respuesta escrita recibe el foco al
  aparecer y, corregida, «Siguiente pregunta» también. Escribir, Intro, leer, Intro.

Nada de esto cambia qué se registra ni cómo se corrige.

## Cómo está hecho

- `src/lib/dia.ts`: `TipoDia`, `TECHOS`, `DIA_VACIO` y `tipoDeDia`, con el corte de
  las 3:00. `estadoDelDia` devuelve el tipo y usa sus techos. Sigue siendo una
  función pura del historial y la fecha: no hay tablas ni columnas nuevas.
- `src/lib/cajas.ts`: el techo de cajas es el del tipo de día. El viernes no entra
  nada; lo vencido sigue vencido y se ordena por delante al día siguiente.
- `src/screens/Hoy.tsx`: la presentación del viernes. Tampoco depende de que carguen
  las sesiones de la semana: si no llegan, el viernes sigue cerrado y sin avisos.
- `src/nbme/NbmeProvider.tsx`: `startSession` acepta `reuseRecentCatalog`; sólo lo
  usan las cajas.
- `src/screens/SesionCajas.tsx` y `src/screens/Reproductor.tsx`: desplazamiento,
  cabecera estable y foco, sólo en el modo caja.

## Pruebas

- `dia.test.ts` (15): los techos por tipo de día y el corte de las 3:00 en el cambio
  de tipo; el día cierra exactamente en 10 + 5 entre semana y en 20 + 10 en sábado y
  domingo; el viernes sale cerrado desde que amanece, con los techos en cero.
- `cajas.test.ts` (15): con 90 vencidas entran 40 entre semana y ninguna función
  devuelve 90 ni 50; el viernes no entra ninguna caja aunque venzan; el sábado el
  techo es 70 y recoge primero lo que venció el viernes.
- `hoy.test.tsx` (16): el viernes, sin botones ni cuentas aunque haya material y
  cajas, y cerrado aunque no lleguen las sesiones; el fin de semana muestra 20, 10 y
  70.
- `reproductor-caja.test.tsx`: el foco en la respuesta y en «Siguiente pregunta».
- `nbme/provider.test.tsx`: el catálogo reciente se reutiliza sólo cuando se pide y
  nunca pasados diez minutos.
- Las pruebas del motor y de la portada que usaban el viernes 25 como «hoy» pasan a
  un jueves. `ui-navigation.test.tsx` fija también un jueves: usaba el reloj real y,
  con el viernes vacío, habría fallado cualquier viernes.

Total: 511 pruebas, 509 pasan y 2 omitidas (las de siempre). Build sin errores de
TypeScript.
