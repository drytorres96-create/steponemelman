# Para reforzar hoy: inventario de lo frágil, una vez al día · 1.34.0

Pedido por Yoel el 17-oct-2026: que la plataforma revise sus respuestas, repeticiones, fallos y
aciertos a la primera y, al volver, le sugiera recuperar lo que aún está frágil, **con un techo
claro** («no es que cada rato me va a estar sugiriendo cosas»).

Esta versión es la primera mitad del pedido. La segunda —el cuadro de diálogo en Hoy para armar
una sesión con sus propias palabras— va en 1.35.0.

Decisiones de producto que tomó Yoel antes de construirlo:

- Techo: **una vez al día, hasta 5 ítems**.
- Qué cuenta como «por recuperar»: fallo reciente (7 días), fallo repetido y acierto solo con
  ayuda. Un acierto adivinado no cuenta.
- Lo que se estudia desde la tarjeta cuenta como **intento normal** (cajas y dominio se
  registran como siempre).

## Qué cambia

Una tarjeta nueva en **Hoy**, «Para reforzar hoy», con hasta cinco conceptos y/o preguntas NBME,
la señal principal de cada uno (*Fallada esta semana*, *Fallada más de una vez*, *Acertada con
ayuda*) y dos botones: **Repasar estos N** y **Hoy no**. Repasar abre una sesión «Para reforzar ·
hoy» con esos mismos ítems.

### Cómo se decide qué es frágil (lo calcula la plataforma, no la IA)

Se reutilizan las reglas de acierto que ya usa el planificador (`intentoCorrecto`, `conAyuda`):
un parcial es un fallo, una respuesta «por revisar» no cuenta, un envío NBME en conflicto cuenta
como fallo y un examen NBME sin terminar no se mira.

| Señal | Peso | Se da cuando |
| --- | --- | --- |
| Fallo reciente | 3 | El último fallo fue hace ≤ 7 días y no hay un acierto limpio en un día de estudio posterior. |
| Fallo repetido | 2 | Hay ≥ 2 fallos y menos de 2 días limpios después del último. |
| Acierto con ayuda | 1 | Lo último que pasó fue un acierto con pista, fuente consultada o explicación previa. |

Corregirse el mismo día del fallo no lo supera (la explicación acababa de verse). El día de
estudio es el de siempre: empieza a las 3:00 de Nueva York. Se ordena por peso y, a igualdad,
por el fallo más cercano.

### El techo

- **Una sola lista por día de estudio**, fijada la primera vez que abres Hoy con la cuenta y el
  banco ya cargados; no cambia durante el día aunque estudies.
- **Nunca más de 5.** Nunca los viernes (día vacío) ni cuando el día ya está completo.
- **No duplica las cajas**: lo que ya está en las cajas de hoy se recupera allí, y lo que ya
  tocaste hoy no se sugiere. Lo que el techo diario de las cajas dejó fuera sí puede entrar aquí.
- **Si no la usas, no vuelve ni se acumula**: «Hoy no» o dejarla pasar solo significa que mañana
  se recalcula desde tu historial. Usarla la cierra por hoy.

### Dónde interviene Claude

Solo en una cosa: una frase corta (≤ 200 caracteres) sobre qué tienen en común o por dónde
empezar, **una vez al día**. No decide qué se sugiere. Si no responde, la tarjeta sale completa
sin la frase.

## Cómo está protegido

- La ruta nueva `/api/ia/sesion` exige sesión verificada y pertenencia al banco, como el chat.
- El navegador solo envía identificadores y etiquetas cortas (esquema estricto, ≤ 5 ítems); nunca
  texto de preguntas NBME ni enunciados.
- Las preguntas NBME se mandan como «Pregunta NBME» salvo que la política de fuente segura
  (que falla cerrada) permita usar su tema.
- Las etiquetas se tratan como datos: si traen instrucciones, el prompt manda ignorarlas.
- La frase se valida en el servidor y otra vez en el navegador: una línea, sin markdown ni listas;
  una salida cortada por el tope de tokens no se muestra ni entra en la caché.
- Modo `hilo` con su propio techo: deja de servirse cuando el gasto del mes pasaría del 80 % de
  `CLAUDE_PRESUPUESTO_USD`, así el tutor y la calificación conservan el resto. Caché de siete días
  y un solo vuelo por petición idéntica. Es una llamada breve al día.
- No cambia ninguna regla de dominio, caja, repaso ni qué se registra como intento.

## Limitaciones conocidas

- **La lista del día se guarda en este navegador** (`localStorage`, por cuenta). Si abres Hoy el
  mismo día desde otro dispositivo, ese dispositivo calcula su propia lista del día. No se
  escribe nada en Supabase.
- El comportamiento real de la frase de Claude depende de la clave de la API ya configurada en
  1.33.0; sin ella, la tarjeta funciona igual sin la frase.

## Cómo comprobar el despliegue

Cloudflare → Builds: el intento más reciente debe corresponder al **commit nuevo**. En la
aplicación, **Cuenta y ajustes → Ajustes y respaldo** debe decir *Versión 1.34.0*. En **Hoy**,
un día de entre semana en que tengas fallos recientes que las cajas no cubran, aparece «Para
reforzar hoy». Los viernes no aparece.

## Validación

Ver la descripción del PR: salida de `npm ci`, `npm test`, `npm run build` y la suite Playwright
completa. Pruebas nuevas: inventario (señales, orden, techo), tarjeta diaria (persistencia, viernes,
«Hoy no», descartada/usada), ruta `/api/ia/sesion` (sesión, pertenencia, política NBME, validación de
la frase) y e2e a 390 y 1280 px.
