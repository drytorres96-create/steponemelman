# Auditoría de dominio y mantenimiento

Revisor: neurocognición y matemáticas del progreso. Fecha: 7-oct-2026, zona de referencia America/New_York. La lectura de cuenta se hizo sobre un snapshot privado; este documento contiene únicamente agregados. No modifica preguntas, criterios personales, intentos, hitos ni estado de cuenta.

## Un concepto, una trayectoria

El identificador `concept_id`, no la puerta de entrada, identifica el aprendizaje. Hoy, la recuperación de la meta, un módulo y el repaso relacionado con NBME registran intentos en el mismo historial. La reconstrucción (`reconstruirProgreso`) ordena por instante e identidad estable y resuelve actualizaciones del mismo UUID antes de calcular agenda y dominio. Cambiar de pantalla o autoevaluar la misma respuesta no crea una recuperación nueva.

Una presentación real cuenta como vista. No es un acierto ni demuestra dominio. Los ejercicios generados de recuperación NBME ayudan a practicar, pero no se convierten en intentos Melman inventados. La práctica sobre una pregunta Melman existente usa el registro y corrector compartidos. Ver la solución, pedir pistas o consultar la fuente impide acreditar independencia en esa respuesta; los historiales antiguos que no guardaban si hubo ayuda se conservan sin asumir que fueron independientes.

Principio docente: separar exposición, discriminación y recuperación. La práctica de recuperación favorece la retención diferida (Roediger y Karpicke, 2006, DOI 10.1111/j.1467-9280.2006.01693.x); distribuirla en el tiempo evita equiparar una racha inmediata con una consolidación (Cepeda et al., 2006, DOI 10.1037/0033-2909.132.3.354). Los números 3, 2, 48 y 7 siguientes son reglas operativas acordadas, no umbrales universales demostrados por esas investigaciones.

## Criterios que se conservan

La cuenta auditada guarda los mismos criterios vigentes: al menos 3 respuestas correctas independientes, en 2 sesiones distintas, con una separación total de al menos 48 horas; al menos un recuerdo sin alternativas o una aplicación; y ninguna confusión conceptual en los últimos 7 días. Los criterios personales prevalecen y las generaciones históricas se reconocen exactamente, sin sobrescribir ajustes manuales.

- Correcta u ortografía con cero pistas, fuente no consultada y explicación no vista: añade evidencia independiente.
- Correcta asistida: queda en el historial y agenda, pero no añade evidencia independiente.
- Incorrecta o parcial: descuenta los dos aciertos independientes más recientes, con suelo cero.
- Pendiente de revisión: no añade ni descuenta aciertos y mantiene la agenda.
- Reconocimiento entre alternativas: puede aportar un acierto independiente, pero no reemplaza el recuerdo o aplicación exigidos.
- Una confusión fundamental permanece activa hasta el límite exacto de 7 días; la separación se acredita exactamente a las 48 horas.

El primer hito `dominado_en` se conserva. No convierte por sí solo una respuesta fallada o un historial asistido en dominio actual. Una pérdida de evidencia puede reducir el número demostrado; recuperar un concepto previamente acreditado no inventa un nuevo primer hito. Las etiquetas actuales se calculan desde el historial, no se toman de un `estado` antiguo.

## Curva y agenda

El planificador es una adaptación transparente de FSRS-4.5, con pesos fijos, no el paquete oficial ni un modelo personalizado ajustado a la cuenta. Con estabilidad `S` en días y tiempo transcurrido `t`, calcula:

`R(t,S) = (1 + (19/81) · t/S)^(-1/2)`

A los `S` días, `R(S,S) = 0,9`. La inversión usada para el intervalo es `I(S,r) = S/(19/81) · (r^(-2) - 1)`, por lo que `I(S,0,9) = S`. El resultado comprobado manda sobre la autoevaluación: un fallo siempre es grado 1; una correcta asistida no puede programarse como fácil. Error, confianza y horizonte del examen pueden acortar el intervalo. El reparto final es determinista, respeta el límite y no promete una cuota diaria.

La retención estimada baja con el tiempo. El vencimiento pide mantenimiento sin borrar la primera acreditación ni decir que nunca se dominó. El 90 % estimado es un indicador del modelo, no una probabilidad de aprobar, ni un intervalo de confianza obtenido de respuestas reales. Las observaciones a 30 días se muestran por separado con su denominador; sin observaciones se informa «Sin dato», no 0 %.

La ventana de confusión sí puede vencer por tiempo: una confusión del día 0 seguida de tres recuperaciones independientes los días 1, 2 y 3 no cumple antes del día 7 y cumple en su límite exacto. Cambia la vigencia de una exclusión temporal sobre evidencia existente; no crea otra respuesta ni un nuevo `dominado_en`. Si falta un primer hito conocido y validado, la meta no inventa su fecha al vencer la ventana. Si la última respuesta sigue fallada, el mantenimiento al día y la caja cerrada siguen bloqueados por esa recuperación pendiente.

## Recalculo de la cuenta

Snapshot: 7-oct-2026 a las 16:33:24 de Nueva York. Corpus publicado: 2079 conceptos. Banco: 596 preguntas, 592 calificables. La reconstrucción utiliza el código de la aplicación y el historial existente, sin escribir a Supabase.

| Verificación | Resultado |
|---|---:|
| Conceptos con actividad | 201 |
| Intentos conservados | 1170 |
| Correctas / incorrectas / parciales / por revisar | 829 / 145 / 166 / 30 |
| UUID de intento duplicados / instantes futuros | 0 / 0 |
| Respuestas correctas independientes | 523 |
| Dominio demostrado actual | 31 |
| Mantenimiento al día / pendiente | 28 / 3 |
| Agendas reproducidas exactamente | 201 de 201 |
| Primera respuesta NBME histórica única | 63 |
| Observaciones de retención a ≥30 días | Sin dato, n=0 |
| Errores repetidos a ≥24 horas | 17 de 24 |

La pantalla de la meta se reproduce exactamente: día 13, 17 conceptos demostrados en la ventana de 510, línea esperada 50, diferencia 33; 23 NBME respondidas por primera vez en la ventana de 255, línea 52, diferencia 29. Global y ventana son poblaciones distintas: 31 y 17 son compatibles. No hay evidencia que justifique cambiar las metas o los pesos para mejorar la apariencia del avance.

Hay 81 hitos históricos. Cuarenta y ocho no reproducen la acreditación bajo la lectura actual de evidencia; se conservan y no se convierten en dominio actual. Ninguno de los 31 conceptos que hoy acredita dominio tiene una fecha discrepante al reconstruir sus intentos. Cambiar esos hitos reescribiría historia y no es una reparación autorizada de los cálculos.

## Límites revisados

El dominio depende de datos registrados, no mide todo lo que se sabe fuera de la aplicación. La separación de dos sesiones permite reanudar un bloque, pero sólo un UUID nuevo demuestra otra respuesta; una explicación inmediata no se vuelve independiente por cambiar de ruta. La duración de siete días que usa la curva de la meta representa la demora prevista de su plan, no una garantía de consolidación individual.

Una fecha de acreditación desconocida no debe tratarse como acreditación anterior a la meta. La disponibilidad para nuevos primeros hitos también debe distinguir primeros dominios históricos de dominio vigente, especialmente en corpus pequeños. Estos casos se coordinan con la auditoría de `meta.ts` y del resumen de aprendizaje.

## Reparaciones verificadas

- El modelo limita el tiempo transcurrido a cero cuando otro reloj sitúa el último intento en el futuro. La curva no supera 100 %, no produce NaN con una estabilidad inválida y conserva exactamente su fórmula con entradas válidas. El timestamp cero se interpreta como instante válido.
- Consultar una fecha sólo usa intentos y confusiones que ya ocurrieron. No permite que un intento futuro acredite o retire dominio pasado. El historial permanece sin mutaciones.
- La cercanía al dominio excluye la retención estimada de las puertas de acreditación. Si sólo falta la separación, indica su fecha aun cuando el modelo estime retención baja.
- Un último fallo vuelve a caja 1 antes de comprobar la evidencia de dominio restante. Cinco aciertos antiguos no ocultan un error nuevo. El resumen pide recuperación; una agenda ausente se muestra como mantenimiento por comprobar.
- Las cajas calculan sus días en Nueva York y conservan los máximos de 24, 48 y 72 horas durante cambios de hora. Viajar no desplaza el calendario de la meta.
- El repaso Melman iniciado tras una explicación NBME conserva la ayuda conocida en `explicacion_previa`. El nuevo registro no sobrescribe `confusion_conceptos` con la confianza declarada; la confusión con confianza alta mantiene el factor de intervalo 0,4 y su ventana de siete días. Los envíos nuevos usan `EVALUADOR_VERSION` 2.4.0; los antiguos mantienen su versión, resultado y evidencia.
- El resumen de aprendizaje valida los primeros hitos conocidos contra su historial y sus criterios. La meta distingue esos hitos históricos de quienes hoy cumplen y no trata fechas desconocidas como anteriores.

Validación específica: 146 pruebas aprobadas en ocho suites, incluidas 19 nuevas regresiones y propiedades de la curva, independencia, deduplicación, consulta temporal, cajas y límites exactos de observación. La comparación posterior mantiene las 201 fechas de agenda idénticas; dificultad idéntica; diferencias de estabilidad de redondeo numérico de hasta `8,53 × 10⁻¹⁴` días, sin efecto en fechas. El snapshot permanece intacto. Las mismas cifras 31/28/3 y meta 17/23 se obtienen con zonas de dispositivo Nueva York, UTC, Tokio y Honolulu.
