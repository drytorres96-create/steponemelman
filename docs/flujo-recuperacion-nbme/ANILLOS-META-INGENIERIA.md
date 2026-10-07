# Círculos y líneas: revisión de ingeniería

El anillo exterior de Hoy representaba cada sesión con un arco del mismo tamaño,
pero su leyenda contaba conceptos únicos. Eso promediaba porcentajes de sesiones
en lugar de mostrar la proporción real de conceptos. Una sesión de un concepto
completa y otra de nueve sin completar dibujaban 50 %, aunque sólo hubiera
dominio demostrado en uno de diez conceptos (10 %).

QA confirmó el defecto en el navegador con contenido sintético: una semana de
14 conceptos con uno dominado dibujaba `1/12` (8.33 %) y mostraba `1/14` (7.14 %)
en la leyenda, porque el concepto dominado pertenecía a una sesión de cuatro y
las tres sesiones ocupaban el mismo arco.

La corrección asigna cada ID a la primera sesión de la semana que lo contiene.
Si otro guion vuelve a incluirlo, no crea otro lugar en el anillo. Cada arco
ocupa un tamaño proporcional a sus conceptos únicos. Los huecos entre arcos
usan la misma proporción de tamaño, por lo que tampoco sesgan el porcentaje.
Las sesiones sin conceptos no añaden un arco vacío. La fracción del dibujo,
la cifra visible y la descripción accesible comparten el mismo denominador.

El anillo de dominio también usa `evaluarDominio(...).cumple`, igual que el
resumen general de aprendizaje. La caja de recuperación describe lo que toca
practicar: un fallo puede llevar un concepto a caja 1 aunque conserve suficiente
evidencia independiente para demostrar dominio. Ese caso no debe hacer que Hoy
y Progreso muestren cantidades distintas de dominio demostrado. La corrección
no cambia los criterios, la evaluación, el historial ni el planificador.

El anillo interior conserva su significado: trabajo del plan diario realizado,
incluidos los intentos fallados. La barra de vistos registra conceptos
presentados. La meta de 60 días cuenta dominio demostrado en su ventana. Estas
medidas conservan etiquetas y denominadores propios; una presentación no concede
dominio ni una pregunta IA equivale a otro concepto publicado.

## Verificación

- Seis regresiones del SVG real: sesiones de tamaños 1/9; huecos sin sesgo;
  sesión sin conceptos; dominio completo; reserva sin segmentos; población cero.
- Dos regresiones de Hoy: ID compartido en tres guiones ocupa una sola posición;
  cinco aciertos espaciados y un fallo conservan el mismo dominio demostrado que
  Progreso mientras la caja indica recuperación.
- Las tres pruebas de cambio de día/semana/viernes usan instantes explícitos de
  Nueva York, con sus afirmaciones originales, para comprobar el corte a las 3:00.
- La prueba geométrica compara la longitud total del avance exterior con la
  longitud total de sus pistas. Debe coincidir con `conceptos dominados / conceptos
  únicos`, independientemente del número y tamaño de las sesiones.

El resto de indicadores conserva la deduplicación por ID: los conceptos vistos
y dominados usan una población única, y las preguntas NBME de la meta cuentan
la primera respuesta de cada ID. Practicar el mismo concepto desde Hoy,
recuperación de la meta y una pregunta relacionada utiliza el mismo historial.
