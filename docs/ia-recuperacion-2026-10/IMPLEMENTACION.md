# Melman 1.27.0 · IA gratuita, corrección de errores, recuperación e icono

## Resultado para Yoel

Después de una respuesta incorrecta, parcial o con error ortográfico, los conceptos muestran «Para tu próximo intento». Las preguntas NBME lo muestran tras elegir una opción incorrecta. La ayuda describe la diferencia observada, propone una posible confusión, señala el dato decisivo y da una comprobación para la próxima respuesta. «Así lo razoné · opcional» permite enviar el paso que llevó a esa elección. Es una petición explícita; escribir no consume IA.

Sin razonamiento aportado, la explicación de la confusión es una hipótesis. La respuesta, la letra elegida y la presentación exacta son hechos disponibles; el modelo no puede conocer el pensamiento del estudiante. La tarjeta conserva el botón para continuar y el material original si falla la IA. No vuelve a llamar automáticamente ni registra intentos adicionales. Respeta el modo examen: la ayuda aparece después de contestar, nunca antes.

En Progreso, y en Hoy → Cómo va todo, «Ponerme al día con la meta» compara lo demostrado con la línea de la meta vigente. Distingue conceptos con dominio demostrado y primeras respuestas NBME. Propone un recorrido de Hoy cuando los criterios siguientes se cumplen. Intentar, demostrar dominio y mantenerlo al día conservan significados distintos.

El icono del acceso directo de iPhone utiliza el símbolo orbital de la cabecera de Melman, con fondo verde oscuro. Safari recibe un PNG opaco de 180 × 180; el manifiesto incluye 192 y 512, con zona segura para máscaras. En Safari: Compartir → Añadir a pantalla de inicio. Un acceso directo anterior puede conservar su icono en caché y necesitar eliminarse y añadirse de nuevo. No borres datos del sitio ni cierres la cuenta para cambiarlo.

## Auditoría de integración y coste

**[Coach / productividad / revisor adversarial]** El Worker autentica al usuario, valida membresía y obtiene el material publicado. Un Durable Object `StudyCoach` reserva consumo antes de llamar a Workers AI. Se conserva `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; los embeddings siguen disponibles en `@cf/baai/bge-m3`. No hay proveedor alternativo de pago, cambio de plan, aumento de límites ni dependencia nueva.

La documentación oficial consultada indica **10 000 neuronas gratuitas al día por cuenta**, con reinicio a las **00:00 UTC**. La aplicación conserva su presupuesto útil de **8500**, reserva del **15 %**, límite individual del **90 %** y **300 llamadas por usuario al día**. Se mantienen los umbrales de los modos: calificar/confusión 100 %, análisis 85 %, chat 75 %, explicación 70 % y examen 60 %. La corrección personalizada usa el umbral de explicación, preservando capacidad para calificar.

Fuentes: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) y [fuente oficial consultada](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers-ai/platform/pricing.mdx). Tarifas conservadas: 26 668 neuronas por millón de tokens de entrada y 204 805 por millón de salida del modelo de texto; 1075 por millón de entrada del embedding.

| Hallazgo | Cambio verificable | Efecto |
| --- | --- | --- |
| `Number(null/false/"")` podía convertir consumo desconocido en cero | Uso exige enteros numéricos válidos; si falta, se conserva la reserva estimada | Evita devolver presupuesto sin evidencia |
| Una respuesta anterior a medianoche podía liquidarse contra el día nuevo | La reserva lleva su día UTC; la transacción comprueba el día al liquidar | El resultado viejo no reduce el contador nuevo |
| Repetir un fallo idéntico podía generar otra llamada costosa | Coalescencia existente y espera de 60 s para fallos 503 idénticos, con `Retry-After` | Reintentar manualmente enseña el aviso sin gastar otra reserva durante la espera |
| La ayuda extensa carecía de límite cliente y no actualizaba consumo | Transporte compartido, cancelación portable y plazos acotados | Se puede continuar y el medidor se actualiza |
| Chat podía perder contexto o exceder 6000 bytes con Unicode | Turnos completos recientes, eliminación de parejas antiguas y contexto exacto de la presentación | Conserva conversación válida; no corta respuestas a mitad |
| Una consulta fallida contaminaba el historial siguiente | Excluye la pareja fallida y devuelve la duda al campo | Retomar conserva una pregunta pendiente útil |
| `apoyo: material` se aceptaba sin cita comprobada | Exige una cita literal localizada de 15–180 caracteres | La interfaz dice qué cita encontró, sin certificar toda la interpretación |
| El medidor enseñaba disponibilidad global aunque hubiera un límite individual o por modo | Campos nuevos opcionales; lectura antigua compatible; actualización agrupada a 900 ms y al reinicio UTC | Indica cuándo queda corrector aunque la ayuda extensa haya agotado su parte |
| La similitud semántica no explicaba el error concreto | Una generación breve usa respuesta exacta, referencia y razonamiento opcional | Mejora la corrección personal; sustituye la consulta automática de similitud |

Los máximos de salida bajan de 650 a **500 tokens en chat** y de 550 a **450 en explicación**. La nueva corrección usa **400**. Son límites de reserva, no mediciones de ahorro real ni de calidad clínica. No se recorta el contenido médico para forzar una generación: si excede el límite o falta una fuente válida, se conserva su explicación original.

La caché de éxito sigue limitada a siete días y 200 entradas. Las claves incluyen usuario, modelo, fuente vigente y contexto; en corrección también incluyen respuesta/letra y razonamiento. Autorización, disponibilidad y revisión se comprueban antes de consultar la caché. NBME reutiliza su puerta existente: membresía del banco, pregunta disponible y revisión fijada. Se conservan letras originales, sin reordenarlas.

Una cita literal sólo acredita la coincidencia del fragmento. Las interpretaciones pueden equivocarse. La tarjeta no cambia el veredicto; la corrección manual del estudiante sigue disponible donde ya existía. Una cuota finita no permite garantizar generación ilimitada para cada fallo. Al agotarse, se muestra el motivo y continúa el estudio con el material existente. La asignación gratuita es compartida por la cuenta de Cloudflare: la app conserva su margen, pero no controla el consumo de otros proyectos.

## Criterios para ponerse al día

**[Coach / neurocognición-ADHD / productividad]** La opción es informativa dentro de un desplegable, con un siguiente paso finito. No añade rachas, alertas de deuda ni cambia el horizonte o los criterios de dominio.

1. La ventana debe estar activa: días 1–60 de la meta existente, del 25-sep al 23-nov de 2026. Tras ella, Hoy conserva la consolidación y el mantenimiento.
2. Índice, catálogo y progreso deben estar disponibles. Una primera sincronización incompleta o fallida impide crear un recorrido sobre datos parciales.
3. El viernes queda libre. La distancia puede consultarse, pero no se ofrece recuperación.
4. Debe existir atraso fuera del margen ya acordado de planificación: **10 % de la línea, tres unidades como mínimo**. La diferencia exacta se muestra incluso dentro del margen. Por ejemplo, 50 frente a 57 muestra siete; 54 frente a 57 muestra tres y mantiene el día habitual.
5. Una sesión pendiente de conceptos o NBME se retoma antes de abrir otra. También se comprueban sesiones NBME pausadas que no sean la activa; las sesiones internas de cajas conservan su reanudación habitual.
6. Primero se ofrecen los repasos vencidos válidos que ya selecciona Hoy, en el mismo orden y dentro de sus plazas restantes. Incluyen mantenimiento del dominio acreditado cuando corresponde. Se conserva la cola pendiente completa, sin recortarla a la diferencia de la meta.
7. Sólo después se ofrece material nuevo de los guiones semanales conocidos: IDs publicados, NBME `ready`, revisión vigente y selección idéntica a Hoy. Si falla la carga semanal, los repasos conocidos siguen disponibles y lo nuevo espera.
8. Se mantienen los techos: lunes–jueves 10 conceptos nuevos, 5 NBME nuevas y 40 repasos; fin de semana 20/10/70; viernes cero. La cola nueva se deduplica sin reordenarla y respeta las plazas que quedan.
9. Al tocar el botón se recalculan fecha, progreso y elegibilidad. El cambio de día a las 03:00, una semana nueva o una sincronización reciente no ejecutan una propuesta vieja.

«Completar siete» no equivale a «dominar siete». Se conservan los criterios de cada cuenta. Los criterios por defecto piden tres aciertos independientes, dos sesiones, al menos 48 horas entre la primera y última evidencia, y siete días sin confusión, con recuerdo o aplicación según el criterio existente. Una repetición inmediata puede reparar un error, pero no suplanta la recuperación tras un intervalo. La opción no promete cerrar todo el atraso en una sola sesión.

El cálculo es derivado, sin tabla nueva ni marca de deuda guardada. Usa metadatos y carga el panel sólo cuando se abre; no descarga el corpus completo para mostrar la propuesta. La sesión elegida escribe el progreso de la forma habitual al responder, sin alterar historiales, borradores, lápidas, generaciones o continuaciones anteriores.

## Diseño y principios

**[Diseño web]** Fondo verde oscuro, símbolo existente y recursos versionados evitan una identidad separada para el acceso directo. iOS aplica sus esquinas; el PNG no trae esquinas transparentes. Se conserva alcance `/`, entrada `/` y modo `standalone`. El manifiesto y aliases revalidan; los iconos nuevos versionados admiten caché inmutable. No se incorpora un service worker que almacene material privado.

**[Coach]** La corrección específica conecta elección, dato decisivo y próxima comprobación. Principio: feedback centrado en la tarea y el proceso, no juicios sobre la persona ([Hattie y Timperley, 2007](https://doi.org/10.3102/003465430298487)). Se distingue observación de hipótesis cuando falta razonamiento.

**[Coach / productividad]** Prioridad a recuperación espaciada y evidencia antes que lectura repetida o cierre cosmético. Principios: beneficio de recuperar frente a releer ([Roediger y Karpicke, 2006](https://doi.org/10.1111/j.1467-9280.2006.01693.x)) y práctica distribuida ([Dunlosky et al., 2013](https://doi.org/10.1177/1529100612453266)). Estas referencias apoyan el enfoque; no validan clínicamente un algoritmo o un tratamiento para ADHD.

**[Neurocognición-ADHD / diseño web]** Un siguiente paso, información ampliable, razonamiento opcional, final cercano y continuación disponible reducen acciones obligatorias. Movimiento reducido, safe-area, foco y controles de al menos 44 px se conservan. La inspección encontró una sugerencia de chat de 38 px; se corrigió a 44.

## Verificación y revisión adversarial

Pruebas con estados, IDs, preguntas y respuestas de IA **sintéticos**. No se consultaron bases reales, ejecutaron RPC o migraciones ni copiaron contenido médico privado. No cambiaron corpus, banco, revisiones reales, `bankVersion`, evaluación ni `EVALUADOR_VERSION`. Se preservan ambos modelos de estado, sus contratos y la sincronización existente.

| Lote | Commit | `npm ci` → `npm test` → build → navegador |
| --- | --- | --- |
| 1 · presupuesto | `4de8611` | Node 22; 712 aprobadas, dos omitidas esperadas; build; 37 E2E |
| 2 · transporte y contexto | `be759cb` | Node 22; 727 + dos omisiones; build; 39 E2E |
| 3 · corrección de errores | `fd4ad76` | Node 22; 738 + dos omisiones; build; 43 E2E |
| 4 · recuperación | `ae05be3` | Node 22; 754 + dos omisiones; build; 47 E2E |
| 5 · icono, pulido táctil y compatibilidad | HEAD del PR | Suite final: 758 unitarias y 47 E2E; ejecutar puertas sobre esta versión |

El aviso de chunk >500 kB es informativo y permanece. Las dos omisiones son las esperadas del proyecto, incluida la comprobación que necesita un corpus privado externo. No se saltó ni desactivó una prueba. La fusión requiere las puertas locales verdes y «Verificar aplicación» verde sobre el HEAD exacto, sin conflictos con main.

Revisión adversarial por diff: cuotas y modelos iguales; contador compatible `v=2` sin reinicio de despliegue; medianoche y valores nulos; límites de bytes y cancelación sin APIs recientes obligatorias; cache sin bypass de permisos; revisión y letra NBME; presentación 1/2/3 reconstruida; errores incompletos o citas inventadas rechazados; respuestas fallidas sin reintento; sesiones pausadas; viernes/cambio de semana; techo y selección exactos; geometría original del logo, PNG opaco y máscaras. El transporte conserva los veredictos del contrato antiguo cuando falta el motivo opcional, sin exigir un campo nuevo para aceptar una calificación válida. Los casos cuentan con pruebas dirigidas además de las suites existentes.

Capturas de navegador en 390 y 1280 px, movimiento reducido: [antes](capturas/antes/) y [después](capturas/despues/). Se utilizan las mismas escenas sintéticas; la base conserva código de aplicación `4177e2d` (1.26.0), con dobles de autenticación y metadatos de prueba para habilitar la demostración sin acceder a cuentas reales. [Capturas de cada lote visual](capturas/lotes/) conservan la evidencia intermedia. En la versión final: cero errores de página, cero desbordamientos horizontales y cero controles visibles menores de 44 px en las escenas medidas. Los JSON contienen medidas y peticiones sintéticas para revisar el contexto enviado.

| Escena | 390 px | 1280 px |
| --- | --- | --- |
| Error de concepto | [antes](capturas/antes/error-concepto-390.png) · [después](capturas/despues/error-concepto-390.png) | [antes](capturas/antes/error-concepto-1280.png) · [después](capturas/despues/error-concepto-1280.png) |
| Chat y cita | [antes](capturas/antes/chat-390.png) · [después](capturas/despues/chat-390.png) | [antes](capturas/antes/chat-1280.png) · [después](capturas/despues/chat-1280.png) |
| Error de opciones | [antes](capturas/antes/error-opciones-390.png) · [después](capturas/despues/error-opciones-390.png) | [antes](capturas/antes/error-opciones-1280.png) · [después](capturas/despues/error-opciones-1280.png) |
| Recuperación | [progreso antes](capturas/antes/progreso-390.png) · [opción nueva](capturas/despues/recuperacion-390.png) | [progreso antes](capturas/antes/progreso-1280.png) · [opción nueva](capturas/despues/recuperacion-1280.png) |

Límites de comprobación: modelos y consumo se simulan en pruebas; no se ha medido facturación de la cuenta ni calidad clínica con material real. La inspección de tarifas fue de documentación oficial, no del plan privado de Cloudflare. Las capturas son de Chromium con tamaños móviles, no de un iPhone físico. La red de esta sesión bloquea `workers.dev` y `supabase.com` con un 403 del proxy; una comprobación de despliegue de Cloudflare es evidencia distinta de abrir la aplicación publicada en Safari. El icono final puede verse en [512px](../../public/brand-v127-512.png).
