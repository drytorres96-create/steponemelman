# 1.9.0 — Sesiones que se cierran solas y progreso con horizonte

Publicado el 13 de septiembre de 2026.

## Una sesión se marca completada por evidencia, no por haber pasado páginas

`src/semana/cobertura.ts` define el criterio y se prueba aparte. Un paso cuenta
como hecho cuando hay evidencia registrada: un intento del concepto con el
`session_id` de esa sesión, o una respuesta enviada de esa pregunta en su bloque
NBME. Cuando la evidencia cubre el **85 %** de los pasos, la sesión se marca
`completada` sola —sin esperar al último paso— y no vuelve atrás.

Tres decisiones detrás del número:

- **No es el 100 %**: un concepto retirado del corpus o una pregunta que no carga
  dejarían la sesión colgada para siempre. En un guion de veinte pasos, 85 % son
  diecisiete.
- **Acertar no entra en el criterio.** Completar una sesión es haber hecho el
  trabajo; que el concepto quede dominado lo siguen decidiendo los criterios de
  dominio y el planificador, en repasos posteriores.
- **Llegar al final no basta.** El cursor sólo dice por dónde va el recorrido. Si
  se llega al final sin responder, la pantalla de cierre dice cuántos pasos
  faltan y ofrece volver al primero que quedó sin evidencia.

La tarjeta de «Mi semana» enseña ahora `N de M pasos respondidos` con su barra, y
una sesión ya completada con pasos sueltos sin responder conserva un botón para
retomarlos.

## Progreso semanal y general

Progreso tiene dos ventanas, con un selector propio junto al de Conceptos /
Preguntas. **Esta semana** cuenta desde el lunes: conceptos que cruzaron a
dominio, conceptos respondidos, preguntas NBME respondidas y sesiones de la
semana completadas. **General** mide todo el historial contra el corpus completo
y conserva el ritmo de las últimas cuatro semanas frente al necesario.

## Progreso por forma NBME

`src/nbme/formas.ts` calcula, por cada forma (27, 28, 29) y con ventana temporal:
preguntas vistas, correctas, incorrectas, acertadas a la primera y reincidentes,
más una barra con el porcentaje de cobertura de la forma.

- **Correctas / incorrectas** describen cómo quedó el *último* intento, así que
  corregir un error mueve la pregunta de una columna a la otra.
- **A la primera** es el primer intento registrado de esa pregunta en toda su
  historia: repetir en enero una pregunta fallada en diciembre no lo convierte en
  un primer intento limpio.
- **Reincidentes** son las falladas dos veces o más: un despiste no cuenta.

## Visión a futuro: el material en diez semanas

`src/lib/plan-horizonte.ts` reparte lo que queda —conceptos por dominar y
preguntas por responder— entre diez semanas, con pesos decrecientes `10, 9, … 1`:
las últimas semanas antes del examen valen más para consolidar que para absorber
material nuevo. El reparto se recalcula entero en cada visita desde lo que de
verdad queda, así que avanzar más de lo previsto baja los objetivos siguientes y
perder una semana los sube. La tabla enseña el objetivo de cada semana y el
acumulado, y la semana en curso compara el objetivo con lo que ya llevas.

## Secciones retiradas

Por petición de Yoel se eliminan por completo:

- «¿Puedes aplicarlo en una pregunta nueva?» (el piloto de variantes) en Progreso.
- «Respuestas por revisar» en Progreso.

Las funciones de `src/lib/variantes.ts` siguen en su sitio con sus pruebas; lo que
desaparece es la sección de la interfaz.
