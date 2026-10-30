# Auditoría de calidad MyQBank · 30 de octubre de 2026

Versión propuesta: **1.42.0**. Base: `7db11565fd685f665f85277cfa224895a0998da9`.

Encargo: auditar y corregir funcionamiento, sincronización, clasificación, IA,
navegación y presentación, con autorización de publicación y sin compras ni
llamadas de pago. El alcance de este lote es software; no reescribe material
privado, respuestas, revisiones, letras NBME ni historial.

## Hallazgos resueltos

| Área / etiqueta | Fallo y efecto | Corrección y evidencia |
| --- | --- | --- |
| Sincronización · revisor adversarial | Elegir una copia local sólo por su hora podía recuperar una generación anterior a un reinicio. Elegir sólo una copia también perdía trabajo independiente. | Recuperación común de IndexedDB y respaldo: revisiones conocidas deciden entre generaciones; copias compatibles se combinan. Regresiones para ambos proveedores. |
| Sincronización · productividad | Un fallo simultáneo de almacenamiento podía aparentar guardado local. Un ciclo NBME sin subida perdía evidencia remota ya confirmada. | Fallos de persistencia visibles; se conserva confirmación remota. Settings muestra por separado conceptos, NBME y anotaciones. |
| Sincronización · revisor adversarial | Un reinicio remoto confirmado podía comunicarse como fallido si después fallaba el guardado local. | Conserva la generación confirmada y distingue el éxito remoto del fallo local; la advertencia continúa hasta recuperar la persistencia. Prueba de un único reset RPC y de que no revive historial. |
| Clasificación · revisor adversarial | Alias ES/EN, acentos y espacios dividían un mismo sistema; IDs iguales entre tipos podían colisionar. | Clave canónica y etiqueta de presentación explícitas; desconocidos conservados; deduplicación por tipo+ID. Sin inferir nuevas categorías médicas. |
| Selección · coach | Un intento todavía oculto en modo Test podía borrar temporalmente un error anterior de la selección Incorrect. | Conserva el último resultado publicado hasta cerrar el bloque. Cobertura NBME y conceptos. |
| Filtros · productividad | Formularios NBME estáticos y filtros heredados podían dejar resultados vacíos al cambiar de fuente. | Opciones derivadas del catálogo disponible; formulario deshabilitado en Concepts; búsqueda por tema/objetivo sin distinción de acentos. |
| IA · revisor adversarial | Cancelar durante autenticación o lectura de respuesta podía dejar una petición pendiente o aceptar un resultado tardío. | Cancelación y timeout cubren autenticación, fetch y parseo; rechazo tardío controlado. |
| IA · coach | Una preparación rechazada podía dejar el chat indefinidamente cargando; conteos y fichas de caché inconsistentes parecían lectura completa. | Error con reintento; partición exacta de conteos; validación de fuente, versión, fecha y ficha antes de reutilizar caché; sin fuente cuenta como no disponible. |
| Navegación · neurocognición/ADHD | Volver a una pregunta contestada podía dejar la lectura al fondo; el enlace Skip cambiaba el hash de la ruta. | Reinicia paneles y foco por pregunta; nueva retroalimentación móvil recibe foco sólo al revelarse; Skip enfoca contenido conservando la ruta. Principio: reducir reorientación y mantener el contexto. |
| Ergonomía · diseño web | Constructor largo de escritorio alejaba la acción Start y competía con el progreso de la página. | Constructor limitado a la altura disponible y opciones con scroll propio; Dashboard y Settings conservan scroll de documento. Foco visible, regiones accesibles y movimiento reducido. |
| Ajustes · productividad | Fallos de lectura/importación o exportación podían dejar acciones bloqueadas; el texto de reinicio omitía bloques guardados. | Errores recuperables, reintento del mismo archivo, mensajes de estado y alcance real del reinicio. No cambia la operación de reinicio. |
| Pruebas · revisor adversarial | Diez verificaciones dependían de la zona horaria del proceso. | Fechas fixture explícitas de America/New_York; mismas aserciones verificadas en UTC y Asia/Tokyo. |

## Verificación

- `npm ci`, Node 22.
- `npm test`: **1.483 aprobadas, 2 omisiones previstas**, 121 archivos aprobados y 1 omitido, incluyendo la regresión adicional de reinicio confirmado.
- `npm run build`: TypeScript y build de producción aprobados.
- Revisión independiente cruzada de sincronización/taxonomía, IA y UX. La revisión
  adversarial corrigió además la descripción del alcance de reinicio.
- Navegador con datos sintéticos a 390 y 1280 px: dashboard, filtros, creación y
  reanudación de bloque, respuesta, navegación siguiente/anterior, Labs y Settings.
  Comprobado foco al volver a Question 1 y que Start permanece accesible en escritorio.
- E2E añadido: Skip sin cambio de ruta, opciones del constructor, explicación larga
  y foco en ambos anchos, y Settings sin desbordamiento con tres estados de sync.
  La ejecución completa y capturas finales de Settings corresponden al CI del PR.
- Producción se inspeccionó sin enviar respuestas ni llamadas de IA. La verificación
  de despliegue debe comprobar la versión visible después del merge.

Las capturas locales antes/después se revisaron con fixtures sintéticos y se
mantienen fuera del repositorio público. La evidencia visual reproducible se
genera desde el propio código de pruebas en CI. Las capturas definitivas de
Settings (390 y 1280) se generan en
`docs/myqbank-phases-2-4/audit-settings-*.png` y se conservan, junto a la revisión
general de pantallas, en el artefacto de CI `myqbank-phases-2-4`.

## Límites y riesgos residuales

- No se ha efectuado una revisión médica ítem por ítem del corpus privado. La
  normalización de etiquetas no certifica la clasificación semántica original.
- IA validada con simulaciones, cachés y pruebas del Worker. No se invocó un modelo
  de pago ni se cambiaron presupuestos, modelos o puertas de fuente/gasto.
- No se modificaron esquema, RPC, datos de producción, preguntas ni `step1-lessons`.
  Las mejoras previenen fallos futuros; no reconstruyen retroactivamente historial.
- La recuperación entre generaciones con metadatos conocidos tiene cobertura. Una
  copia heredada sin metadatos no permite demostrar por sí sola a qué generación
  pertenecía; se mantiene el comportamiento compatible para no descartar trabajo.
- No se invalidaron las claves de caché de lectura por perfil de modelo: hacerlo
  induciría nuevas lecturas de pago. Los controles de validez sí se reforzaron.

Esta auditoría aporta correcciones y evidencia reproducible; no constituye una
garantía de ausencia absoluta de defectos ni una certificación clínica o WCAG.

## Referencias de calidad consultadas

- [W3C APG: modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):
  referencia para foco y navegación por teclado.
- [WCAG 2.2: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html):
  referencia para lectura y adaptación sin desplazamiento horizontal innecesario.
- [PouchDB: conflicts](https://pouchdb.com/guides/conflicts.html): referencia de
  resolución explícita de conflictos; no se sustituyó la sincronización existente.
- [W3C SKOS](https://www.w3.org/TR/skos-reference/): separación de identidad y
  etiquetas preferidas/alternativas como criterio de diseño de la taxonomía.

No se copiaron implementaciones externas ni se añadieron dependencias.
