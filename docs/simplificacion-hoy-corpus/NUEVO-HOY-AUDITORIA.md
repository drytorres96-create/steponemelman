# Nuevo de Hoy: diagnóstico y regla de selección

La lectura de la cuenta del 7 de octubre de 2026 reprodujo el problema sin escribir en Supabase. La semana del 5 al 11 no tenía guiones; el historial sí contenía un concepto y una pregunta resueltos por primera vez ese día. El selector anterior ofrecía exclusivamente IDs de esos guiones: calculaba un techo de 1/1 y cerraba Nuevo, aunque el corpus publicado tenía 2079 conceptos y el banco 592 preguntas listas.

El selector ahora conserva la prioridad semanal y completa las plazas con el corpus publicado en orden editorial y el orden del catálogo actual. Hoy y RecuperarMeta comparten `completarEntradaDeHoy`. La llegada posterior del Plan no cambia la selección ni la identidad de un bloque NBME.

Para conceptos y preguntas por separado, el objetivo es `min(techo del día, primeros resueltos hoy + disponibles nunca resueltos)`. Se ofrecen sólo las plazas restantes. Se eliminan duplicados e IDs ausentes antes de aplicar el techo. Una pregunta lista lleva la revisión actual; una respuesta previa de otra revisión sigue excluyendo ese mismo ID de Nuevo. Un intento de concepto pendiente de revisión no acredita trabajo resuelto. Un concepto ya respondido y aún sin dominio se consolida en Cajas conforme a su agenda.

Se mantienen los límites: 10 conceptos y 5 preguntas entre semana, 20 y 10 los fines de semana, cero el viernes. El día usa el calendario de Nueva York con corte a las 03:00. No se crean respuestas, dominio, fechas ni crédito por visualización, y los registros de material retirado permanecen intactos.

La carga de guiones se espera antes de seleccionar. Si falla y existe material publicado conocido, aparece un aviso y se puede continuar con ese material. Un fallo sin corpus disponible no se presenta como un día terminado. El botón «Retomar mi sesión pendiente» utiliza la cola y la posición guardadas.

## Verificación

El recálculo sobre las revisiones de estudio 8932 y NBME 2008 mantuvo 201 progresos, de los cuales 184 tenían algún intento resuelto. El resultado pasó de objetivo 1/1 cerrado a objetivo 10/5 abierto, con 9 conceptos y 4 preguntas disponibles. Las 40 cajas de ese día seguían hechas. Todos los candidatos existían en el corpus o banco actual, carecían de respuesta resuelta previa y la repetición produjo la misma selección. El resumen anterior y posterior del historial fue idéntico.

Seis suites focales: 87 pruebas aprobadas, incluidas regresiones de guiones vacíos o agotados, prioridad semanal, duplicados, IDs retirados, respuestas por revisar, revisión antigua, catálogo ausente, evidencia futura, viernes y fines de semana. La navegación también verificó que una cola guardada con IDs repetidos recupera exactamente la posición original. TypeScript pasó sin errores. Los snapshots privados y sus identificadores no forman parte del repositorio.
