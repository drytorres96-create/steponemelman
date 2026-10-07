# Auditoría y recálculo de la meta

Etiquetas: coach, productividad, revisor adversarial. Principio docente: separar exposición, práctica y evidencia de recuperación; la separación temporal y la independencia de las respuestas acreditan dominio, no el número de pantallas abiertas.

La ventana acordada tiene 60 días de calendario, del 25 de septiembre al 23 de noviembre de 2026, ambos incluidos. El día de estudio empieza a las 03:00 de America/New_York. La línea de hoy usa los días ya cerrados: en el día 13 han cerrado 12. El 24 de noviembre a las 03:00 la ventana queda cerrada. Las etiquetas del 23 de noviembre y del examen del 21 de diciembre están separadas por cuatro semanas de calendario. Desde el cierre efectivo hasta el examen a las 08:00 hay 27 días y 5 horas: unas cuatro semanas, no cuatro semanas completas de tiempo disponible.

## Qué mide cada cantidad

- **Conceptos vistos:** IDs únicos de material Melman realmente presentado, más la práctica histórica que implica una presentación. Ver una recomendación o generar un ejercicio IA no cuenta como ver el concepto.
- **Práctica:** respuestas registradas del mismo `concept_id`, venga de Hoy, ponerse al día, estudiar un módulo o recuperación NBME. Todas las rutas comparten FSRS y criterios guardados.
- **Dominio demostrado total:** conceptos publicados que cumplen los criterios guardados hoy. La cuenta vigente exige tres respuestas correctas independientes, dos sesiones distintas, separación de al menos 48 horas, recuperación activa y ausencia de confusión reciente; no hay una regla diferente para recuperación NBME.
- **Conceptos de esta meta:** los que cumplen esos criterios hoy y cuyo primer hito de acreditación conocido cae en la ventana. Un hito anterior no se convierte en nuevo por recuperarlo durante la ventana. Una fecha desconocida no se inventa ni se interpreta como acreditación anterior.
- **Preguntas de esta meta:** pregunta NBME publicada y calificable respondida por primera vez en la ventana; acierto y fallo cuentan como respuesta. Reintentos, cambio de revisión y ejercicios IA no añaden una segunda pregunta.

## Línea de planificación

Los techos se conservan: viernes 0; lunes a jueves 10 conceptos y 5 preguntas; sábado y domingo 20 y 10. No se modificaron los pesos FSRS ni los criterios para hacer subir la barra.

Si `C(n)` suma los techos de conceptos durante los primeros `n` días de la ventana y `P(n)` los de preguntas:

```
Línea de conceptos tras n días cerrados = 510 × C(max(0, n − 7)) / C(53)
Línea de preguntas tras n días cerrados = 255 × P(n) / P(60)
C(53) = 610; C(60) = 690; P(60) = 345
```

La semana de retraso en conceptos es un supuesto de planificación; no acredita automáticamente dominio a los siete días. La UI redondea la marca de la línea al entero más próximo. Ambas líneas deben ser monótonas, permanecer entre cero y su meta y llegar a 510/255 al cerrar el día 60, sin seguir creciendo después.

Con las metas completas, la línea avanza unos 8,36 conceptos y 3,70 preguntas por día entre semana, el doble el fin de semana, y cero el viernes. La línea de conceptos sigue el calendario de siete días atrás. Su avance no exige superar los techos diarios. Si el material publicado disponible es menor que la meta, la meta y toda su línea se reducen proporcionalmente.

La disponibilidad descuenta primeros hitos anteriores conocidos y validados, aunque el concepto haya perdido dominio hoy. Ese conjunto histórico se entrega como `primerasAcreditaciones`; la cantidad hecha en la ventana conserva sólo los dominios actuales con fecha válida. Validar el hito exige que el prefijo del historial hasta ese instante cumpla los criterios: no se inventa una nueva fecha ni se reescribe el estado de la cuenta.

## Recálculo de la cuenta, sólo lectura

Snapshot del **7 de octubre de 2026 a las 16:33:24 de Nueva York**; revisiones de progreso 8916 y NBME 2007. Cálculo puro sobre una copia privada, usando las funciones de la aplicación; no se escribieron datos, intentos, hitos ni fechas. El catálogo contrastado contiene 2079 IDs Melman y 592 preguntas calificables. Este documento contiene sólo agregados.

| Magnitud | Conceptos | Preguntas NBME |
| --- | ---: | ---: |
| Cumplen criterios hoy / primeras respuestas históricas | 31 | 63 |
| Anteriores a la ventana | 14 | 40 |
| Cuentan en esta meta | 17 | 23 |
| Meta | 510 | 255 |
| Línea al empezar el día 13 | 50 | 52 |
| Faltan para igualar la marca de hoy | 33 | 29 |
| Faltan para superar esa marca por una unidad | 34 | 30 |
| Faltan para completar la meta final | 493 | 232 |

Hay 201 conceptos con práctica registrada y 33 primeros hitos históricos validados; 31 cumplen los criterios hoy. De esos 31 con dominio demostrado, 28 tienen mantenimiento al día y 3 tienen repaso pendiente. Esos tres siguen contando como dominio demostrado. No hay hitos sin fecha entre los 31 actuales. La proyección aún no debe mostrarse: empieza en el día 15, **9 de octubre**, cuando han cerrado 14 días.

La marca sin redondear del día 13 es `510 × 60 / 610 = 50,163934…` y `255 × 70 / 345 = 51,739130…`; las diferencias publicadas usan las marcas visibles de 50 y 52. El margen del rumbo es `max(3, round(línea × 0,10))`, cinco unidades para ambas marcas. «Dentro del margen» no significa igualdad exacta: las diferencias exactas siguen disponibles.

## Avance, retroceso y mantenimiento

Una primera respuesta NBME nueva en la ventana aumenta su barra una unidad. Una respuesta Melman aumenta la práctica, pero la barra de dominio sólo aumenta al cumplir los criterios compartidos. Una pantalla vista aumenta cobertura vista, sin fabricar un acierto. Un fallo Melman puede retirar evidencia vigente según la regla existente y reducir la cantidad de conceptos acreditados; el historial y su primer hito se conservan. Un repaso vencido por el paso del tiempo conserva la acreditación y cambia a mantenimiento pendiente. El reloj hace avanzar la marca esperada al cerrar cada día elegible aunque la cantidad hecha no cambie.

Igualar o superar **la marca de hoy** es distinto de completar **la meta del 23 de noviembre**. Una cola de recuperación puede aportar evidencia para los conceptos pendientes; completarla no garantiza acreditar 33 conceptos en una sesión. El dominio necesita tiempo e independencia.

## Proyección y capacidad

A partir del día 15, se compara lo acreditado/respondido en los últimos siete días cerrados con el avance de la línea en ese intervalo. El ritmo se extrapola al resto de la línea y se limita al material disponible. Las respuestas nuevas de hoy mueven la barra pero no alteran ese intervalo cerrado. Una proyección igual a la meta **la alcanza**, no está por encima; superar exige una cantidad estrictamente mayor.

Para el tramo del día 13 al 60, los techos habituales ofrecen hasta 550 exposiciones nuevas, 275 primeras respuestas NBME y 2060 plazas de cajas. Hasta el día 53 —dejando siete días de consolidación antes del cierre— ofrecen 470 exposiciones nuevas. Son capacidades de planificación de Hoy, no garantía de asistencia, material semanal disponible, aciertos ni dominio. La diferencia NBME final de 232 cabe dentro de las 275 plazas previstas; los 493 dominios restantes también dependen de conceptos que ya están en proceso y de evidencia futura. No se convierten en deuda automática ni se eleva el techo para forzar la meta.

## Hallazgos corregidos y comprobados

1. El calendario original depende de la zona del dispositivo. Las pruebas deben fijar Nueva York y cubrir el cambio de hora del 1 de noviembre; entre los cortes de las 03:00 del 31 de octubre y del 1 de noviembre transcurren 25 horas, aunque sólo avanza un día de calendario.
2. La función pública de línea de conceptos podía superar 510 al recibir más de 60 días, aunque el resumen la limitaba. Debe quedar limitada en su propia frontera.
3. Un hito sin fecha representado por cero podía descontarse como anterior a la ventana. Las fechas no conocidas deben excluirse del recuento temporal.
4. La etiqueta de proyección trataba la igualdad como «por encima». Debe distinguir alcanzar de superar.
5. La diferencia exacta y el rumbo con margen necesitan contratos separados para que «en la línea» no oculte cuánto falta para igualar o superar su marca.

Se unificaron también las fronteras de Hoy, títulos de sesiones, calendario semanal y anillos de evidencia: semana de lunes a lunes a las 03:00 de Nueva York, aritmética de calendario durante DST, domingo opcional al final de su semana y exclusión de respuestas fechadas en el futuro. Las etiquetas de fecha conservan la misma fecha en UTC, Tokio, Honolulu y Nueva York.

Las pruebas verifican corte horario, extremos de ventana, DST, invariantes de la línea, primera respuesta única, ausencia de fechas inventadas, cambios de cobertura sin dominio ficticio, cantidades exactas de igualar/superar y conservación de los techos y del orden de Hoy.
