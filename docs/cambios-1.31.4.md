# Recuperación NBME 1.31.4

Diseño web / revisor adversarial: la generación seguía terminando en `no_verificable`.
El contrato pedía al modelo volver a copiar objetivo, evidencia, respuesta y alternativas
con numerosas condiciones exactas. Una diferencia en cualquiera de ellas descartaba el
lote completo. Esta corrección afecta al servicio de recuperación de todas las preguntas.

El servidor construye un catálogo acotado a partir de la revisión NBME autorizada y
los conceptos relacionados disponibles. Prioriza el objetivo y la respuesta correcta,
conserva afirmaciones completas y su contexto y evita preguntar por palabras funcionales.
Cloudflare selecciona únicamente de tres a seis identificadores. El servidor reconstruye
los ejercicios y conserva las comprobaciones de cita literal, origen, respuesta única,
diversidad, cantidad y alternativas. Los órdenes de las opciones generadas varían;
las letras y el contenido de las preguntas NBME se conservan.

El catálogo intenta primero citas completas de hasta 200 caracteres. Si no permiten
formar un lote válido, un segundo pase admite hasta 300 para conservar todo el contexto;
las preguntas admiten 350. No se recortan cláusulas ni se separan pronombres de su
antecedente para hacerlas caber. Las pruebas admiten 300 y rechazan 301; el pase largo
no se utiliza si el corto basta. El objetivo se toma del campo docente original, con
una oración completa cuando ese campo supera 350 caracteres.

Una comprobación acotada detecta clasificaciones explícitas opuestas del mismo agente
entre explicación y objetivo. Ante esa contradicción se excluye toda la fuente primaria
para recuperación, sin decidir qué campo prevalece ni cambiar el banco. Sólo se pueden
utilizar conceptos vinculados previamente aprobados; si no hay material suficiente se
explica el conflicto antes de consultar IA, caché o cuota. Esto no constituye una
auditoría médica completa ni declara correcta toda fuente que no dispara el detector.
La revisión médica de esta política consultó [DailyMed](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fb08161e-7711-406d-e7b3-ea4515c07983)
y [FDA](https://www.accessdata.fda.gov/drugsatfda_docs/label/2022/008453s040lbl.pdf).

Si el modelo devuelve una selección inválida, se utiliza una selección del mismo
catálogo que también supera la validación. La aplicación muestra que se preparó desde
el material verificado. No hay una segunda inferencia, una respuesta médica inventada
ni un registro de acierto NBME. Se conserva esa procedencia al guardar y retomar.

El modelo de 70B y el presupuesto gratuito permanecen; seleccionar identificadores
necesita un máximo de 256 tokens de salida. La reserva y la liquidación usan el prompt
efectivamente enviado. Los permisos, la revisión exacta y las fuentes se comprueban
antes de consultar la caché. La clave v3 aísla rechazos anteriores y la caché conserva
la procedencia. Los errores técnicos del proveedor y el agotamiento de cuota mantienen
sus respuestas propias, sin reintentos automáticos.

Se validan el circuito de selección por identificadores, la salida inválida, la práctica
alternativa, el almacenamiento, la compatibilidad de prácticas anteriores, el retorno
a la misma pregunta y la conservación de sesiones e intentos. El material privado y
los resultados por pregunta se mantienen fuera de Git. La comprobación de fuentes y
las pruebas simuladas no equivalen a una inferencia real en la cuenta de Cloudflare.

La comprobación privada de las 592 fuentes publicadas encontró una fuente primaria
contradictoria sin conceptos vinculados utilizables, que se excluye. Las otras 591
producen seis ejercicios que superan el contrato de cita y la selección por IDs.
Las dos fuentes que necesitaban contexto de más de 200 caracteres pasan el segundo
intento acotado. Esta cifra describe cobertura estructural, no una revisión médica
individual de todo el banco. La CPU local se midió por separado; el catálogo ejecuta
dentro del Durable Object, cuyo [límite documentado](https://developers.cloudflare.com/durable-objects/platform/limits/)
por defecto es 30 segundos por invocación. No se cambia la configuración ni se presenta
la medición local como rendimiento de producción.

Validación local: `npm ci`, 1154 pruebas unitarias aprobadas con las dos omisiones
esperadas y `npm run build` correcto. El flujo de recuperación tiene diez casos de
navegador aprobados, incluidos generación, respaldo, borrador, recarga, retorno y
conservación de resultados a 390 y 1280 px. Se inspeccionaron capturas antes/después
a ambos anchos, sin desbordamiento. La publicación requiere además CI verde sobre el
commit exacto y la comprobación de despliegue de Cloudflare sobre el merge en main.
