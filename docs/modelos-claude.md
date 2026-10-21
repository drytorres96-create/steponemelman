# Modelos y consumo de Claude

Reparto económico aprobado por Yoel el 17-oct-2026, vigente desde 1.39.0.
Se acepta probar Haiku en tareas médicas y revisar su calidad durante el uso.

Actualización de Yoel del 21-oct-2026, vigente desde 1.41.0: armar una sesión desde
el chat («Pídele a Claude una sesión») usa **Opus 5.5** en sus tres pasos, aunque
tarde minutos. Haiku entendía mal los pedidos combinados y sólo miraba las etiquetas
del banco, que no son fiables. El resto del reparto no cambia.

| Función | Perfil | Modelo | Razonamiento | Tope de salida¹ | Plazo |
| --- | --- | --- | --- | ---: | ---: |
| Frase del dashboard | `hilo` | Haiku 5.5 | Desactivado, effort low | 500 | 12 s |
| Entender qué estudiar | `entender` | Opus 5.5 | Adaptativo, high | 8000 | 90 s |
| Leer el banco NBME (una vez por pregunta) | `leer` | Opus 5.5 | Adaptativo, medium | 16 000 | 170 s |
| Seleccionar candidatos | `revisar` | Opus 5.5 | Adaptativo, high | 16 000 | 170 s |
| Explicaciones y chat | `chat` | Haiku 5.5 | Adaptativo, medium | 3500 | 50 s |
| Generar recuperación activa | `practica` | Haiku 5.5 | Adaptativo, medium | 6000 | 75 s |
| Corregir texto libre | `calificar` | Haiku 5.5 | Adaptativo, medium | 2000 | 10 s |
| Revisión explícita de una explicación | `revisionSonnet` | Sonnet 5.5 | Adaptativo, medium | 3500 | 50 s |

¹ Tokens máximos de razonamiento **y** respuesta juntos, no un objetivo de consumo.
Los topes de JSON dejan espacio para razonar sin cortar la salida. Una respuesta
con `stop_reason: max_tokens` no se muestra como completa ni se guarda en caché.
El esfuerzo orienta cuánto razona el modelo; no fija una cantidad exacta de tokens.

## Dónde cambiarlo

- `src/server/perfiles-claude.ts`: modelo, esfuerzo, pensamiento, tokens y plazo
  de cada función. Las fábricas de `ia-chat.ts` e `ia-sesion.ts` aplican esos perfiles.
- `src/server/claude.ts`: parámetros HTTP y contabilidad de uso de Anthropic.
  Haiku desactiva pensamiento con `disabled`; Sonnet con `between_tools`.
  Los perfiles adaptativos envían `thinking.type: adaptive` y `output_config.effort`.
- `CLAUDE_PRESUPUESTO_USD` en el Worker: tope mensual de la aplicación, actualmente
  90 USD. No se modificó. El límite de facturación de Anthropic se configura aparte
  en su Console. Los límites del chat de claude.ai no son el saldo de esta API.
- Los prompts fijan contenido y formato; no pueden seleccionar un modelo diferente.
  Ningún endpoint público acepta nombres arbitrarios de modelos.

Después de editar un perfil: probar, compilar y desplegar. La clave de caché incluye
modelo, esfuerzo, pensamiento, tokens y plazo; al cambiar el prompt también hay
que subir su versión. Un cambio de calificador exige `EVALUADOR_VERSION` y pruebas
de compatibilidad. El historial conserva su versión y no se recalifica.

## Armar una sesión con Opus

1. **Entender.** Opus traduce el pedido a la consulta: fuente, estados del historial,
   `cantidad` de ítems (1–60, manda sobre los minutos), los bloques temáticos en
   `terminos` y, como pistas amplias, sistemas y disciplinas.
2. **Leer el banco.** Cada pregunta NBME candidata sin ficha se lee entera (la
   explicación revisada o el original que autoriza la política de fuentes), en lotes
   de 20 y tres a la vez. Opus escribe su ficha: sistemas, disciplinas y tema. La
   ficha se guarda en el Durable Object con la clave `lectura:<versión>:<id>:<revisión>`
   y no caduca; la próxima sesión no la vuelve a pagar. Una pregunta sin material
   legible se recuerda como «sin fuente» durante un día. Cambiar el prompt de lectura
   exige subir `VERSION_LECTURA`, y eso relee el banco.
3. **Seleccionar.** La plataforma sólo filtra por fuente e historial. Opus lee la
   ficha de cada candidata (los conceptos, con su tema y objetivo) en lotes de 150,
   tres a la vez, y devuelve las que tratan lo pedido con el número del tema que
   cubren. Todas las preguntas NBME candidatas pasan por esta lectura; los conceptos,
   los que tengan alguna pista (sistema, disciplina o palabras del tema), hasta 900.
4. **Armar.** La plataforma reparte por turnos entre los temas pedidos y llena los
   minutos o la cantidad pedida, con tres conceptos por pregunta en las mixtas y un
   máximo de 20 preguntas NBME por bloque.

Las etiquetas originales nunca excluyen por sí solas: una pregunta etiquetada como
renal entra en «farmacología cardiovascular» si su contenido lo es. Un pedido sin
tema («las que he fallado») sigue sin llamar a Claude después de entender.

Estimaciones, no mediciones, con las tarifas de abajo: leer las 592 preguntas NBME
por primera vez son unas 30 llamadas, del orden de 3 a 5 USD una sola vez y entre 5
y 10 minutos. Seleccionar sobre todo el banco (unas 1500 candidatas) son unas 10
llamadas, del orden de 0,5 a 1 USD y 3 a 6 minutos; con un filtro de historial
(«falladas», «por repasar») baja a céntimos. Entender cuesta unos céntimos por turno.
El tope mensual y los techos por función siguen frenando el gasto.

Un límite de ritmo (429) o una saturación (529) de la API no se factura: cada lote
se reintenta una vez, tras 20 segundos. Un plazo agotado sí pudo facturarse y no se
repite solo.

No se activa el `fallbacks` de Anthropic para rechazos: sería cambiar de modelo
automáticamente. Si un lote de lectura falla (o el clasificador lo rechaza), sus
preguntas quedan fuera de esa sesión y se avisa; si fallan todos, se muestra el
motivo. Un fallo en la selección no presenta una sesión a medias: al reintentar,
los lotes que sí contestaron salen de la caché.

## Controles de ahorro

Las respuestas deterministas se corrigen localmente sin IA. Se conserva la caché
de respuestas válidas durante siete días, la deduplicación de peticiones en curso,
el historial acotado, el presupuesto mensual y los techos por función. La reserva
previa cuenta entrada estimada y salida máxima; después se liquida el uso informado.
Un timeout conserva la reserva porque podría haberse facturado. Sólo un fallo
transitorio admite un reintento, con el mismo modelo y parámetros; los errores 400
no reintentan sin controles de razonamiento. No hay escaladas automáticas.

Opus 5.5 sólo se usa en el constructor de sesiones del chat, por decisión de Yoel;
no hay Opus de rutina en el tutor, la práctica ni la calificación.

«Revisar con Sonnet» aparece tras una respuesta del tutor. Usa más crédito y sólo
revisa la explicación disponible, con material autorizado del servidor. El historial
puede estar recortado, y el prompt lo indica. No cambia notas, intentos ni dominio.
La siguiente pregunta habitual vuelve a Haiku; reintentar esa revisión conserva
Sonnet. Recuperación activa y calificación no aceptan esta opción.

## Tarifas de referencia y límites de la prueba

La contabilidad interna usa USD por millón de tokens: Haiku 5.5, 0,10 entrada y
0,50 salida hasta 100 000 tokens de entrada; por encima, 0,50 y 2,50. El umbral
incluye entrada normal, lecturas y escrituras de caché. Sonnet 5.5 usa 2 y 10.
Escritura de caché se estima conservadoramente a 2×; lectura a 0,1× para Haiku y
0,05× para Sonnet/Opus 5.5. Opus 5.5 usa 4 y 20. La factura real corresponde a
Anthropic. No se activa prompt caching nuevo en estos cambios.

Fuentes: [precios](https://platform.claude.com/docs/en/about-claude/pricing),
[esfuerzo](https://platform.claude.com/docs/en/build-with-claude/effort),
[Haiku 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5).

Las pruebas verifican contratos, peticiones, validación y conservación del progreso
con datos sintéticos; no certifican equivalencia clínica entre modelos ni un ahorro
mensual concreto. No se hicieron llamadas facturadas para esta implementación.
