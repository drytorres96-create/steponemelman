// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { StudyCoach, validarRespuesta } from './worker'
const fragment = 'Fragmento sintético: alfa es el primer elemento.'
const output = { response: JSON.stringify({ diferencia: 'Alfa y beta son distintos.', explicacion: 'Alfa ocupa el primer lugar.', recordar: 'Alfa primero.', evidencia: 'alfa es el primer elemento.' }) }
class MemoryStorage {
  values = new Map<string, unknown>()
  tail: Promise<unknown> = Promise.resolve()
  async get<T>(k: string) { return structuredClone(this.values.get(k)) as T | undefined }
  async put(k: string, v: unknown) { this.values.set(k, structuredClone(v)) }
  async delete(keys: string[]) { keys.forEach(k => this.values.delete(k)); return keys.length }
  async list<T>({ prefix }: { prefix: string }) { return new Map([...this.values].filter(([k]) => k.startsWith(prefix))) as Map<string,T> }
  async transaction<T>(fn: (s: MemoryStorage) => Promise<T>): Promise<T> {
    const next = this.tail.then(() => fn(this)); this.tail = next.catch(() => {}); return next
  }
}
function setup() {
  const storage = new MemoryStorage()
  const env = { AI_FREE_ENABLED: 'true', AI: { run: vi.fn().mockResolvedValue(output) }, ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('site')) }, COACH: { idFromName: vi.fn(), get: vi.fn() } }
  const coach = new StudyCoach({ storage }, env)
  const call = (key: string, user = 'one') => coach.fetch(new Request('https://coach/explicar', { method: 'POST', body: JSON.stringify({ key, user, reference: fragment, sourceFragment: fragment, question: '¿Primero?', answer: 'beta', canonical: 'alfa', source: { title: 'QA', page: 1 } }) }))
  return { storage, env, call }
}
afterEach(() => vi.unstubAllGlobals())
describe('ayuda de IA con cuota gratuita', () => {
  it('rechaza una cita inventada y JSON incompleto', () => {
    expect(validarRespuesta(output, fragment)).toBeTruthy()
    expect(validarRespuesta(output, 'Otra referencia sin la cita')).toBeNull()
    expect(validarRespuesta({ response: '{"explicacion":"inventado"}' }, fragment)).toBeNull()
  })
  it('coalesce solicitudes iguales y sirve caché sin consumir otra ayuda', async () => {
    const { call, env, storage } = setup()
    const results = await Promise.all([call('same'), call('same'), call('same')])
    expect(results.every(r => r.status === 200)).toBe(true)
    expect((await (await call('same')).json()).cached).toBe(true)
    expect(env.AI.run).toHaveBeenCalledTimes(1)
    expect(await storage.get('quota')).toMatchObject({ total: 1, users: { one: 1 } })
  })
  it('no sobrepasa 20 por usuario ni 30 globales con concurrencia', async () => {
    const { call, env } = setup()
    const a = await Promise.all(Array.from({ length: 25 }, (_, n) => call(`a${n}`)))
    expect(a.filter(r => r.status === 200)).toHaveLength(20)
    const b = await Promise.all(Array.from({ length: 15 }, (_, n) => call(`b${n}`, 'two')))
    expect(b.filter(r => r.status === 200)).toHaveLength(10)
    expect(env.AI.run).toHaveBeenCalledTimes(30)
    expect((await call('same', 'three')).status).toBe(429)
  })
  it('un fallo consume la reserva y no provoca reintentos automáticos', async () => {
    const { call, env, storage } = setup()
    env.AI.run.mockRejectedValue(new Error('quota'))
    expect((await call('failed')).status).toBe(503)
    expect(env.AI.run).toHaveBeenCalledTimes(1)
    expect(await storage.get('quota')).toMatchObject({ total: 1 })
  })
  it('restablece el contador diario y conserva caché válida', async () => {
    const { call, storage } = setup()
    await storage.put('quota', { day: '2000-01-01', total: 30, users: { one: 20 } })
    expect((await call('new-day')).status).toBe(200)
    expect(await storage.get('quota')).toMatchObject({ total: 1 })
  })
  it('exige autenticación, mismo origen y cuerpo acotado antes de inferir', async () => {
    const { env } = setup()
    const headers = { Authorization: 'Bearer ' + 'x'.repeat(30) }
    expect((await worker.fetch(new Request('https://site/api/explicar', { method: 'POST' }), env)).status).toBe(401)
    expect((await worker.fetch(new Request('https://site/api/explicar', { method: 'POST', headers: { ...headers, Origin: 'https://other' } }), env)).status).toBe(403)
    expect((await worker.fetch(new Request('https://site/api/explicar', { method: 'POST', headers, body: 'x'.repeat(6001) }), env)).status).toBe(413)
    expect(env.AI.run).not.toHaveBeenCalled()
  })
  it('vuelve a comprobar membresía antes de acceder a caché o material', async () => {
    const { env } = setup()
    const remote = vi.fn().mockResolvedValueOnce(Response.json({ id: 'user', email_confirmed_at: '2026-01-01' })).mockResolvedValueOnce(Response.json([]))
    vi.stubGlobal('fetch', remote)
    const request = new Request('https://site/api/explicar', { method: 'POST', headers: { Authorization: 'Bearer ' + 'x'.repeat(30) }, body: JSON.stringify({ conceptId: 'QA-001', answer: 'beta', questionId: 'qa-question', version: 'v1', index: 0, route: 'repaso', retry: false }) })
    expect((await worker.fetch(request, env)).status).toBe(403)
    expect(remote).toHaveBeenCalledTimes(2)
    expect(env.COACH.get).not.toHaveBeenCalled()
  })
})
