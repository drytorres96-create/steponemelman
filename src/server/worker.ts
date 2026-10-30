import { clavePerfil } from './perfiles-claude'
import config from '../../project.config.json'
import { registrar } from './registro'
import { evaluarTexto, EVALUADOR_VERSION } from '../lib/normalize'
import { ConceptoZ, IndiceZ, type Concepto, type Indice } from '../schema/concept'
import { prepararConcepto } from '../lib/formatos'
import { fragmentoDocente, fundamentoEditorial } from '../lib/fuente-docente'
import { versionPregunta } from '../screens/sesion'
import { aplicarVariante } from '../lib/variantes'
import { PresentacionIAZ } from '../lib/contexto-ia'
import { PeticionChatZ } from '../lib/contexto-chat'
import { MAX_PREGUNTAS_SEGUIMIENTO, PeticionSesionZ } from '../lib/contexto-sesion'
import { extraerJSON, validarEjercicios } from '../lib/practica-activa'
import type { NbmeQuestion } from '../nbme/types'
import { NBME_SOURCE_SAFETY_PATH, readNbmeSourceSafety, originalRecoveryAllowed, type NbmeSourceSafety } from '../nbme/source-safety'
import { tieneClasificacionContradictoria } from './fuente-recuperacion-confiable'
import { evidenciaNbme, type OrigenEvidencia } from './etiquetas-sesion'
import { handleNbme } from './nbme'
import { handlePlan, type PlanEnv } from './plan'
import { ErrorClaude, costeDeError, costeReservaUSD, llamarClaude, type CodigoClaude, type SolicitudClaude } from './claude'
import { MAX_MATERIAL, VERSION_CHAT, materialChatConcepto, materialChatNbme, solicitudCalificar, solicitudChat, solicitudPractica, type MaterialChat } from './ia-chat'
import {
  VERSION_CONSTRUCTOR, VERSION_LECTURA, VERSION_SESION, solicitudEntender, solicitudHilo, solicitudLeer, solicitudRevisar, textoDeFicha,
  validarEntenderSalida, validarHilo, validarLectura, validarRevision, type FichaLectura,
} from './ia-sesion'

const DAY = 86400000

interface Storage {
  get<T>(key: string): Promise<T | undefined>
  /** Hasta 128 claves por llamada; las que no existen no aparecen en el mapa. */
  get<T>(keys: string[]): Promise<Map<string, T>>
  put(key: string, value: unknown): Promise<void>
  delete(keys: string[]): Promise<number>
  list<T>(options: { prefix: string }): Promise<Map<string, T>>
  transaction<T>(fn: (storage: Storage) => Promise<T>): Promise<T>
}

/** Lo gastado en Claude este mes, en dólares, y las llamadas de cada día por usuario. */
interface GastoClaude { v: 1; mes: string; usd: number; llamadas: number; usuarios: Record<string, { dia: string; llamadas: number }> }

interface Env extends PlanEnv {
  /** Secreto del Worker. Sin él, nada de IA responde y la aplicación sigue con su corrector propio. */
  ANTHROPIC_API_KEY?: string
  /** Tope mensual de gasto en USD que contabiliza el Worker. El límite duro lo fija la Consola de Anthropic. */
  CLAUDE_PRESUPUESTO_USD?: string
  COACH: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } }
  ASSETS: { fetch(request: Request): Promise<Response> }
}

type ModoClaude = 'calificar' | 'chat' | 'practica' | 'hilo' | 'entender' | 'leer' | 'revisar'
/**
 * Lo que el validador necesita saber de la petición: los ids que se pueden devolver, cuántas preguntas
 * de seguimiento quedan y cuántos temas se pidieron. `lectura` dice dónde guardar cada ficha leída.
 */
export type ContextoValidacion = { permitidos?: string[]; preguntas?: number; temas?: number; lectura?: { id: string; clave: string; origen: OrigenEvidencia }[] }
type CoachInput = { user: string; key: string; mode: ModoClaude; solicitud: SolicitudClaude; source?: { title: string; page: number }; contexto?: ContextoValidacion }
export type CoachVeredicto = { veredicto: 'correcta' | 'parcial' | 'incorrecta'; motivo: string }

/** Gasto mensual que el Worker contabiliza si no se configura otro, en USD. Deja margen bajo los 100 USD del plan. */
export const PRESUPUESTO_USD_PREDETERMINADO = 90
/** Cortafuegos contra un bucle del cliente: ninguna sesión legítima se acerca a esto. */
export const LLAMADAS_POR_DIA = 500
/**
 * Hasta qué parte del presupuesto llega cada uso. Corregir una respuesta escrita decide el
 * veredicto que se guarda en el historial, así que llega hasta el final; el chat y los
 * ejercicios son prescindibles y se quedan fuera los primeros.
 */
export const TECHO_POR_MODO: Record<ModoClaude, number> = { calificar: 1, chat: 0.9, practica: 0.9, entender: 0.85, leer: 0.85, revisar: 0.85, hilo: 0.8 }

/**
 * Ficha de lectura guardada de una pregunta NBME, por id, revisión y versión del prompt de lectura.
 * No caduca: la pregunta fijada por revisión no cambia. «sin_fuente» recuerda que hoy no hay material
 * que la IA pueda leer, y sólo vale un día para que una explicación revisada nueva se lea pronto.
 */
export type FichaGuardada = { v: 1; at: number } & ({ origen: OrigenEvidencia } & FichaLectura | { origen: 'sin_fuente' })
export const VIGENCIA_SIN_FUENTE_MS = DAY
export const claveLectura = (r: { id: string; revision: string }) => `lectura:${VERSION_LECTURA}:${r.id}:${r.revision}`
export const fichaVigente = (f: FichaGuardada | undefined, ahora = Date.now()): boolean =>
  !!f && f.v === 1 && (f.origen !== 'sin_fuente' || ahora - f.at < VIGENCIA_SIN_FUENTE_MS)

export const presupuestoMensualUSD = (env: Pick<Env, 'CLAUDE_PRESUPUESTO_USD'>): number => {
  const n = Number(env.CLAUDE_PRESUPUESTO_USD)
  return env.CLAUDE_PRESUPUESTO_USD !== undefined && env.CLAUDE_PRESUPUESTO_USD !== '' && Number.isFinite(n) && n >= 0 && n <= 10000
    ? n : PRESUPUESTO_USD_PREDETERMINADO
}

const json = (value: unknown, status = 200) => Response.json(value, { status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

/** Un motivo por causa, en lugar de un 503 mudo para cinco fallos distintos. */
export const MOTIVOS = {
  sin_clave: 'Claude todavía no está conectado en esta plataforma: falta configurar la clave de la API en el Worker. Puedes seguir con la explicación de la pregunta.',
  clave: 'La clave de la API de Claude no es válida o fue revocada. Revisa el secreto ANTHROPIC_API_KEY del Worker.',
  credito: 'Claude no tiene saldo disponible ahora (crédito agotado o límite de gasto alcanzado en la Consola de Anthropic). La explicación de la pregunta sigue disponible.',
  cuota_local: 'Se alcanzó el límite de uso de Claude que tiene fijado esta plataforma (mensual o diario). La explicación de la pregunta sigue disponible.',
  limite: 'Claude está recibiendo demasiadas consultas ahora mismo. Vuelve a intentarlo en un minuto.',
  sobrecarga: 'Claude está saturado en este momento. Vuelve a intentarlo en unos segundos.',
  tiempo: 'Claude tardó demasiado en contestar. Puedes volver a intentarlo.',
  conexion: 'Se perdió la conexión con Claude y no se recibió su respuesta. Puedes volver a intentarlo.',
  proveedor: 'Claude no pudo contestar ahora. Puedes volver a intentarlo.',
  respuesta: 'La respuesta de Claude llegó incompleta o no se pudo comprobar. Vuelve a intentarlo.',
  rechazo: 'Claude no quiso contestar esta consulta. Reformúlala o sigue con la explicación.',
  material: 'El material se está actualizando. Recarga la página para continuar.',
  concepto_largo: 'Esta pregunta es demasiado extensa para el chat. Su explicación sigue disponible.',
  no_verificable: 'No se pudo preparar el material de esta pregunta para el chat.',
  fuente_en_revision: 'Esta pregunta NBME está en revisión de fuente y no se envía a la IA. Usa su explicación y la práctica revisada disponible.',
  fuente_inconsistente: 'En esta pregunta NBME la explicación y el objetivo se contradicen, así que no se envía a la IA hasta revisar la fuente. Usa su explicación publicada.',
  interno: 'Algo falló en el servidor al preparar la ayuda. La explicación de la pregunta sigue disponible.',
} as const
export type Motivo = keyof typeof MOTIVOS
const unavailable = (codigo: Motivo = 'proveedor') => json({ error: MOTIVOS[codigo], codigo }, 503)

async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('')
}

const VEREDICTOS = ['correcta', 'parcial', 'incorrecta'] as const

/** El veredicto solo vale si es uno de los tres y trae un motivo corto: nada de texto libre. */
export function validarCalificacion(salida: string): CoachVeredicto | null {
  const obj = extraerJSON(salida) as Record<string, unknown> | null
  if (!obj || typeof obj !== 'object') return null
  if (!VEREDICTOS.includes(obj.veredicto as CoachVeredicto['veredicto'])) return null
  const motivo = typeof obj.motivo === 'string' ? obj.motivo.trim() : ''
  if (!motivo || motivo.length > 200) return null
  return { veredicto: obj.veredicto as CoachVeredicto['veredicto'], motivo }
}

/** Lo que se guarda y se devuelve según el uso; null si la salida del modelo no es utilizable. */
export function validarSalida(modo: ModoClaude, salida: string, parada?: string, contexto: ContextoValidacion = {}): Record<string, unknown> | null {
  // Una respuesta cortada por el tope de tokens nunca es utilizable: ni se muestra como completa ni se guarda en caché.
  if (parada === 'max_tokens') return null
  if (modo === 'calificar') return validarCalificacion(salida)
  if (modo === 'hilo') return validarHilo(salida)
  if (modo === 'entender') return validarEntenderSalida(salida, contexto.preguntas ?? 0)
  if (modo === 'leer') return validarLectura(salida, contexto.permitidos ?? [])
  if (modo === 'revisar') return validarRevision(salida, contexto.permitidos ?? [], contexto.temas ?? 0)
  if (modo === 'chat') {
    const respuesta = salida.trim()
    return respuesta.length >= 20 ? { respuesta: respuesta.slice(0, 8000) } : null
  }
  const ejercicios = validarEjercicios(extraerJSON(salida))
  return ejercicios ? { ejercicios } : null
}

/** Only this Worker can address the object. No public endpoint accepts trusted source text. */
export class StudyCoach {
  private pending = new Map<string, Promise<Response>>()
  constructor(private state: { storage: Storage }, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const ruta = new URL(request.url).pathname
    if (ruta === '/lecturas') return this.lecturas(await request.json() as { claves: string[] })
    if (ruta === '/lecturas/sin-fuente') return this.sinFuente(await request.json() as { claves: string[] })
    const input = await request.json() as CoachInput
    // Dos peticiones idénticas a la vez comparten una sola llamada (y un solo gasto).
    const current = this.pending.get(input.key)
    if (current) return (await current).clone()
    const work = this.atender(input)
    this.pending.set(input.key, work)
    try { return (await work).clone() } finally { this.pending.delete(input.key) }
  }

  /** Las fichas guardadas de estas claves. Sólo lee: nunca llama a Claude ni gasta. */
  private async lecturas({ claves }: { claves: string[] }): Promise<Response> {
    const fichas: Record<string, FichaGuardada> = {}
    const validas = (Array.isArray(claves) ? claves : []).filter(c => typeof c === 'string' && c.startsWith('lectura:'))
    for (let n = 0; n < validas.length; n += 128) {
      for (const [k, v] of await this.state.storage.get<FichaGuardada>(validas.slice(n, n + 128))) fichas[k] = v
    }
    return json({ fichas })
  }

  /** Recuerda por un día que estas preguntas no tienen material legible, sin pisar una ficha ya leída. */
  private async sinFuente({ claves }: { claves: string[] }): Promise<Response> {
    const validas = (Array.isArray(claves) ? claves : []).filter(c => typeof c === 'string' && c.startsWith('lectura:'))
    for (let n = 0; n < validas.length; n += 128) {
      const lote = validas.slice(n, n + 128)
      const ya = await this.state.storage.get<FichaGuardada>(lote)
      for (const clave of lote) {
        if (ya.get(clave)?.origen === 'revisada' || ya.get(clave)?.origen === 'original') continue
        await this.state.storage.put(clave, { v: 1, at: Date.now(), origen: 'sin_fuente' } satisfies FichaGuardada)
      }
    }
    return json({ ok: true })
  }

  private async guardarFichas(lectura: NonNullable<ContextoValidacion['lectura']>, fichas: Record<string, FichaLectura>) {
    for (const l of lectura) {
      const f = fichas[l.id]
      if (f && l.clave.startsWith('lectura:')) await this.state.storage.put(l.clave, { v: 1, at: Date.now(), origen: l.origen, ...f } satisfies FichaGuardada)
    }
  }

  private async atender(input: CoachInput): Promise<Response> {
    const cacheKey = `cache:${input.key}`
    // Una lectura se guarda como fichas por pregunta, no como respuesta en caché.
    const lectura = input.mode === 'leer'
    const guardado = lectura ? undefined : await this.state.storage.get<{ at: number; cuerpo: Record<string, unknown> }>(cacheKey)
    if (guardado?.cuerpo && Date.now() - guardado.at < 7 * DAY) return json({ ...guardado.cuerpo, ...(input.source ? { source: input.source } : {}), cached: true })
    const reserva = costeReservaUSD(input.solicitud)
    const mes = await this.admitir(input.user, input.mode, reserva)
    if (!mes) return json({ error: MOTIVOS.cuota_local, codigo: 'cuota_local' }, 429)
    // Lo que se devuelve al bote al terminar. Un error HTTP de la API no factura; que se agote
    // la espera sí puede (el modelo pudo seguir trabajando), y entonces se queda la reserva.
    let real = reserva
    try {
      const r = await llamarClaude(this.env.ANTHROPIC_API_KEY, input.solicitud)
      real = r.costeUSD
      const cuerpo = validarSalida(input.mode, r.texto, r.parada, input.contexto)
      if (!cuerpo) {
        registrar('coach/salida-invalida', input.mode, { parada: r.parada })
        return unavailable('respuesta')
      }
      if (lectura) await this.guardarFichas(input.contexto?.lectura ?? [], (cuerpo as { fichas: Record<string, FichaLectura> }).fichas)
      else {
        await this.state.storage.put(cacheKey, { at: Date.now(), cuerpo })
        await this.podarCache()
      }
      return json({ ...cuerpo, ...(input.source ? { source: input.source } : {}), cached: false })
    } catch (causa) {
      if (causa instanceof ErrorClaude) {
        real = costeDeError(causa) ?? (causa.pudoFacturarse ? reserva : 0)
        return unavailable(causa.codigo satisfies CodigoClaude)
      }
      registrar('coach/interno', causa)
      return unavailable('interno')
    } finally {
      await this.liquidar(mes, reserva, real).catch(causa => registrar('coach/liquidar', causa))
    }
  }

  private async leer(storage: Storage, mes: string): Promise<GastoClaude> {
    const guardado = await storage.get<GastoClaude>('gasto-claude')
    return guardado?.v === 1 && guardado.mes === mes ? guardado : { v: 1, mes, usd: 0, llamadas: 0, usuarios: {} }
  }

  /**
   * Reserva por adelantado el peor caso de la llamada. El mes decide el bote; el día, el
   * cortafuegos por usuario. Una respuesta cacheada no llega hasta aquí. Devuelve el mes
   * reservado, o null si no hay sitio.
   */
  private async admitir(user: string, modo: ModoClaude, estimado: number): Promise<string | null> {
    return this.state.storage.transaction(async storage => {
      const ahora = new Date().toISOString()
      const mes = ahora.slice(0, 7), dia = ahora.slice(0, 10)
      const g = await this.leer(storage, mes)
      if (g.usd + estimado > presupuestoMensualUSD(this.env) * TECHO_POR_MODO[modo]) return null
      const hoy = g.usuarios[user]?.dia === dia ? g.usuarios[user].llamadas : 0
      if (hoy >= LLAMADAS_POR_DIA) return null
      g.usd += estimado; g.llamadas++
      g.usuarios[user] = { dia, llamadas: hoy + 1 }
      await storage.put('gasto-claude', g)
      return mes
    })
  }

  /** Cambia la reserva por el gasto real. Si el mes ya cambió, el contador nuevo no se toca. */
  private async liquidar(mes: string, estimado: number, real: number) {
    if (real === estimado) return
    await this.state.storage.transaction(async storage => {
      const g = await storage.get<GastoClaude>('gasto-claude')
      if (g?.v !== 1 || g.mes !== mes) return
      g.usd = Math.max(0, g.usd + real - estimado)
      await storage.put('gasto-claude', g)
    })
  }

  private async podarCache() {
    const entries = await this.state.storage.list<{ at: number }>({ prefix: 'cache:' })
    const old = [...entries].sort((a, b) => a[1].at - b[1].at)
    const remove = old.filter(([, v], n) => Date.now() - v.at > 7 * DAY || n < old.length - 200).map(([k]) => k)
    for (let n = 0; n < remove.length; n += 128) await this.state.storage.delete(remove.slice(n, n + 128))
  }
}


/** Tope del cuerpo de una petición de IA. Revisar una lista de candidatos necesita más que una pregunta suelta. */
const LIMITE_CUERPO = 6000
export const LIMITE_CUERPO_SESION = 160_000

async function boundedBody(request: Request, limite = LIMITE_CUERPO): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []; let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > limite) { await reader.cancel(); return null }
    chunks.push(part.value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}

/** Puerta común: método, origen, sesión y tamaño, en ese orden y con esos mensajes. */
function preflight(request: Request, url: URL, metodo: 'GET' | 'POST', limite = LIMITE_CUERPO): Response | null {
  if (request.method !== metodo) return json({ error: 'Método no permitido' }, 405)
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Origen no permitido' }, 403)
  if (!/^Bearer [^\s]{20,8192}$/.test(request.headers.get('authorization') ?? '')) return json({ error: 'Inicia sesión para usar la ayuda.' }, 401)
  if (Number(request.headers.get('content-length') ?? 0) > limite) return json({ error: 'Solicitud demasiado larga.' }, 413)
  return null
}

type Lector = (path: string) => Promise<Response>

/**
 * Cuenta verificada y con acceso al material, comprobada contra Supabase en cada llamada.
 * Ninguna ruta de IA mira caché ni corpus antes de pasar por aquí.
 */
async function identificar(request: Request): Promise<{ userId: string; get: Lector } | Response> {
  const headers = { apikey: config.supabasePublishableKey, Authorization: request.headers.get('authorization') ?? '' }
  const get: Lector = async path => fetch(`${config.supabaseUrl}${path}`, { headers, signal: AbortSignal.timeout(10000) })
  const auth = await get('/auth/v1/user')
  if (!auth.ok) return json({ error: 'Tu sesión necesita verificarse otra vez.' }, 401)
  const user = await auth.json() as { id?: string; is_anonymous?: boolean; email_confirmed_at?: string }
  if (!user.id || user.is_anonymous || !user.email_confirmed_at) return json({ error: 'Se necesita una cuenta verificada.' }, 403)
  const member = await get(`/rest/v1/app_members?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`)
  if (!member.ok || !(await member.json() as unknown[]).length) return json({ error: 'Tu cuenta no tiene acceso al material.' }, 403)
  return { userId: user.id, get }
}

const activos = (get: Lector) => async (path: string) => {
  const res = await get(`/rest/v1/corpus_assets?select=payload&path=eq.${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error('corpus')
  return (await res.json() as { payload: unknown }[])[0]?.payload
}

/** Reconstruye exactamente lo mostrado, incluidas variantes y formatos antiguos. */
function reconstruirPresentacion(original: Concepto, input: unknown): Concepto | Response {
  const leido = PresentacionIAZ.safeParse(input)
  if (!leido.success || leido.data.conceptId !== original.concept_id) return json({ error: 'Presentación no válida.' }, 400)
  const p = leido.data
  const c = prepararConcepto(aplicarVariante(original, p.variantId), { semilla: p.questionId, indice: p.index, ruta: p.route, forzarReconocimiento: p.retry, version: p.formatVersion ?? 1 })
  return versionPregunta(c) === p.version ? c : json({ error: 'La pregunta ha cambiado. Recarga el material para usar la ayuda.' }, 409)
}

/**
 * El concepto tal y como está publicado, con los mismos filtros que la ayuda: material
 * alineado con el índice, aprobado, de Step 1 y sin aclaración editorial pendiente.
 */
async function conceptoPublicado(get: Lector, conceptId: string): Promise<{ indice: Indice; concepto: Concepto } | Response> {
  const asset = activos(get)
  const indice = IndiceZ.parse(await asset('index.json'))
  const modulo = indice.modulos.find(m => m.sesiones.some(s => s.conceptos.includes(conceptId)))
  if (!modulo) return json({ error: 'Concepto no disponible.' }, 404)
  const data = await asset(`modules/${modulo.module_id}.json`) as { conceptos?: unknown[]; corpus_version?: string }
  if (data?.corpus_version !== indice.corpus_version) {
    registrar('concepto/corpus-desalineado', 'el módulo y el índice declaran versiones distintas', { modulo: modulo.module_id })
    return unavailable('material')
  }
  const leido = ConceptoZ.safeParse(data.conceptos?.find(c => (c as { concept_id: string }).concept_id === conceptId))
  if (!leido.success) return json({ error: 'Concepto no disponible.' }, 404)
  const concepto = leido.data
  if (concepto.revision_editorial && !fundamentoEditorial(concepto)) return json({ error: 'Este concepto tiene una aclaración editorial. Consulta su explicación y las referencias en «Ver la fuente».' }, 422)
  if (concepto.calidad.estado !== 'aprobado' || concepto.calidad.confianza < 0.7 || concepto.step === 'step2') return json({ error: 'Concepto no disponible.' }, 404)
  return { indice, concepto }
}

const alCoach = (env: Env, modo: ModoClaude, cuerpo: unknown) =>
  env.COACH.get(env.COACH.idFromName('study-coach-v1')).fetch(new Request(`https://coach/${modo}`, { method: 'POST', body: JSON.stringify(cuerpo) }))


/** Una pregunta NBME fijada por revisión, con la misma puerta del banco (membresía, disponibilidad y revisión exacta). */
async function preguntaNbme(request: Request, url: URL, questionId: string, revision: string): Promise<NbmeQuestion | Response> {
  const response = await handleNbme(new Request(new URL('/api/nbme/questions', url.origin), {
    method: 'POST', headers: { Authorization: request.headers.get('authorization')!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refs: [{ id: questionId, revision }] }) }))
  if (!response.ok) return response
  const data = await response.json() as { questions: NbmeQuestion[] }
  return data.questions[0] ?? json({ error: 'Pregunta no disponible.' }, 404)
}

/** La política de fuentes NBME vigente, o null si no se puede leer: sin ella ninguna pregunta sale hacia la IA. */
async function politicaNbme(get: Lector): Promise<NbmeSourceSafety | null> {
  const respuesta = await get(`/rest/v1/nbme_assets?select=payload&path=eq.${encodeURIComponent(NBME_SOURCE_SAFETY_PATH)}`)
  const filas: unknown = respuesta.ok ? await respuesta.json() : null
  return Array.isArray(filas) && filas.length === 1 ? readNbmeSourceSafety(filas[0]?.payload) : null
}

/**
 * Chat de la pregunta que acabas de responder, y su ronda de recuperación activa.
 *
 * Sirve igual si acertaste, fallaste o acertaste a medias. El cliente solo identifica la
 * pregunta; el material lo resuelve el Worker contra su fuente, con la autorización vigente,
 * antes de mirar la caché o gastar nada.
 */
async function handleChat(request: Request, url: URL, env: Env): Promise<Response> {
  const parado = preflight(request, url, 'POST')
  if (parado) return parado
  try {
    const body = await boundedBody(request)
    if (body === null) return json({ error: 'Solicitud demasiado larga.' }, 413)
    let parsed: unknown
    try { parsed = JSON.parse(body) } catch { return json({ error: 'Solicitud no válida.' }, 400) }
    const leido = PeticionChatZ.safeParse(parsed)
    if (!leido.success) return json({ error: 'Solicitud no válida.' }, 400)
    const input = leido.data
    const quien = await identificar(request)
    if (quien instanceof Response) return quien
    if (!env.ANTHROPIC_API_KEY) return unavailable('sin_clave')
    let material: MaterialChat | null, identidad: unknown
    if (input.tipo === 'concepto') {
      const publicado = await conceptoPublicado(quien.get, input.presentacion.conceptId)
      if (publicado instanceof Response) return publicado
      const c = reconstruirPresentacion(publicado.concepto, input.presentacion)
      if (c instanceof Response) return c
      const respuesta = input.presentacion.answer.trim().normalize('NFC')
      material = materialChatConcepto(c, respuesta, input.resultado)
      identidad = [publicado.indice.corpus_version, c.concept_id, input.presentacion.version, respuesta, input.resultado]
    } else {
      const q = await preguntaNbme(request, url, input.questionId, input.revision)
      if (q instanceof Response) return q
      // La política de fuentes vigente manda sobre cualquier cliente: una pregunta en revisión no sale hacia la IA.
      if (!originalRecoveryAllowed(await politicaNbme(quien.get), q.id)) return unavailable('fuente_en_revision')
      // Una cita literal puede seguir siendo médicamente contradictoria: sin elegir un ganador ni tocar el banco, se cierra.
      if (tieneClasificacionContradictoria(q.explanation ?? '', q.objective)) return unavailable('fuente_inconsistente')
      material = materialChatNbme(q, input.optionId)
      identidad = [input.questionId, input.revision, input.optionId]
    }
    if (!material) return unavailable('no_verificable')
    if (material.reference.length > MAX_MATERIAL) return unavailable('concepto_largo')
    const mensaje = (input.mensaje ?? '').trim().normalize('NFC')
    const practica = input.accion === 'practica'
    const solicitud = practica ? solicitudPractica(material.reference, input.evitar, material.estudiante)
      : solicitudChat(material.reference, input.historial, mensaje, material.estudiante, input.revisionSonnet)
    const trusted: CoachInput = { user: quien.userId, mode: practica ? 'practica' : 'chat', solicitud, source: material.fuente,
      key: await digest(JSON.stringify([quien.userId, identidad, material.reference, material.estudiante ?? '', input.accion, mensaje,
        input.historial, input.evitar, input.revisionSonnet === true, clavePerfil(solicitud), VERSION_CHAT])) }
    return await alCoach(env, trusted.mode, trusted)
  } catch (causa) {
    registrar('ia/chat', causa)
    return unavailable('interno')
  }
}

/** Etiqueta de una pregunta NBME en lo que sale hacia la IA: sin política que la autorice, sólo «Pregunta NBME». */
const ETIQUETA_NBME_RESERVADA = 'Pregunta NBME'

/** Una pregunta NBME sólo lleva su etiqueta a la IA si su forma es la de una pregunta real y la política vigente la autoriza. */
const nbmeAutorizada = (id: string, politica: NbmeSourceSafety | null) => /^NBME(?:27|28|29)-P\d{4}$/.test(id) && originalRecoveryAllowed(politica, id)
const limpiarEtiqueta = (t: string) => t.replace(/\s+/g, ' ').trim().normalize('NFC')

/** Las fichas guardadas de estas preguntas, por clave. Lee del Durable Object sin gastar. */
async function fichasGuardadas(env: Env, claves: string[]): Promise<Map<string, FichaGuardada>> {
  if (!claves.length) return new Map()
  const r = await env.COACH.get(env.COACH.idFromName('study-coach-v1')).fetch(new Request('https://coach/lecturas', { method: 'POST', body: JSON.stringify({ claves }) }))
  if (!r.ok) throw new Error('lecturas')
  const { fichas } = await r.json() as { fichas?: Record<string, FichaGuardada> }
  return new Map(Object.entries(fichas ?? {}))
}

const ID_NBME = /^NBME(?:27|28|29)-P\d{4}$/

/**
 * Ayudas de organización del estudio (no explican una pregunta):
 * - `hilo`: la frase con el hilo común de las sugeridas del día.
 * - `entender`: traduce lo que la persona pide al vocabulario cerrado de la plataforma, o hace una pregunta de seguimiento.
 * - `lecturas`: qué preguntas NBME de la lista aún no tienen ficha de lectura. No llama a Claude.
 * - `leer`: Claude lee, una por una, las preguntas sin ficha con el material que resuelve el servidor, y la ficha se guarda.
 * - `revisar`: Claude lee la ficha de cada candidata y deja las que tratan lo pedido, con el tema que cubren.
 * El navegador manda identificadores, etiquetas cortas de sus conceptos y lo que la persona escribe; la
 * plataforma ya decidió qué es frágil o fallado. Las preguntas NBME pasan por la política de fuentes
 * antes de que su material o su ficha lleguen a la IA.
 */
async function handleSesion(request: Request, url: URL, env: Env): Promise<Response> {
  const parado = preflight(request, url, 'POST', LIMITE_CUERPO_SESION)
  if (parado) return parado
  try {
    const body = await boundedBody(request, LIMITE_CUERPO_SESION)
    if (body === null) return json({ error: 'Solicitud demasiado larga.' }, 413)
    let parsed: unknown
    try { parsed = JSON.parse(body) } catch { return json({ error: 'Solicitud no válida.' }, 400) }
    const leido = PeticionSesionZ.safeParse(parsed)
    if (!leido.success) return json({ error: 'Solicitud no válida.' }, 400)
    const input = leido.data
    const quien = await identificar(request)
    if (quien instanceof Response) return quien
    if (!env.ANTHROPIC_API_KEY) return unavailable('sin_clave')

    if (input.fase === 'entender') {
      const restantes = Math.max(0, MAX_PREGUNTAS_SEGUIMIENTO - input.preguntasHechas)
      const solicitud = solicitudEntender(input.mensajes, restantes)
      const trusted: CoachInput = { user: quien.userId, mode: 'entender', solicitud, contexto: { preguntas: restantes },
        key: await digest(JSON.stringify([quien.userId, 'entender', input.mensajes, restantes, clavePerfil(solicitud), VERSION_CONSTRUCTOR])) }
      return await alCoach(env, 'entender', trusted)
    }

    if (input.fase === 'lecturas' || input.fase === 'leer') {
      const claves = input.items.map(claveLectura)
      const guardadas = await fichasGuardadas(env, claves)
      const faltan = input.items.filter((_, n) => !fichaVigente(guardadas.get(claves[n])))
      if (input.fase === 'lecturas') return json({ faltan: faltan.map(r => r.id) })
      const yaLeidas = input.items.length - faltan.length
      if (!faltan.length) return json({ leidas: yaLeidas, sinFuente: 0, pendientes: 0 })
      const politica = await politicaNbme(quien.get)
      // Sin política vigente nada sale hacia la IA, y tampoco se recuerda como «sin fuente»: puede ser un fallo pasajero.
      if (!politica) return json({ leidas: yaLeidas, sinFuente: faltan.length, pendientes: 0 })
      const { evidencias, sinFuente } = await evidenciaNbme(faltan, politica, quien.get)
      if (sinFuente.length) {
        const marcadas = faltan.filter(r => sinFuente.includes(r.id)).map(claveLectura)
        await env.COACH.get(env.COACH.idFromName('study-coach-v1')).fetch(new Request('https://coach/lecturas/sin-fuente', { method: 'POST', body: JSON.stringify({ claves: marcadas }) }))
      }
      if (!evidencias.length) return json({ leidas: yaLeidas, sinFuente: sinFuente.length, pendientes: 0 })
      const solicitud = solicitudLeer(evidencias)
      const lectura = evidencias.map(e => ({ id: e.id, clave: claveLectura(e), origen: e.origen }))
      const trusted: CoachInput = { user: quien.userId, mode: 'leer', solicitud, contexto: { permitidos: evidencias.map(e => e.id), lectura },
        key: await digest(JSON.stringify(['leer', evidencias, clavePerfil(solicitud), VERSION_LECTURA])) }
      const respuesta = await alCoach(env, 'leer', trusted)
      if (!respuesta.ok) return respuesta
      const leidasAhora = Object.keys((await respuesta.json() as { fichas?: Record<string, unknown> }).fichas ?? {}).length
      return json({ leidas: yaLeidas + leidasAhora, sinFuente: sinFuente.length, pendientes: evidencias.length - leidasAhora })
    }

    if (input.fase === 'revisar') {
      const preguntas = input.items.filter((i): i is typeof i & { revision: string } => i.tipo === 'pregunta' && ID_NBME.test(i.id) && !!i.revision)
      const politica = preguntas.length ? await politicaNbme(quien.get) : null
      const claves = new Map(preguntas.map(p => [p.id, claveLectura(p)]))
      const guardadas = politica ? await fichasGuardadas(env, [...claves.values()]) : new Map<string, FichaGuardada>()
      let conFuenteRevisada = 0
      // Un concepto lleva su tema y objetivo; una pregunta NBME, la ficha que Claude escribió al leerla.
      // Una ficha leída del original sólo vale mientras la política siga autorizando ese original.
      const revisables = input.items.flatMap(i => {
        if (i.tipo === 'concepto') return i.id.startsWith('NBME') ? [] : [{ id: i.id, etiqueta: limpiarEtiqueta(i.etiqueta) }]
        const f = claves.has(i.id) ? guardadas.get(claves.get(i.id)!) : undefined
        if (!f || f.origen === 'sin_fuente' || (f.origen === 'original' && !originalRecoveryAllowed(politica, i.id))) return []
        if (f.origen === 'revisada') conFuenteRevisada++
        return [{ id: i.id, etiqueta: textoDeFicha(f) }]
      })
      const sinRevisar = input.items.length - revisables.length
      if (!revisables.length) return json({ ids: [], grupos: [], sinRevisar, cached: false })
      const pedido = limpiarEtiqueta(input.pedido)
      const solicitud = solicitudRevisar(pedido, input.consulta, revisables)
      const trusted: CoachInput = { user: quien.userId, mode: 'revisar', solicitud,
        contexto: { permitidos: revisables.map(i => i.id), temas: input.consulta.terminos.length },
        key: await digest(JSON.stringify([quien.userId, 'revisar', pedido, input.consulta, revisables, clavePerfil(solicitud), VERSION_CONSTRUCTOR])) }
      const respuesta = await alCoach(env, 'revisar', trusted)
      if (!respuesta.ok) return respuesta
      return json({ ...await respuesta.json() as Record<string, unknown>, sinRevisar, revisadas: revisables.length, conFuenteRevisada })
    }

    const hayNbme = input.items.some(i => i.tipo === 'pregunta')
    const politica = hayNbme ? await politicaNbme(quien.get) : null

    // fase === 'hilo'
    const items = input.items.map(i => ({
      etiqueta: limpiarEtiqueta(i.tipo === 'pregunta' && !nbmeAutorizada(i.id, politica) ? ETIQUETA_NBME_RESERVADA : i.etiqueta),
      senales: i.senales }))
    const solicitud = solicitudHilo(items)
    const trusted: CoachInput = { user: quien.userId, mode: 'hilo', solicitud,
      key: await digest(JSON.stringify([quien.userId, 'hilo', items, clavePerfil(solicitud), VERSION_SESION])) }
    return await alCoach(env, 'hilo', trusted)
  } catch (causa) {
    registrar('ia/sesion', causa)
    return unavailable('interno')
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (url.pathname.startsWith('/api/nbme/')) return handleNbme(request)
    if (url.pathname.startsWith('/api/plan/')) return handlePlan(request, env)
    if (url.pathname === '/api/ia/chat') return handleChat(request, url, env)
    if (url.pathname === '/api/ia/sesion') return handleSesion(request, url, env)
    if (url.pathname !== '/api/calificar') return json({ error: 'No encontrado' }, 404)
    const parado = preflight(request, url, 'POST')
    if (parado) return parado
    try {
      const body = await boundedBody(request)
      if (body === null) return json({ error: 'Solicitud demasiado larga.' }, 413)
      const input = JSON.parse(body)
      if (typeof input.conceptId !== 'string' || input.conceptId.length > 200 || typeof input.answer !== 'string' || input.answer.length > 500
        || typeof input.questionId !== 'string' || input.questionId.length > 512 || typeof input.version !== 'string'
        || !Number.isInteger(input.index) || input.index < 0 || input.index > 100000
        || (input.formatVersion !== undefined && ![1, 2, 3].includes(input.formatVersion))
        || !['guiada', 'sistemas', 'disciplinas', 'repaso', 'debiles', 'confusiones', 'direccional', 'terminos', 'examen', 'mixta', 'aplicacion'].includes(input.route)
        || typeof input.retry !== 'boolean' || (input.variantId !== undefined && (typeof input.variantId !== 'string' || input.variantId.length > 200))) return json({ error: 'Solicitud no válida.' }, 400)
      const quien = await identificar(request)
      if (quien instanceof Response) return quien
      const { userId, get } = quien
      const publicado = await conceptoPublicado(get, input.conceptId)
      if (publicado instanceof Response) return publicado
      const { indice, concepto: original } = publicado
      // Los clientes 1.4 abiertos antes del despliegue no envían formatVersion.
      const c = prepararConcepto(aplicarVariante(original, input.variantId), { semilla: input.questionId, indice: input.index, ruta: input.route, forzarReconocimiento: input.retry, version: input.formatVersion ?? 1 })
      if (versionPregunta(c) !== input.version) return json({ error: 'La pregunta ha cambiado. Recarga el material para usar la ayuda.' }, 409)
      const acceptedAnswers = [...c.sinonimos, ...c.evaluacion.respuestas_aceptadas]
      // Reconstruct from trusted, version-checked source; never let AI/cache override an accepted answer.
      if (['correcta', 'ortografia'].includes(evaluarTexto(input.answer, c.respuesta_canonica, acceptedAnswers, c.distractores_cercanos.map(d => d.texto)))) {
        return json({ veredicto: 'correcta', motivo: 'Coincide con una respuesta aceptada del concepto.', origen: 'respuesta_aceptada' })
      }
      if (!env.ANTHROPIC_API_KEY) return unavailable('sin_clave')
      const reference = `${fragmentoDocente(original)}\n${c.afirmacion}\n${c.respuesta_canonica}\n${c.explicacion}\n${JSON.stringify(c.evaluacion.opciones ?? [])}`
      if (reference.length > MAX_MATERIAL || c.evaluacion.pregunta.length > 1500) return unavailable('concepto_largo')
      const answer = input.answer.trim().normalize('NFC')
      const solicitud = solicitudCalificar({ material: reference, pregunta: c.evaluacion.pregunta, referencia: c.respuesta_canonica, aceptadas: acceptedAnswers, respuesta: answer })
      const trusted: CoachInput = { user: userId, mode: 'calificar', solicitud,
        // El modo entra en la clave: una explicación cacheada nunca puede servirse como veredicto.
        key: await digest(JSON.stringify([userId, indice.corpus_version, c.concept_id, input.version, answer, reference, clavePerfil(solicitud), `calificar-${EVALUADOR_VERSION}`, acceptedAnswers])) }
      return await alCoach(env, 'calificar', trusted)
    } catch (causa) {
      registrar('calificar', causa)
      return unavailable('interno')
    }
  },
}
