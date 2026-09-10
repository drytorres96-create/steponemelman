# Cambios de la versión 1.1.0

Fecha: 10 de septiembre de 2026. Documento de la versión de código preparada para el sitio existente. La publicación de esta revisión debe comprobarse en Cloudflare y en el sitio; este documento no acredita por sí solo un despliegue correcto.

## Qué cambia para estudiar

- **Inicio centrado en la sesión actual.** Permite continuar lo guardado o elegir 5, 10 o 20 conceptos. El plan global explica cómo combina repasos vencidos, errores recientes y material nuevo. Las estimaciones de tiempo usan respuestas anteriores cuando hay suficiente historial, sin imponer un cronómetro.
- **Sesiones con final definido.** Cada respuesta se guarda al enviarse, antes de autoevaluar; calificar actualiza el mismo intento. Los fallos se programan para repaso sin añadir preguntas a la sesión actual. Pausar conserva la posición y las ayudas utilizadas.
- **Práctica sin ayuda.** Selecciona hasta 20 preguntas con opciones sobre material ya visto. Durante la respuesta se ocultan pistas, fuente y resultado; al finalizar se muestran la corrección y las explicaciones. No se presenta como simulacro validado ni pronóstico de aprobación.
- **Ayuda y dominio diferenciados.** Se registra si hubo pistas, consulta de fuente o explicación previa. La evidencia de dominio requiere respuestas independientes separadas en el tiempo, y puede corresponder a recuerdo, discriminación o aplicación. Un hito histórico de dominio no se confunde con el estado vigente.
- **Corrección más conservadora.** Las respuestas libres no reciben crédito por parecerse ortográficamente a otra respuesta médica. Las no reconocidas quedan por revisar y pueden reintentarse explícitamente desde Progreso. En respuestas numéricas se comprueban signos, escala y unidades explícitas sin adivinar conversiones.
- **Menos distracciones y mejor navegación.** El modo de concentración oculta el menú durante el estudio y permite recuperarlo. Se mejora la navegación con teclado, el manejo del foco en diálogos, el retorno tras recargar y el diseño en pantallas pequeñas.
- **Contenido y cobertura más claros.** La distribución por sistema y disciplina muestra lo disponible sin llamarlo temario completo. Los objetivos por reforzar dejan de depender de fallos históricos ya superados.

## Material publicado

El corpus **1.0.2** publicado en Supabase contiene **1.937 conceptos publicados y 83 en cuarentena**, frente a 1.946 y 74 antes de esta etapa. Se apartaron nueve conceptos adicionales por requerir revisión. Entre los publicados, **1.388** están etiquetados Step 1 y **549** compartidos Step 1 / Step 2. El avance de transformación sigue en **18 de 50 lotes**, con **32 pendientes**.

No se publican en GitHub los conceptos apartados, sus fragmentos, los PDF ni datos personales. La [planificación editorial](plan-calidad-2026-09-10.md) conserva los pendientes por categorías y criterios de revisión, sin exponer contenido médico del corpus privado.

## Evidencia técnica y verificación

La comprobación final integrada aprobó **101 pruebas en 12 archivos** y TypeScript. La compilación Vite de producción también pasó. El navegador de esta sesión bloqueó la vista previa local; no se presenta la revisión visual autenticada como completada.

Las pruebas usan datos sintéticos y cubren estas conductas:

| Área | Evidencia en el repositorio |
| --- | --- |
| Plan diario y rutas | Límites, prioridad global, ausencia de duplicados, exclusión de fallos superados y selección de preguntas válidas |
| Envío y reanudación | Guardado antes de autoevaluar, doble clic sin duplicación, restauración de la retroalimentación y del resumen |
| Práctica sin ayuda | Pistas, fuente y corrección ocultas hasta finalizar; la cola termina incluso después del último fallo |
| Evidencia de ayuda | Persistencia de pistas, fuente consultada y explicación previa al pausar o reanudar |
| Evaluación y dominio | Respuestas ambiguas sin aumentar aciertos/fallos; unidades y negaciones; dominio vigente separado del histórico |
| Sincronización | Unión por identificadores, actualización del mismo intento, conflictos y compatibilidad con historiales anteriores |
| Navegación | Recuperación de sesión desde Inicio, salida tras error de carga, foco del contenido y modal con Tab/Escape |

Los casos se encuentran en `src/__tests__/plan-estudio.test.ts`, `release-integration.test.ts`, `ui-navigation.test.tsx`, `normalize.test.ts`, `mastery.test.ts`, `fsrs.test.ts`, `estado-model.test.ts`, `estado-provider.test.ts` y `sync.test.ts`, además de las pruebas de autenticación.

Para verificar la revisión concreta que se vaya a publicar, ejecutar `npm test` y `npm run build`, y después comprobar el despliegue de ese commit y la versión **1.1.0** en **Ajustes**. La ejecución local de pruebas no acredita una publicación en producción.

## Límites y trabajo siguiente

- La corrección de respuestas libres compara con respuestas y sinónimos declarados. Una formulación válida puede quedar por revisar; no hay revisión médica automática garantizada de cualquier texto libre. El estado por revisar no se cuenta como un fallo nuevo ni elimina un resultado comprobado anterior; el reintento explícito permite volver al concepto sin penalización automática.
- El corpus sigue incompleto. Quedan cobertura oficial por objetivo, revisión de conceptos compartidos con Step 2, cuarentena, extracción pendiente, recursos visuales y práctica en inglés.
- El orden de fundamentos es una regla inicial; los prerrequisitos todavía no forman un grafo clínico y pedagógico validado.
- Las pruebas con servicios simulados no sustituyen el ensayo con la cuenta real al pasar de un dispositivo a otro. La recarga sin conexión sigue sin estar garantizada.
- Los historiales antiguos se conservan; la ausencia de registro de ayuda no demuestra independencia. Las métricas pueden cambiar al aplicar criterios de evidencia más precisos sin que eso borre las respuestas anteriores.
- Estas mejoras apoyan la organización y la accesibilidad. No constituyen tratamiento para ADHD ni han sido validadas como intervención clínica o como mejora de puntuación del examen.
