# Auditoría de StepOneMelman · 5 de octubre de 2026

Repositorio: `drytorres96-create/steponemelman`. Base verificada: `main` `8a55bbb`.
Equipo: coach USMLE, neurocognición/ADHD, productividad, diseño web y revisión adversarial.
Sólo código y datos sintéticos; ninguna consulta/escritura real de base de datos.
Las cifras suministradas (2.079 conceptos, 34 módulos, 592 ready/4 blocked, 119 figuras)
son contexto del usuario: no se certifican sin acceso al material privado.

## 1. Lo que ya funciona bien

- Hoy ya ofrece un techo circular y oculta el acceso adicional al cerrar el día.
- La portada actual carga índice/historial, no materializa el corpus completo.
- Tres conceptos y una pregunta se intercalan sin un resumen entre tramos.
- El patrón fuente y la explicación de conceptos aparecen después de responder.
- Pistas, fuente y enseñanza previa se registran como ayuda; no acreditan independencia.
- NBME conserva letras/revisiones y esconde respuesta, objetivo y procedencia antes del envío.
- Figuras blob funcionan con la CSP; ampliación, Escape y retorno de foco ya existen.
- Las RPC usan revisión/generación y las pruebas cubren conflictos y respuestas tardías.

## 2. Reconocimiento y línea base

`npm ci`: 170 paquetes instalados. `npm test`: **575 aprobadas, 2 omitidas**,
61 archivos aprobados y 1 omitido. `npm run build`: correcto; aviso informativo de
chunk >500 kB. `CHROMIUM_PATH=/usr/bin/chromium npm run e2e`: **14/14 aprobadas**.
Runtime disponible Node 24.19.0; CI configura Node 22. Lote 0 repetido con Node 22.23.3:
575 aprobadas, dos omitidas y build correcto. No se cambian dependencias.

Las seis piezas de la auditoría del 12-sep están en esta base:
`srs/fsrs.ts:28` (techoHorizonte), `server/registro.ts`, `store/sync.ts:47`
(diagnosticoSync), `nbme/model.ts:224` (discardNbmeSession), `store/model.ts:230`
(esVersionLegible), `srs/mastery.ts:29` (CRITERIOS_HEREDADOS).

### Flujos reales

| Flujo | Entrada y recorrido | Comprobación / límite |
|---|---|---|
| Arranque | main → AuthProvider/AuthGate → App lazy → Hoy; índice, estados y catálogo | Hoy no llama cargarTodo; detalles sí lo hacen al abrirse. |
| Conceptos diarios | Hoy → materialNuevo → SesionMixta → Reproductor | Actualmente 10 entre semana, 20 finde, viernes vacío (`lib/dia.ts:31`). No se cambian los techos. La misión de cinco conceptos difiere del producto ya publicado: decisión de Yoel. |
| Mixta | construirGuion → tramos de hasta tres conceptos → NBME | La cola de errores del tramo aún podía crecer sin límite. |
| Banco | NbmeLibrary → provider → API Worker → NbmePlayer | Primera vuelta, correcciones y catálogo/figuras privados separados. |
| Repaso | cajasDelDia → SesionCajas | Máximo tres reinserciones; pendiente arrastra, sin contador de deuda en portada. |
| IA | Ayuda/Chat/Calificación → Worker → StudyCoach | Cuotas, caché y evidencia literal conservadas. |
| Sync | IndexedDB → motores optimistas → RPC revision/generation | Fixtures prueban conflictos, offline y reset; no hay sesión real para medir fallos en producción. |
| Plan | API proxy → events/week_checkpoints → Hoy/Calendario | Esta tarea sólo lee. El servidor ya incluye una ruta de marcado previa, que no se ejecuta ni se amplía. |

### Medidas de productividad y diseño

- Arnés sintético, Chromium local, 390×844 y 1280×900, America/New_York;
  capturas de Hoy, concepto, NBME, figura ampliada, feedback y cierre.
- Cinco aperturas independientes a 390 px: primer concepto en un toque;
  mediana **1.137 ms** desde navegación, portada lista mediana **724 ms**.
  Son tiempos locales del arnés Vite, no SLA ni tiempos de producción/login.
- Bundle base: entrada JS 539,05 kB / 155,41 kB gzip; App 78,31 / 27,00;
  Reproductor 55,35 / 16,11; NbmePlayer 14,44 / 4,76.
  El coste de corpus en Hoy es cero módulos completos. Inicio/bibliotecas heredadas
  aún cargan todo al visitarlas (`screens/Inicio.tsx:27`, `Modulos.tsx:41`).
- NBME sin desbordamiento de página: scrollWidth 390/1280 para viewport 390/1280;
  pruebas existentes añaden 360 y 1428 px para tablas y columnas.
- Botones NBME medidos: salida 128×44, comprobar móvil 316×50 y ampliar 316×60.
  Conmutador de piel base: 41×44 px; lote 2: 44×44 px medidos a 390 px.
- Texto secundario piel claro 6,88:1 / oscuro 7,53:1; bordes de campos 1,54:1 / 1,49:1.
- Sync: no hay tasa real antes/después sin login. 104 pruebas focalizadas de motores,
  parser, generaciones, diagnóstico y SRS pasan en la revisión adversarial inicial.

## 3. Hallazgos

Referencias a la base anterior a cambios; las pruebas/capturas de cada lote prueban el resultado.
Riesgo indica estado guardado / semántica del plan; alto se mantiene como propuesta.

| ID | Rol · severidad | Evidencia | Impacto en el día de Yoel | Arreglo | Esfuerzo | Riesgo |
|---|---|---|---|---|---|---|
| H01 | Neurocognición + coach · alta | `screens/sesion.ts:32`, `Reproductor.tsx:240`, `semana/SesionMixta.tsx:235` | Un fallo reiterado impide llegar a NBME y terminar el bloque. | Una vuelta finita en nuevos tramos mixtos; conservar cola guardada, intentos y errores para cajas. | Medio | Bajo |
| H02 | Coach · media | `screens/SesionCajas.tsx:191,200,212,233` | Una caja indisponible saltada se anuncia como repasada/acertada. | Diferenciar omitidas y respondidas en esta visita, sin nuevo estado persistido. | Bajo | Bajo |
| H03 | Neurocognición · media | `screens/Reproductor.tsx:527–539` | Puede cambiar confianza/ayuda mientras IA corrige un envío ya comprometido. | Bloquear esas acciones durante la petición. | Bajo | Bajo |
| H04 | Neurocognición · media | `screens/Reproductor.tsx:440–444` | Tras feedback largo el nuevo enunciado puede quedar fuera de vista. | Scroll al enunciado al cambiar presentación, sin mover feedback. | Bajo | Ninguno |
| H05 | Coach · media | `nbme/NbmePlayer.tsx:144,184`, `Reproductor.tsx:494` | Primera vuelta del bloque puede confundirse con pregunta nunca vista. | Etiquetas derivadas de intentos previos; mantenerlas durante feedback. | Bajo | Ninguno |
| H06 | Coach · media | `nbme/NbmePlayer.tsx:159,226,229` | Objetivo/truncado puede ocultar razonamiento y distractor elegido. | Mostrar explicación fuente y distractor elegido tras enviar, sin inventar contenido. | Medio | Ninguno |
| H07 | Coach · media | `nbme/NbmePlayer.tsx:220`, `nbme/model.ts:147` | Un acierto tras leer la explicación parece independiente. | Etiquetar correcciones posteriores a feedback; no alterar puntaje original. | Bajo | Ninguno |
| H08 | Diseño · media | `index.html:5`, ausencia safe-area en CSS | Notch y barra del teléfono pueden recortar controles en horizontal. | Proteger shell y modal con safe-area. | Bajo | Ninguno |
| H09 | Diseño · media | `NbmePlayer.tsx:29`, `TablaPlanificador.tsx:46`, `Ajustes.tsx:111`, `NbmeLibrary.tsx:127` | Algunas regiones de tabla dependen del navegador para scroll por teclado. | Regiones enfocables y nombradas, sin alterar celdas/texto. | Bajo | Ninguno |
| H10 | Diseño · alta | `organic.css:271,273`; `capturas/antes/nbme-390.png` | Valores de laboratorio claros sobre fondo claro (1,08:1) casi ilegibles; caption 2,30:1. | Resolver herencia de laboratorio en ambas pieles con tokens existentes; también bordes de campos <3:1. | Bajo | Ninguno |
| H11 | Diseño · baja | `piel-estudio.css:327–330` | Conmutador móvil mide 41×44 px; ancho inferior a 44 px. | Min-width 44; comprobar foco y ambos temas. | Bajo | Ninguno |
| H12 | Diseño + productividad · media | `NbmePlayer.tsx:65,193`, `nbme.css:64` | Todas las figuras se solicitan juntas; una figura alta puede ocultar opciones sin aviso. | Diferir fuera del viewport, vista compacta, salto visible a opciones; zoom táctil comprobable con gráfico sintético grande. | Medio | Ninguno |
| H13 | Revisor adversarial · alta | `nbme/model.ts:12,110,112`, `model.test.ts:223` | Tras 201 descartes una copia antigua puede resucitar la sesión descartada. | Rediseñar retención con compatibilidad de clientes; no quitar límites a ciegas. | Alto | Alto |
| H14 | Revisor adversarial · media | `nbme/model.ts:15` | Lápidas de misma fecha empatan de forma distinta según orden de mezcla. | Desempate estable por ID; no soluciona por sí solo H13. | Bajo | Bajo |
| H15 | Revisor adversarial · media | `store/sync.ts:52`, `estado.tsx:166,185` | Error objeto de PostgREST acaba sin diagnóstico de red/servidor. | Leer message/status de objetos seguros; mantener mensajes sobrios. | Bajo | Ninguno |
| H16 | Revisor adversarial · media | `server/plan.ts:42,146`, `screens/Hoy.tsx:85,217` | Domingo opcional se descarta; título puede mostrar próxima semana sobre guion actual. | Aceptar dia=0 con pruebas; fijar lectura a semana de estudio sin cambiar plan. | Medio | Bajo |
| H17 | Neurocognición · alta | `interacciones.tsx:149,189,235,286`, `Reproductor.tsx:316`, `srs/azar.ts:49` | Alternativas visibles pueden contar como recuerdo y sobrevalorar evidencia. | Propuesta separada de evaluación/SRS, versionada; no reescribir históricos. | Medio | Alto |
| H18 | Productividad · media | `srs/fsrs.ts:28` | Repasos posteriores al horizonte convergen el 20-dic. | Proponer reparto determinista con tope, ≤20-dic y fixtures antiguos antes de cambiarlo. | Alto | Alto |
| H19 | Productividad · baja | `screens/Inicio.tsx:27`, `screens/Modulos.tsx:41` | Vistas heredadas aún pagan corpus completo; no afecta Hoy actual. | Índice de metadatos o carga focalizada, sólo con igualdad exacta de selección previa/posterior. | Alto | Bajo si idéntica |
| H20 | Coach · baja | `nbme/types.ts:24`, `NbmePlayer.tsx:195` | Sin patrón clínico estructurado ni confianza NBME histórica. | Backlog editorial/diseño de registro; nunca inferir patrones médicos por heurística. | Medio | Alto editorial / bajo estado |
| H21 | Productividad + revisor adversarial · media | CI de los lotes 2–5: unitarias/build terminan, segundo runner de navegador no se asigna; run 37371871821 cancelado sin ejecutar navegador | Impide publicar mejoras verificadas localmente. | Ejecutar los mismos checks en un runner, conservando ambos presupuestos de tiempo y las trazas; adjuntar auditoría sintética sólo en este PR. | Bajo | Ninguno en la aplicación |

Principios de las propuestas docentes:

- H01/H04: carga cognitiva y final visible; el techo anunciado debe limitar trabajo real.
- H02/H05/H07: calibración; distinguir exposición, corrección y desempeño independiente.
- H03: confianza declarada antes del resultado y feedback inmediato tras comprometer respuesta.
- H06/H20: elaboración; conectar caso y mecanismo con la explicación fuente.
- H12: codificación dual; figura legible antes de discriminar opciones.
- H17: dificultad deseable; discriminar alternativas no equivale a producir sin pistas.
- H18: espaciado; repartir oportunidades sin crear una deuda final artificial.

## 4. Backlog por valor frente a riesgo

Primero lotes acotados H01–H12/H15–H16. H13/H17/H18 se dejan como propuestas
porque requieren revisar contratos o decisiones de producto. No se cambia el techo
de diez/veinte conceptos ni el viernes libre durante esta tarea.

1. H13: descartes duraderos incluso tras cientos de sesiones y dispositivos atrasados.
2. H17: evidencia real de discriminación versus recuerdo; revisar SRS/versionado.
3. H18: reparto de los repasos del horizonte, con tope elegido y pruebas deterministas.
4. H19: aligerar bibliotecas/Inicio heredado preservando exactamente los IDs seleccionados.
5. H20: revisión editorial de patrones y distractores faltantes, y confianza NBME compatible.

No se pudieron buscar errores médicos reales: los fixtures son sintéticos y el corpus privado
no se descargó. Revisar gráficos médicos densos/legibilidad y Safari/iPad con login real.

## 5. Lotes y verificación

Esta sección se completa al cerrar cada lote. Capturas: `capturas/antes/` y
`capturas/lote-N/`, a 390 y 1280 px. Cada lote exige pruebas completas, build,
revisión adversarial y CI sobre su HEAD antes de fusionar. Los logs locales se
conservan fuera del repo; los entregables no contienen corpus ni exportaciones.

- Lote 0: AGENTS (<60 líneas), corrección de proyecto Supabase en CLAUDE y esta auditoría.
  Línea base 575/2 y build verde; no hay pantalla modificada.
- Lote 1 · un final real para los bloques: H01–H04 (coach y neurocognición).
  Mixta consume una vuelta sin ampliar errores; las apariciones de colas antiguas
  y su feedback se conservan. Cajas omitidas no acreditan respuesta ni repaso.
  Confianza/ayudas se fijan al envío; el siguiente enunciado vuelve a la vista.
  Diez regresiones unitarias nuevas y dos de navegador, incluyendo lector de
  estado antiguo, cola ampliada, IA pendiente y scroll a 390/1280 px.
  Puertas finales en Node 22: **585 aprobadas/2 omitidas**, build correcto,
  **16/16 e2e**. Revisor adversarial corrigió antes de aprobar cantidadInicial
  ausente y scroll bajo cabecera; ambos casos reproducidos y probados.

- Lote 2 · figuras y lectura móvil: H08–H12 (diseño y productividad).
  Laboratorios usan los tokens de ambas pieles: valores 1,08→13,55:1 y caption
  2,30→6,88:1 en la piel clara. Figuras fuera de vista no se descargan; se
  comprueba que la imagen abra antes de responder si es necesaria. Aviso,
  saltos con foco, errores con reintento y visor 100–400 % con pellizco/arrastre.
  Regiones de tablas accesibles, controles de 44 px y áreas seguras también
  en horizontal. Revisión adversarial corrigió cambio de revisión con modal
  abierto y desplazamiento sin cambio de escala. 29 pruebas UI y 13 casos
  de navegador dirigidos aprobados. Puertas completas: **590 aprobadas/2
  omitidas**, build correcto, **29/29 e2e**. El primer CI del lote 1 detectó
  un selector de prueba ambiguo con el chat durante la transición: se identifica
  ahora la respuesta por su nombre accesible, conservando las aserciones.
  Se repite el navegador sobre el lote aislado tras esta corrección.
  Capturas anteriores y nuevas son limpias y usan sólo contenido sintético.

- Lote 3 · feedback que distingue práctica y corrección: H05–H07 (coach).
  Conceptos/preguntas indican nuevo o ya practicado aquí sin reclasificar
  su primera respuesta al guardarla o retomarla. Correcciones NBME se señalan
  tras explicación; objetivo, fundamento íntegro y distractor elegido están
  visibles después del envío, sin exponerlos antes. NBME se escribe con su
  nombre completo. No cambia letras, puntuación, intentos ni evaluación.
  Principios: calibración y elaboración. 22 pruebas dirigidas aprobadas,
  incluidas diez nuevas; capturas antes/después a 390/1280 px. Puertas
  completas: **600 aprobadas/2 omitidas**, build correcto, **29/29 e2e**.
  Revisión adversarial aprobada. H20 queda editorial.

- Lote 4 · diagnosticar la sincronización y mezclar descartes de forma estable:
  H14–H15 (revisor adversarial; compatibilidad revisada por neurocognición y
  productividad). Errores PostgREST planos conservan message/status/code;
  PGRST000–003 identifican fallo de conexión del servidor sin status del SDK.
  Se preservan prioridad offline/SyncError y causas primitivas; no se ejecuta
  toString de objetos. Lápidas de misma fecha desempatan por ID, con el mismo
  tope y parser. **H13 sigue pendiente:** este desempate no resuelve la retención.
  Cuatro fixtures de estados actuales/antiguos conservan sesión, continuación,
  intentos, letras y borrador. 32 pruebas dirigidas aprobadas; capturas del
  diagnóstico objeto antes/después a 390/1280 px; revisión independiente
  aprobada. Puertas completas: **608 aprobadas/2 omitidas**, build correcto,
  **29/29 e2e**. No se ejecuta transporte remoto.

- Lote 5 · conservar la semana del domingo: H16 (revisor adversarial).
  Proxy y cliente admiten dia=0 sin convertir NULL/false/vacío; no se crea
  un domingo sin checkpoint. Hoy y Calendario piden el lunes de la semana
  de estudio hasta el corte de las 03:00; Hoy conserva su recarga diaria.
  El calendario cambia de semana abierto y resetea su selección junto al
  nuevo plan; la regresión domingo opcional terminado + jueves pendiente
  anterior fallaba antes y ahora abre un único lunes nuevo. No se cambia
  el contrato 0/1–6/NULL, el rango lunes–sábado ni las tres prioridades.
  82 pruebas dirigidas aprobadas, capturas actuales antes/después a
  390/1280 px y revisión adversarial aprobada. Puertas completas:
  **617 aprobadas/2 omitidas**, build correcto y **29/29 e2e**.
  Las capturas usan doble de selección/lectura y parser real; no llaman
  Worker ni base. La prueba nueva del proxy comprueba peticiones GET únicamente.

- Lote 6 · completar la verificación y entregar la auditoría: H21
  (productividad; revisión adversarial). CI conserva npm ci, todas las pruebas
  unitarias, build, Chromium oficial y todos los e2e, ahora en secuencia sobre
  un runner con 20 minutos. No se filtra ni omite ninguna prueba ni se amplían
  permisos. Este PR adjunta un ZIP de auditoría/capturas sintéticas durante
  siete días; los archivos permanecen en el repositorio. No modifica pantallas,
  dependencias ni aplicación. Revisión adversarial aprobada. Puertas locales
  repetidas con Node 22: npm ci correcto, **617 aprobadas/2 omitidas**, build
  correcto y **29/29 e2e**. CI del HEAD exacto se confirma en el PR.

## 6. Resultado medido y publicación

| Comprobación | Antes | Después de lotes 0–6 |
|---|---:|---:|
| Pruebas unitarias aprobadas / omitidas previstas | 575 / 2 | 617 / 2 |
| Pruebas de navegador | 14 / 14 | 29 / 29 |
| Portada lista, mediana de cinco aperturas locales | 724 ms | 572 ms |
| Primer concepto, mediana de cinco aperturas locales | 1.137 ms | 883 ms |
| Toques al primer concepto | 1 | 1 |
| Entrada JS / gzip | 539,05 / 155,41 kB | 539,40 / 155,54 kB |
| App JS / gzip | 78,31 / 27,00 kB | 78,68 / 27,16 kB |
| Reproductor JS / gzip | 55,35 / 16,11 kB | 55,93 / 16,35 kB |
| NBME JS, cargado al abrir pregunta / gzip | 14,44 / 4,76 kB | 19,49 / 6,47 kB |
| CSS / gzip | 153,61 / 32,25 kB | 155,24 / 32,51 kB |
| Figura sintética fuera del viewport, peticiones | 1 | 0 |
| Conmutador móvil | 41×44 px | 44×44 px |

Son medidas de Chromium local con fixtures y Vite, sin login ni latencia real.
La diferencia de segundos no demuestra una mejora causal: no se optimizó la
selección ni el arranque de Hoy. La entrada crece 0,35 kB; el visor y el
feedback explican el aumento del chunk NBME, que se carga al entrar.
Hoy sigue sin materializar módulos completos, verificado por sus rutas de código.
No se conoce la tasa de fallos de sincronización real antes/después.

H01–H12 y H14–H16 quedan implementados y probados; H21 se verifica mediante CI.
H13 y H17–H20 siguen
como propuestas; no se modificaron esquema, corpus/banco, RPC, cuotas ni
criterios/evaluación. Los parsers públicos leen fixtures reales antiguos y
actuales de study_state y nbme_state; conservaron historial y continuación.
Todos los lotes tienen npm ci, pruebas, build, capturas correspondientes y
revisión adversarial local. Sólo las dos omisiones previas se mantienen.

Publicación y CI del HEAD exacto: [PR #46](https://github.com/drytorres96-create/steponemelman/pull/46).
CLAUDE.md exige CI verde y mergeable_state clean antes de main. El primer CI
del lote 1 encontró el selector ambiguo corregido en lote 2; no se desactivó
ningún caso para alcanzar el verde. La publicación final se confirma en el PR,
no se deduce de las puertas locales.

Pendiente comprobar con sesión real: sincronización entre dispositivos,
figuras clínicas privadas, revisión médica del corpus/banco, Safari/iPad y
notch físico. Este entorno no permite descargar Chromium de Playwright desde
su CDN (403 de política de red); las pruebas locales usan Chromium del
sistema y la CI usa la versión instalada por Playwright. La selección diaria
sigue siendo la existente (10/20 y viernes libre); el contexto de cinco
conceptos se dejó documentado como decisión de producto.

Para deshacer: Revert del PR completo en GitHub, o git revert <sha-del-lote>
para una mejora concreta. Si se retiran varios lotes, empezar por el más reciente.
