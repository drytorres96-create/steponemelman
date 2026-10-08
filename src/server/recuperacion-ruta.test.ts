// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NbmeQuestion } from '../nbme/types'
import { ConceptoZ } from '../schema/concept'
import worker, { StudyCoach, TIEMPO_RECUPERACION_MS, MAX_TOKENS_SELECCION_RECUPERACION } from './worker'
import { LIMITE_LLAMADAS_USUARIO, PRESUPUESTO_UTIL, costeEstimado, techoDeModo } from './neuronas'
import { validarPlanRecuperacionNbme } from './recuperacion-nbme'

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
const fragmentoRelacionado = 'Delta is the related element.'
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
function seleccionDelCatalogo(args: unknown, vinculada = false) {
  const payload = JSON.parse((args as { messages: { content: string }[] }).messages[1].content)
  const catalogo = payload.catalogo as { id: string; tipo: string; pregunta: string; evidencia: string }[]
  const primero = catalogo.find(e => e.evidencia === frases[0] && ['seleccion', 'discriminar'].includes(e.tipo))
  const segundo = catalogo.find(e => e.evidencia === frases[1] && e.tipo === 'verdadero_falso')
  const tercero = vinculada
    ? catalogo.find(e => e.evidencia === fragmentoRelacionado && e.tipo === 'completar'
      && e.pregunta === fragmentoRelacionado.replace('Delta', '____'))
    : catalogo.find(e => e.evidencia === frases[2] && ['seleccion', 'discriminar'].includes(e.tipo))
  expect([primero, segundo, tercero].every(Boolean)).toBe(true)
  return { response: JSON.stringify({ ejercicios: [primero!.id, segundo!.id, tercero!.id] }) }
}
function setup(pregunta = q, fragmentoVinculado = fragmentoRelacionado) {
  const permisos = { app: true, nbme: true, ready: true, user: 'synthetic-user', mismatch: false,
    linked: false, editorial: false, corpusMismatch: false, step2: false, corpusHangs: false }
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
        conceptos: [{ ...relacionado, source: { ...relacionado.source, fragment: fragmentoVinculado },
          step: permisos.step2 ? 'step2' : 'step1',
          ...(permisos.editorial ? { revision_editorial: { nota: 'Private correction', fuentes: [{ titulo: 'Synthetic reference', url: 'https://example.org/reference' }],
            fundamento: { texto: fragmentoRelacionado, revision: '1.0.7' } }, source: { ...relacionado.source, fragment: 'Obsolete synthetic claim must not reach AI.' } } : {}) }],
      } }])
    }
    return Response.json([{ path: `questions/${q.id}/${q.revision}.json`,
      payload: permisos.mismatch ? { ...pregunta, revision: 'synthetic-other' } : pregunta }])
  })
  vi.stubGlobal('fetch', remoto)
  const storage = new Storage()
  const env = { AI_FREE_ENABLED: 'true', AI: { run: vi.fn().mockImplementation(async (_modelo, args) => seleccionDelCatalogo(args)) },
    ASSETS: { fetch: vi.fn() }, COACH: { idFromName: vi.fn(), get: vi.fn() } }
  const coach = new StudyCoach({ storage }, env)
  env.COACH.get.mockReturnValue({ fetch: (request: Request) => coach.fetch(request) })
  const call = (body: unknown = input, headers: Record<string, string> = {}) => worker.fetch(new Request(
    'https://site/api/ia/recuperacion-nbme', { method: 'POST', headers: { Authorization: 'Bearer ' + 'x'.repeat(30), ...headers }, body: JSON.stringify(body) }), env)
  return { permisos, env, remoto, storage, call }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('puerta de recuperación NBME', () => {
  it('resuelve los IDs del modelo desde el catálogo y devuelve únicamente preguntas respaldadas', async () => {
    const { call, env, storage } = setup()
    env.AI.run.mockImplementation(async (_modelo, args) => {
      return { ...seleccionDelCatalogo(args), usage: { prompt_tokens: 500, completion_tokens: 40 } }
    })
    const respuesta = await call()
    expect(respuesta.status).toBe(200)
    const contenido = await respuesta.json()
    expect(contenido).toMatchObject({ preparacion: 'ia', cached: false })
    expect(contenido.ejercicios.map((e: { evidencia: string }) => e.evidencia)).toEqual(frases)
    expect(contenido.ejercicios.map((e: { id: string }) => e.id)).toEqual(['rec-1', 'rec-2', 'rec-3'])
    expect(await storage.get('gasto')).toMatchObject({ llamadas: 1 })
    expect(await (await call()).json()).toMatchObject({ preparacion: 'ia', cached: true })
    expect(env.AI.run).toHaveBeenCalledOnce()
  })
  it.each([
    { ejercicios: ['e-1', 'e-1', 'e-2'] },
    { ejercicios: ['e-97', 'e-98', 'e-99'] },
    { ejercicios: ['e-1', 'e-2', 'e-3'], pregunta: 'Invented unsupported private statement.' },
    '{truncated JSON',
  ])('una selección no válida ofrece el respaldo comprobado sin exponer la salida ni duplicar el gasto', async salidaModelo => {
    const { call, env, storage } = setup()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      env.AI.run.mockResolvedValue({ response: typeof salidaModelo === 'string' ? salidaModelo : JSON.stringify(salidaModelo) })
      const respuesta = await call()
      expect(respuesta.status).toBe(200)
      const contenido = await respuesta.json()
      expect(contenido).toMatchObject({ preparacion: 'fuente_verificada' })
      expect(contenido.ejercicios).toHaveLength(6)
      expect(JSON.stringify(contenido)).not.toContain('Invented unsupported private statement')
      expect(JSON.stringify(log.mock.calls)).toContain('seleccion_no_valida')
      expect(JSON.stringify(log.mock.calls)).not.toContain('Invented unsupported private statement')
      expect(env.AI.run).toHaveBeenCalledOnce()
      expect(await storage.get('gasto')).toMatchObject({ llamadas: 1 })
    } finally { log.mockRestore() }
  })
  it('no gasta cuota cuando la fuente no permite tres ejercicios con dos citas completas', async () => {
    const { call, env, storage } = setup({ ...q, explanation: frases[0], objective: null })
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ available: false, codigo: 'no_verificable' })
    expect(env.AI.run).not.toHaveBeenCalled()
    expect(await storage.get('gasto')).toBeUndefined()
  })
  it('excluye toda la fuente primaria contradictoria antes de consultar IA o caché sin cambiar el banco', async () => {
    const pregunta = { ...q, explanation: 'Alpha is a depolarizing skeletal muscle relaxant.',
      objective: 'Alpha is a nondepolarizing neuromuscular blocker.' }
    const antes = structuredClone(pregunta)
    const { call, env, storage } = setup(pregunta)
    const res = await call()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ available: false, codigo: 'fuente_inconsistente' })
    expect(env.AI.run).not.toHaveBeenCalled()
    expect(await storage.get('gasto')).toBeUndefined()
    expect((await storage.list({ prefix: 'cache:' })).size).toBe(0)
    expect(pregunta).toEqual(antes)
  })
  it('ante contradicción utiliza exclusivamente los conceptos vinculados aprobados con su propia procedencia', async () => {
    const pregunta = { ...q, explanation: 'Alpha is a depolarizing skeletal muscle relaxant.',
      objective: 'Alpha is a nondepolarizing neuromuscular blocker.' }
    const fuenteVinculada = 'Delta is the related element. Epsilon is another related element.'
    const { call, env, permisos } = setup(pregunta, fuenteVinculada)
    permisos.linked = true
    env.AI.run.mockResolvedValue({ response: JSON.stringify({ ejercicios: [] }) })
    const res = await call()
    expect(res.status).toBe(200)
    const contenido = await res.json()
    expect(contenido.preparacion).toBe('fuente_verificada')
    expect(contenido.source).toEqual({ title: 'Synthetic linked source', page: 2 })
    expect(contenido.ejercicios).toHaveLength(6)
    for (const e of contenido.ejercicios) {
      expect(fuenteVinculada).toContain(e.evidencia)
      expect(e.source.conceptId).toBe('QA-C1')
    }
    const enviado = JSON.stringify(env.AI.run.mock.calls[0][1])
    expect(enviado).not.toContain(pregunta.explanation)
    expect(enviado).not.toContain(pregunta.objective)
    expect(enviado).toContain('Delta is the related element.')
    expect(await (await call()).json()).toMatchObject({ cached: true, preparacion: 'fuente_verificada' })
    expect(env.AI.run).toHaveBeenCalledOnce()
  })
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
    expect(sent.max_tokens).toBe(MAX_TOKENS_SELECCION_RECUPERACION)
    expect(sent.messages[0].content).toContain('Without explicit reasoning never claim to know')
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
    await storage.put('gasto', { v: 2, day, neuronas: techoDeModo('recuperar'), llamadas: 0, users: {} })
    expect((await call()).status).toBe(429)
    await storage.put('gasto', { v: 2, day, neuronas: 0, llamadas: LIMITE_LLAMADAS_USUARIO,
      users: { 'synthetic-user': { neuronas: 0, llamadas: LIMITE_LLAMADAS_USUARIO } } })
    expect((await call()).status).toBe(429)
    expect(env.AI.run).not.toHaveBeenCalled()
  })
  it('descarta la propuesta inventada y prepara práctica respaldada sin otra inferencia', async () => {
    const { call, env, storage } = setup()
    env.AI.run.mockResolvedValue({ response: JSON.stringify({ ...salida, ejercicios: salida.ejercicios.map(e => ({ ...e, pregunta: 'Invented new assertion with a real quote.' })) }) })
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ preparacion: 'fuente_verificada', cached: false })
    expect(body.ejercicios.length).toBeGreaterThanOrEqual(3)
    expect(JSON.stringify(body)).not.toContain('Invented new assertion')
    expect(await (await call()).json()).toMatchObject({ preparacion: 'fuente_verificada', cached: true })
    expect(env.AI.run).toHaveBeenCalledOnce()
    const cache = await storage.list({ prefix: 'cache:' })
    expect([...cache.keys()].some(k => !k.startsWith('cache:fallo:'))).toBe(true)
  })
  it('una propuesta médica antigua válida no sustituye los IDs y sirve respaldo con procedencia honesta', async () => {
    const { call, env, storage } = setup()
    const raw = { response: JSON.stringify(salida) }
    expect(validarPlanRecuperacionNbme(raw, fuente + '\n' + objetivo, q.options.map(o => o.text))).not.toBeNull()
    env.AI.run.mockResolvedValue(raw)
    const res = await call()
    expect(res.status).toBe(200)
    const contenido = await res.json()
    expect(contenido).toMatchObject({ objetivo, preparacion: 'fuente_verificada', cached: false })
    expect(contenido.ejercicios).toHaveLength(6)
    expect(contenido.ejercicios).not.toEqual(salida.ejercicios)
    expect(await (await call()).json()).toMatchObject({ preparacion: 'fuente_verificada', cached: true })
    expect(env.AI.run).toHaveBeenCalledOnce()
    expect(await storage.get('gasto')).toMatchObject({ llamadas: 1 })
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
    env.AI.run.mockImplementation(async (_modelo, args) => seleccionDelCatalogo(args, true))
    const res = await call()
    expect(res.status).toBe(200)
    const contenido = await res.json()
    expect(contenido).toMatchObject({ preparacion: 'ia' })
    expect(contenido.ejercicios).toHaveLength(3)
    expect(contenido.ejercicios[2]).toMatchObject({ tipo: 'completar', respuesta: 'Delta', evidencia: fragmentoRelacionado,
      source: { title: 'Synthetic linked source', page: 2, conceptId: 'QA-C1' } })
    expect(remoto.mock.calls.some(([url]) => url.includes('corpus_assets'))).toBe(true)
    const sent = env.AI.run.mock.calls[0][1] as { messages: { content: string }[] }
    expect(JSON.stringify(JSON.parse(sent.messages[1].content).catalogo)).toContain(fragmentoRelacionado)
  })
  it('recupera con la evidencia editorial corregida y nunca cita el fragmento obsoleto', async () => {
    const { call, env, permisos } = setup()
    permisos.linked = true; permisos.editorial = true
    expect((await call()).status).toBe(200)
    const sent = env.AI.run.mock.calls[0][1] as { messages: { content: string }[] }
    const linked = JSON.parse(sent.messages[1].content).catalogo
    expect(JSON.stringify(linked)).toContain(fragmentoRelacionado)
    expect(JSON.stringify(linked)).not.toContain('Obsolete synthetic claim')
  })
  it.each(['corpusMismatch', 'step2'] as const)('omite el material %s y conserva la explicación NBME sin bloquear el flujo', async invalid => {
    const { call, env, permisos } = setup()
    permisos.linked = true; permisos[invalid] = true
    expect((await call()).status).toBe(200)
    const sent = env.AI.run.mock.calls[0][1] as { messages: { content: string }[] }
    expect(JSON.stringify(JSON.parse(sent.messages[1].content).catalogo)).not.toContain(fragmentoRelacionado)
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
    const signal = (env.AI.run.mock.calls[0][2] as { signal: AbortSignal }).signal
    await vi.advanceTimersByTimeAsync(TIEMPO_RECUPERACION_MS + 1)
    const res = await pending
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ available: false, codigo: 'tiempo' })
    expect(signal.aborted).toBe(true)
    expect(await storage.get('gasto')).toMatchObject({ llamadas: 1, neuronas: expect.any(Number) })
  })
  it('una generación de 35 segundos funciona con 80 % libre y sin el antiguo corte de 20 segundos', async () => {
    vi.useFakeTimers()
    const { call, env, storage } = setup()
    const day = new Date().toISOString().slice(0, 10)
    const previo = Math.floor(PRESUPUESTO_UTIL * 0.2)
    await storage.put('gasto', { v: 2, day, neuronas: previo, llamadas: 9,
      users: { 'synthetic-user': { neuronas: previo, llamadas: 9 } } })
    env.AI.run.mockImplementation((_modelo, args) => new Promise(resolve => setTimeout(() => resolve({
      ...seleccionDelCatalogo(args), usage: { prompt_tokens: 700, completion_tokens: 40 },
    }), 35_000)))
    let terminada = false
    const pending = call().then(r => { terminada = true; return r })
    await vi.waitFor(() => expect(env.AI.run).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(25_001)
    expect(terminada).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    const res = await pending
    expect(res.status).toBe(200)
    const contenido = await res.json()
    expect(contenido).toMatchObject({ preparacion: 'ia', cached: false })
    expect(contenido.ejercicios).toHaveLength(3)
    expect(contenido.ejercicios[0]).toMatchObject({ respuesta: 'Alpha', evidencia: frases[0], explicacion: frases[0] })
    expect(env.AI.run.mock.calls[0][0]).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast')
    expect((env.AI.run.mock.calls[0][2] as { signal: AbortSignal }).signal.aborted).toBe(false)
    const gasto = await storage.get<{ v: number; neuronas: number; llamadas: number }>('gasto')
    expect(gasto).toMatchObject({ v: 2, llamadas: 10 })
    expect(gasto!.neuronas).toBeGreaterThan(previo)
    expect(gasto!.neuronas).toBeLessThan(previo + costeEstimado('', MAX_TOKENS_SELECCION_RECUPERACION))
  })
  it('recuperación conserva capacidad después del techo de explicación sin reiniciar el contador', async () => {
    const { call, env, storage } = setup()
    const day = new Date().toISOString().slice(0, 10)
    const previo = techoDeModo('explicar') + 1
    await storage.put('gasto', { v: 2, day, neuronas: previo, llamadas: 12,
      users: { 'synthetic-user': { neuronas: previo, llamadas: 12 } } })
    expect((await call()).status).toBe(200)
    expect(env.AI.run).toHaveBeenCalledOnce()
    expect(await storage.get('gasto')).toMatchObject({ v: 2, day, llamadas: 13 })
    expect((await storage.get<{ neuronas: number }>('gasto'))!.neuronas).toBeGreaterThan(previo)
  })
  it.each([
    ['3040: Capacity exceeded. Private prompt must stay private.', 503, 'capacidad'],
    ['3036: Daily neuron limit reached. Private prompt must stay private.', 429, 'cuota_proveedor'],
    ['3007: Inference timeout. Private prompt must stay private.', 503, 'tiempo'],
    ['JSON Mode couldn\'t be met. Private prompt must stay private.', 503, 'proveedor'],
  ] as const)('distingue el error de Cloudflare sin publicar ni registrar material (%s)', async (mensaje, status, codigo) => {
    const { call, env } = setup()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      env.AI.run.mockRejectedValue(new Error(mensaje))
      const response = await call()
      expect(response.status).toBe(status)
      const body = await response.json()
      expect(body).toMatchObject({ available: false, codigo })
      expect(JSON.stringify(body)).not.toContain('Private prompt')
      expect(JSON.stringify(log.mock.calls)).not.toContain('Private prompt')
      if (codigo === 'cuota_proveedor') expect(response.headers.get('Retry-After')).toBeNull()
    } finally { log.mockRestore() }
  })
  it('un modelo que termina después del límite no guarda ejercicios ni inicia otra inferencia', async () => {
    vi.useFakeTimers()
    const { call, env, storage } = setup()
    env.AI.run.mockImplementation((_modelo, args) => new Promise(resolve => setTimeout(() => resolve(
      seleccionDelCatalogo(args),
    ), TIEMPO_RECUPERACION_MS + 10_000)))
    const pending = call()
    await vi.waitFor(() => expect(env.AI.run).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(TIEMPO_RECUPERACION_MS + 1)
    expect((await pending).status).toBe(503)
    await vi.advanceTimersByTimeAsync(10_000)
    const entries = await storage.list({ prefix: 'cache:' })
    expect([...entries.keys()].every(k => k.startsWith('cache:fallo:'))).toBe(true)
    expect(env.AI.run).toHaveBeenCalledOnce()
    expect((await call()).status).toBe(503)
    expect(env.AI.run).toHaveBeenCalledOnce()
  })
})
