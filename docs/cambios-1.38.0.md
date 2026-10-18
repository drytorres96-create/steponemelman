# Claude: búsqueda verificada y conversación amplia · 1.38.0

Categorías: coach, diseño web y revisor adversarial. Solicitud de Yoel del
17-oct-2026. Se conserva el material original y todo el historial.

## Problema y resultado

Una petición de conceptos y preguntas podía terminar con cero preguntas: la
selección aplicaba sistema y disciplina simultáneamente, revisaba una sola ventana
y entregaba a Claude etiquetas NBME sin evidencia cuando el índice no tenía tema.
Además, la restricción de una fuente original descartaba el candidato aunque
existiera una explicación complementaria revisada.

El servidor ahora carga la revisión vigente de la pregunta y valida la explicación
complementaria contra el hash exacto de la fuente, el hash del contenido, su estado
y la revisión independiente. Usa esa evidencia temática para clasificarla. Sin
complemento, solo usa objetivo y explicación originales si la política lo permite.
Un complemento presente pero inválido no permite recurrir al original. La etiqueta
NBME enviada por el navegador nunca se utiliza como evidencia. Una revisión antigua,
una fuente restringida sin complemento válido o una política ausente siguen
excluidas. Este cambio no libera fuentes ni redacta correcciones médicas automáticas.

Claude recibe instrucciones explícitas para reconocer sinónimos, siglas y términos
en ambos idiomas, y aceptar una pregunta pertinente para cualquiera de los temas
pedidos. El código valida los identificadores devueltos y busca alternativas del
mismo tema si falta un tipo de material. Puede ampliar sistema y disciplina, pero
conserva fuente, historial y duración. Cada candidato se revisa una sola vez; hay
un máximo de cinco rondas de hasta 150 candidatos y se preservan los límites de
gasto del servicio. Las ventanas mixtas reservan espacio para preguntas.

Si ambos tipos caben en una sesión corta, se reserva tiempo para una pregunta.
Cuando la mezcla sigue incompleta tras buscar alternativas, la tarjeta lo explica
y el botón dice «Empezar solo con conceptos» o «Empezar solo con preguntas».
Un fallo del servicio permite reintentar; no se presenta como ausencia de material.
No se garantiza encontrar preguntas de cualquier tema ni se incorporan ítems sin
verificar para completar una cifra.

## Espacio del tutor

En MyQBank el estudio usa el ancho disponible de la ventana y, después de responder,
Claude abre ampliado. El panel de conversación gana espacio a la derecha, con
adaptación a móvil. El control de reducir/ampliar cambia el reparto de columnas sin
remontar el tutor: conserva mensajes, respuestas de recuperación activa e intentos.
La recuperación activa sigue sin acreditar intentos ni dominio.

## Validación y evidencia

Pruebas sintéticas cubren fuentes restringidas con complemento válido, hashes
alterados, autorrevisión, fuente distinta, versión antigua, política ausente, error
de base y compatibilidad del catálogo. La búsqueda prueba sustitución entre
clasificaciones, conservación del historial, mezcla en cinco minutos, cancelación,
límites de rondas y ausencia de candidatos repetidos.

En navegador se recorre la creación de una sesión mixta tras ampliar la búsqueda y
la alternativa parcial explícita. El tutor se prueba a 390, 961, 1024, 1280 y 1920 px,
incluyendo un ejercicio activo, persistencia del borrador al cambiar de tamaño,
ausencia de desbordamiento horizontal y ausencia de scroll de página en escritorio.
Las capturas usan exclusivamente material sintético y el orden de CSS de producción.

| Ancho | Antes | Después | Práctica |
| --- | --- | --- | --- |
| 390 px | [Antes](claude-search-wide/before-390.png) | [Después](claude-search-wide/after-390.png) | [Práctica](claude-search-wide/practice-390.png) |
| 1280 px | [Antes](claude-search-wide/before-1280.png) | [Después](claude-search-wide/after-1280.png) | [Práctica](claude-search-wide/practice-1280.png) |
| 1920 px | [Antes](claude-search-wide/before-1920.png) | [Después](claude-search-wide/after-1920.png) | [Práctica](claude-search-wide/practice-1920.png) |

La aserción del ancho falla en el código anterior a 1280 y 1920 px y pasa con el
cambio. La nota de publicación y el PR registran las puertas locales y CI sobre el
HEAD exacto. No hay escrituras de base, cambios de RPC, progreso, letras NBME ni
contenido privado en este lote.

Puertas locales en orden, Node 22.23.3:

```text
npm ci
added 170 packages in 3s

npm test
Test Files  116 passed | 1 skipped (117)
Tests       1380 passed | 2 skipped (1382)

npm run build
tsc -b && vite build
built in 4.05s
```

Las dos omisiones son las esperadas. El PR registra el resultado final de los 193
recorridos del navegador, las 12 pruebas de la vista previa y la revisión visual
general. También hay capturas en oscuro a [390](claude-search-wide/dark-390.png),
[1280](claude-search-wide/dark-1280.png) y [1920](claude-search-wide/dark-1920.png) px.
