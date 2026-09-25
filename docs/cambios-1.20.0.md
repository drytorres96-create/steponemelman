# 1.20.0 — Hoy: todo en una pantalla

Publicado el 25 de septiembre de 2026. Segunda y última entrega del rediseño de
los «anillos de bioquímica». La 1.19.0 trajo el motor y la portada; esta cumple
la otra mitad del encargo: Mi semana, Recuperación y Progreso dejan de ser
pantallas, y lo que se usaba de ellas vive ahora plegado dentro de Hoy.

## Qué cambia

**Una sola pantalla.** La navegación principal tiene una entrada, Hoy. El menú
discreto (**Cuenta y ajustes**) guarda Elegir contenido, Ajustes y respaldo,
Calidad del material y Plan diario clásico.

**Tres desplegables debajo de los bloques, cerrados por defecto.** Nada de lo que
hay dentro se carga ni se pinta hasta que se abre, así que la portada sigue
siendo el anillo, la línea de lo que toca y los dos bloques.

- **Cómo va todo.** Las cifras de Progreso tal como estaban: la banda de tres
  anillos de la semana, el reparto del material en diez semanas y la adherencia
  al plan. Debajo, el calendario de la semana, con un solo día abierto, sus
  casillas, «Oído» para los audios y el cronómetro para las tareas con minutos.
  Sigue ahí con el día cerrado: mirar cómo va no es estudiar.
- **Lo que estoy cerrando.** La tabla de detalle del planificador que vivía al
  final de Recuperación, ahora sobre las cajas de hoy: con qué caja entró cada
  una, qué le falta para cerrarse, la retención estimada, el estado y la
  interacción. Es para mirar por qué, no para decidir qué estudiar. **No aparece
  con el día cerrado.**
- **Quiero hacer algo más.** «Elegir conceptos» y «Elegir preguntas», que antes
  estaban en Mi semana. Tampoco aparece con el día cerrado: después del cierre,
  estudiar más sigue siendo abrir el menú a propósito.

**Los enlaces guardados siguen funcionando.** `#semana`, `#recuperacion`,
`#progreso` y `#repaso` llevan a Hoy.

## Lo que se retiró

El encargo pedía absorber en los desplegables unas piezas concretas y borrar lo
que quedara sin usar. Esto es lo que ya no está:

- **De Mi semana:** la tarjeta de cada sesión preparada con su «Empezar sesión»,
  el histórico plegable de sesiones hechas y los avisos para retomar sesiones
  guardadas fuera del plan. El material de las sesiones de la semana entra ahora
  por lo nuevo de Hoy. Retomar una sesión guardada sigue en **Plan diario
  clásico**, y las de preguntas también en **Elegir contenido → Preguntas**.
- **De Recuperación:** los grupos «Cerca de dominio», «Esperando separación»,
  «Conceptos», «Preguntas» y «Mezclar», con su selector de carga. Lo fallado
  vuelve solo, en las cajas.
- **De Progreso:** el mapa por sistema y disciplina, el progreso por forma NBME,
  la lectura de la semana con IA, las tarjetas de conceptos trabajados, el
  historial de sesiones y el selector de ventana semanal o general.
- **Repaso**, que ya solo existía como relevo de `#repaso`.

## Decisiones de detalle

- **La banda de cifras va con la ventana de esta semana.** Es la que Progreso
  enseñaba al entrar. El reparto de diez semanas y la adherencia miran el
  conjunto, así que «Cómo va todo» cubre la semana y el horizonte.
- **Las sesiones preparadas son una fila más del calendario**, con su casilla y
  sin botón. Consecuencia que conviene saber: **esa casilla ya no se marca sola**
  al terminar la sesión, porque la sesión ya no se abre como tal. Si se usa, se
  marca a mano.
- **El anillo «Sesiones de esta semana» de la banda de cifras no avanzará**: cuenta
  las sesiones preparadas completadas, y ya no se completan desde la aplicación.
  Lo que mide la semana es el anillo exterior de Hoy.
- **Los repasos de lo dominado** siguen en el planificador normal, que ahora solo
  vive en **Plan diario clásico**.
- **El Worker no se tocó.** Conserva la ruta de la lectura de la semana con IA,
  aunque la aplicación ya no la llama.

## Cómo está hecho

- `src/screens/Hoy.tsx`: `Desplegable`, un `<details>` controlado que monta su
  contenido al abrirse, y `ComoVaTodo`, que reutiliza `BandaDeCifras`,
  `ProgresoHorizonte` y `BandaAdherencia` sin cambiarlos.
- `src/screens/CalendarioSemana.tsx`: el plan de la semana sacado de Mi semana,
  con sus marcas optimistas que se deshacen si la base no las acepta.
- `src/screens/TablaPlanificador.tsx`: la tabla de detalle, ahora sobre las
  cajas de hoy; las preguntas NBME falladas tienen su propia fila.
- `src/App.tsx`: `vistaDesdeHash` resuelve las cuatro rutas antiguas a Hoy.
- `src/hoy.css`: los desplegables son barras de cristal discretas, y su cuerpo es
  una sola columna que puede encoger: en el teléfono las tablas anchas se
  desplazan dentro y no empujan la página.
- `src/plan/enlace.ts` se queda en `tituloDeCheckpoint` y `sesionesDeLaSemana`;
  `src/semana/api.ts` pierde `cargarSesionesSemana`.
- Borrados: `Semana.tsx`, `Recuperacion.tsx`, `Progreso.tsx`, `Repaso.tsx`,
  `LecturaSemana.tsx`, `MapaProgreso.tsx`, `NbmeProgress.tsx`,
  `lib/mapa-progreso.ts`, `lib/analisis-ia.ts` y `lib/semana-fallos.ts`.

## Pruebas

- `hoy.test.tsx` (13, cinco nuevas): con el día completo no aparece la tabla de
  detalle; «Lo que estoy cerrando» explica cada caja al abrirse y no antes;
  «Quiero hacer algo más» lleva a la biblioteca; «Cómo va todo» reúne cifras,
  adherencia y calendario también con el día cerrado; los hashes antiguos
  resuelven a Hoy.
- `ui-navigation.test.tsx` (12): el menú ya sin las tres pantallas, cada enlace
  antiguo aterriza en Hoy, las cifras de Progreso dentro de «Cómo va todo», y el
  error al preparar un estudio y «Saltar al contenido» comprobados ahora desde
  Elegir contenido.
- `semana-plan.test.tsx` (9) prueba el calendario dentro de Hoy;
  `semana-api.test.ts`, `cargarHistorialSesiones`.
- `design-export.test.tsx` exporta Hoy plegada y con sus tres desplegables
  abiertos, además de la biblioteca y el acceso.
- Retiradas junto con el código que probaban (22): `lectura-semana.test.tsx`
  (5), `recuperacion-cercania.test.tsx` (2), `semana-fallos.test.ts` (5), las del
  mapa de progreso en `simplificacion.test.tsx` (2) y `upgrade.test.ts` (1), la
  de `NbmeProgress` en `nbme/ui.test.tsx` (1), las del emparejamiento entre plan y
  sesiones en `enlace.test.ts` (5) y la del histórico de Mi semana en
  `semana-plan.test.tsx` (1). `cercania-dominio.test.ts` sigue probando la
  cercanía al dominio que usaba Recuperación.

Total: 501 pruebas, 499 pasan y 2 omitidas (las de siempre). Build sin errores
de TypeScript.
