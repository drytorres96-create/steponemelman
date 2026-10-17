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
import { extraerJSON, validarEjercicios } from '../lib/practica-activa'
import type { NbmeQuestion } from '../nbme/types'
import { NBME_SOURCE_SAFETY_PATH, readNbmeSourceSafety, originalRecoveryAllowed } from '../nbme/source-safety'
import { tieneClasificacionContradictoria } from './fuente-recuperacion-confiable'
import { handleNbme } from './nbme'
import { handlePlan, type PlanEnv } from './plan'
import { ErrorClaude, costeDeError, costeReservaUSD, llamarClaude, type CodigoClaude, type SolicitudClaude } from './claude'
import { MAX_MATERIAL, VERSION_CHAT, materialChatConcepto, materialChatNbme, solicitudCalificar, solicitudChat, solicitudPractica, type MaterialChat } from './ia-chat'

const DAY = 86400000

interface Storage {
  get<T>(key: string): Promise<T | undefined>
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

type ModoClaude = 'calificar' | 'chat' | 'practica'
type CoachInput = { user: string; key: string; mode: ModoClaude; solicitud: SolicitudClaude; source?: { title: string; page: number } }
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
export const TECHO_POR_MODO: Record<ModoClaude, number> = { calificar: 1, chat: 0.9, practica: 0.9 }

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
export function validarSalida(modo: ModoClaude, salida: string, parada?: string): Record<string, unknown> | null {
  // Una respuesta cortada por el tope de tokens nunca es utilizable: ni se muestra como completa ni se guarda en caché.
  if (parada === 'max_tokens') return null
  if (modo === 'calificar') return validarCalificacion(salida)
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
    const input = await request.json() as CoachInput
    // Dos peticiones idénticas a la vez comparten una sola llamada (y un solo gasto).
    const current = this.pending.get(input.key)
    if (current) return (await current).clone()
    const work = this.atender(input)
    this.pending.set(input.key, work)
    try { return (await work).clone() } finally { this.pending.delete(input.key) }
  }

  private async atender(input: CoachInput): Promise<Response> {
    const cacheKey = `cache:${input.key}`
    const guardado = await this.state.storage.get<{ at: number; cuerpo: Record<string, unknown> }>(cacheKey)
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
      const cuerpo = validarSalida(input.mode, r.texto, r.parada)
      if (!cuerpo) {
        registrar('coach/salida-invalida', input.mode, { parada: r.parada })
        return unavailable('respuesta')
      }
      await this.state.storage.put(cacheKey, { at: Date.now(), cuerpo })
      await this.podarCache()
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


async function boundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []; let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > 6000) { await reader.cancel(); return null }
    chunks.push(part.value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}

/** Puerta común: método, origen, sesión y tamaño, en ese orden y con esos mensajes. */
function preflight(request: Request, url: URL, metodo: 'GET' | 'POST'): Response | null {
  if (request.method !== metodo) return json({ error: 'Método no permitido' }, 405)
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Origen no permitido' }, 403)
  if (!/^Bearer [^\s]{20,8192}$/.test(request.headers.get('authorization') ?? '')) return json({ error: 'Inicia sesión para usar la ayuda.' }, 401)
  if (Number(request.headers.get('content-length') ?? 0) > 6000) return json({ error: 'Solicitud demasiado larga.' }, 413)
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
      const respuestaPolitica = await quien.get(`/rest/v1/nbme_assets?select=payload&path=eq.${encodeURIComponent(NBME_SOURCE_SAFETY_PATH)}`)
      const filas: unknown = respuestaPolitica.ok ? await respuestaPolitica.json() : null
      const politica = Array.isArray(filas) && filas.length === 1 ? readNbmeSourceSafety(filas[0]?.payload) : null
      if (!originalRecoveryAllowed(politica, q.id)) return unavailable('fuente_en_revision')
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
      : solicitudChat(material.reference, input.historial, mensaje, material.estudiante)
    const trusted: CoachInput = { user: quien.userId, mode: practica ? 'practica' : 'chat', solicitud, source: material.fuente,
      key: await digest(JSON.stringify([quien.userId, identidad, material.reference, material.estudiante ?? '', input.accion, mensaje,
        input.historial, input.evitar, solicitud.modelo, VERSION_CHAT])) }
    return await alCoach(env, trusted.mode, trusted)
  } catch (causa) {
    registrar('ia/chat', causa)
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
        key: await digest(JSON.stringify([userId, indice.corpus_version, c.concept_id, input.version, answer, reference, solicitud.modelo, `calificar-${EVALUADOR_VERSION}`, acceptedAnswers])) }
      return await alCoach(env, 'calificar', trusted)
    } catch (causa) {
      registrar('calificar', causa)
      return unavailable('interno')
    }
  },
}
