# Cambios de la versión 1.3.0

Fecha: 11 de septiembre de 2026. Código 1.3.0; corpus privado 1.0.4.

## Preguntas variadas y escritura breve

Las preguntas escritas solicitan una palabra o una frase breve: hasta seis palabras y 65 caracteres en la respuesta de referencia. Los mecanismos extensos se practican mediante opciones; no se sustituyen por un sinónimo que responda sólo una parte de lo preguntado.

Se han revisado 531 preguntas extensas: 461 reciben tres opciones redactadas, una respuesta correcta y explicación de cada alternativa. Las otras 70 se apartan para revisión médica por contradicciones, afirmaciones demasiado generales o evaluación ambigua. Los 70 apartados incluyen dos problemas detectados antes de la autoría dividida en cuatro lotes.

En el material publicable, los formatos de escritura pasan de 1.251/2.149 (58,2 %) a 720/2.079 (34,6 %), todos con respuesta breve. Estos porcentajes describen el conjunto; cada selección temática puede tener una distribución diferente. Las respuestas numéricas se contabilizan aparte.

El reproductor alterna formatos dentro de la selección. Una parte de las preguntas con opciones se presenta como verdadero/falso usando una propuesta correcta o incorrecta del mismo ejercicio. El formato queda estable al pausar y reanudar. Las preguntas clínicas y la primera vuelta del examen conservan sus opciones originales. Algunas respuestas breves alternan con completar un hueco literal en la afirmación. Se mantienen flechas, parejas, secuencias y clasificación cuando el concepto dispone de sus datos.

No se generan distractores médicos al azar entre conceptos. Tampoco se habilitan simuladores ni ejercicios visuales sin contenido preparado. Un activo antiguo que pida escritura larga sin evaluación válida permite consultar la explicación, con resultado pendiente y sin crédito automático.

## Corrección y dominio

El evaluador 2.1.0 reconoce variantes de presentación como guiones entre palabras, acentos y determinadas letras griegas. Conserva diferencias entre cifras, signos, subtipos y negaciones. Lo que no reconoce queda pendiente de revisión, sin convertirse automáticamente en un fallo ni un acierto. Se puede volver a responder en la misma sesión.

Se corrigen etapas de dominio que seguían mostrando consolidación después de un fallo, y el estado próximo al dominio cuando todavía no había evidencia independiente. La interfaz muestra aciertos independientes, sesiones y los criterios pendientes. La configuración inicial sigue exigiendo tres aciertos independientes, dos sesiones, separación temporal y ausencia de confusiones recientes; no se equipara repetir una respuesta recién mostrada con retenerla a largo plazo.

## Sesiones personalizadas

En Módulos se pueden combinar disciplina, sistema, tema, estado y búsqueda, elegir 5, 10 o 20 conceptos y pulsar **Practicar filtros**. Cada concepto cumple todos los filtros activos, incluidas sus etiquetas secundarias. Con cualquier estado se incluyen conceptos nuevos y ya estudiados, aunque su próximo repaso todavía no venza.

Los mismos filtros se aplican a las sesiones de un módulo y a las rutas. Las rutas mantienen sus condiciones: por ejemplo, el examen usa material ya estudiado con opciones. Cuando una ruta no tiene candidatos, se explica cómo iniciar práctica libre con los filtros. Las pestañas Módulos y Buscar conceptos comparten los filtros.

Comprobación con el corpus 1.0.4: Farmacología + Endocrino, 56 conceptos; Fisiología + Cardiovascular, 221; Patología + Hematológico y oncológico, 184.

## Errores dentro de la sesión

Las respuestas incorrectas o parciales se colocan al final de la cola y reaparecen hasta acertarlas. La sesión permite pausar y conserva la cola completa, las repeticiones y cada intento con su identificador. Los dobles clics no crean respuestas duplicadas.

En examen no se muestra ni la corrección ni la cantidad de fallos antes de terminar la primera vuelta. Después se revisan las respuestas y se practican los errores. El resumen separa aciertos iniciales, correcciones y respuestas pendientes. Los reintentos posteriores a la explicación se registran como práctica con ayuda y no inflan el dominio independiente.

## Integridad y comprobaciones

El corpus 1.0.4 contiene 2.079 conceptos aprobados, 191 apartados, 34 módulos y 169 sesiones editoriales. Son 1.523 conceptos Step 1 y 556 compartidos con Step 2; no se publican conceptos exclusivos de Step 2. La cobertura sigue siendo parcial: 21/50 lotes procesados.

Se conserva la identidad, respuesta canónica y fuente de los 2.079 conceptos que siguen publicados. No se modifica el historial en Supabase. Los 70 apartados dejan de entrar en sesiones nuevas y permanecen documentados para revisión. La revisión editorial fue realizada por IA y no certifica una auditoría clínica humana ni dificultad equivalente a NBME.

Validación local: **159 pruebas en 18 archivos**, incluyendo el corpus privado completo, comparación con 1.0.3 y 500 presentaciones reproducibles. TypeScript y la compilación Vite finalizan correctamente. La validación de los lotes y consistencia del corpus no registra errores. CI omite únicamente el control que necesita el corpus privado.

La publicación se comprueba mediante el commit, la compilación de Cloudflare y los recursos servidos por la web. Las pruebas locales no representan una sesión autenticada en producción.
