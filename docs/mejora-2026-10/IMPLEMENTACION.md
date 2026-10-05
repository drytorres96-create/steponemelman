# Dominio, mantenimiento y diseño de StepOneMelman

Solicitud del 5 de octubre de 2026: implementar los cambios de repetición espaciada, corregir la exclusión del mantenimiento y completar el diseño propuesto. Continúa la auditoría ya fusionada en PR46; esta tarea autoriza expresamente los cambios de criterios, métodos y diseño que antes se presentaron como propuestas. La autorización incluye fusionar los lotes verdes. Base: `7610e317abf1de2536788805ca3abc7ea2f6b6f0`.

## Resultado implementado

| Petición | Implementación y comprobación |
| --- | --- |
| Repasar lo dominado cuando vence | `cajasDelDia` incluye conceptos acreditados cuya fecha FSRS canónica vence. Mantenimiento no usa la escalera inicial de 24/48/72 h. La lista se fija al inicio del día y respeta 40/70 repasos y viernes libre. Regresiones en `cajas.test.ts`. |
| Dominio por evidencia real | Se conservan tres aciertos independientes, dos sesiones, separación de 48 h y siete días sin confusión reciente. Además se exige al menos un recuerdo sin alternativas o una aplicación independiente vigente. Se retira la multiplicación teórica de azar como puerta. La retención estimada sigue como indicador. Evaluador `2.3.0`. |
| Métodos de recuperación alcanzables | Presentación V3 alterna reconocimiento y recuperación autorizada por la semilla guardada. Usa la canónica breve completa, sin crear contenido. No convierte casos, variantes, respuestas largas, preguntas que muestran la respuesta o que dependen de las opciones. Examen y correcciones conservan sus opciones. V1/V2 se reconstruyen exactamente. Worker y navegador admiten las tres versiones y comprueban la huella. |
| Repasos finales repartidos | Las propuestas posteriores al horizonte se distribuyen determinísticamente por ID en la ventana de los últimos catorce días, excluyendo viernes (doce fechas útiles) y sin pasar del 20-dic. El reparto no garantiza una cuota por fecha; la ejecución conserva el techo diario. Fechas antiguas comprimidas al 20-dic se interpretan canónicamente sin mutar el payload ni variar la cola tras una respuesta. |
| Estado actual comprensible | Un contrato compartido distingue actividad, dominio demostrado y mantenimiento al día/pendiente. Agenda nula o reaprendizaje sin confirmación se indican como mantenimiento por comprobar. `dominado_en` conserva el hito histórico. Progreso, Biblioteca y tabla diaria comparten significados. |
| Resultados observados | Acierto inicial, acierto independiente tras ≥30 días y errores repetidos tras ≥24 h tienen denominadores explícitos y desglose de recuerdo/discriminación/aplicación. Versiones desconocidas y prácticas asistidas no acreditan esas comparaciones. |
| Portada clara | Hoy presenta una acción principal para el siguiente paso pendiente, objetivo dentro del techo diario, siguiente bloque, avance y cantidad restante. Biblioteca, Progreso y Cuenta quedan en navegación secundaria. El cierre explica lo realizado y dónde retomar. |
| Ritmo y atención | Bloques pequeños y paso visible conservan el guion y los IDs. En cajas, las correcciones se etiquetan aparte sin fabricar «paso 3 de 2». Pregunta, entrada y comprobación están cerca; confianza y ayudas son discretas. Dato decisivo y explicación de la elección preceden al desarrollo completo. |
| Motivación verificable | «Retomamos aquí», mejora tras un fallo de otro día, hitos independientes tras ≥24 h y pausa opcional al cerrar un bloque. Los hitos de dominio sólo se clasifican si el historial hasta su fecha cumplía los criterios actuales. No se inventan fechas para acreditaciones antiguas por reconocimiento. No hay rachas, rankings ni avisos continuos. |
| Estilo coherente | Verde bosque, lectura cálida, dorado reservado para avances e hitos. Tipografía, espaciado, bordes, foco y estados coherentes. Fotografías en portada; al estudiar se desmonta el paisaje. Figuras y casos conservan su protagonismo y contenido completo. |
| Rendimiento | Los indicadores iniciales usan IDs del índice y progreso. Corpus y correspondencia por temas sólo se descargan al solicitar el detalle. Calendario y adherencia se montan al desplegarlos. Biblioteca reutiliza índice de búsqueda, IDs deduplicados y cálculos por módulo; sus filtros mantienen la selección exacta. Cachés y carga diferida de figuras continúan. |
| Móvil y accesibilidad | Revisión a 390/1280 px, controles de al menos 44 px, safe-area, navegación con teclado, foco restaurado y movimiento reducido. Revisión adicional a 320/380 px y horizontal. |

## Compatibilidad y límites

- No se consultaron ni escribieron bases reales. No hay migraciones ni cambios de RPC, corpus, banco, revisiones, cuotas o credenciales. Los fixtures son sintéticos.
- `study_state` y `nbme_state` actuales y antiguos cargan. Historial, borradores, continuación, colas ampliadas y lápidas se conservan. La nueva versión de presentación es opcional; ausencia significa V1.
- Acreditaciones antiguas obtenidas sólo entre alternativas pueden pasar a aprendizaje hasta demostrar recuperación o aplicación. El historial y el hito guardado permanecen.
- Un concepto sin formato de recuperación autorizado ni caso publicado conserva sus métodos editoriales. No se fabrica una pregunta para poder acreditarlo.
- Tiempo aproximado sólo con al menos cinco duraciones válidas por cada tipo necesario. Mediana, exclusión de interrupciones largas y rango orientativo; la lectura de explicaciones añade tiempo. No es un límite.
- FSRS sigue siendo el modelo simplificado existente, con sus pesos. El 90 % es estimado, no una probabilidad clínica calibrada para Yoel.

## Principios de las decisiones

Coach y aprendizaje: práctica de recuperación y comprobación diferida (Roediger y Karpicke, 2006; Dunlosky et al., 2013). Acertar con pistas o después de ver la explicación se conserva como trabajo, pero no acredita la misma independencia. Aplicar exige un caso publicado, no una etiqueta inventada.

Diseño y productividad: una entrada principal, divulgación progresiva, bloques con final visible y retorno concreto. El diseño para atención es una hipótesis de producto que debe contrastarse con la experiencia de Yoel; las pruebas de interfaz no demuestran un efecto clínico sobre ADHD.

Revisor adversarial: criterios alcanzables, denominadores coherentes, evidencia histórica conservadora, frontera del horizonte, agenda conocida, compatibilidad de formato y ausencia de pistas involuntarias.

## Lotes y validación

Los lotes se registran como commits acotados. Cada snapshot ejecuta Node22, `npm ci`, `npm test`, `npm run build` y las pruebas de Chromium, y recibe revisión adversarial. La fusión requiere CI verde sobre el HEAD exacto y `mergeable_state: clean`.

La referencia anterior pasó 617 pruebas +2 omisiones, build y29 pruebas de navegador. Todas las puertas de los cinco lotes pasaron; `validacion/` contiene su salida resumida real y `validacion.json` identifica los snapshots completos.

| Lote | Snapshot del código | npm ci | Pruebas unitarias | Build | Chromium |
| --- | --- | --- | --- | --- | --- |
| 1 · evidencia, métodos y mantenimiento | `44194a2` | verde | 674 +2 omisiones | verde | 29 |
| 2 · indicadores y carga | `7fbfee2` | verde | 701 +2 omisiones | verde | 29 |
| 3 · base visual | `1d51475` | verde | 701 +2 omisiones | verde | 29 |
| 4 · Hoy y metas | `c5d6f58` | verde | 707 +2 omisiones | verde | 29 |
| 5 · sesión y pulido | `085abc0` (snapshot local) | verde | 708 +2 omisiones | verde | 37 |

Después de estas puertas se incorporaron únicamente este informe, las salidas y las64 capturas a `docs/`; el código de la aplicación coincide con el snapshot del lote5. El CI comprueba el HEAD definitivo antes de fusionar. Versión visible: **1.26.0**. No se cambiaron dependencias.

Capturas `antes/` y `despues/`: datos sintéticos iguales, reloj 5-oct-2026, Nueva York, 390 y1280 px, movimiento reducido. La pantalla propia de Progreso y la escena de mantenimiento son nuevas; sus referencias anteriores son los indicadores dentro de Hoy, no una pantalla anterior inexistente.

`lotes/1` a `lotes/4` conserva las pantallas pertinentes de cada snapshot; `lotes/5` usa el código final de sesión. Las referencias de cada paso son el snapshot anterior y `antes/` para el primero. Las medidas de accesibilidad incluyen controles realmente visibles, ambas pieles, foco y animaciones reducidas. Todas las imágenes utilizan exclusivamente el arnés sintético.

| Medida sintética | Antes | Después |
| --- | --- | --- |
| Posición vertical del CTA de cajas a390 px | 850 px | 695 px |
| Posición vertical del CTA de cajas a1280 px | 561 px | 651 px |
| Toques desde Hoy al siguiente ejercicio | 1 | 1 |
| CTA principal visible en Hoy abierto | 2 | 1 |
| CTA de estudio al cerrar el día | 0 | 0 |
| Desbordamiento en390/1280 | 0 | 0 |

El CTA móvil entra en la primera pantalla de844 px. En escritorio el bloque explícito de objetivos ocupa más altura y el CTA sigue visible. No se ha medido el tiempo humano hasta responder ni la motivación real. La revisión visual final verifica pregunta, respuesta, feedback, NBME, figuras, menú, biblioteca, progreso y cierre.

Cloudflare despliega al fusionar a main. El entorno remoto bloquea el acceso a `workers.dev`: el intento de comprobarlo el5-oct a23:16 UTC recibió un403 del túnel de red, que no describe el estado del sitio. Comprobación pendiente en [steponemelman.yoeltorres.workers.dev](https://steponemelman.yoeltorres.workers.dev/): el nuevo build debe corresponder al commit fusionado y Ajustes y respaldo debe mostrar **1.26.0**.
