# MyQBank fase 5

MyQBank conserva los motores de estudio, calificación e historial y presenta el diseño
aprobado mediante `?workspace=myqbank`. La activación general sigue pendiente de cobertura
editorial y validación del conjunto; los cambios técnicos se pueden usar en esa entrada.

## Cinco grupos de ajustes confirmados

1. **Identidad y estructura:** MyQBank y logo aprobado; IDs y taxonomía ocultos en estudio.
   Desktop sin scroll de página, con desplazamiento interno para contenido largo. Móvil
   conserva reflujo y continuación al final de la explicación. Paleta clara conservada;
   oscuro carbón con bosque, coral y grafito, foco y movimiento reducido.
2. **Estudio y material:** selector Tutor/Test disponible durante el bloque; crea otro ID
   y conserva el bloque previo. Solo pausa el anterior al completar la creación nueva.
   La ayuda previa se conserva por concepto cuando su explicación se mostró; cambiar
   de modo por sí solo no convierte una respuesta en práctica asistida.
   Labs antes de responder a la derecha, después bajo la viñeta a la izquierda, también
   en Test sin revelar respuestas. Figuras originales con ampliación y tablas compactas.
3. **Navegación y accesibilidad:** mapa de tres columnas en escritorio, círculos de 44 px,
   opción de ocultarlo, progreso y banderas. Reintento con icono y nombre accesible.
   Diálogo con nombre, orden DOM del dashboard coherente con móvil y controles legibles.
4. **Explicaciones:** únicamente secciones aplicables; revelado progresivo literal que
   conserva negaciones, unidades y decimales. Drills separados del resultado original,
   fuentes desplegables, revisión identificada como IA o humana. Nunca reutilizar la
   explicación de otra pregunta durante una carga o tras cambiar la fuente.
5. **Resaltado:** selección directa, borrado al volver a seleccionar o hacer clic, sin
   botón de activación. Incluye enunciado, opciones, explicaciones, tablas y labs; anclas
   persistentes por usuario, fuente, versión y región. Selección por teclado al soltar
   Shift, uniones validadas antes de borrar y marcas grandes divididas en segmentos.

El usuario confirmó mantener **controles y NBME en inglés; explicaciones, mecanismos y
práctica nuevos en español**, tal como se encargó a Claude. La lista posterior de diseño
no cambia esta decisión de idioma.

## Recepción de Claude e integración

Asignación privada: `corpus_assets/audits/myqbank/2026-10-14/claude-full/assignment.json`.
Mantiene 3.583 tareas en 164 lotes, 18 adaptaciones del piloto revisadas por separado y
el trabajo editorial ya iniciado. Claude redacta y registra fuentes; Codex conserva la
revisión independiente final, integración, software y publicación.

Las herramientas siguientes funcionan fuera de línea y no aprueban ni publican:

```sh
node qa/myqbank-editorial.mjs PRIVATE_SOURCES PRIVATE_OUTPUT
node qa/myqbank-import.mjs PRIVATE_ASSIGNMENT PRIVATE_DELIVERY PRIVATE_OUTPUT_EMPTY
```

Todos los argumentos privados deben quedar fuera del checkout. El inventario valida
índice, módulos, variantes y presentaciones actuales. La recepción exige lote e identidad
exactos, tareas únicas y completas, autor/fecha, borradores pendientes, evidencia HTTPS
y razones de bloqueo. Los cuatro NBME bloqueados pueden conservar su identidad sin
inventar un `sourceHash` publicable. Las propuestas sobre fuentes defectuosas permanecen
separadas de las adaptaciones. El resultado es una cola de revisión, nunca una aprobación.

`source-proof.ts` reconstruye cada presentación desde su módulo/pregunta y el índice.
`release.ts` exige revisión independiente del texto exacto, sin observaciones abiertas;
produce transacciones revisables con CAS del original, índice, destino y figuras. Verifica
la relación entre payload y MD5 en PostgreSQL. La reversión exige el registro exacto de
esa publicación y el contenido publicado intacto. No modifica originales ni progreso.

Cada figura vincula MD5 del registro JSONB para publicación y SHA-256 de sus bytes para
lectura. El navegador comprueba el Blob ya cargado antes de mostrar una adaptación
revisada; una imagen distinta con el mismo ID no conserva esa aprobación.

## Catálogo y rendimiento

El constructor de bloques carga metadatos privados versionados, sin preguntas, respuestas
ni explicaciones completas. Solo descarga los conceptos elegidos al iniciar. La selección
y la programación conservan los resultados anteriores. El catálogo se valida por versión,
IDs únicos, cobertura completa y calidad; la caché queda ligada al usuario. Un error ofrece
reintento y bloquea iniciar material incompleto.

Antes de desplegar debe existir `corpus_assets/myqbank/catalogs/1.0.7.json`, validado con
el índice vigente. Su publicación deriva únicamente de los 34 módulos y el índice de
corpus; `nbme_assets/catalog-index.json` pertenece a otro bucket. No se cambian RLS ni RPC.
La división de dependencias deja el módulo inicial alrededor de 140 kB y evita el chunk
monolítico de más de 500 kB.

## Evidencia

- `npm ci`, 1.193 pruebas unitarias aprobadas y dos omisiones esperadas.
- Suite completa inicial de navegador: 132 aprobadas; después se verificaron las 16
  pruebas actuales de workspace/editorial, incluido mapa/flechas, cambio de modo y
  resaltado por teclado. Plantilla aislada: 12 aprobadas, incluido reflujo equivalente a 200%.
- Build TypeScript/Vite aprobado. Capturas sintéticas en `before/` y `after/`, 390/1280 px,
  claro/oscuro, sin material clínico privado. Chromium local; no se atribuye prueba en Safari.
- Corpus: 2.270 conceptos, 76 variantes explícitas, 659 presentaciones adicionales actuales;
  592 NBME habilitados y cuatro bloqueados. Ningún formato histórico se cuenta como revisado.
- Ensayo PostgreSQL de publicación: seis conceptos y doce NBME; reversión devuelve cero.
  Una discrepancia de figura aborta y un rollback sin su audit se rechaza. Ensayos terminados
  con ROLLBACK.
- Publicación atómica real del catálogo y piloto: 14-oct-2026. Lectura posterior confirma
  18/18 textos exactos en español con revisión independiente por IA, 2.270 entradas de
  catálogo y cero discrepancias en las fuentes originales. Auditorías privadas:
  `audits/myqbank/releases/2026-10-14-phase5-pilot.json` en ambos buckets y
  `audits/myqbank/releases/2026-10-14-compact-catalog.json` en corpus.
- Revisiones adversarial y visual independientes cerradas sin bloqueadores. La aprobación
  del piloto corresponde únicamente a esos textos y presentaciones exactos.

Las decisiones médicas, SQL completos, snapshots, hashes y motivos por ID quedan privados.
La cobertura restante depende de las entregas de Claude y de su revisión independiente;
preparar herramientas o desplegar software no equivale a aprobar todo el contenido.
