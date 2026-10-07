// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NbmeQuestion } from '../nbme/types'
import { ConceptoZ } from '../schema/concept'
import worker, { StudyCoach } from './worker'
import { LIMITE_LLAMADAS_USUARIO, techoDeModo } from './neuronas'
import { MAX_TOKENS_RECUPERACION } from './recuperacion-nbme'

const frases = ['Alpha is the first synthetic element.', 'Beta is the second synthetic element.', 'Gamma is the third synthetic element.']
const objetivo = 'Distinguish the synthetic element order.'
const fuente = frases.join('\n')
const salida = { objetivo, ejercicios: [
  { tipo: 'completar', pregunta: '____ is the first synthetic element.', respuesta: 'Alpha', explicacion: frases[0], evidencia: frases[0] },
  { tipo: 'verdadero_falso', pregunta: frases[1], respuesta: 'Verdadero', explicacion: frases[1], evidencia: frases[1] },
  { tipo: 'seleccion', pregunta: '____ is the third synthetic element.', respuesta: 'Gamma', alternativas: ['Alpha', 'Beta', 'Gamma'], explicacion: frases[2], evidencia: frases[2] },
] }
const q: NbmeQuestion = { id: 'NBME27-P0001', revision: 'synthetic-old-r1', form: '27', section: 1,
  item: 1, page: 1, status: 'ready', stem: 'Which synthetic element is first?',
  options: [{ id: 'A', text: 'Alpha' }, { id: 'B', text: 'Beta' }, { id: 'C', text: 'Gamma' }], answer: 'A',
  explanation: fuente, objective: objetivo, figures: [], provenance: { sourceFile: 'Synthetic fixture', sourceRecordId: 'QA', notes: [] },
  systems: [], disciplines: [], topic: 'Synthetic order', reasons: [], figureRequired: false, conceptLinks: [] }
const input = { questionId: q.id, revision: q.revision, optionId: 'B' }
const fragmentoRelacionado = 'Delta is a linked synthetic mechanism component.'
const relacionado = ConceptoZ.parse({ concept_id: 'QA-C1',
  source: { doc: 'QA-linked', doc_title: 'Synthetic linked source', page: 2, item_id: 'QA-C1', fragment: fragmentoRelacionado },
  objetivo: 'Distinguish synthetic components.', afirmacion: fragmentoRelacionado, respuesta_canonica: 'Delta', explicacion: fragmentoRelacionado,
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'Synthetic QA', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] },
  evaluacion: { pregunta: 'Which synthetic component is linked?' }, pistas: ['One', 'Two', 'Three'],
  calidad: { estado: 'aprobado', confianza: 1 } })
const indiceRelacionado = { schema_version: '1', corpus_version: 'synthetic-corpus-v1', n_conceptos: 1,
  modulos: [{ module_id: 'QA-linked', nombre: 'Synthetic linked module', proposito: 'Synthetic QA',
    prerrequisitos: [], disciplinas: [], sistemas: [], temas: [], n_conceptos: 1, minutos_estimados: 1,
    cobertura_documental: [], orden: 1, sesiones: [{ session_id: 'QA-session', titulo: 'Synthetic session', objetivo: 'Synthetic QA', conceptos: ['QA-C1'] }] }],
  glosario: [], documentos: [], cuarentena: 0 }
class Storage {
  values = new Map<string, unknown>()
  async get<T>(k: string) { return this.values.get(k) as T | undefined }
  async put(k: string, v: unknown) { this.values.set(k, structuredClone(v)) }
  async delete(keys: string[]) { keys.forEach(k => this.values.delete(k)); return keys.length }
  async list<T>({ prefix }: { prefix: string }) { return new Map([...this.values].filter(([k]) => k.startsWith(prefix))) as Map<string, T> }
  async transaction<T>(fn: (s: Storage) => Promise<T>) { return fn(this) }
}
function setup() {
  const permisos = { app: true, nbme: true, ready: true, user: 'synthetic-user', mismatch: false,
    linked: false, corpusMismatch: false, step2: false, corpusHangs: false }
  const remoto = vi.fn(async (url: string) => {
    if (url.includes('/auth/v1/user')) return Response.json({ id: permisos.user, email_confirmed_at: '2026-01-01' })
    if (url.includes('app_members')) return Response.json(permisos.app ? [{ user_id: permisos.user }] : [])
    if (url.includes('nbme_members')) return Response.json(permisos.nbme ? [{ user_id: permisos.user }] : [])
    if (url.includes('catalog')) return Response.json([{ payload: { schemaVersion: 1, bankVersion: 'synthetic-bank',
      questions: [{ id: q.id, revision: 'synthetic-current-r2', status: permisos.ready ? 'ready' : 'blocked',
        conceptLinks: permisos.linked ? [{ conceptId: 'QA-C1', relation: 'tested', confidence: 0.9, review: 'suggested' }] : [] }] } }])
    if (url.includes('corpus_assets')) {
      if (permisos.corpusHangs) return new Promise<Response>(() => {})
      return Response.json([{ payload: url.includes('index.json') ? indiceRelacionado : {
        corpus_version: permisos.corpusMismatch ? 'synthetic-stale' : indiceRelacionado.corpus_version,
        conceptos: [{ ...relacionado, step: permisos.step2 ? 'step2' : 'step1' }],
      } }])
    }
    return Response.json([{ path: `questions/${q.id}/${q.revision}.json`,
      payload: permisos.mismatch ? { ...q, revision: 'synthetic-other' } : q }])
  })
  vi.stubGlobal('fetch', remoto)
  const storage = new Storage()
  const env = { AI_FREE_ENABLED: 'true', AI: { run: vi.fn().mockResolvedValue({ response: JSON.stringify(salida) }) },
    ASSETS: { fetch: vi.fn() }, COACH: { idFromName: vi.fn(), get: vi.fn() } }
  const coach = new StudyCoach({ storage }, env)
  env.COACH.get.mockReturnValue({ fetch: (request: Request) => coach.fetch(request) })
  const call = (body: unknown = input, headers: Record<string, string> = {}) => worker.fetch(new Request(
    'https://site/api/ia/recuperacion-nbme', { method: 'POST', headers: { Authorization: 'Bearer ' + 'x'.repeat(30), ...headers }, body: JSON.stringify(body) }), env)
  return { permisos, env, remoto, storage, call }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('puerta de recuperación NBME', () => {
  it('resuelve la revisión histórica exacta, mantiene letras y no confunde análisis con recuperación', async () => {
    const { call, env, remoto } = setup()
    const antes = structuredClone(q)
    const res = await call({ ...input, razonamiento: 'I swapped the synthetic order.' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ objetivo, ejercicios: [{ id: 'rec-1' }, { id: 'rec-2' }, { id: 'rec-3' }],
      source: { title: expect.stringContaining('Synthetic fixture'), page: 1 }, cached: false })
    expect(q).toEqual(antes)
    expect(remoto.mock.calls.some(([url]) => decodeURIComponent(url).includes(`questions/${q.id}/${q.revision}.json`))).toBe(true)
    const sent = env.AI.run.mock.calls[0][1] as { max_tokens: number; messages: { content: string }[] }
    expect(sent.max_tokens).toBe(MAX_TOKENS_RECUPERACION)
    expect(sent.messages[0].content).toContain('without explicit reasoning never claim to know')
    expect(JSON.parse(sent.messages[1].content).material.opcion_elegida).toEqual(q.options[1])
    expect(JSON.parse(sent.messages[1].content).razonamiento_del_estudiante).toBe('I swapped the synthetic order.')
  })
  it('reutiliza la recuperación guardada sin otra inferencia, pero no la comparte entre cuentas', async () => {
    const { call, env, permisos } = setup()
    expect((await call()).status).toBe(200)
    expect(await (await call()).json()).toMatchObject({ cached: true })
    expect(env.AI.run).toHaveBeenCalledOnce()
    permisos.user = 'synthetic-other-user'
    expect(await (await call()).json()).toMatchObject({ cached: false })
    expect(env.AI.run).toHaveBeenCalledTimes(2)
  })
  it.each(['app', 'nbme'] as const)('un permiso %s revocado evita servir caché y leer el banco', async permiso => {
    const { call, env, remoto, permisos } = setup()
    expect((await call()).status).toBe(200)
    env.AI.run.mockClear(); remoto.mockClear(); permisos[permiso] = false
    expect((await call()).status).toBe(403)
    expect(env.AI.run).not.toHaveBeenCalled()
    expect(remoto.mock.calls.some(([url]) => url.includes('nbme_assets'))).toBe(false)
  })
  it('una retirada o una revisión desalineada se rechazan antes de llamar al modelo', async () => {
    const { call, env, permisos } = setup()
    permisos.ready = false
    expect((await call()).status).toBe(422)
    permisos.ready = true; permisos.mismatch = true
    expect((await call()).status).toBe(409)
    expect(env.AI.run).not.toHaveBeenCalled()
  })
  it('solo recupera errores con letras existentes, y no acepta fuente del navegador', async () => {
    const { call, env } = setup()
    expect((await call({ ...input, optionId: 'A' })).status).toBe(422)
    expect((await call({ ...input, optionId: 'Z' })).status).toBe(422)
    expect((await call({ ...input, fuente: fuente })).status).toBe(400)
    expect(env.AI.run).not.toHaveBeenCalled()
  })
  it('mantiene origen, autenticación y tamaño antes de acceder a materiales', async () => {
    const { call, env, remoto } = setup()
    expect((await call(input, { Authorization: '' })).status).toBe(401)
    expect((await call(input, { Origin: 'https://another-site' })).status).toBe(403)
    expect((await call(input, { 'Content-Length': '6001' })).status).toBe(413)
    expect(remoto).not.toHaveBeenCalled(); expect(env.AI.run).not.toHaveBeenCalled()
  })
  it('respeta el techo gratuito y el límite de llamadas ya existentes', async () => {
    const { call, env, storage } = setup()
    const day = new Date().toISOString().slice(0, 10)
    await storage.put('gasto', { v: 2, day, neuronas: techoDeModo('explicar'), llamadas: 0, users: {} })
    expect((await call()).status).toBe(429)
    await storage.put('gasto', { v: 2, day, neuronas: 0, llamadas: LIMITE_LLAMADAS_USUARIO,
      users: { 'synthetic-user': { neuronas: 0, llamadas: LIMITE_LLAMADAS_USUARIO } } })
    expect((await call()).status).toBe(429)
    expect(env.AI.run).not.toHaveBeenCalled()
  })
  it('descarta invenciones con cita decorativa y limita reintentos del mismo fallo', async () => {
    const { call, env, storage } = setup()
    env.AI.run.mockResolvedValue({ response: JSON.stringify({ ...salida, ejercicios: salida.ejercicios.map(e => ({ ...e, pregunta: 'Invented new assertion with a real quote.' })) }) })
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ available: false, codigo: 'no_verificable' })
    expect((await call()).headers.get('Retry-After')).not.toBeNull()
    expect(env.AI.run).toHaveBeenCalledOnce()
    const cache = await storage.list({ prefix: 'cache:' })
    expect([...cache.keys()].every(k => k.startsWith('cache:fallo:'))).toBe(true)
  })
  it('con IA desactivada deja disponibles el material y la pregunta sin gastar', async () => {
    const { call, env } = setup()
    env.AI_FREE_ENABLED = 'false'
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ available: false, codigo: 'desactivada' })
    expect(env.AI.run).not.toHaveBeenCalled()
  })
  it('lee fragmentos de enlaces actuales autorizados y atribuye la evidencia del material relacionado', async () => {
    const { call, env, permisos, remoto } = setup()
    permisos.linked = true
    env.AI.run.mockResolvedValue({ response: JSON.stringify({ ...salida, ejercicios: [
      ...salida.ejercicios.slice(0, 2),
      { tipo: 'seleccion', pregunta: '____ is a linked synthetic mechanism component.', respuesta: 'Delta',
        alternativas: ['Alpha', 'Beta', 'Delta'], evidencia: fragmentoRelacionado, explicacion: fragmentoRelacionado },
    ] }) })
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).ejercicios[2].source).toEqual({ title: 'Synthetic linked source', page: 2, conceptId: 'QA-C1' })
    expect(remoto.mock.calls.some(([url]) => url.includes('corpus_assets'))).toBe(true)
    const sent = env.AI.run.mock.calls[0][1] as { messages: { content: string }[] }
    expect(JSON.parse(sent.messages[1].content).material.conceptos_vinculados).toHaveLength(1)
  })
  it.each(['corpusMismatch', 'step2'] as const)('omite el material %s y conserva la explicación NBME sin bloquear el flujo', async invalid => {
    const { call, env, permisos } = setup()
    permisos.linked = true; permisos[invalid] = true
    expect((await call()).status).toBe(200)
    const sent = env.AI.run.mock.calls[0][1] as { messages: { content: string }[] }
    expect(JSON.parse(sent.messages[1].content).material.conceptos_vinculados).toEqual([])
  })
  it('limita la espera del corpus suplementario y sigue con la fuente original', async () => {
    vi.useFakeTimers()
    const { call, permisos } = setup()
    permisos.linked = true; permisos.corpusHangs = true
    const pending = call()
    await vi.advanceTimersByTimeAsync(3001)
    expect((await pending).status).toBe(200)
  })
  it('un timeout del modelo conserva la reserva y ofrece fallback sin alterar ningún intento', async () => {
    vi.useFakeTimers()
    const { call, env, storage } = setup()
    env.AI.run.mockImplementation(() => new Promise(() => {}))
    const pending = call()
    await vi.waitFor(() => expect(env.AI.run).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(20001)
    const res = await pending
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ available: false, codigo: 'interno' })
    expect(await storage.get('gasto')).toMatchObject({ llamadas: 1, neuronas: expect.any(Number) })
  })
})
