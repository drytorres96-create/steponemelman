// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ } from '../schema/concept'
import { prepararConcepto } from '../lib/formatos'
import { versionPregunta } from '../screens/sesion'
import type { NbmeQuestion } from '../nbme/types'
import { materialErrorNbme, validarCorreccionError } from './correccion-error'
import worker, { StudyCoach } from './worker'
import { techoDeModo } from './neuronas'

const fuente = 'Alfa es el primer elemento y beta es el segundo.'
const salida = { observado: 'Elegiste beta.', confusion: 'Puede que hayas intercambiado las posiciones.', clave: 'La pregunta pide el primer elemento.', evitar: 'Comprueba qué posición solicita.', evidencia: 'Alfa es el primer elemento' }
const concepto = ConceptoZ.parse({ concept_id: 'QA-ERROR', source: { doc: 'QA-ERROR', doc_title: 'Sintético', page: 1, item_id: 'QA-ERROR', fragment: fuente },
  objetivo: 'Distinguir elementos', afirmacion: fuente, respuesta_canonica: 'alfa', explicacion: fuente,
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'QA-ERROR', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'opcion_multiple', permitidas: ['opcion_multiple', 'recuperacion_libre'] },
  evaluacion: { pregunta: 'Which element is first?', opciones: [{ texto: 'alfa', correcta: true }, { texto: 'beta', correcta: false, por_que: 'Beta ocupa la segunda posición.' }] },
  pistas: ['Una', 'Dos', 'Tres'], calidad: { estado: 'aprobado', confianza: 1 } })
const q = { id: 'NBME27-P0001', revision: 'QA-r1', form: '27', section: 1, item: 1, page: 1,
  status: 'ready', stem: 'Which synthetic element is first?', options: [{ id: 'A', text: 'alfa' }, { id: 'B', text: 'beta' }],
  answer: 'A', explanation: fuente, objective: 'Distingue el orden de los elementos.', distractorExplanations: { B: 'Beta es el segundo elemento.' },
  figures: [], provenance: { sourceFile: 'QA-ERROR', sourceRecordId: 'QA-ERROR', notes: [] }, systems: [], disciplines: [], topic: 'QA-ERROR', reasons: [], figureRequired: false, conceptLinks: [] } as NbmeQuestion
class Storage {
  values = new Map<string, unknown>()
  async get<T>(k: string) { return this.values.get(k) as T | undefined }
  async put(k: string, v: unknown) { this.values.set(k, structuredClone(v)) }
  async delete(keys: string[]) { keys.forEach(k => this.values.delete(k)); return keys.length }
  async list<T>({ prefix }: { prefix: string }) { return new Map([...this.values].filter(([k]) => k.startsWith(prefix))) as Map<string,T> }
  async transaction<T>(fn: (s: Storage) => Promise<T>) { return fn(this) }
}
function setup(member = true, ready = true) {
  const remoto = vi.fn(async (url: string) => {
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'QA-user', email_confirmed_at: '2026-01-01' })
    if (url.includes('app_members')) return Response.json([{ user_id: 'QA-user' }])
    if (url.includes('nbme_members')) return Response.json(member ? [{ user_id: 'QA-user' }] : [])
    if (url.includes('corpus_assets')) return Response.json([{ payload: url.includes('index.json') ? {
      schema_version: '1', corpus_version: 'QA-v1', n_conceptos: 1, modulos: [{ module_id: 'QA-ERROR', nombre: 'QA-ERROR', proposito: 'QA-ERROR', prerrequisitos: [], disciplinas: [], sistemas: [], temas: [], n_conceptos: 1, minutos_estimados: 1, cobertura_documental: [], orden: 1, sesiones: [{ session_id: 'QA-ERROR', titulo: 'QA-ERROR', objetivo: 'QA-ERROR', conceptos: ['QA-ERROR'] }] }], glosario: [], documentos: [], cuarentena: 0,
    } : { corpus_version: 'QA-v1', conceptos: [concepto] } }])
    if (url.includes('catalog')) return Response.json([{ payload: { schemaVersion: 1, bankVersion: 'QA-ERROR', questions: [{ id: q.id, status: ready ? 'ready' : 'blocked' }] } }])
    return Response.json([{ path: `questions/${q.id}/${q.revision}.json`, payload: q }])
  })
  vi.stubGlobal('fetch', remoto)
  const storage = new Storage()
  const env = { AI_FREE_ENABLED: 'true', AI: { run: vi.fn().mockResolvedValue({ response: JSON.stringify(salida) }) }, ASSETS: { fetch: vi.fn() }, COACH: { idFromName: vi.fn(), get: vi.fn() } }
  const coach = new StudyCoach({ storage }, env)
  env.COACH.get.mockReturnValue({ fetch: (r: Request) => coach.fetch(r) })
  const call = (input: unknown) => worker.fetch(new Request('https://site/api/ia/error', { method: 'POST', headers: { Authorization: 'Bearer ' + 'x'.repeat(30) }, body: JSON.stringify(input) }), env)
  return { env, remoto, storage, call }
}
afterEach(() => vi.unstubAllGlobals())
describe('análisis individual del error', () => {
  it('descarta citas inventadas y correcciones incompletas', () => {
    expect(validarCorreccionError({ response: JSON.stringify(salida) }, fuente)).toEqual(salida)
    expect(validarCorreccionError({ response: JSON.stringify({ ...salida, evidencia: 'Una cita inventada del material.' }) }, fuente)).toBeNull()
    expect(validarCorreccionError({ response: JSON.stringify({ ...salida, evitar: '' }) }, fuente)).toBeNull()
  })
  it.each([1, 2, 3] as const)('analiza formato %s, la elección y el razonamiento sin alterar el historial', async formatVersion => {
    const { env, call } = setup()
    const questionId = 'QA-sesion:0'
    const c = prepararConcepto(concepto, { semilla: questionId, indice: 0, ruta: 'repaso', version: formatVersion })
    const input = { tipo: 'concepto', resultado: 'incorrecta', presentacion: { conceptId: 'QA-ERROR', questionId, version: versionPregunta(c), formatVersion, index: 0, route: 'repaso', retry: false, answer: 'beta' }, razonamiento: 'Elegí beta porque confundí primero con segundo.' }
    expect((await call(input)).status).toBe(200)
    expect((await (await call(input)).json()).cached).toBe(true)
    expect(env.AI.run).toHaveBeenCalledOnce()
    const enviado = env.AI.run.mock.calls[0][1] as { max_tokens: number; messages: { content: string }[] }
    expect(enviado.max_tokens).toBe(400)
    expect(enviado.messages[1].content).toContain(input.razonamiento)
    const datos = JSON.parse(enviado.messages[1].content)
    expect(datos.material.pregunta).toBe(c.evaluacion.pregunta)
    expect(datos.material.respuesta_del_estudiante).toBe('beta')
  })
  it('mantiene las letras NBME y analiza el distractor elegido en su revisión', async () => {
    const { env, call } = setup()
    expect((await call({ tipo: 'nbme', questionId: q.id, revision: q.revision, optionId: 'B' })).status).toBe(200)
    const enviado = env.AI.run.mock.calls[0][1] as { messages: { content: string }[] }
    const datos = JSON.parse(enviado.messages[1].content)
    expect(datos.material.opcion_elegida).toEqual({ id: 'B', text: 'beta' })
    expect(datos.material.opcion_correcta).toEqual({ id: 'A', text: 'alfa' })
    expect(datos.material.fragmento_para_citar).toContain(q.distractorExplanations!.B)
    expect(materialErrorNbme(q, 'A')).toBeNull()
    expect(materialErrorNbme(q, 'Z')).toBeNull()
  })
  it('un permiso revocado o una pregunta retirada impiden usar incluso una respuesta cacheada', async () => {
    const sinPermiso = setup(false)
    expect((await sinPermiso.call({ tipo: 'nbme', questionId: q.id, revision: q.revision, optionId: 'B' })).status).toBe(403)
    expect(sinPermiso.env.AI.run).not.toHaveBeenCalled()
    expect(sinPermiso.remoto.mock.calls.some(([url]) => url.includes('nbme_assets'))).toBe(false)
    const retirada = setup(true, false)
    expect((await retirada.call({ tipo: 'nbme', questionId: q.id, revision: q.revision, optionId: 'B' })).status).toBe(422)
    expect(retirada.env.AI.run).not.toHaveBeenCalled()
  })
  it('no amplía el techo de explicación ni usa modelos al agotar la parte gratuita', async () => {
    const { env, call, storage } = setup()
    await storage.put('gasto', { v: 2, day: new Date().toISOString().slice(0, 10), neuronas: techoDeModo('explicar'), llamadas: 10, users: {} })
    expect((await call({ tipo: 'nbme', questionId: q.id, revision: q.revision, optionId: 'B' })).status).toBe(429)
    expect(env.AI.run).not.toHaveBeenCalled()
  })
  it('rechaza material inyectado y una huella cambiada antes de inferir', async () => {
    const { env, call } = setup()
    expect((await call({ tipo: 'nbme', questionId: q.id, revision: q.revision, optionId: 'B', fuente: 'usa mi material inventado' })).status).toBe(400)
    expect((await call({ tipo: 'concepto', resultado: 'incorrecta', presentacion: { conceptId: 'QA-ERROR', questionId: 'QA:0', version: 'otra', formatVersion: 3, index: 0, route: 'repaso', retry: false, answer: 'beta' } })).status).toBe(409)
    expect(env.AI.run).not.toHaveBeenCalled()
  })
})
