// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleNbme } from './nbme'

const auth = { Authorization: 'Bearer ' + 'x'.repeat(30) }
const ref = { id: 'NBME27-P0001', revision: 'synthetic-v1' }
const request = (body: unknown = { refs: [ref] }, headers = auth) => new Request('https://site/api/nbme/questions', { method: 'POST', headers, body: JSON.stringify(body) })
function remote(member = true, question: unknown = { ...ref, status: 'ready', stem: 'Pregunta sintética', answer: 'A' }) {
  const mock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
    .mockResolvedValueOnce(Response.json(member ? [{ user_id: 'user' }] : []))
    .mockResolvedValueOnce(Response.json([
      { path: 'catalog.json', payload: { questions: [{ ...ref, status: 'ready' }] } },
      ...(question === null ? [] : [{ path: `questions/${ref.id}/${ref.revision}.json`, payload: question }]),
    ]))
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
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(String(fetch.mock.calls[2][0])).toContain(encodeURIComponent(`questions/${ref.id}/${ref.revision}.json`))
  })
  it('no entrega una revisión antigua si el catálogo actual bloqueó esa pregunta', async () => {
    const mock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([{ user_id: 'user' }]))
      .mockResolvedValueOnce(Response.json([{ path: 'catalog.json', payload: { questions: [{ ...ref, status: 'blocked' }] } }]))
    vi.stubGlobal('fetch', mock)
    expect((await handleNbme(request())).status).toBe(422)
    expect(mock).toHaveBeenCalledTimes(3)
  })

  it('carga veinte preguntas en tres solicitudes y restaura el orden solicitado', async () => {
    const refs = Array.from({ length: 20 }, (_, i) => ({ ...ref, id: `NBME27-P${String(i + 1).padStart(4, '0')}` }))
    const rows = refs.map(r => ({ path: `questions/${r.id}/${r.revision}.json`, payload: { ...r, status: 'ready' } }))
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([{ user_id: 'user' }]))
      .mockResolvedValueOnce(Response.json([
        ...rows.reverse(),
        { path: 'catalog.json', payload: { questions: refs.map(r => ({ ...r, status: 'ready' })) } },
      ]))
    vi.stubGlobal('fetch', fetch)
    const result = await handleNbme(request({ refs }))
    expect(result.status).toBe(200)
    expect((await result.json()).questions.map((q: typeof ref) => q.id)).toEqual(refs.map(r => r.id))
    expect(fetch).toHaveBeenCalledTimes(3)
    const query = new URL(String(fetch.mock.calls[2][0])).searchParams
    expect(query.get('select')).toBe('path,payload')
    expect(query.get('path')).toContain('catalog.json')
    expect(query.get('path')).toContain('NBME27-P0020')
  })

  it('no entrega un lote parcial cuando falla la consulta agrupada', async () => {
    const fetch = remote()
    fetch.mockReset().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([{ user_id: 'user' }]))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    expect((await handleNbme(request())).status).toBe(503)
  })
})
