# 1.31.0 · Hoy, FAQ y material revisado

La navegación se concentra en Hoy, Biblioteca, Progreso y Ajustes y respaldo. Biblioteca
mantiene Conceptos y Preguntas NBME. Se retiran completamente las pantallas y lecturas
cliente de Viñetas (piloto), Auditoría y Plan diario clásico. Los enlaces antiguos regresan
a Hoy; una cola histórica válida conserva su posición exacta al retomar.

Las explicaciones de dominio, cajas, metas, círculos, sesiones y cuenta están agrupadas
como preguntas frecuentes en Ajustes. El índice del material se abre allí bajo demanda.
Hoy y Progreso conservan cantidades actuales, círculos, líneas de la meta, distancias para
alcanzar o superar la línea, proyección y acciones de recuperación. La información interna
de auditoría no se muestra en el panel de fuente ni en las explicaciones del estudiante.

## Selección de Hoy

La falta de guiones semanales podía cerrar Nuevo en 1 concepto y 1 pregunta aunque quedara
material disponible. Se prioriza el guion y se completan las plazas con conceptos publicados
y preguntas listas aún sin responder, en orden editorial y sin duplicados. Hoy y Ponerme al
día comparten la misma selección. Se conservan los límites 10/5 entre semana, viernes libre
y 20/10 el fin de semana, además del calendario de Nueva York con corte a las 03:00.
Los conceptos ya respondidos se consolidan en Cajas conforme a sus intervalos.

El recálculo de la lectura real del 7 de octubre pasó de 1/1 cerrado a 10/5 abierto,
con 9 conceptos y 4 preguntas restantes. Las cajas y el historial permanecieron iguales.
Ver [la auditoría del selector](simplificacion-hoy-corpus/NUEVO-HOY-AUDITORIA.md).

## Material corregido e IA

El esquema admite un fundamento docente corregido con revisión y referencias verificadas,
conservando el identificador y la fuente originales. La ayuda de IA cita ese fundamento;
las revisiones anteriores que no lo tienen siguen bloqueadas. El servidor resuelve el material
publicado, comprueba pertenencia y versión y mantiene la evidencia literal, autenticación,
cuotas y caché por cuenta. Las correcciones no acreditan dominio por sí mismas.

La integración privada requiere revisión médica/editorial y una revisión independiente por
cada ID, comprobación del corpus completo y una transacción con CAS. No modifica intentos,
estados de progreso ni preguntas NBME. Las decisiones se conservan en Supabase para agentes;
ver [el procedimiento](material-privado-agentes.md). La revisión automatizada no se presenta
como una revisión clínica humana.

## Comprobación

Pruebas del selector, FAQ, rutas retiradas, reanudación histórica, evidencia corregida y
bloqueo de revisiones incompletas, además de las suites generales. Comparación visual con
material sintético a 390 y 1280 px en [la evidencia de UI](simplificacion-hoy-corpus/).
