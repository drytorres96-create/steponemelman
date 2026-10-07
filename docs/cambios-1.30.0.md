# 1.30.0 · Recuperar un error sin perder el bloque y orientar la meta

Al fallar una pregunta NBME, se pueden elegir más conceptos relacionados de Melman o generar manualmente una práctica corta con Cloudflare AI. La práctica conserva su continuación en la misma cuenta y dispositivo; las respuestas a conceptos Melman existentes siguen el historial global y se sincronizan. Terminar permite volver a la pregunta original o avanzar una sola vez en el mismo bloque. Las recuperaciones después de una explicación se registran como guiadas, sin acreditar respuestas independientes.

La biblioteca añade continuar, ver únicamente las falladas y borrar sesión. Borrar oculta el bloque y conserva sus intentos y progreso. La barra representa la primera vuelta: verde para correctas, rojo para incorrectas y gris para no respondidas o en conflicto; las correcciones posteriores no alteran esos colores. Las sesiones distinguen sin empezar, a medias, primera vuelta completada y completada.

La meta mantiene 510 conceptos y 255 primeras respuestas en 60 días. Usa un calendario común de Nueva York, con corte a las 03:00, y muestra por separado cuánto falta para alcanzar la marca de hoy, superarla y completar el objetivo. Las fechas de acreditación desconocidas no se inventan. El dominio usa evidencia independiente compartida entre rutas; el mantenimiento y las vistas se muestran como medidas diferentes. Los círculos ponderan los conceptos únicos y coinciden con las cifras de su leyenda.

La selección tiene color azul, las correctas un borde y distintivo verde claro y los errores coral. Las respuestas se reconocen también por texto y símbolos, con foco visible y sin animación repetitiva.

Se conservan los criterios personales, techos de Hoy, historial, generaciones de sincronización, cuotas de IA y validación literal de las fuentes. Evaluador 2.4.0 conserva la confusión conceptual aunque se declare confianza alta. La auditoría de fórmulas y sus límites está en `flujo-recuperacion-nbme/META-CALCULOS.md` y `DOMINIO-AUDITORIA.md`; la revisión de flujo y capturas utiliza material sintético.
