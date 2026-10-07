# Revisión adversarial de la aplicación

Fecha: 7-oct-2026. Base revisada: `d9e71f0`; incluye los archivos nuevos de fuente docente, FAQ y pruebas, además del diff de fuentes existentes. Revisor independiente: auditoría de dominio. Esta revisión no publica material ni escribe en la base.

**Resultado:** no quedan hallazgos críticos, altos o medios abiertos en el diff de la aplicación. Se encontró y corrigió una atribución incorrecta de evidencia docente en la ayuda de IA. La publicación del corpus y los resultados de las puertas completas se comprueban por separado.

## Hallazgo corregido

| Severidad | Problema | Resolución y evidencia |
| --- | --- | --- |
| Media | `AyudaIA` recibía una cita del fundamento corregido, pero la mostraba junto al documento original y su página PDF. Esto podía atribuir al PDF una afirmación que procedía de una revisión docente. | El rótulo usa `referenciaDocente` y las referencias externas cuando existe revisión; conserva la referencia PDF para material original. La prueba de UI utiliza un ancla editorial y una página física diferentes y comprueba que la evidencia corregida no aparezca como cita de una página PDF. |

La corrección fue realizada por el integrador después de comunicar el hallazgo. Se releyó el diff y se ejecutó `npx vitest run src/__tests__/fuente-docente.test.tsx --pool=forks --maxWorkers=1`: **5/5 pruebas aprobadas**, incluida la reproducción del problema.

## Fuente docente, esquema y Worker

- `revision_editorial.fundamento` es opcional: los conceptos históricos sin el campo siguen cargando. Una revisión antigua sin fundamento válido permanece bloqueada para IA; no vuelve a usar el fragmento original como alternativa.
- El fundamento exige longitud acotada, revisión con formato válido y referencias HTTPS con título. Material en cuarentena, confianza editorial insuficiente o exclusivo de Step 2 mantiene sus restricciones. Estos controles estructurales no sustituyen la revisión médica independiente.
- Las rutas de explicación, calificación, chat, aplicación y corrección resuelven el concepto publicado desde la base bajo la autorización del usuario. La recuperación NBME resuelve primero la revisión exacta de la pregunta y después sus conceptos relacionados actuales. El navegador no puede sustituir la evidencia docente enviada al modelo.
- Las referencias y el texto que admite una cita pasan por el mismo selector docente. No se encontró otro envío directo de `source.fragment` en los prompts afectados. El análisis semanal utiliza los campos docentes del concepto, sin enviar el fragmento original.
- Las citas de explicación y corrección siguen exigiendo una coincidencia literal de longitud acotada. En recuperación, cada ejercicio debe coincidir con una fuente individual; no basta una coincidencia que atraviese el límite entre dos fragmentos. El chat distingue apoyo literal de conocimiento sin cita, y la aplicación de examen continúa siendo una ayuda de lectura sin crédito de aprendizaje.
- Los módulos y el índice deben declarar la misma versión antes de acceder al modelo. Las presentaciones reconstruidas conservan la validación de pregunta, variante y formato; una presentación que ha cambiado se rechaza, sin sustituir silenciosamente el ítem.
- Las claves de caché de las respuestas afectadas incluyen el material docente y la identidad de versión. La autorización y la disponibilidad vigente se comprueban antes de acceder a la caché. Las pruebas nuevas del Worker cubren evidencia corregida y bloqueo de revisiones anteriores; la prueba de recuperación comprueba que el fragmento obsoleto no llegue al prompt.

El panel de fuente conserva la procedencia original, muestra el fundamento como texto docente y presenta sus referencias. Las notas administrativas y los porcentajes de confianza editorial no se convierten en contenido de estudio.

## Seguridad, créditos y compatibilidad

- El diff no cambia políticas RLS, SQL, firmas RPC, permisos de membresía, cuotas, presupuestos de IA, reservas de consumo ni dependencias. Las respuestas API mantienen `no-store`, los límites de cuerpo y las comprobaciones de origen, método y autorización.
- No hay cambios en los modelos de `study_state` o `nbme_state`, la combinación entre dispositivos, las lápidas, la calificación de intentos ni las fórmulas de dominio, meta y retención de esta entrega. Retirar pantallas no elimina sus registros históricos.
- La nueva selección de Hoy amplía el material disponible después de los guiones semanales, respetando los techos existentes. Sólo incluye material publicado aún sin una respuesta resuelta; la práctica ya resuelta sin dominio permanece en consolidación. Abrir FAQ, índice o navegación no registra respuestas ni créditos.
- El diagnóstico de Hoy y sus pruebas se documentan en [NUEVO-HOY-AUDITORIA.md](NUEVO-HOY-AUDITORIA.md). Esta revisión comprobó el contrato y el diff; no repitió esas pruebas ni modificó el estado real de la cuenta.
- Las URLs de pantallas retiradas aterrizan en Hoy. La continuación conceptual conserva la lista exacta de IDs, sus repeticiones, variantes, sesión e índice guardados. Si falta material, comunica el fallo y conserva la cola; no prepara una sustitución. La ruta NBME mantiene la sesión y sus revisiones fijadas.
- La prueba de navegación conserva explícitamente el índice de una cola con IDs repetidos al retomar desde Hoy. También cubre los hashes históricos absorbidos y la navegación reducida. El respaldo y la importación conservan sus contratos; retirar el exportador de auditoría no retira el respaldo del progreso.

## FAQ y métricas

Las explicaciones estáticas se trasladan a Ajustes. Permanecen las cantidades actuales, fracciones, diferencias para alcanzar/superar/completar la meta, mantenimiento, estimaciones y acciones de continuación. La FAQ usa los criterios guardados y constantes compartidas; editar un borrador no cambia su explicación antes de aplicarlo.

Se contrastaron sus textos con las reglas existentes: independencia sin ayudas, descuento de evidencia tras fallos, bloqueo temporal por confusión, separación entre dominio y mantenimiento, primeros hitos verificables y primera respuesta NBME única. La práctica generada por IA no acredita dominio Melman. Los círculos conservan denominadores distintos y no estiman aprobación. El índice se carga a petición, cuenta IDs únicos y no presenta la distribución por áreas como cobertura del examen.

Las pruebas de FAQ cubren criterios personalizados, condiciones desactivadas, borradores, carga diferida, deduplicación y reintento. Las pruebas de pantalla conservan las cifras dinámicas tras retirar la explicación repetida.

## Límites de esta revisión

La revisión adversarial comprueba el código y sus contratos; no convierte un campo `fundamento` en una certificación médica automática. La promoción de un concepto requiere las decisiones por ID, la revisión independiente, el manifiesto de versiones y la validación/publicación atómica descritos en [material-privado-agentes.md](../material-privado-agentes.md). No se ha inferido una publicación por la existencia de esos documentos.

Las puertas completas de tests, build, E2E y capturas pertenecen al registro de integración de esta entrega. La prueba focal registrada aquí verifica el cierre del hallazgo, sin reemplazar esas puertas.
