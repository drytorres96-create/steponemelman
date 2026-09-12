# StepOneMelman 1.6.2

Fecha: 2026-09-12. Correcciones sobre la entrega 1.6.1.

La limpieza de caché eliminaba también el índice y las migraciones del corpus. Además, una pregunta retirada podía seguir calificándose desde la copia del navegador y el formato convertía la referencia vertebral `L3` en `L³`.

## Cambios

- La limpieza elimina únicamente módulos con una versión semántica anterior. Conserva índice, migraciones, cuarentena, versiones posteriores, otras cuentas y progreso. Un rechazo remoto con conexión no se sustituye por contenido antiguo del índice.
- Se conservan `L3`, `mL 3` y `dL 3`. Los cocientes, exponentes explícitos y comillas de diálogo no generan las falsas alarmas corregidas.
- Los defectos de lectura se comprueban en el enunciado, las tablas y las alternativas. La API privada, la lectura de caché y el controlador de respuestas impiden calificarlos. El catálogo vigente puede retirar una pregunta sin borrar su revisión histórica, borradores ni intentos anteriores.
- El servidor consulta la disponibilidad actual mediante las políticas de acceso. Se retira la caché compartida del catálogo que podía mantener permisos o disponibilidad anteriores.
- Un bloque de 20 revisiones usa cuatro consultas a Supabase: identidad, membresía, catálogo y lote de preguntas. La disponibilidad se valida antes de descargar contenido; las respuestas mantienen el orden y la revisión solicitados.
- El índice compacto del catálogo conserva identificación, clasificación, disponibilidad y orden. Reduce el JSON de 423.655 a 181.165 bytes (57,2 %). Los fundamentos y enlaces completos siguen en cada pregunta privada y en el catálogo de respaldo. El servidor admite el catálogo completo si no existe el compacto.

## Estado del banco

Se mantiene el banco de 596 identidades. El catálogo `1.0.0-392d86977641-safety162` contiene 327 preguntas habilitadas y 269 pendientes. Se retiraron de la práctica 51 preguntas: unión de 36 bloqueos indicados por la revisión anterior y 21 defectos de lectura detectados, con 6 coincidencias.

La actualización conserva las 596 referencias y todas las revisiones inmutables. En una sola transacción se guardó el catálogo anterior en `releases/1.6.2/catalog-before.json`, el registro de retiradas en `releases/1.6.2/withdrawals.json`, y se publicaron ambos catálogos. La transacción comprueba la huella del catálogo previo, todas las referencias y los recuentos; no escribe en tablas de progreso ni membresías.

La carga editorial anterior contiene revisiones nuevas para 484 de 596 identidades; 112 de la forma 29 siguen sin esa revisión. Los adjuntos disponibles no incluyen el banco final revisado ni los PDF fuente de estas formas. Esta publicación no completa esa revisión documental ni certifica la exactitud médica de las preguntas habilitadas. Para habilitar material pendiente hace falta cotejarlo con una fuente legible y publicar revisiones verificadas.

## Comprobación

`npm test` pasa 246 pruebas; dos pruebas de integración con material privado externo quedan omitidas por su configuración. `npm run build` pasa TypeScript y la compilación de producción.

Las regresiones cubren caché con y sin conexión, denegación de acceso, conservación de sesiones entre dispositivos, retirada de una pregunta ya seleccionada, lectura dudosa en alternativas, atajos de teclado, revisiones exactas y carga por lotes con orden inverso en la respuesta del servidor.
