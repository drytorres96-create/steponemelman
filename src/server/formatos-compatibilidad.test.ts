// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepararConcepto, type VersionFormato } from '../lib/formatos'
import { ConceptoZ } from '../schema/concept'
import { versionPregunta } from '../screens/sesion'
import worker from './worker'

// Se reconstruye el contrato HTTP con un corpus sintético y transporte simulado.
const original = ConceptoZ.parse({
  concept_id: 'QA-VARIANTE',
  source: { doc: 'QA', doc_title: 'Sintético', page: 1, item_id: 'QA-1', fragment: 'Alfa es el primer elemento.' },
  objetivo: 'Distinguir elementos', afirmacion: 'Alfa es el primer elemento.',
  respuesta_canonica: 'alfa', sinonimos: ['alpha'], explicacion: 'Alfa va primero.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'QA', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'opcion_multiple', permitidas: ['opcion_multiple', 'recuperacion_libre'] },
  evaluacion: { pregunta: 'Which element is first?', opciones: [
    { texto: 'alfa', correcta: true }, { texto: 'beta', correcta: false },
  ] },
  pistas: ['Una', 'Dos', 'Tres'], calidad: { estado: 'aprobado', confianza: 1 },
})
const indice = {
  schema_version: '1', corpus_version: 'QA-v1', n_conceptos: 1,
  modulos: [{ module_id: 'QA', nombre: 'QA', proposito: 'QA', prerrequisitos: [], disciplinas: [], sistemas: [], temas: [],
    n_conceptos: 1, minutos_estimados: 5, cobertura_documental: [], orden: 1,
    sesiones: [{ session_id: 'QA-S', titulo: 'QA', objetivo: 'QA', conceptos: [original.concept_id] }] }],
  glosario: [], documentos: [], cuarentena: 0,
}
function setup() {
  const transporte = vi.fn(async (url: string) => {
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'QA-user', email_confirmed_at: '2026-01-01' })
    if (url.includes('app_members')) return Response.json([{ user_id: 'QA-user' }])
    if (url.includes('index.json')) return Response.json([{ payload: indice }])
    return Response.json([{ payload: { corpus_version: 'QA-v1', conceptos: [original] } }])
  })
  vi.stubGlobal('fetch', transporte)
  const enviado = vi.fn(async (_request: Request) => Response.json({ veredicto: 'correcta', motivo: 'Sintético.' }))
  const env = { AI_FREE_ENABLED: 'true', AI: { run: vi.fn() }, ASSETS: { fetch: vi.fn() },
    COACH: { idFromName: vi.fn(), get: vi.fn().mockReturnValue({ fetch: enviado }) } }
  return { env, enviado, transporte }
}
function peticion(version: VersionFormato | undefined, huella?: string, index = 0) {
  const questionId = 'QA-sesion:0'
  const c = prepararConcepto(original, { semilla: questionId, indice: index, ruta: 'repaso', version: version ?? 1 })
  return { c, request: new Request('https://site/api/calificar', { method: 'POST',
    headers: { Authorization: 'Bearer ' + 'x'.repeat(30) },
    body: JSON.stringify({ conceptId: original.concept_id, answer: 'alfa', questionId,
      version: huella ?? versionPregunta(c), ...(version !== undefined ? { formatVersion: version } : {}),
      index, route: 'repaso', retry: false }),
  }) }
}
afterEach(() => vi.unstubAllGlobals())

describe('reconstrucción de presentación entre navegador y Worker', () => {
  it.each([undefined, 1, 2, 3] as const)('acepta formato %s y reconstruye exactamente la pregunta y canónica enviadas', async version => {
    const { env, enviado } = setup()
    // La versión heredada en índice2 conserva su propuesta V/F.
    const { c, request } = peticion(version, undefined, version === 1 || version === undefined ? 2 : 0)
    const respuesta = await worker.fetch(request, env)
    expect(respuesta.status).toBe(200)
    expect(enviado).toHaveBeenCalledOnce()
    const trusted = await enviado.mock.calls[0][0].json()
    expect(trusted.question).toBe(c.evaluacion.pregunta)
    expect(trusted.canonical).toBe(original.respuesta_canonica)
    expect(c.interaccion.recomendada).toBe(version === 3 ? 'recuperacion_libre'
      : version === 2 ? 'opcion_multiple' : 'verdadero_falso')
    expect(env.AI.run).not.toHaveBeenCalled()
  })

  it('rechaza una huella de opciones al pedir una presentación V3 de recuerdo', async () => {
    const { env, enviado } = setup()
    const opciones = prepararConcepto(original, { semilla: 'QA-sesion:0', indice: 0, ruta: 'repaso', version: 2 })
    const { request } = peticion(3, versionPregunta(opciones))
    expect((await worker.fetch(request, env)).status).toBe(409)
    expect(enviado).not.toHaveBeenCalled()
  })
})
