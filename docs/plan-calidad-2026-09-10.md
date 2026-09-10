# Organización y calidad del aprendizaje

Estado de referencia: 10 de septiembre de 2026, versión de código 1.1.0. Este documento distingue cambios de organización implementados de trabajo editorial todavía pendiente. No certifica revisión médica humana, preparación para aprobar el examen ni el despliegue de esta revisión. Véanse las [notas de cambios y verificación](cambios-1.1.0.md).

## Cambios de organización implementados

- El plan diario usa la selección completa del corpus disponible. El usuario elige un máximo de 5, 10 o 20 conceptos; la vista previa y la apertura comparten la misma función de selección.
- Se priorizan los repasos vencidos según el planificador; después, los conceptos cuyo último intento fue incorrecto o parcial en los últimos siete días; finalmente, se añaden conceptos nuevos hasta el límite elegido. Cada repaso ocupa una plaza y reduce el espacio para material nuevo. Si no hay suficientes candidatos pendientes o nuevos, la sesión es más corta.
- Los errores se interpretan por el resultado comprobable, con compatibilidad con intentos antiguos. Un fallo histórico deja de ser criterio de prioridad cuando el último intento resuelto es correcto; el concepto puede reaparecer cuando venza su repaso. Entre errores recientes se prioriza el exceso de confianza y después la fecha. Una respuesta por revisar no crea un fallo nuevo ni borra un resultado resuelto anterior; puede reintentarse explícitamente desde Progreso sin penalización automática.
- El orden inicial de lo nuevo favorece definiciones, terminología y estructura-función; después mecanismos, causas y secuencias; luego comparación y asociación; finalmente aplicación. Es una regla editorial sencilla, no un grafo validado de prerrequisitos. Las rutas permanecen disponibles sin bloqueos por prerrequisitos escritos en texto libre.
- La ruta mixta alterna exclusivamente conceptos ya vistos. La práctica sin ayuda selecciona hasta 20 conceptos ya vistos cuya interacción recomendada sea caso clínico u opción múltiple, con al menos dos opciones y una única respuesta correcta. No reproduce un examen NBME ni ofrece una predicción de aprobación.
- La tabla de contenido muestra conceptos publicados por sistema y disciplina, incluyendo etiquetas secundarias. Indica explícitamente que tener material no demuestra cobertura completa. Un concepto puede contarse en más de un área.
- Los intentos se guardan desde el envío; la autoevaluación actualiza el mismo registro. La cola inicial no crece con los errores. Al pausar y retomar se conserva la evidencia de ayuda, y las métricas distinguen hitos históricos de dominio vigente.
- La práctica sin ayuda difiere la corrección hasta el final. La corrección libre evita deducir equivalencia médica a partir de una semejanza ortográfica; lo que no puede resolver queda por revisar. Se registran pistas, fuente y explicación previa para distinguir evidencia independiente.
- El modo de concentración, la reducción de información secundaria en Inicio y la navegación con teclado facilitan el uso. Su eficacia como intervención específica para ADHD o como mejora del resultado del examen no se ha validado.

El planificador de repaso es una implementación inspirada en FSRS. Sus puntuaciones de prioridad son estimaciones para ordenar el estudio y no están calibradas como pronóstico individual del examen. El período de siete días y la ordenación inicial son decisiones de producto ajustables tras observar el uso.

## Estado editorial de referencia

| Elemento | Estado |
| --- | --- |
| Lotes transformados | 18 de 50 |
| Lotes pendientes | 32 |
| Conceptos publicados | 1.937 |
| Etiquetados Step 1 | 1.388 |
| Etiquetados compartidos Step 1 / Step 2 | 549 |
| Conceptos apartados en cuarentena | 83 |
| Revisión clínica humana | Pendiente |

En esta etapa se apartaron nueve conceptos adicionales de los previamente publicados. La clasificación registrada no garantiza la exactitud de todas las preguntas. Un concepto compartido se conserva únicamente cuando su objetivo evaluado corresponde a Step 1. Un mecanismo añadido a la explicación no basta para justificar una pregunta que solo evalúa manejo clínico de Step 2.

## Trabajo necesario antes de declarar cerrado el contenido

1. **Cobertura oficial.** Vincular objetivos evaluables al temario de USMLE por sistema, disciplina y tarea. Separar áreas cubiertas, parciales y pendientes mediante revisión editorial; no convertir la proporción de lotes o conceptos en porcentaje del examen. Justificar la prioridad de cada objetivo sin inventar frecuencias de aparición.
2. **Filtro Step 1 y calidad médica.** Revisar los 549 conceptos compartidos publicados y los 83 apartados, con especial atención a preguntas de tratamiento, siguiente paso y decisiones de urgencia. Documentar la decisión, sus fuentes, versión y responsable de revisión. Separar fidelidad al PDF, corrección médica y pertinencia para Step 1. No reincorporar material de cuarentena sin resolver el motivo.
3. **Extracción documental.** Completar los 32 lotes restantes; recuperar material incompleto de Ethics, revisar anclajes de página pendientes en nueve documentos y 256 fragmentos breves señalados en el relevo anterior. Verificar estos pendientes contra los PDF antes de convertirlos en conceptos.
4. **Prerrequisitos y preguntas alternativas.** Reemplazar gradualmente referencias libres por objetivos o IDs verificables, manteniendo la posibilidad de saltar una recomendación. Introducir variantes revisadas de los objetivos prioritarios y distinguir primer intento, repetición y transferencia. Evitar que recordar el texto de una sola pregunta se interprete como dominio general.
5. **Figuras y tablas.** Recuperar los recursos pertinentes de los PDF con página y procedencia, revisar legibilidad y vincular preguntas que realmente dependan de la imagen. El corpus actual no dispone de interacciones visuales habilitadas; la simple presencia del tipo «Patrón visual» no subsana esa carencia.
6. **Inglés con apoyo en español.** Añadir viñetas y terminología inglesa con explicación española opcional, preservando equivalencia conceptual, IDs y progreso. Validar que la traducción no cambie la respuesta ni introduzca pistas.
7. **Piloto pedagógico.** Probar un módulo representativo con recuperación sin ayuda tras una demora, preguntas alternativas, error con exceso de confianza y retorno tras interrupción. Evaluar claridad y facilidad de uso además de aciertos. La comparación externa con evaluaciones oficiales es independiente del porcentaje de conceptos de esta plataforma.

## Criterios para publicar nuevos lotes

- Cada objetivo y respuesta deben conservar fuente y página verificadas. Un fragmento truncado o ambiguo requiere resolución antes de publicarse.
- La pregunta debe evaluar el objetivo declarado, tener una respuesta defendible y, si hay opciones, explicar los distractores. Revisar excepciones y afirmaciones absolutas, sin corregir silenciosamente al autor.
- Documentar clasificación Step 1, decisiones compartidas y motivos de exclusión. «Aprobado» en la canalización automatizada debe distinguirse de revisión humana.
- Mantener IDs estables o alias explícitos para preservar el progreso y ejecutar los validadores de integridad y consistencia del corpus antes de actualizar el material publicado.
- Las pruebas de software verifican estructura y comportamiento; no reemplazan la evaluación médica y pedagógica del contenido.

## Referencias de alcance

- [USMLE: contenido y especificaciones de Step 1](https://www.usmle.org/exam-resources/step-1-materials/step-1-content-outline-and-specifications): guía para mapear la cobertura por áreas y tareas, no un inventario exhaustivo de preguntas.
- [USMLE: Step 1](https://www.usmle.org/step-exams/step-1): referencia del formato vigente; la práctica de esta plataforma no es un simulacro validado.
- [NBME: Comprehensive Basic Science Self-Assessment](https://www.nbme.org/examinees/self-assessments/comprehensive-basic-science-self-assessment/): evaluación externa para interpretar preparación, separada de las métricas internas.

La revisión clínica completa, las variantes, las imágenes y el inglés siguen planificados. El ajuste de cuarentena de esta etapa no equivale a haber completado esos trabajos.
