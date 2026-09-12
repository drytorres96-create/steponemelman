// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleNbme } from './nbme'

const auth = { Authorization: 'Bearer ' + 'x'.repeat(30) }
const ref = { id: 'NBME27-P0001', revision: 'synthetic-v1' }
const cleanQuestion = { ...ref, status: 'ready', stem: 'Pregunta sintética', options: [{ id: 'A', text: 'Primera' }, { id: 'B', text: 'Segunda' }], answer: 'A' }
const assetRow = (question: typeof cleanQuestion) => ({ path: `questions/${question.id}/${question.revision}.json`, payload: question })
const request = (body: unknown = { refs: [ref] }, headers = auth) => new Request('https://site/api/nbme/questions', { method: 'POST', headers, body: JSON.stringify(body) })
function remote(member = true, question: unknown = cleanQuestion) {
  const mock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
    .mockResolvedValueOnce(Response.json(member ? [{ user_id: 'user' }] : []))
    .mockResolvedValueOnce(Response.json([{ payload: { questions: [{ ...ref, status: 'ready' }] } }]))
    .mockResolvedValueOnce(Response.json(question === null ? [] : [{ path: `questions/${ref.id}/${ref.revision}.json`, payload: question }]))
  vi.stubGlobal('fetch', mock)
  return mock
}
afterEach(() => vi.unstubAllGlobals())
describe('banco privado de preguntas', () => {
  it('impide solicitudes anónimas y desde otros orígenes', async () => {
    expect((await handleNbme(new Request('https://site/api/nbme/catalog'))).status).toBe(401)
    expect((await handleNbme(request(undefined, { ...auth, Origin: 'https://otro' } as typeof auth))).status).toBe(403)
  })
  it('rechaza cuerpos malformados, rutas y lotes demasiado grandes antes de acceder al banco', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    for (const body of [{ refs: [] }, { refs: [{ ...ref, id: '../catalog' }] }, { refs: [{ ...ref, revision: '../../private' }] }, { refs: Array(21).fill(ref) }, { refs: [ref, ref] }]) {
      expect((await handleNbme(request(body))).status).toBe(400)
    }
    expect((await handleNbme(new Request('https://site/api/nbme/questions', { method: 'POST', headers: auth, body: 'x'.repeat(6001) }))).status).toBe(413)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('no entrega material a una cuenta sin permiso para el banco', async () => {
    const fetch = remote(false)
    expect((await handleNbme(request())).status).toBe(403)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('conserva las versiones solicitadas y no permite calificarlas si están bloqueadas', async () => {
    remote(true, { ...ref, status: 'blocked' })
    expect((await handleNbme(request())).status).toBe(422)
    remote(true, { ...ref, revision: 'different', status: 'ready' })
    expect((await handleNbme(request())).status).toBe(409)
    remote(true, null)
    expect((await handleNbme(request())).status).toBe(409)
  })
  it('entrega preguntas autorizadas sin permitir caché pública', async () => {
    const fetch = remote()
    const result = await handleNbme(request())
    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect((await result.json()).questions[0]).toMatchObject(ref)
    expect(String(fetch.mock.calls[3][0])).toContain(encodeURIComponent(`questions/${ref.id}/${ref.revision}.json`))
  })
  it('no entrega una revisión antigua si el catálogo actual bloqueó esa pregunta', async () => {
    const mock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([{ user_id: 'user' }]))
      .mockResolvedValueOnce(Response.json([{ payload: { questions: [{ ...ref, status: 'blocked' }] } }]))
    vi.stubGlobal('fetch', mock)
    expect((await handleNbme(request())).status).toBe(422)
    expect(mock).toHaveBeenCalledTimes(3)
  })
  it('consulta 20 revisiones en un lote después de autorizar y conserva el orden solicitado', async () => {
    const batch = Array.from({ length: 20 }, (_, i) => ({ ...cleanQuestion, id: `NBME27-P${String(i + 1).padStart(4, '0')}` }))
    const mock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([{ user_id: 'user' }]))
      .mockResolvedValueOnce(Response.json([{ payload: { questions: batch } }]))
      .mockResolvedValueOnce(Response.json(batch.map(assetRow).reverse()))
    vi.stubGlobal('fetch', mock)
    const response = await handleNbme(request({ refs: batch.map(({ id, revision }) => ({ id, revision })) }))
    expect(response.status).toBe(200)
    expect((await response.json()).questions.map((q: typeof ref) => q.id)).toEqual(batch.map(q => q.id))
    expect(mock).toHaveBeenCalledTimes(4)
    expect(new URL(String(mock.mock.calls[3][0])).searchParams.get('path')).toBe(`in.(${batch.map(q => assetRow(q).path).join(',')})`)
  })
  it('impide calificar lecturas dudosas tanto en el enunciado como en las opciones', async () => {
    remote(true, { ...cleanQuestion, stem: 'A 4S-year-old person.' })
    expect((await handleNbme(request())).status).toBe(422)
    remote(true, { ...cleanQuestion, options: [{ id: 'A', text: '2.6 rng.\' dL' }, { id: 'B', text: 'Segunda' }] })
    expect((await handleNbme(request())).status).toBe(422)
  })
  it('no usa una caché compartida para saltarse las políticas de acceso al catálogo', async () => {
    const match = vi.fn().mockResolvedValue(Response.json({ schemaVersion: 1, bankVersion: 'synthetic', total: 1, questions: [cleanQuestion] }))
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ match, put: vi.fn() }) })
    const mock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([{ user_id: 'user' }]))
      .mockResolvedValueOnce(Response.json({}, { status: 403 }))
    vi.stubGlobal('fetch', mock)
    expect((await handleNbme(new Request('https://site/api/nbme/catalog', { headers: auth }))).status).toBe(503)
    expect(match).not.toHaveBeenCalled()
    expect(mock).toHaveBeenCalledTimes(3)
  })
  it('admite el catálogo completo cuando todavía no existe el índice compacto', async () => {
    const catalog = { schemaVersion: 1, bankVersion: 'synthetic', total: 1, questions: [cleanQuestion] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([{ user_id: 'user' }]))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([{ payload: catalog }])))
    const response = await handleNbme(new Request('https://site/api/nbme/catalog', { headers: auth }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(catalog)
  })
})
