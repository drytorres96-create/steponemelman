# Persistencia compatible

`database/recuperacion-nbme-schema.sql` es un cambio incremental que se aplica después de los dos archivos base de esquema. Sustituye los cuerpos de `sync_nbme_state` y `sync_study_state`: conserva firmas, permisos, RLS, controles de cuenta, bloqueo, `revision` y `generation`.

La sincronización conserva `archivedSessions` por unión y máximo de fecha. Quitar una sesión conserva sus preguntas originales y sus intentos; la biblioteca y las acciones de continuación excluyen los bloques retirados. Los descartes destructivos anteriores siguen siendo compatibles.

Para `conceptosVistos`, la unión conserva la primera presentación mínima y la última máxima. Cuando dos presentaciones comparten fecha, desempata por `preguntaId` con el mismo orden UTF-16 que JavaScript. No convierte presentaciones en respuestas ni modifica dominio, FSRS o criterios. Un reinicio por nueva generación sigue limpiando el estado.

Ambos campos son opcionales: un cliente anterior puede omitirlos sin borrar los metadatos guardados por la nueva versión. Se valida su forma antes de guardar. El cambio de funciones no actualiza filas de progreso.

Las pruebas se ejecutan exclusivamente en una base PostgreSQL local vacía y desechable:

1. Aplicar `sql-fixture.sql` para crear tablas y cuentas sintéticas.
2. Aplicar `database/recuperacion-nbme-schema.sql`.
3. Aplicar `sql-compatibilidad.sql` con `psql -v ON_ERROR_STOP=1`.

Se verifican clientes anteriores, fechas mínimas/máximas, empates Unicode, conservación de intentos, conflictos de revisión, reinicios por generación y rechazo de metadatos inválidos. Las copias de seguridad de la cuenta y el archivo dirigido de sesiones quedan fuera del repositorio.
