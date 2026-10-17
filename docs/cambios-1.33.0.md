# Tutor Claude por pregunta y fin de la IA gratuita · 1.33.0

Pedido por Yoel el 17-oct-2026: usar el crédito de API de su plan de Claude (100 USD/mes)
en lugar de la IA gratuita de Cloudflare (Llama), cuya calidad no servía para razonamiento
médico, recuperación de conceptos ni recuperación activa.

## Qué cambia

- **Tutor «Claude» tras cada pregunta** (concepto de Melman, pregunta NBME y MyQBank): al
  responder —bien, parcial o mal— aparece un chat con el icono de cerebro en terracota.
  No llama a la API hasta que lo pides. Sugerencias: *Mecanismo paso a paso*, *Key learning
  point*, *Stem killer* (solo si el enunciado es un caso clínico) y hasta dos del propio ítem.
  Cada burbuja de Claude cita la fuente cuando el material la trae.
- **Recuperación activa dentro del mismo chat**, en español y dirigida por Claude: palabra
  clave (completar), verdadero o falso, elige la respuesta correcta, selección múltiple,
  ordenar los pasos y emparejar. Una tarjeta con progreso por segmentos, «Cambiar formato»,
  «Una pista», «No lo recuerdo» y «Comprobar». Al terminar queda un resumen con «Repasar las
  falladas» y «Otra ronda con ideas nuevas» (Claude recibe lo ya preguntado para no repetir).
  Los enunciados NBME siguen en inglés; lo que escribe Claude va en español.
- **`/api/calificar` pasa a Claude** (Sonnet 5.5, esfuerzo bajo). Si Claude no responde, decide
  el corrector propio, como antes con la IA gratuita.
- **Presupuesto en dólares** en lugar de neuronas: tope mensual de 90 USD
  (`CLAUDE_PRESUPUESTO_USD`, en `wrangler.jsonc`), reserva antes de cada llamada, caché de siete
  días y un solo vuelo por pregunta idéntica. 10 USD de margen frente al crédito de 100.

## Qué se retira

«Para tu próximo intento» y «Así lo razoné», «Sigo sin entender», «Cómo caería en el examen»,
«Preguntar sobre esta pregunta», la recuperación NBME con IA («Practicar este error con IA»),
el medidor «IA gratis hoy», «Lectura de la semana», Confusión (embeddings) y el binding `AI`
de Workers AI. La ruta `/api/ia/chat` sustituye a las siete rutas anteriores.

## Cómo está protegido

- El Worker **no se fía del navegador**: recibe identificadores y tu mensaje, y arma el material
  él mismo (corpus publicado; NBME con la política de fuente segura, que falla cerrada). Se
  vuelve a comprobar sesión y pertenencia al banco en cada llamada.
- Una pregunta NBME cuya explicación y objetivo clasifican distinto al mismo agente
  (`fuente-recuperacion-confiable.ts`) no se envía a la IA: el chat y la práctica se cierran con
  «fuente_inconsistente», sin elegir cuál de los dos textos manda ni tocar el banco.
- Lo que escribes como respuesta viaja en tu propio turno (`<RESPUESTA_DEL_ESTUDIANTE>`), nunca
  dentro de las instrucciones: no puede cerrar el bloque `MATERIAL` ni hablar con prioridad de sistema.
- Una respuesta que Claude deja cortada por el tope de tokens no se muestra como completa ni se
  guarda en la caché de siete días: se pide de nuevo.
- Corregir una respuesta escrita (`/api/calificar`) corta su llamada a Claude a los 10 s; el
  navegador espera 15 s en total, así que el veredicto no puede llegar tarde y perderse.
- Límites: cuerpo ≤ 6000 bytes, mensaje ≤ 400 caracteres, historial ≤ 8 turnos.
- Cada ejercicio que escribe Claude se **valida antes de mostrarse**: clave dentro de las
  opciones, sin opciones repetidas, un solo hueco, palabra clave que no está ya escrita en el
  enunciado, y pista que nunca contiene la respuesta. Lo que no cuadra se descarta.
- La clave de la API vive solo como secreto del Worker; no entra en el código, el cliente ni
  los registros (el redactor de logs ahora también oculta `sk-ant-…`).
- Los ejercicios de recuperación activa **no cuentan** como intento, dominio, caja ni repaso
  espaciado: consolidan, no miden.

## Lo que hay que hacer una vez (no se puede desde el repositorio)

1. En la Consola de Anthropic, canjear el crédito de API del plan y crear una clave en un
   espacio de trabajo propio con **límite de gasto** (≈ 90 USD/mes).
2. En Cloudflare → Workers & Pages → steponemelman → Settings → Variables and Secrets:
   añadir el secreto **`ANTHROPIC_API_KEY`**.

Sin la clave, el chat avisa «falta configurar la clave» y `/api/calificar` usa el corrector propio.

## Limitaciones conocidas

- El comportamiento real de la API no se ha podido probar sin la clave. Las llamadas se
  comprobaron contra la documentación oficial (por ejemplo, `thinking: {type: "between_tools"}`
  es el valor que admite Sonnet 5.5 para quitar el pensamiento previo) y, si la API rechaza
  `effort` o `thinking`, la consulta se repite sin ellos.
- Las 135 preguntas NBME retenidas por la política de fuente segura no abren el chat (por diseño).
- La tabla histórica `ai_vignettes` ya no la lee nada (retirada en 1.31.0) y **no se ha
  borrado**. Si quieres eliminarla, es una decisión tuya y se ejecuta en el editor SQL de Supabase:

  ```sql
  drop table if exists public.ai_vignettes;
  ```

## Cómo comprobar el despliegue

Cloudflare → Builds: el intento más reciente debe ser el commit nuevo. En la aplicación,
**Cuenta y ajustes → Ajustes y respaldo** debe decir *Versión 1.33.0*. Responde cualquier
pregunta: debajo del resultado aparece «Claude · Tu tutor de esta pregunta».

## Validación

Ver la descripción del PR: salida de `npm ci`, `npm test`, `npm run build`, la suite
Playwright completa y el volcado de `wrangler deploy --dry-run` (bindings: `COACH`,
`ASSETS`, `CLAUDE_PRESUPUESTO_USD`).
