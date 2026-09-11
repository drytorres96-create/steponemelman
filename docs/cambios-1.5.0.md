# Versión 1.5.0 — simplificación del estudio

Código 1.5.0; corpus privado 1.0.5. Fecha: 11 de septiembre de 2026.

Esta entrega reduce las decisiones y pasos entre una pregunta y la siguiente, manteniendo el historial, las ayudas registradas, las fuentes y la repetición de errores.

## Cambios aplicados

| Área | Comportamiento |
| --- | --- |
| Navegación | Hoy, Elegir contenido y Progreso. Repasos, ajustes, respaldo y calidad del material quedan en Cuenta y ajustes. Los enlaces antiguos siguen funcionando. |
| Inicio | Prioriza continuar la sesión pendiente. Empezar otra es una opción secundaria explícita. La carga inicial es 20 minutos; Cambiar duración permite 10/20/30 minutos o 5/10/20 conceptos. |
| Preguntas | Siguiente pregunta conserva el resultado y la programación ya registrados. Confianza y ajuste de dificultad son opcionales. |
| Enseñanza | La pregunta se presenta primero. Necesito aprenderlo abre la explicación sin borrar el borrador de respuesta. La ayuda y su apertura se conservan al reanudar. |
| Escritura | Una errata reconocida del historial no exige transcribir para continuar. Se puede practicar la escritura voluntariamente. La evaluación conservadora de términos médicos permanece intacta. |
| Formatos | Las sesiones nuevas conservan las opciones editoriales; se retira la conversión mecánica a V/F cada tres posiciones. Se mantienen V/F nativo, casos, flechas, relaciones, secuencias y respuestas breves. |
| Feedback | Resultado, explicación central y avance directo. El error elegido conserva su explicación; los otros distractores, patrones, conexiones y criterios quedan en Profundizar. Las aclaraciones editoriales siguen visibles. |
| IA | Se encuentra en Sigo sin entender. Conserva autenticación, fuentes verificadas y cuotas existentes, sin intervenir en la calificación. |
| Contenido | Un formulario de filtros, modo y duración para módulos y conceptos. Los módulos y sesiones editoriales respetan tanto la intersección de etiquetas como la carga. |
| Selección manual | Respeta la elegibilidad del modo antes del límite. El botón indica cuántos seleccionados se enviarán. El conjunto se conserva al volver a Elegir contenido en la misma aplicación abierta. |
| Rutas | Se retiran las tarjetas Por sistemas y Por disciplinas, que no representaban filtros concretos. Esos filtros reales permanecen; los modos especializados y el intercalado están en opciones avanzadas. |
| Progreso | Trabajados, pendientes de repaso y dominio vigente. La recomendación utiliza el mismo plan diario que Hoy y también prioriza reanudar. El mapa y el historial quedan plegados. |
| Aplicación | La métrica se limita al piloto. Muestra primeros intentos sin ayuda correctos sobre evaluados; sin intentos, muestra ausencia de datos. No atribuye cero rendimiento a conceptos sin variantes. |
| Criterios | Edición en borrador dentro de ajustes avanzados, validación y aplicación conjunta. Se detectan cambios remotos mientras se edita. Endurecer criterios conserva los hitos históricos y los intentos. |
| Notas editoriales | Exportar notas incluye todas las propuestas, independientemente de filtros o filas visibles. El CSV contiene originales y propuestas por separado y neutraliza fórmulas. La edición conserva cambios al cerrar con Escape e informa errores de persistencia. |

## Continuidad

Cada nueva sesión persiste `versionFormato: 2`. Las sesiones anteriores sin marca se reanudan con la presentación 1, incluida la propuesta V/F original. La marca conocida se conserva al fusionar copias incompletas de la misma sesión. La IA reconstruye la misma versión y sigue verificando la huella de la pregunta; los clientes 1.4 aún abiertos se admiten como presentación 1.

Si la huella de un intento guardado no coincide con el contenido reconstruido, aparece un aviso y no se ofrece la IA para esa comparación. El intento original no se modifica.

Los fallos y respuestas parciales siguen reinsertándose hasta acertarlos. La pausa por presupuesto ocurre después de guardar el resultado y la cola pendiente. Las correcciones con ayuda no se convierten en evidencia independiente. Las respuestas ambiguas permanecen pendientes de revisión.

No se modifica el corpus, sus identificadores, su clasificación Step 1 ni los datos de las cuentas. No hay migración de base de datos. La selección manual conservada entre pantallas es local a la aplicación abierta; el progreso y la sesión reanudable mantienen su sincronización habitual.

## Verificación

**189 pruebas aprobadas en 22 archivos**, incluyendo el corpus privado. Se verifica compilación TypeScript/Vite y pruebas de interacción, continuidad, filtros, sincronización, autorización de IA, criterios, exportación y corpus privado. Las nuevas regresiones incluyen V/F antiguo ya respondido, escritura correctiva voluntaria, borrador de respuesta durante enseñanza, aplicación conjunta de criterios, notas fuera del filtro, rechazo de errores de guardado y duración compartida en distintos orígenes de sesión.

La publicación se comprueba contra el commit de GitHub y los recursos servidos por Cloudflare. Estas comprobaciones no equivalen a una prueba manual en dos dispositivos ni a una nueva auditoría clínica del material.
