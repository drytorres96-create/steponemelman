# Cambios de la versión 1.2.0

Fecha: 10 de septiembre de 2026. Esta revisión añade búsqueda de conceptos y controles de integridad al sitio existente. La publicación debe comprobarse en Cloudflare y en el sitio; este documento no acredita por sí solo que el despliegue haya terminado.

## Buscar y elegir qué practicar

**Módulos → Buscar conceptos** permite localizar objetivos mediante palabras del término, la pregunta, la afirmación o los sinónimos registrados. La búsqueda no distingue mayúsculas ni tildes y admite varias palabras a la vez. Puede combinarse con filtros de disciplina, sistema, tema y estado personal de estudio.

Los resultados se muestran en páginas de 20 objetivos. La selección se conserva al cambiar de página o filtro y admite como máximo 20 conceptos. Puedes añadir una página, quitar objetivos, vaciar la selección o comenzar la práctica. El listado muestra el objetivo y la referencia documental; no añade la respuesta, la explicación ni el fragmento fuente a la pantalla de selección.

El buscador distingue **Nuevo**, **Repaso pendiente**, **Respuesta por revisar** y **Al día**. Una respuesta pendiente de revisión no pasa a considerarse un concepto nuevo por carecer de un acierto comprobado. La carga de conceptos comienza al abrir el buscador; un error ofrece una acción para volver a intentarlo.

Las pestañas de módulos y búsqueda admiten teclado, incluidas las flechas y las teclas Inicio/Fin. Al cambiar de página de resultados, el foco vuelve a su cabecera para facilitar la orientación.

## Cargar solo contenido consistente

Antes de estudiar, la aplicación comprueba que el índice tenga módulos e identificadores únicos y que sus cantidades coincidan con las sesiones declaradas. Cada módulo debe contener exactamente los conceptos que le corresponden y cumplir el esquema completo. Cuando declara su versión de corpus, esta debe coincidir con la del índice.

También se rechazan conceptos exclusivos de Step 2, conceptos en cuarentena y registros con confianza editorial inferior a 0,7. Esto añade una comprobación en la aplicación al filtro de publicación. Las etiquetas y ese umbral describen decisiones del proceso editorial; no certifican la exactitud médica de cada concepto.

Si una comprobación falla, esa carga se detiene y solicita actualizar el material. Ya no se omiten registros inválidos silenciosamente para presentar un módulo incompleto. Los módulos antiguos sin marca de versión se aceptan solo cuando sus identificadores, contenido y demás comprobaciones coinciden. Una cuota de caché agotada tampoco impide utilizar el material que se haya descargado correctamente de Supabase.

## Referencias de páginas más claras

El material puede conservar dos referencias diferentes:

| Campo | Uso |
| --- | --- |
| `source.page` | Ancla original de la extracción, conservada para trazabilidad |
| `source.pdf_page` | Página física del PDF cuando su correspondencia está comprobada |
| `source.pdf_page_fin` | Última página física cuando un fragmento abarca varias páginas |

Las pantallas muestran **Página PDF** cuando ese dato está disponible y **Página de la fuente** cuando solo existe el ancla original. Si ambas referencias difieren, el panel de fuente explica la diferencia. La ausencia de página física sigue siendo una limitación explícita; esta mejora de presentación no demuestra que todas las referencias del corpus hayan sido revisadas.

## Material procesado

Los lotes **B019–B021** ya están procesados. El corpus **1.0.3**, activado y comprobado en Supabase, contiene **2.149 conceptos publicados** y **121 en cuarentena**, con **21 de 50 lotes terminados** y **29 pendientes**. Esta etapa añade **212 conceptos** al material de estudio respecto a la versión anterior.

Entre los publicados hay **1.566 conceptos Step 1** y **583 compartidos Step 1 / Step 2**, sin contenido exclusivo de Step 2. La lectura posterior a la activación confirmó **34 módulos**, **2.149 identificadores únicos** y ninguna coincidencia con los identificadores de cuarentena. El material procede de **10 de los 22 documentos**; esta proporción documental no mide la cobertura del examen.

El contenido sigue destinado a Step 1. Los conceptos compartidos con Step 2 solo pueden conservarse por su objetivo pertinente a Step 1; sigue pendiente la revisión médica de los casos dudosos. Los documentos originales y los conceptos no se incorporan al repositorio público.

## Comprobaciones de esta revisión

La comprobación integrada con el corpus privado aprobó **116 pruebas en 15 archivos**, incluida la validación completa del conjunto **1.0.3**. Sin ese conjunto, como en CI del repositorio público, se ejecutan **115 pruebas y se omite una comprobación privada**. TypeScript y la compilación Vite también finalizaron correctamente. Las comprobaciones locales no acreditan por sí solas que el despliegue haya terminado.

Las pruebas nuevas cubren:

- Búsqueda con palabras combinadas, normalización, filtros y clasificación del estado personal.
- Paginación, selección sin duplicados y límite de 20 conceptos.
- Interacción del buscador con el proveedor de progreso, carga al abrir, recuperación tras error y ausencia de respuestas reveladas en el listado.
- Rechazo de contenido Step 2, cuarentena, confianza insuficiente, versiones incompatibles, identificadores repetidos y módulos incompletos.
- Conservación de metadatos de cobertura y presentación de páginas físicas o intervalos.

La prueba adicional de contenido privado se habilita con `CORPUS_CHECK_DIR` y valida todos los módulos, sus cantidades y su separación de cuarentena. No forma parte del repositorio el conjunto médico necesario para ejecutarla.

No se realizó una nueva inspección visual autenticada del buscador en esta fase. Las pruebas de interfaz utilizan datos sintéticos. La comprobación en producción debe confirmar el despliegue de este commit, sus recursos y la versión **1.2.0** en **Ajustes**.
