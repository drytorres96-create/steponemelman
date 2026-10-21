# Pídele a Claude una sesión: Opus lee cada ítem · 1.41.0

Pedido de Yoel del 21-oct-2026. Al pedir «una sesión mixta de 40 ítems de
farmacología cardiovascular, del sistema respiratorio y farmacología
antimicrobiana», el chat devolvía 4 ítems, casi todos cardiovasculares. Había
tres causas:

1. **Modelo con poco razonamiento.** Entender y seleccionar usaban Haiku 5.5
   (medium y low). Ahora usan **Opus 5.5** con razonamiento high; leer el banco,
   Opus 5.5 medium. Tarda más (minutos la primera vez) y el chat va diciendo qué hace.
2. **Filtro ciego por etiquetas.** La plataforma combinaba sistemas «y» disciplinas
   antes de que Claude viera nada, y sin un término libre ni siquiera llamaba a
   Claude. Las etiquetas del banco NBME no son fiables (el catálogo no trae tema ni
   objetivo), así que lo mal etiquetado nunca entraba. Ahora la plataforma sólo
   filtra por fuente e historial; Claude lee cada candidata y decide por su contenido.
3. **Sólo minutos.** La sesión se medía en minutos (máximo 30, 10 por defecto), así
   que «40 ítems» no se podía expresar. La consulta admite ahora `cantidad` (hasta 60).

## Cómo funciona

- **Leer el banco, una vez.** Cada pregunta NBME se lee entera con el material que
  autoriza la política de fuentes, y Opus escribe su ficha: sistemas, disciplinas y
  tema. La ficha se guarda en el Durable Object por pregunta y revisión, así que
  sólo la primera sesión paga la lectura. Es el reetiquetado para usos posteriores.
- **Seleccionar.** Opus lee las fichas de las preguntas y el tema y objetivo de los
  conceptos, en lotes de 150, y devuelve las que tratan lo pedido con el tema que
  cubren. Ya no se le pide que «ante la duda deje fuera»: incluye todo lo que trate
  claramente el tema; la plataforma decide cuántos entran.
- **Repartir.** Con varios temas, la sesión los alterna por turnos y el resultado dice
  cuántos lleva de cada uno. Las mixtas conservan tres conceptos por pregunta y un
  bloque NBME sigue sin pasar de 20 preguntas; si se pidieron más de los que encajan,
  se dice.

Un pedido sin tema («las que he fallado») sigue resolviéndose sin llamar a Claude
después de entender. No se activa el cambio automático de modelo ante un rechazo;
un lote que no se puede leer queda fuera de esa sesión y se avisa.

## Coste y espera (estimaciones)

Primera lectura del banco: unas 30 llamadas, del orden de 3 a 5 USD una sola vez y
5 a 10 minutos. Una selección sobre todo el banco: unas 10 llamadas, 0,5 a 1 USD y 3 a
6 minutos; con filtro de historial, céntimos. Un límite de ritmo o una saturación,
que no se facturan, se reintentan una vez por lote. El tope mensual de 90 USD y los techos
por función no cambian. Detalle en la [guía de modelos](modelos-claude.md).

## Qué no cambia

Las reglas de fallo, dominio, repaso e intentos siguen siendo de la plataforma. Las
preguntas retenidas por la política de fuentes no salen hacia la IA salvo con su
explicación revisada exacta; una ficha leída del original deja de usarse si la
política la retiene después. No se escribe en Supabase, no se toca el corpus, el
progreso ni las RPC, y no se hicieron llamadas facturadas a Anthropic para esta
implementación.

## Validación

Puertas locales en orden, con Node 22, y resultado de CI sobre el HEAD en el PR.
Las pruebas cubren el contrato de cada fase (`lecturas`, `leer`, `revisar`), las
fichas guardadas y su vigencia, la política de fuentes, el reparto por temas, la
cantidad de ítems, la lectura por lotes con fallos parciales y los recorridos de
navegador del chat en Hoy y en MyQBank. No miden la calidad clínica de Opus ni el
gasto real.
