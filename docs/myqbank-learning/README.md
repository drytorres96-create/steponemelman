# Aprender antes de responder — MyQBank

El botón **Learn this concept** abre la explicación disponible en Tutor para los
10 formatos de conceptos. **Practice recall / Hide and recall** la oculta y
restaura la misma interacción, con su borrador. Una lectura se guarda como
**Studied with help**, sin fabricar una respuesta, fallo o calificación SRS.
El concepto cuenta como visto y como paso completado; los resúmenes distinguen
respuestas, estudio con ayuda y posiciones sin trabajar.

**Learning** en el constructor permite recuperar conceptos estudiados con ayuda.
Permanece pendiente hasta una respuesta correcta independiente posterior, respetando
la separación de horas de los criterios guardados. La práctica inmediata se marca
con `explicacion_previa`, incluso en otro bloque; los criterios de dominio existentes
siguen decidiendo cuándo hay dominio. Las lecturas sin respuesta no cambian la agenda
SRS. Una respuesta real sí utiliza el planificador existente.

En Test no se revela ayuda. **Learn in Tutor** crea un bloque Tutor nuevo mediante
el cambio de modo existente, conservando el examen y sus respuestas. Los resultados
Test continúan ocultos hasta terminarlo.

## Persistencia y revisión adversarial

- `StudyBlock.learning` es opcional; los estados antiguos siguen siendo legibles.
- La exposición se conserva al sincronizar dispositivos; ocultar la explicación
  no borra que se usó ayuda. La unión del estado retiene ayuda concurrente para
  el mismo intento, sin modificar su respuesta ni duplicarlo.
- La lectura no se suma como tiempo de respuesta. Tampoco concede evidencia
  independiente, un acierto ni dominio.
- El mapa y la precisión separan todos los intentos asistidos, acertados o fallados,
  de los intentos independientes. No se excluyen sólo los aciertos asistidos.
- Los originales clínicos, claves, versiones, firmas RPC y tablas no cambian.

Principios: divulgación progresiva y menor fricción (ADHD/diseño web), recuperación
con explicación oculta y distinción entre exposición y evidencia independiente
(neurocognición/revisor adversarial). No se hacen nuevas afirmaciones clínicas.

Validación: pruebas unitarias de compatibilidad, unión entre dispositivos y selección;
recorridos de navegador de recarga, lectura sin nota, práctica asistida, todos los
formatos y separación Tutor/Test. Capturas sintéticas antes/después a 390 y 1280 px,
con ambos temas, conservadas fuera del material clínico privado.

Evidencia visual sintética: [pregunta antes](screenshots/before-question-1280-dark.png),
[pregunta después](screenshots/after-question-1280-dark.png),
[aprendizaje en escritorio](screenshots/after-learning-1280-dark.png) y
[aprendizaje en móvil](screenshots/after-learning-390-light.png).
La carpeta también conserva el dashboard y las comparaciones móviles.
