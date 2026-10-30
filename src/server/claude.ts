import { registrar } from './registro'

/**
 * Llamada a la API de Mensajes de Claude desde el Worker, con `fetch` y sin SDK.
 *
 * La clave vive solo como secreto del Worker (`ANTHROPIC_API_KEY`); no entra en el código,
 * en el cliente ni en los registros. Nada de aquí decide qué se le pregunta al modelo: eso lo
 * arma el servidor a partir del material que él mismo lee, nunca del texto que manda el navegador.
 *
 * Detalles de la API que importan y están comprobados contra la documentación:
 * - `temperature` no se envía: los modelos 5.5 solo aceptan el valor por defecto.
 * - No hay «prefill»: la conversación debe terminar siempre en un turno de usuario.
 * - El pensamiento adaptativo está activo por defecto y sus tokens cuentan dentro de
 *   `max_tokens`, así que el texto puede no estar en `content[0]` ni llegar si el tope se agota.
 * - `stop_reason: "refusal"` llega con HTTP 200: hay que mirarlo siempre.
 */

export type ModeloClaude = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5'

export type EsfuerzoClaude = 'low' | 'medium' | 'high'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const VERSION_API = '2023-06-01'

/** Dólares por millón de tokens (entrada, salida). Solo para contabilidad: la factura la hace Anthropic. */
export const TARIFAS_USD: Record<ModeloClaude, { entrada: number; salida: number }> = {
  'claude-haiku-5-5': { entrada: 0.10, salida: 0.50 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
  'claude-opus-5-5': { entrada: 4, salida: 20 },
}

export interface UsoClaude {
  entrada: number
  salida: number
  cacheEscritura: number
  cacheLectura: number
}

export interface SolicitudClaude {
  modelo: ModeloClaude
  sistema: string
  mensajes: { role: 'user' | 'assistant'; content: string }[]
  /** Tope de salida; incluye los tokens de pensamiento. */
  maxTokens: number
  esfuerzo: EsfuerzoClaude
  /** `sin_pensar`: disabled en Haiku, between_tools en Sonnet; Opus no permite apagarlo. */
  pensamiento?: 'adaptativo' | 'sin_pensar'
  tiempoMs: number
}

export interface RespuestaClaude {
  texto: string
  uso: UsoClaude
  costeUSD: number
  parada: string
  modelo: string
}

export type CodigoClaude =
  | 'sin_clave'   // el secreto no está configurado
  | 'clave'       // la clave se rechaza (revocada, mal copiada, sin permiso)
  | 'credito'     // sin saldo, o se alcanzó el límite de gasto fijado en la Consola
  | 'limite'      // límite de ritmo de la API; pasa solo
  | 'sobrecarga'  // la API está saturada
  | 'tiempo'      // el servidor dejó de esperar
  | 'conexion'    // se perdió la conexión; el proveedor pudo procesar la petición
  | 'proveedor'   // cualquier otro fallo del servicio
  | 'respuesta'   // contestó, pero sin nada utilizable
  | 'rechazo'     // el modelo declinó contestar

export class ErrorClaude extends Error {
  constructor(public codigo: CodigoClaude, public estado?: number, mensaje: string = codigo) {
    super(mensaje)
    this.name = 'ErrorClaude'
  }
  /**
   * Si el intento pudo costar dinero. Un error HTTP de la API no factura; que se agote nuestra
   * espera, sí puede (el modelo pudo seguir trabajando), y un rechazo se factura según la documentación.
   */
  get pudoFacturarse() { return this.codigo === 'tiempo' || this.codigo === 'conexion' || this.codigo === 'rechazo' || this.codigo === 'respuesta' }
}

/** Estimación pesimista de tokens de entrada: sobrestimar solo adelanta el freno. */
export const CHARS_POR_TOKEN = 3
export const tokensDeTexto = (texto: string) => Math.ceil(texto.length / CHARS_POR_TOKEN)

export function costeUSD(modelo: ModeloClaude, uso: UsoClaude): number {
  const tokensEntrada = uso.entrada + uso.cacheEscritura + uso.cacheLectura
  const t = modelo === 'claude-haiku-5-5' && tokensEntrada > 100_000
    ? { entrada: 0.50, salida: 2.50 } : TARIFAS_USD[modelo] ?? TARIFAS_USD['claude-opus-5-5']
  // Escritura 2× (reserva conservadora de 1 h); lectura Haiku 0,1×, Sonnet/Opus 0,05×.
  const lectura = modelo === 'claude-sonnet-5-5' || modelo === 'claude-opus-5-5' ? 0.05 : 0.1
  const entrada = uso.entrada + uso.cacheEscritura * 2 + uso.cacheLectura * lectura
  return (entrada * t.entrada + uso.salida * t.salida) / 1_000_000
}

/** Lo que se reserva antes de llamar: toda la entrada estimada y la salida al tope. */
export function costeReservaUSD(s: Pick<SolicitudClaude, 'modelo' | 'sistema' | 'mensajes' | 'maxTokens'>): number {
  const entrada = tokensDeTexto(s.sistema) + s.mensajes.reduce((n, m) => n + tokensDeTexto(m.content), 0)
  return costeUSD(s.modelo, { entrada, salida: s.maxTokens, cacheEscritura: 0, cacheLectura: 0 })
}

function clasificar(estado: number, cuerpo: unknown): CodigoClaude {
  const error = (cuerpo as { error?: { type?: unknown; message?: unknown; details?: { error_code?: unknown } } } | null)?.error
  const tipo = typeof error?.type === 'string' ? error.type : ''
  const mensaje = typeof error?.message === 'string' ? error.message : ''
  // El tope de gasto del nivel llega como un 429 «de ritmo» que no se arregla esperando.
  if (error?.details?.error_code === 'enforced_spend_limit_reached') return 'credito'
  if (tipo === 'billing_error' || estado === 402) return 'credito'
  // Saldo agotado o límite de gasto de la Consola: la documentación no fija el código HTTP, así que
  // el texto solo sirve para elegir un mensaje más claro, no para decidir si se reintenta.
  if (estado === 400 && /credit balance|usage limit|spend limit/i.test(mensaje)) return 'credito'
  if (estado === 401 || estado === 403 || tipo === 'authentication_error' || tipo === 'permission_error') return 'clave'
  if (estado === 429) return 'limite'
  if (estado === 529) return 'sobrecarga'
  return 'proveedor'
}

const REINTENTABLES = new Set<CodigoClaude>(['sobrecarga', 'proveedor'])

/**
 * Una llamada, con un único reintento ante saturación o fallo transitorio. El tiempo total es el
 * del llamante: si el primer intento ya gastó la mitad, no se reintenta.
 */
export async function llamarClaude(apiKey: string | undefined, s: SolicitudClaude,
  opciones: { fetch?: typeof fetch; esperaReintentoMs?: number } = {}): Promise<RespuestaClaude> {
  if (!apiKey) throw new ErrorClaude('sin_clave')
  if (s.modelo === 'claude-opus-5-5' && s.pensamiento === 'sin_pensar') throw new ErrorClaude('proveedor', 400)
  const enviar = opciones.fetch ?? fetch
  const espera = opciones.esperaReintentoMs ?? 700
  const inicio = Date.now()
  for (let intento = 0; ; intento++) {
    try {
      return await intentar(apiKey, s, Math.max(1000, s.tiempoMs - (Date.now() - inicio)), enviar)
    } catch (causa) {
      if (!(causa instanceof ErrorClaude)) throw causa
      // No retirar límites de razonamiento ni subir de modelo ante un parámetro rechazado.
      if (causa.estado !== undefined && causa.estado < 500) throw causa
      if (!REINTENTABLES.has(causa.codigo) || intento >= 1) throw causa
      if (s.tiempoMs - (Date.now() - inicio) < s.tiempoMs / 2) throw causa
      await new Promise(resolve => setTimeout(resolve, espera))
    }
  }
}

async function intentar(apiKey: string, s: SolicitudClaude, tiempoMs: number, enviar: typeof fetch): Promise<RespuestaClaude> {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), tiempoMs)
  let respuesta: Response
  try {
    respuesta = await enviar(ENDPOINT, {
      method: 'POST', signal: control.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': VERSION_API },
      body: JSON.stringify({
        model: s.modelo, max_tokens: s.maxTokens, system: s.sistema, messages: s.mensajes,
        output_config: { effort: s.esfuerzo },
        thinking: { type: s.pensamiento === 'sin_pensar' ? (s.modelo === 'claude-haiku-5-5' ? 'disabled' : 'between_tools') : 'adaptive' },
      }),
    })
  } catch (causa) {
    clearTimeout(temporizador)
    if (control.signal.aborted) throw new ErrorClaude('tiempo')
    registrar('claude/red', causa)
    // Un fallo de red no confirma que la API no haya recibido la petición. No repetirla
    // automáticamente y conservar la reserva evita duplicar y subestimar el gasto.
    throw new ErrorClaude('conexion', undefined, 'sin conexión con la API')
  }
  try {
    let cuerpo: unknown = null
    try { cuerpo = await respuesta.json() } catch { /* cuerpo no JSON: se trata por su código */ }
    const idPeticion = respuesta.headers.get('request-id') ?? ''
    if (!respuesta.ok) {
      const codigo = clasificar(respuesta.status, cuerpo)
      // Solo el estado, el tipo y el identificador: el mensaje de la API puede citar lo enviado.
      registrar('claude/http', codigo, { estado: respuesta.status, tipo: String((cuerpo as { error?: { type?: unknown } } | null)?.error?.type ?? ''), idPeticion })
      throw new ErrorClaude(codigo, respuesta.status)
    }
    return leer(cuerpo, s.modelo)
  } catch (causa) {
    if (causa instanceof ErrorClaude) throw causa
    if (control.signal.aborted) throw new ErrorClaude('tiempo')
    registrar('claude/lectura', causa)
    throw new ErrorClaude('proveedor')
  } finally {
    clearTimeout(temporizador)
  }
}

function leer(cuerpo: unknown, modelo: ModeloClaude): RespuestaClaude {
  const m = cuerpo as { content?: unknown; stop_reason?: unknown; model?: unknown; usage?: Record<string, unknown> } | null
  const numero = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
  const usoValido = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  // En una respuesta 200 malformada el proveedor pudo haber cobrado. Sin los dos
  // contadores obligatorios no se conoce el coste: conservar la reserva completa.
  const opcionalValido = (v: unknown) => v == null || usoValido(v)
  if (!usoValido(m?.usage?.input_tokens) || !usoValido(m?.usage?.output_tokens)
    || !opcionalValido(m?.usage?.cache_creation_input_tokens) || !opcionalValido(m?.usage?.cache_read_input_tokens)) throw new ErrorClaude('respuesta')
  const uso: UsoClaude = { entrada: numero(m?.usage?.input_tokens), salida: numero(m?.usage?.output_tokens),
    cacheEscritura: numero(m?.usage?.cache_creation_input_tokens), cacheLectura: numero(m?.usage?.cache_read_input_tokens) }
  const parada = typeof m?.stop_reason === 'string' ? m.stop_reason : ''
  // El texto está en los bloques `text`; antes pueden venir bloques de pensamiento.
  const texto = Array.isArray(m?.content)
    ? (m!.content as { type?: unknown; text?: unknown }[]).filter(b => b?.type === 'text' && typeof b.text === 'string')
      .map(b => b.text as string).join('').trim()
    : ''
  const base = { uso, costeUSD: costeUSD(modelo, uso), parada, modelo: typeof m?.model === 'string' ? m.model : modelo }
  if (parada === 'refusal') throw Object.assign(new ErrorClaude('rechazo'), { respuesta: { texto, ...base } })
  if (!texto) throw Object.assign(new ErrorClaude('respuesta'), { respuesta: { texto, ...base } })
  return { texto, ...base }
}

/** El coste de un fallo que sí llegó a facturar, si la API informó del uso. */
export function costeDeError(e: unknown): number | null {
  const r = (e as { respuesta?: { costeUSD?: unknown } } | null)?.respuesta
  return typeof r?.costeUSD === 'number' ? r.costeUSD : null
}
