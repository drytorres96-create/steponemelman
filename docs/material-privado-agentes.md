# Material privado y revisión editorial

El material reside en `public.corpus_assets` del proyecto Supabase vigente. Los archivos
médicos, fragmentos PDF, exportaciones y datos de cuentas nunca se guardan en Git ni en
`public/`. La aplicación sólo carga el índice y sus módulos explícitos. Los metadatos de
calidad siguen disponibles para agentes autorizados y no se muestran en la interfaz.

## Consultas administrativas

La revisión de los 191 conceptos apartados utiliza estas rutas, sin cambios de esquema,
permisos ni políticas RLS:

- `audits/quarantine/2026-10-07/original.json`: contenido original y motivos de cuarentena.
- `audits/quarantine/2026-10-07/review-decisions.json`: decisiones médicas/editoriales por ID,
  referencias verificadas y revisión independiente de la evaluación.
- `audits/quarantine/2026-10-07/release-manifest.json`: versiones, hashes y conservación
  de conceptos, sesiones y migraciones de identidad.

Consultar el `payload` por `path` mediante la conexión administrativa autorizada.
La existencia de estos archivos se verifica en la base; no se presupone una publicación
por leer esta documentación. Las políticas de lectura para miembros permanecen iguales.

## Corregir sin falsear la procedencia

Conservar `concept_id` y `source` íntegros. `source.page` es un ancla editorial; sólo
`source.pdf_page` verificado representa una página física. No inventar páginas.
Guardar en `revision_editorial.nota` la resolución del problema original, en `fuentes`
las referencias médicas consultadas y en `fundamento` un texto docente corregido en
inglés de 15–1600 caracteres junto con la revisión del corpus. El texto es una explicación
propia, no una cita atribuida falsamente al PDF original. Las notas administrativas no
pertenecen a `explicacion` ni al enunciado que recibe el estudiante.

`src/lib/fuente-docente.ts` selecciona la evidencia de IA. Sólo admite material aprobado,
confianza editorial suficiente, alcance Step 1 y, en revisiones, fundamento con referencias
HTTPS. Los conceptos antiguos revisados sin ese fundamento siguen bloqueados. El servidor
resuelve el material de la base; el navegador no aporta evidencia ni decisiones médicas.
Las citas de IA siguen exigiendo coincidencia literal con la evidencia recibida y las cuotas
no aumentan. La confianza editorial no es una probabilidad de aprobar el examen.

## Publicación y conservación

Cada motivo de cuarentena requiere una resolución específica y una revisión independiente
de la corrección, pregunta, respuesta, opciones, etiquetas y alcance Step 1. Mantener
cuarentena mientras esa revisión esté pendiente. Si faltan datos clínicos, reformular el
objetivo hacia un mecanismo verificable; no inventar un diagnóstico ni una figura ausente.

La publicación actualiza índice y módulos en una sola transacción con comparación de
hashes y marcas temporales. Conserva íntegros los conceptos y sesiones previos y las
migraciones de identidad; añade sesiones sin reemplazar las anteriores. No toca
`study_state`, `nbme_state`, el banco NBME ni los intentos. Preparar una reversión protegida
por CAS y comprobar hashes, cantidades, pertenencias y presentaciones antes y después.

Una pestaña abierta con un índice anterior puede requerir recargar la página. No aceptar
módulos de otra versión ni borrar progreso para resolver ese cambio.
