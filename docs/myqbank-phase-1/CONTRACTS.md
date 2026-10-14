# Contratos y matriz de la reedición

Estos contratos fijan el trabajo posterior. Los tipos nuevos de `src/myqbank/`
describen presentación y propuestas; no alteran los tipos persistidos actuales.

## Matriz de pantallas y estados

| Área | Estados requeridos | Evidencia de fase 1 | Integración |
| --- | --- | --- | --- |
| Dashboard | Con/sin historial, bloque en curso, filtros vacíos, cantidad reducida | Muestra navegable y selección sin duplicados | Fase 3 con datos reales. |
| Meta | Objetivo, realizado, restante y cierre | Tarjeta de ejemplo; contrato del motor intacto | Fase 3 reutiliza techoHorizonte y calendario. |
| Build a block | NBME, conceptos, mixto; Tutor/Test; selección por sistemas y pools | Muestra navegable con cola sintética | Fases 2–3 con validadores y cola real. |
| Settings | Tema, cuenta, respaldo, sincronización, FAQ | Diálogo de tema y acceso a estados comunes | Fase 3 mantiene las acciones existentes. |
| Autenticación | Acceso, recuperación, sesión caducada | Tokens/componentes definidos; AuthGate intacto | Fase 3. |
| Pregunta | Sin responder, borrador, enviada correcta/incorrecta | Caso y recuerdo/cálculo sintéticos | Fase 4 mantiene los diez evaluadores reales. |
| Respuesta pendiente | Guardada sin resultado definitivo | Modelo definido; no simular fallo | Fases 2 y 4. |
| Test | Guardada sin resultado, navegación, cierre, revisión | Muestra y prueba de no revelación | Fase 2 debe proteger todas las vistas reales. |
| Explicación | Una, varias, pendiente, no aplicable | Casos de una, dos y cinco secciones; estados comunes | Fase 4 con fuentes revisadas. |
| Recursos | Figuras, laboratorio del paciente, referencia, imagen fallida | Tabla sintética de signos vitales; resto especificado | Fase 4 con recursos originales y fuentes. |
| Pausa/cierre | Borrador, retorno, intento inmutable, omitida | React conserva bloque y borrador al pausar | Fase 2 añade persistencia/compatibilidad. |
| Anotaciones | Marcador, subrayado, borrado, conflicto | Marcador en memoria; contrato de anclaje | Fase 2 guarda; fase 4 conecta selección de texto. |
| Carga/error/vacío | Mensaje, foco, reintento, estado accesible | Galería accesible desde Settings | Se reutiliza por pantalla. |

## Sesión y evaluación

La identidad NBME sigue siendo `id + revision` y la oportunidad sigue usando la
clave estable de sesión/posición. Nunca se cambian letras, revisiones, bankVersion,
calificación histórica ni firmas RPC para acomodar el aspecto visual.

1. **Crear:** fijar cola única y referencias exactas. Los contadores y el bloque
   comparten función de selección; no sumar pools solapados. En producción los
   conceptos usan el motor actual, no el selector simplificado de la muestra.
2. **Modo:** elegir antes de comenzar; una sesión antigua adopta Tutor. El modo se
   mantiene durante el bloque para impedir convertir ayuda en intento de examen.
3. **Borrador:** selección provisional sin calificar. Navegar o pausar no lo pierde.
4. **Enviar:** un único intento por oportunidad. Un fallo de red conserva la
   operación pendiente; repetir envío no crea otro intento.
5. **Omitir:** no crea respuesta ni fallo. Una omisión puede resolverse después.
6. **Navegar:** volver a una enviada muestra el intento guardado, no permite editarlo.
7. **Cerrar:** termina explícitamente el bloque. Las no respondidas quedan sin
   calificación. Salir/pausar no cierra ni borra historial.
8. **Repetir:** crea una nueva oportunidad marcada como práctica/reintento y conserva
   primera nota y ayuda previa; no se implementa borrando respuestas.
9. **Recuperación:** conserva el retorno al bloque y pregunta original, reutilizando
   el recorrido existente de recuperación y su presupuesto de IA.
10. **Confianza:** nuevas respuestas sin selector conservan `null`. La confianza
    histórica permanece legible por FSRS; no equivale a baja confianza.

`canReveal(mode, submitted, completed)` es el contrato compartido: en Test,
ni banner, texto, colores de opciones, mapa, porcentajes, texto accesible o resumen
del dashboard revelan resultado antes de cerrar. Las preguntas no respondidas
siguen sin respuesta revelada por este contrato; una revisión de solución sin
intento necesitará un estado explícito en fase 4.

Antes de guardar campos nuevos en fase 2, ampliar lectores, validadores y merges,
incluidas sesiones archivadas. Verificar ambos fixtures actuales, defaults,
generation/revision, lápidas y datos escritos por otra pestaña o dispositivo.
El rollback de interfaz debe poder leer lo ya escrito. No se cambia el esquema
persistido hasta completar esta compatibilidad.

## Definición de métricas

| Métrica | Numerador y denominador | Casos que se excluyen |
| --- | --- | --- |
| NBME utilizadas | IDs distintos con respuesta enviada / banco elegible | Sin respuesta, bloqueadas. |
| Acierto NBME | Primeras respuestas correctas / primeras respuestas calificables | Reintentos, conflictos y omisiones. |
| Errores pendientes | IDs aún pendientes de recuperación según modelo actual | Errores históricos ya resueltos. |
| Conceptos vistos | Exposición registrada por el modelo vigente | No implica dominio. |
| Dominio/mantenimiento | Criterios actuales y separación temporal | No se deriva del porcentaje NBME. |
| Marcadas | IDs distintos con marcador activo | Marcadores borrados. Puede solaparse con otros pools. |
| Omitidas | Omisión explícita por sesión | No cuenta como incorrecta. |
| Ritmo | Tiempo activo de respuesta / intentos medidos | Lectura de explicaciones, pausa, ayuda. |
| Actividad semanal | Registro diario con zona y calendario existentes | No inferir día por UTC del servidor. |
| Meta | Motor existente, techo y pendientes vigentes | Crear un bloque grande no aumenta la meta diaria. |
| Sin observaciones | Valor ausente: `null` y «—» | Nunca convertir a 0 % de acierto. |

En Mixed se presentan métricas por material: no se promedian dominio y acierto.
La muestra ilustra esta separación y no calcula dominio. Una sugerencia de debilidad
necesita tamaño de muestra y errores pendientes; con pocos datos ofrecer cobertura
o práctica breve. No clasificar un sistema por un único fallo. Ritmo de 90 segundos
solo para NBME cuando corresponda, no para todos los conceptos.

## Contrato editorial

Cada adaptación mantiene identidad de fuente, revisión, variante, hash, idioma,
versión editorial, estado y evidencia por sección. El consumidor solo usa una
adaptación aprobada que corresponda a la presentación actual. Si la fuente cambió,
mantiene acceso a la explicación disponible y marca la adaptación como pendiente.

| Sección | Incluir cuando | No completar por obligación |
| --- | --- | --- |
| Read the stem / Key idea / Key data | Hay pistas o un dato central que explica la decisión | No añadir «ruido» ficticio a un recuerdo simple. |
| Mechanism / Steps | La causalidad o el cálculo aporta comprensión | No inventar mecanismos para hechos aislados. |
| Every choice | Existen alternativas/comparaciones y justificación revisada | NBME no tiene actualmente ese campo estructurado. |
| Pattern | Hay regla discriminativa con límites explícitos | No convertir una asociación en regla absoluta. |
| Drills | Hay un ejercicio corto respaldado, con solución | No generar práctica infinita ni conceder dominio automático. |

La etiqueta está en inglés y el contenido nuevo en español. Textos existentes
conservan idioma; explicaciones NBME se adaptan al español, preservando originales.
Estados por sección: `available`, `not_applicable`, `pending`. Una sección no
aplicable desaparece; una pendiente no se rellena ni se cuenta como terminada.
Una única sección elimina el tablist. El objetivo de lectura inicial es 40–80
palabras y hasta tres ideas, sin omitir unidades, negaciones o excepciones.

En conceptos corregidos, la evidencia sale de `revision_editorial.fundamento`
con referencias, no del fragmento original erróneo. Los dos casos antiguos sin
fundamento mantienen su bloqueo para IA. Los vínculos NBME sugeridos no equivalen
a evidencia validada. Se requiere revisión clínica por ID en fases 4–5.

## Almacenamiento futuro

**Decisión propuesta:** anotaciones en una tabla privada independiente; adaptaciones
en activos privados complementarios. Ni cambios de esquema ni publicaciones en fase 1.

- Anotación: UUID, propietario, material, ID/revisión/variante, tipo, región y
  selección literal con prefijo/sufijo/offsets. El contenido explicativo incluye
  su versión en el anclaje. Timestamp, revisión y lápida de borrado para conflictos.
- Una fuente modificada no desplaza un subrayado a otra frase ambiguamente. Mostrar
  que necesita revisión o dejarlo sin anclar; conservar el dato del usuario.
- Escrituras idempotentes por ID. Cola local de operaciones solo en fase 2,
  confirmación al guardar, reintento y resolución mediante revisión/CAS. Desmarcar
  genera lápida para no reaparecer al unir dispositivos.
- RLS: propietario y membresía; ambas condiciones en lectura, actualización y
  `WITH CHECK`. No confiar en metadata editable del usuario. Privilegios mínimos,
  sin service_role en cliente. Prueba explícita con dos usuarios antes de integrar.
- Activo docente: versión propia y correspondencia con la fuente, carga diferida,
  caché por revisión, publicación/reversión con CAS. No mezclar sus registros con
  el índice de preguntas ni ampliar bankVersion por cambios exclusivamente visuales.
- `study_state`, `nbme_state`, sus RPC y políticas actuales mantienen su función.
  Ninguna implementación de estos cambios forma parte de la fase 1.
