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
  El conmutador de piel requiere verificación específica antes de corregirlo.
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
| H11 | Diseño · baja | `piel-estudio.css:327–330` | Conmutador móvil posiblemente 41 px, pendiente medida. | Min-width 44 si se confirma; comprobar foco y ambos temas. | Bajo | Ninguno |
| H12 | Diseño + productividad · media | `NbmePlayer.tsx:65,193`, `nbme.css:64` | Todas las figuras se solicitan juntas; una figura alta puede ocultar opciones sin aviso. | Diferir fuera del viewport, vista compacta, salto visible a opciones; zoom táctil comprobable con gráfico sintético grande. | Medio | Ninguno |
| H13 | Revisor adversarial · alta | `nbme/model.ts:12,110,112`, `model.test.ts:223` | Tras 201 descartes una copia antigua puede resucitar la sesión descartada. | Rediseñar retención con compatibilidad de clientes; no quitar límites a ciegas. | Alto | Alto |
| H14 | Revisor adversarial · media | `nbme/model.ts:15` | Lápidas de misma fecha empatan de forma distinta según orden de mezcla. | Desempate estable por ID; no soluciona por sí solo H13. | Bajo | Bajo |
| H15 | Revisor adversarial · media | `store/sync.ts:52`, `estado.tsx:166,185` | Error objeto de PostgREST acaba sin diagnóstico de red/servidor. | Leer message/status de objetos seguros; mantener mensajes sobrios. | Bajo | Ninguno |
| H16 | Revisor adversarial · media | `server/plan.ts:42,146`, `screens/Hoy.tsx:85,217` | Domingo opcional se descarta; título puede mostrar próxima semana sobre guion actual. | Aceptar dia=0 con pruebas; fijar lectura a semana de estudio sin cambiar plan. | Medio | Bajo |
| H17 | Neurocognición · alta | `interacciones.tsx:149,189,235,286`, `Reproductor.tsx:316`, `srs/azar.ts:49` | Alternativas visibles pueden contar como recuerdo y sobrevalorar evidencia. | Propuesta separada de evaluación/SRS, versionada; no reescribir históricos. | Medio | Alto |
| H18 | Productividad · media | `srs/fsrs.ts:28` | Repasos posteriores al horizonte convergen el 20-dic. | Proponer reparto determinista con tope, ≤20-dic y fixtures antiguos antes de cambiarlo. | Alto | Alto |
| H19 | Productividad · baja | `screens/Inicio.tsx:27`, `screens/Modulos.tsx:41` | Vistas heredadas aún pagan corpus completo; no afecta Hoy actual. | Índice de metadatos o carga focalizada, sólo con igualdad exacta de selección previa/posterior. | Alto | Bajo si idéntica |
| H20 | Coach · baja | `nbme/types.ts:24`, `NbmePlayer.tsx:195` | Sin patrón clínico estructurado ni confianza NBME histórica. | Backlog editorial/diseño de registro; nunca inferir patrones médicos por heurística. | Medio | Alto editorial / bajo estado |

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
