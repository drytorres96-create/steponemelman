/**
 * Presupuesto de la IA gratuita, medido en lo que Cloudflare cobra de verdad.
 *
 * Workers AI no factura llamadas: factura «neuronas», su unidad de cómputo, y el plan
 * gratuito reparte 10 000 al día para toda la cuenta, con reinicio a las 00:00 UTC. Contar
 * llamadas —lo que hacía la versión anterior— obligaba a fijar el tope por el peor caso
 * imaginable y dejaba la mayor parte del regalo sin usar: una corrección de una palabra
 * cuesta una fracción de lo que cuesta una explicación larga, y las dos gastaban «1».
 *
 * Tarifas publicadas para el modelo del proyecto, @cf/meta/llama-3.3-70b-instruct-fp8-fast.
 * Si Cloudflare las cambia, se cambian aquí y el resto del presupuesto se recalcula solo.
 */
export const TARIFA_ENTRADA = 26_668
export const TARIFA_SALIDA = 204_805

/**
 * Tarifa del modelo de embeddings, `@cf/baai/bge-m3`. Dos órdenes de magnitud por debajo
 * del modelo de texto: comparar cincuenta candidatos cuesta una neurona, no cien.
 */
export const TARIFA_EMBEDDING = 1_075

/** Lo que regala el plan gratuito cada día. No se sobrepasa: no hay respaldo de pago. */
export const PRESUPUESTO_DIARIO = 10_000

/**
 * Lo que no se gasta nunca. La reserva cubre dos cosas a la vez: el error del estimador
 * —se reserva por adelantado y se liquida con el consumo real— y cualquier otro uso de
 * Workers AI en la misma cuenta, que comparte el mismo bote.
 */
export const RESERVA_DE_SEGURIDAD = 0.15
export const PRESUPUESTO_UTIL = Math.floor(PRESUPUESTO_DIARIO * (1 - RESERVA_DE_SEGURIDAD))

/**
 * Tope de gasto diario de una sola cuenta. Con un único estudiante esto casi nunca actúa;
 * existe para que un segundo miembro no se encuentre el día agotado sin haber pedido nada.
 */
export const FRACCION_POR_USUARIO = 0.9

/** Cortafuegos contra un bucle del cliente: ninguna sesión legítima se acerca a esto. */
export const LIMITE_LLAMADAS_USUARIO = 300

export type ModoIA = 'calificar' | 'explicar' | 'analizar' | 'examen' | 'confusion'

/**
 * Hasta qué parte del presupuesto puede llegar cada modo.
 *
 * No todos los usos valen lo mismo para estudiar. Corregir una respuesta libre decide el
 * veredicto que se guarda en el historial, y de ahí salen el dominio y la repetición
 * espaciada: ese uso llega hasta el final del presupuesto. Detectar con qué se confundió
 * una respuesta va con él y cuesta unas pocas neuronas, porque no genera texto. La lectura
 * de la semana es semanal y barata. La explicación es cara y prescindible —el concepto ya
 * trae la suya—, y la viñeta de examen es la más cara de todas y lo más opcional que hay:
 * son las primeras en quedarse fuera. Así un día de muchas dudas no puede dejar sin
 * corrector al día siguiente.
 */
export const TECHO_POR_MODO: Record<ModoIA, number> = {
  calificar: 1, confusion: 1, analizar: 0.85, explicar: 0.7, examen: 0.6,
}

export const techoDeModo = (modo: ModoIA) => Math.floor(PRESUPUESTO_UTIL * TECHO_POR_MODO[modo])

/** Estimación deliberadamente pesimista: sobrestimar tokens solo adelanta el freno. */
export const CHARS_POR_TOKEN = 3.5
export const tokensDeTexto = (texto: string) => Math.ceil(texto.length / CHARS_POR_TOKEN)

/** Neuronas de una llamada, redondeadas hacia arriba: nunca sale gratis un resto. */
export function neuronasDe(entrada: number, salida: number): number {
  return Math.ceil((entrada * TARIFA_ENTRADA + salida * TARIFA_SALIDA) / 1_000_000)
}

/**
 * Lo que se reserva antes de llamar, contando con que el modelo agote `max_tokens`.
 * Casi siempre se devuelve parte al liquidar con el consumo real.
 */
export function costeEstimado(entrada: string, maxTokensSalida: number): number {
  return neuronasDe(tokensDeTexto(entrada), maxTokensSalida)
}

/** Un embedding no escribe nada: solo cuenta lo que entra, y a su propia tarifa. */
export function costeEmbedding(textos: string[]): number {
  return Math.ceil(textos.reduce((n, t) => n + tokensDeTexto(t), 0) * TARIFA_EMBEDDING / 1_000_000)
}

/**
 * Lo que se liquida después de llamar. Cuando Workers AI informa del consumo se cobra ese,
 * que suele ser bastante menor que la reserva; cuando no lo informa se queda el estimado,
 * porque suponer que salió barato es la forma de pasarse del presupuesto sin enterarse.
 */
export function costeReal(raw: unknown, estimado: number): number {
  const uso = tokensUsados(raw)
  return uso ? neuronasDe(uso.entrada, uso.salida) : estimado
}

/** Tokens que Workers AI dice haber usado. Si no los informa, no se puede liquidar. */
export function tokensUsados(raw: unknown): { entrada: number; salida: number } | null {
  const uso = (raw as { usage?: Record<string, unknown> } | null)?.usage
  if (!uso) return null
  const entrada = Number(uso.prompt_tokens)
  const salida = Number(uso.completion_tokens)
  if (!Number.isFinite(entrada) || !Number.isFinite(salida) || entrada < 0 || salida < 0) return null
  return { entrada, salida }
}
