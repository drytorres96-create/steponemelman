# 1.10.1 — «Cerca de dominio» deja de prometer lo que no puede cumplir

Publicado el 14 de septiembre de 2026.

## El fallo

Yoel completó una sesión de «Cerca de dominio» con seis conceptos, acertó los
seis, y ninguno se marcó como dominado. No era un problema de sincronización:
`study_state` tenía los seis intentos guardados y el estado se recalcula en vivo
en todas las pantallas.

Los seis fallaban **el mismo criterio, y no era el conteo de aciertos**:

| concepto | aciertos independientes | separación real | exigida |
|---|---|---|---|
| CPT-ENDOCRINE-002 | 3 | 15,6 h | 96 h |
| CPT-ENDOCRINE-005 | 3 | 15,6 h | 96 h |
| CPT-ENDOCRINE-012-f4c5531a | 3 | 15,8 h | 96 h |
| CPT-ENDOCRINE-014-4d4bfb31 | 3 | 15,7 h | 96 h |
| CPT-NEURO-PART-I-005 | 3 | 15,7 h | 96 h |
| CPT-ENDOCRINE-018-d85b859e | 4 | 40,5 h | 96 h |

El origen estaba en `calcularEstado`: devolvía `proximo_dominio` mirando **sólo**
el número de aciertos vigentes, ignorando los otros cinco criterios. Recuperación
listaba ese estado bajo «Con un acierto más cruzan el umbral. Son los más baratos
de cerrar» y ofrecía «Consolidar ahora». Pero lo que faltaba era **tiempo**, y el
reloj de la separación no se adelanta respondiendo otra vez: tres aciertos en una
tarde siguen siendo una tarde, que es justo lo que las 96 h existen para evitar.

Peor aún, al seguir contando aciertos, los conceptos reaparecían al día siguiente
en la misma lista invitando a repetirlos sin que eso acercara nada.

## La corrección

`src/srs/cercania.ts` es lógica pura con pruebas propias. No reimplementa las
reglas: simula un acierto independiente ahora mismo y le pregunta a
`evaluarDominio` qué pasaría.

- `bastaUnAcierto` — un acierto registrado ahora cruzaría el umbral.
- `esperandoSeparacion` — ya tiene todo salvo el tiempo.
- `disponibleDesde` — primer acierto **vigente** más las horas de separación. Un
  acierto nuevo se añade al final y no mueve ese punto de partida.

`evaluarDominio` gana una `clave` estable por criterio (`aciertos`, `sesiones`,
`separacion`, `pistas`, `activa`, `confusion`) para poder razonar sobre ellos sin
leer el rótulo, y `aciertosVigentes` se exporta.

En Recuperación:

- **«Cerca de dominio»** sólo lista ahora los que de verdad cierran hoy con un
  acierto más.
- **«Esperando separación»**, nuevo grupo, lista los que ya tienen los aciertos y
  dice **cuándo** se acreditan. Sin botón principal: el botón que hay es
  «Repasarlos igualmente», marcado como refuerzo voluntario.
- La tabla del planificador gana una columna **«Qué falta»** con los criterios
  pendientes de cada concepto.

En el reproductor, al terminar un concepto en esa situación, el detalle de
dominio dice que los aciertos ya están, desde qué día se acredita, y que
repetirlo antes no adelanta ese reloj.

## Lo que no se ha tocado

Los criterios de dominio siguen exactamente donde estaban: 3 recuperaciones, 2
sesiones, 96 h de separación, sin pistas, recuperación activa y 7 días sin
confusiones. Cambiarlos es decisión de Yoel, no una consecuencia de este fallo.
Lo que se corrige es que la aplicación decía «un acierto más» cuando lo que
faltaba era esperar.
