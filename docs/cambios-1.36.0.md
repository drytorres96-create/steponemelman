# Claude en el dashboard de MyQBank · 1.36.0

Aviso de Yoel del 17-oct-2026: «Para reforzar hoy» (1.34.0) y «Pídele a Claude una sesión» (1.35.0)
estaban montados solo en la pantalla Hoy de Mehlman, y él trabaja en
`?workspace=myqbank#dashboard`. Ahora están también ahí.

## Qué cambia

Bajo «Your next step», en la misma columna, el dashboard de MyQBank enseña dos tarjetas:

- **Reinforce today**: lo más frágil de lo ya visto (fallos de la semana, fallos repetidos, aciertos
  con ayuda), una vez al día y como máximo cinco ítems. Es la misma tarjeta, con la misma lógica y el
  mismo techo que en Hoy; aquí va compacta y en inglés como el resto del espacio, con la lista
  plegada («See the 5 items»). «Review these 5» abre un bloque Tutor llamado «Para reforzar · hoy»;
  «Not today» la quita hasta mañana. Los nombres de los conceptos y la frase de Claude siguen en español.
- **Ask Claude for a session**: un botón («Open chat» / «Continue chat») que abre el chat de sesiones
  en un diálogo. Escape, la cruz o un clic fuera lo cierran y el foco vuelve al botón; la página de
  detrás no se desplaza mientras está abierto; cerrar no borra la conversación. «Empezar la sesión»
  crea un bloque Tutor con el nombre que salió del pedido (p. ej. «Renal · falladas»). El chat habla
  español porque así se le pide; el resto del espacio sigue en inglés.

No salen el viernes (día vacío), con el día completo ni con un bloque Test sin terminar: lo que
depende de las respuestas queda oculto mientras el Test está abierto, como el resto del dashboard.

## Cómo está hecho

- `Hoy` sigue siendo el único sitio donde se calcula el día. Con la nueva prop `renderAsistente`
  entrega lo que ya tenía calculado (candidatas, techos, progreso, banco) a quien lo pinte; MyQBank
  pinta `ClaudeEnDashboard` con ello. Sin la prop, Hoy se ve exactamente como antes.
- `SugerenciaRecuperar` gana `variante="myqbank"` y `ChatSesion` un modo controlado (`abierto` +
  `onCerrar`), que es lo que usa el diálogo. En Hoy nada cambia.
- `createBlock` admite un título; sin él, el de siempre («5-item Tutor block»).
- Escape y Tab se escuchan en el documento mientras el diálogo está abierto: al enviar un mensaje el
  botón se desactiva y el foco cae a la página, y un oyente del diálogo habría dejado de enterarse.
- Con la lista de «Reinforce today» abierta, o entre 961 y 1100 px de ancho, el dashboard deja de
  toparse con su altura máxima y crece lo que haga falta; con el tope, la columna central
  pisaba la rejilla.

## Validación

- Pruebas unitarias: la variante MyQBank de la sugerencia, el modo controlado del chat,
  `ClaudeEnDashboard` (abrir, Escape, clic fuera, trampa de Tab, foco perdido, conservar la
  conversación, entregar la sesión, devolver el desplazamiento), `Hoy` con `renderAsistente`
  (semana, día completo, viernes, banco cargando) y el título de `createBlock`.
- `e2e/myqbank-claude.spec.ts` (nueva), a 390 y 1280 px: las tarjetas salen bajo «Your next step», en
  inglés y sin pisar nada; «Review these 5» abre el bloque con su nombre y la sugerencia no vuelve;
  «Not today»; el diálogo y su teclado; de lo pedido a la sesión con `/api/ia/sesion` simulado; el
  viernes y el Test sin terminar las ocultan; y la rejilla a 961 y 1024 px con la lista abierta, con
  el orden de hojas de producción.
- El arnés publica ahora los conceptos frágiles (`escena=fragil`) también en MyQBank, y sus ids pasan
  de `G1` a `G01` porque el esquema del bloque exige al menos tres caracteres.
