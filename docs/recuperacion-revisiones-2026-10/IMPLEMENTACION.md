# Melman 1.27.2 · Recuperar un bloque después de una revisión

## Problema y criterios

**[Productividad / revisor adversarial]** En 1.27.1 se hizo visible el error del botón, pero la continuación seguía comparando todas las preguntas originales con el catálogo actual. Una revisión posterior, incluso de un paso ya terminado, vetaba el bloque completo y sugería descartarlo. Descartar elimina los intentos de ese bloque; no es una recuperación apropiada de trabajo pendiente.

Ahora «Retomar mi sesión pendiente» conserva el mismo bloque y aplica estos criterios:

1. Reconstruir los pasos abiertos con el modelo existente: explicación actual, preguntas aún sin cerrar y reintentos. Deduplicar sus referencias exactas; no cargar ni validar de nuevo un paso ya cerrado que no tenga corrección pendiente.
2. Cada pregunta pendiente debe seguir publicada como disponible. Si la revisión actual difiere, pedir al Worker la revisión guardada exacta, aunque exista una copia en memoria o IndexedDB. El contrato existente del servidor permite esa revisión sólo si su archivo exacto sigue disponible y válido.
3. Continuar con el mismo identificador, orden, letras, revisiones, presupuesto, borradores, feedback e intentos. No sustituir preguntas ni recalificar respuestas anteriores. Un aviso discreto explica que existe una revisión posterior y que el bloque conserva su versión comprobada.
4. Si falta el archivo, está bloqueado o no hay autorización, conservar todo y mostrar el motivo junto al botón para reintentar. Una revisión histórica distinta requiere conexión para validarla; una revisión sin cambios mantiene la continuación offline con su copia válida.
5. Un punto conceptual al final de su cola es un resumen, no una sesión pendiente que deba ocultar NBME o los repasos de Hoy. El resumen sigue disponible en la navegación clásica y no se borra.

Los objetivos de recuperación mantienen la distinción entre trabajo y dominio demostrado. No se cambian los criterios de dominio, intervalos, techo diario, horizonte, cuotas de IA, evaluación, material privado, schema, firmas RPC ni sincronización. No se ejecutaron consultas ni escrituras sobre bases reales.

## Evidencia

**[Revisor adversarial]** Pruebas sintéticas con el proveedor React real, API y persistencia en memoria: misma sesión y revisión histórica, explicación y correcciones, borrador guardado, pasos cerrados corregidos o retirados, rechazos 401/403/409/422, sustitución de revisión rechazada y ambos casos offline. El servidor se prueba por separado para comprobar que el archivo histórico autorizado se sirve y el bloqueado se rechaza. Tres regresiones adicionales cubren la llegada tardía del catálogo y dos intercalaciones de caché al revalidar un bloque activo. Las contrapruebas sin las protecciones reprodujeron la aceptación indebida de una versión después de un rechazo 422.

Las referencias forzadas siguen requiriendo red aunque una carga concurrente vuelva a insertar una copia en memoria. La generación de carga invalida las lecturas de caché y respuestas API anteriores, incluso si terminan después del rechazo. Una operación obsoleta tampoco puede limpiar el error vigente. Ante un fallo de revalidación esa copia no queda utilizable. La carga automática espera al catálogo y no compite con una continuación manual o una sesión pausada.

Las tres regresiones del proveedor real fallan sobre el código anterior `2e4f854` (1.27.1), que permanece en Progreso y exige descartar el bloque. Con la corrección pasan en ambos tamaños. Las pruebas de navegación usan App, RecuperarMeta, NbmeProvider y NbmePlayer reales con un catálogo y preguntas exclusivamente sintéticos, rutas API interceptadas y Supabase en memoria. Comprueban el caso de catálogo r2 y bloque r1, su feedback original, siguiente pregunta y corrección; un 409 conserva el bloque y permite reintentar. Los dos estados sintéticos se comparan; no se copia la captura privada enviada por el usuario al repositorio.

Capturas de Chromium con datos sintéticos y movimiento reducido (no de un iPhone físico):

| Escena | 390 px | 1280 px |
| --- | --- | --- |
| Bloqueo anterior en Progreso | [antes](capturas/antes/revision-390.png) | [antes](capturas/antes/revision-1280.png) |
| Feedback original recuperado | [después](capturas/despues/revision-390.png) | [después](capturas/despues/revision-1280.png) |
| Aviso de versión conservada | [después](capturas/despues/aviso-390.png) | [después](capturas/despues/aviso-1280.png) |

Resultados finales con Node 22: **788 pruebas aprobadas y dos omisiones esperadas, build correcto y 62 pruebas de navegador aprobadas**. Capturas antes/después: cuatro comprobaciones adicionales aprobadas. Las salidas reales están en [VALIDACION.txt](VALIDACION.txt). CI debe pasar sobre el HEAD exacto y la fusión debe estar libre de conflictos. Cloudflare debe desplegar el commit fusionado; comprobar ese build no equivale a abrir Safari en el iPhone. El proxy del entorno bloquea workers.dev, por lo que la comprobación del dispositivo se realiza con la versión 1.27.2 en Cuenta y ajustes.
