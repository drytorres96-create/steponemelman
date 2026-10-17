# Pídele a Claude una sesión: un chat en Hoy para armar sesiones con tus palabras · 1.35.0

Segunda mitad del pedido de Yoel del 17-oct-2026: un cuadro de diálogo en el panel general donde
describe con sus palabras qué quiere estudiar («hazme una sesión de hematología y lo de
hematología relacionado con oncología», «las de endocrino que tengo por repasar», «las que me han
dado más trabajo», «las que he respondido bien»…). Claude responde en el chat, pregunta con botones
lo que falte, revisa concepto por concepto y pregunta por pregunta, y solo cuando algo encaja arma
la sesión y deja un botón para empezarla.

Decisión de producto que tomó Yoel antes de construirlo: lo que se estudia desde el chat cuenta
como **intento normal** (cajas y dominio se registran como siempre) y queda **fuera del techo**
diario de «Para reforzar hoy»: ni lo gasta ni lo bloquea.

## Qué cambia

Una tarjeta nueva en **Hoy**, debajo de «Para reforzar hoy»: **Pídele a Claude una sesión**. Al
abrirla es un chat con el mismo aspecto del tutor de Claude:

1. Escribes lo que quieres (hasta 300 caracteres) o tocas un ejemplo, que solo rellena el campo.
2. Si falta algo que cambia la sesión, Claude pregunta **una cosa corta con botones** (primero la
   fuente: conceptos, NBME o mixto; después la duración: 5, 10 o 20 min). Siempre hay un botón
   «Elige tú». Como mucho **dos preguntas**; con la tercera Claude ya tiene que decidir.
3. Antes de buscar, el chat dice qué entendió («Entendí: Endocrino · por repasar · preguntas
   NBME · ≈ 20 min»), para que puedas corregirlo si no era eso.
4. La plataforma busca en tu material y tu historial; si pediste un tema libre, Claude revisa la
   lista corta. El resultado es una tarjeta con el título, cuántos conceptos y preguntas hay,
   cuánto tardará y el botón **Empezar la sesión**.
5. Si nada encaja, lo dice y explica qué hay sin el filtro más estricto. No arma una sesión de
   relleno.

El panel se puede cerrar sin perder la conversación; **Empezar de nuevo** la borra. Un mensaje
nuevo después de una sesión lista empieza una conversación nueva. No se guarda nada: la
conversación vive en la pantalla.

### Qué entiende (lo calcula la plataforma, no la IA)

Claude solo traduce lo que escribes a un vocabulario cerrado; **no elige conceptos ni preguntas**.
La plataforma interpreta el historial con las mismas reglas de 1.34.0 (un parcial es un fallo, la
ayuda no acredita, el día de estudio acaba a las 3:00 de Nueva York):

| Estado | Se da cuando |
| --- | --- |
| Falladas | Alguna vez falladas. |
| Falladas sin recuperar | Falladas y sin un acierto limpio, en un día de estudio posterior, después del último fallo. |
| Por repasar | Frágiles (fallo reciente, repetido o acierto con ayuda) **o** pendientes hoy en las cajas. |
| Las que más trabajo dieron | Trabajo acumulado ≥ 4 (cada fallo vale 2, cada acierto con ayuda vale 1). |
| Acertadas | La última vez se acertaron. |
| Acertadas a la primera | El primer intento fue limpio, sin ayuda. |
| Nuevas | Nunca vistas. |
| Dominadas | Dominio demostrado (conceptos) o escalera de cajas cerrada (preguntas). |

Sistema y disciplina cuentan también lo que los tiene como secundarios; lo que los tiene como
principales va antes. Se compara sin tildes ni mayúsculas. Con varios estados se combinan con «o»;
sistema y disciplina, con «y». Sin estado, va primero lo más frágil y después lo demás. Con «las
que más trabajo dieron», por trabajo acumulado.

### Cuánto cabe en los minutos

Se llena hasta los minutos pedidos (con un 15 % de margen) y siempre entra al menos un ítem. Con
fuente mixta entran **tres conceptos por cada pregunta**, igual que «lo nuevo de hoy». Nunca más
de 20 preguntas NBME. El ritmo sale de **tu propia mediana de tiempo** (por concepto y por
pregunta, ×1,5 por leer la explicación, con un suelo de 0,75 y 1,5 min); hasta que haya práctica
suficiente se supone 1,5 min por concepto y 2,5 por pregunta.

### Dónde interviene Claude

- **Entender:** traduce el pedido a fuente, sistemas, disciplinas, estados, minutos, temas libres
  y un título corto, o hace una pregunta con opciones. Sale del vocabulario cerrado o se descarta.
- **Revisar:** solo cuando pediste un tema libre que ningún sistema o disciplina cubre
  («oncología», «anemias»). Recibe la lista **ya filtrada** (como mucho 150) con una etiqueta de
  hasta 90 caracteres por ítem y deja los que encajan claramente. Si dudas, fuera: mejor una sesión
  corta y acertada que una larga con relleno.

Si Claude no responde, el chat lo dice y ofrece **Reintentar**. La revisión se reintenta sola, sin
volver a preguntar qué pediste. Nunca se arma una sesión con candidatos sin revisar cuando se pidió
un tema libre.

## Cómo está protegido

- Misma ruta `/api/ia/sesion`, con dos fases nuevas (`entender`, `revisar`): sesión verificada,
  pertenencia al banco y esquema estricto en cada una.
- El navegador solo envía **identificadores, etiquetas cortas y lo que escribes**; nunca texto de
  preguntas NBME, enunciados, respuestas ni explicaciones.
- Las preguntas NBME solo se mandan a revisar si la política de fuente segura (que falla cerrada)
  lo permite. Las que no, **no se pueden juzgar con IA y se quedan fuera**; el chat lo avisa («2
  preguntas NBME no se pueden revisar con IA y quedaron fuera»).
- Todo lo que escribes se trata como dato, no como instrucción. La conversación viaja como JSON en
  un único turno de usuario.
- Lo que devuelve Claude se valida en el servidor y otra vez en el navegador: vocabulario cerrado
  (un valor desconocido invalida todo para no ampliar la búsqueda en silencio), opciones de 2 a 4
  de hasta 32 caracteres sin formato, ids que no estaban en la lista se descartan, una salida
  cortada por el tope de tokens no se usa ni entra en la caché.
- Modos `entender` y `revisar` con su propio techo de gasto: dejan de servirse cuando el gasto del
  mes pasaría del 85 % de `CLAUDE_PRESUPUESTO_USD`, por encima de `hilo` (80 %) y por debajo del
  tutor y la calificación. Caché de siete días y un solo vuelo por petición idéntica.
- El límite de cuerpo de `/api/ia/sesion` sube de 6 000 a **24 000 bytes** (150 etiquetas caben);
  el resto de rutas conserva 6 000.
- No cambia ninguna regla de dominio, caja ni repaso ni qué se registra como intento.

## Decisiones y límites a tener en cuenta

- **«Por repasar» = frágil + pendiente hoy en las cajas.** Lo vencido que el techo diario de las
  cajas dejó fuera **no** cuenta: `cajas.ts` no expone cuánto quedó fuera a propósito (principio
  anti-deuda). Si quieres que «por repasar» incluya también eso, es una decisión de producto aparte.
- **Una sesión del chat con conceptos nunca vistos cuenta como «nuevo» en Hoy**, consecuencia de
  que sean intentos normales.
- **La revisión es por etiqueta** (tema y objetivo del concepto; tema y sistema de la pregunta),
  no por el texto completo.
- El chat **no aparece los viernes ni con el día completo**, igual que «Para reforzar hoy».

## Cómo comprobar el despliegue

Cloudflare → Builds: el intento más reciente debe corresponder al **commit nuevo**. En la
aplicación, **Cuenta y ajustes → Ajustes y respaldo** debe decir *Versión 1.35.0*. En **Hoy**, un
día en que el día no esté completo ni sea viernes, aparece «Pídele a Claude una sesión»: ábrela,
toca un ejemplo, envíalo y comprueba que el chat dice qué entendió y deja **Empezar la sesión**.

## Validación

Ver la descripción del PR: salida de `npm ci`, `npm test`, `npm run build` y la suite Playwright
completa. Pruebas nuevas: constructor de sesiones (estados, filtros, ventana de revisión, minutos,
vacío, sin IA), transportes `pedirEntender`/`pedirRevision`, ruta `/api/ia/sesion` (fases nuevas,
política NBME, vocabulario cerrado, techos, caché), pantalla del chat y e2e a 390 y 1280 px.
