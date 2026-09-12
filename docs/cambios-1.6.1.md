# Versión 1.6.1 · Presentación del banco de preguntas y carga del material

Esta revisión no añade contenido. Corrige cómo se presenta el material importado del banco NBME y cómo se carga el corpus entre visitas. No cambia el progreso, las respuestas registradas ni la clasificación de ninguna pregunta.

## Presentación de las preguntas importadas

El banco procede de una extracción OCR de PDF y llegaba a la pantalla tal como salió de esa extracción. Se corrige la tipografía y se reconstruye la estructura; **no se reescribe ningún dato clínico**.

- **Tablas de laboratorio.** La extracción dejaba las tablas partidas en dos columnas consecutivas: primero todas las etiquetas y después todos los valores, de modo que «Hemoglobin» y «8 g/dL» aparecían separados por seis renglones. Cuando el bloque encaja exactamente en N etiquetas seguidas de N valores, se reconstruye como tabla de dos columnas. Cuando no encaja, el texto se deja como está en la fuente: no se emparejan valores por aproximación.
- **Tipografía.** Se reparan las edades partidas (`57-year- old`), el espacio previo a la puntuación de cierre (`mature )`, `67 %`), el exponente caído de las unidades de volumen (`mm 3` → `mm³`) y el espacio introducido dentro de una unidad (`74,000/ mm 3`). Se unen los saltos de línea que la extracción introdujo al ajustar el ancho de página, conservando los que separan elementos de una tabla.
- **Cifras ilegibles.** La extracción dejó lecturas imposibles en algunos valores (`50:QQ0`, `8 g.' dL`, `N^ 5000-19,500`) y en algunas edades (`A 5 G -year- old`). **No se corrigen por suposición.** El valor se conserva literal, se marca en la tabla y la pregunta muestra un aviso para contrastar esas cifras con el PDF antes de fiarse de ellas. Afecta a 22 de las 379 preguntas disponibles para practicar.
- **Diseño.** El enunciado se presenta en párrafos con la pregunta separada del cuerpo del caso; las opciones, las explicaciones y los distractores comparten el mismo espaciado. En teléfono la tabla ajusta sus columnas y, por debajo de 380 px, pasa a pares etiqueta/valor apilados en lugar de depender del desplazamiento horizontal. Se comprobó la ausencia de desbordamiento horizontal a 1280, 390 y 360 px.

Las correcciones son deterministas y afectan solo a la presentación: el texto de origen permanece intacto en la base de datos y ninguna opción, respuesta o explicación se altera.

## Carga del material

La copia local del corpus existía desde versiones anteriores, pero solo se utilizaba sin conexión: con conexión, cada visita volvía a descargar los 34 módulos completos, unos 6,6 MB, antes de mostrar Inicio, Módulos, Progreso, Repaso o Auditoría. El tiempo de apertura crecía con cada lote incorporado al corpus.

- Un módulo ya guardado se sirve desde la copia local mientras no cambie la versión del corpus. Un activo publicado no cambia dentro de una misma versión, de modo que la copia es válida por definición.
- El índice se sigue pidiendo siempre: es lo que revela que hay una versión nueva y, con ella, una clave de almacenamiento distinta. Una versión nueva nunca se sirve desde la copia anterior.
- Al conocerse la versión vigente se descartan en segundo plano las copias de versiones anteriores, para no acumular material obsoleto en el dispositivo.

En el Worker, el catálogo del banco se conserva un minuto en la caché del borde. Cada bloque de preguntas debía descargarlo entero (412 kB) solo para comprobar que ninguna pregunta hubiera sido retirada. Se mantiene el orden de comprobaciones: una cuenta sin permiso no provoca ninguna lectura del banco, y una pregunta retirada no llega a descargarse.

## Comprobaciones

- 235 pruebas correctas y una omitida (la del conjunto privado del corpus, que requiere `CORPUS_CHECK_DIR`).
- Pruebas nuevas del normalizador de texto: reconstrucción de tablas con valores numéricos y cualitativos, marcado de lecturas dudosas, y los dos casos en que **no** debe transformarse nada (bloque que no encaja en etiquetas y valores, y prosa continua).
- Pruebas nuevas de la caché del corpus por los dos extremos: no se vuelve a descargar lo ya guardado para la misma versión, y una versión nueva se descarga de nuevo en lugar de servirse desde la anterior.
- TypeScript y compilación de producción sin incidencias. Revisión visual del enunciado renderizado a 1280, 390 y 360 px.

Las pruebas del servidor que fijan el orden de comprobaciones de acceso se conservaron sin modificarlas: una optimización que las contradecía fue descartada.

## Pendiente

El aviso de lecturas dudosas señala el problema, no lo resuelve. Las 22 preguntas afectadas necesitan cotejarse con el PDF original para recuperar las cifras correctas. Mientras tanto siguen disponibles para practicar, con la advertencia visible.

La verificación se realizó con datos sintéticos y con la estructura del banco privado; no sustituye una revisión clínica humana del contenido, que sigue pendiente.
