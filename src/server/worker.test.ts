// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { StudyCoach, validarCalificacion, validarRespuesta } from './worker'
import { olvidarCachePlan } from './plan'
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

const veredicto = (v: unknown) => ({ response: JSON.stringify(v) })
function setupCalificar() {
  const storage = new MemoryStorage()
  const env = { AI_FREE_ENABLED: 'true', AI: { run: vi.fn().mockResolvedValue(veredicto({ veredicto: 'correcta', motivo: 'Es un sinónimo aceptado.' })) },
    ASSETS: { fetch: vi.fn() }, COACH: { idFromName: vi.fn(), get: vi.fn() } }
  const coach = new StudyCoach({ storage }, env)
  const call = (key: string, user = 'one', answer = 'alpha') => coach.fetch(new Request('https://coach/calificar', { method: 'POST',
    body: JSON.stringify({ key, user, mode: 'calificar', reference: fragment, sourceFragment: fragment, question: '¿Primero?',
      answer, canonical: 'alfa', source: { title: 'QA', page: 1 } }) }))
  return { storage, env, call }
}

describe('corrección de respuestas breves con IA', () => {
  it('acepta solo los tres veredictos y un motivo corto', () => {
    expect(validarCalificacion(veredicto({ veredicto: 'correcta', motivo: 'Sinónimo aceptado.' })))
      .toEqual({ veredicto: 'correcta', motivo: 'Sinónimo aceptado.' })
    expect(validarCalificacion(veredicto({ veredicto: 'parcial', motivo: 'Falta la segunda mitad.' })))
      .toEqual({ veredicto: 'parcial', motivo: 'Falta la segunda mitad.' })
    // Un veredicto inventado no puede convertirse en acierto ni en fallo.
    expect(validarCalificacion(veredicto({ veredicto: 'casi', motivo: 'Casi.' }))).toBeNull()
    expect(validarCalificacion(veredicto({ veredicto: 'correcta', motivo: '' }))).toBeNull()
    expect(validarCalificacion(veredicto({ veredicto: 'correcta', motivo: 'x'.repeat(201) }))).toBeNull()
    expect(validarCalificacion({ response: 'no es json' })).toBeNull()
  })

  it('devuelve el veredicto, lo cachea y la caché no gasta cuota', async () => {
    const { storage, env, call } = setupCalificar()
    const primera = await call('k1')
    expect(primera.status).toBe(200)
    expect(await primera.json()).toMatchObject({ veredicto: 'correcta', motivo: 'Es un sinónimo aceptado.', cached: false })
    expect(await storage.get('quota')).toMatchObject({ total: 1 })

    const repetida = await call('k1')
    expect(await repetida.json()).toMatchObject({ veredicto: 'correcta', cached: true })
    expect(env.AI.run).toHaveBeenCalledTimes(1)
    expect(await storage.get('quota')).toMatchObject({ total: 1 })
  })

  it('agotada la cuota responde 429 para que mande el corrector propio', async () => {
    const { storage, call } = setupCalificar()
    await storage.put('quota', { day: new Date().toISOString().slice(0, 10), total: 0, users: { one: 20 } })
    const respuesta = await call('k2')
    expect(respuesta.status).toBe(429)
    expect((await respuesta.json() as { error: string }).error).toContain('corrector propio')
  })

  it('el endpoint existe y exige lo mismo que la ayuda; una ruta desconocida sigue siendo 404', async () => {
    const { env } = setupCalificar()
    const assets = { ...env, ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('site')) } }
    expect((await worker.fetch(new Request('https://site/api/calificar', { method: 'POST' }), assets)).status).toBe(401)
    expect((await worker.fetch(new Request('https://site/api/inventado', { method: 'POST' }), assets)).status).toBe(404)
  })

  it('un veredicto que el modelo no sabe dar no se convierte en calificación', async () => {
    const { env, call } = setupCalificar()
    env.AI.run.mockResolvedValueOnce(veredicto({ veredicto: 'depende', motivo: 'No sé.' }))
    const respuesta = await call('k3')
    expect(respuesta.status).toBe(503)
    expect((await respuesta.json() as { codigo: string }).codigo).toBe('no_verificable')
  })
})


/**
 * Proxy al plan de estudio. El Worker tiene la `service_role` de la base de
 * planificación, así que estas dos rutas no pueden quedar abiertas ni servir
 * filas de otro usuario. Y cuando el secreto no está, la respuesta es un 503
 * limpio: la pantalla degrada, no se rompe.
 */
const AUTORIZACION = { Authorization: 'Bearer ' + 'x'.repeat(30) }
const secretos = {
  PLAN_SUPABASE_URL: 'https://plan.supabase.co',
  PLAN_SUPABASE_SERVICE_KEY: 'clave-de-servicio',
  PLAN_USER_ID: 'dd1d5d7c-a9f4-42aa-a08e-f40603c767c2',
}
const entornoPlan = (extra: Record<string, unknown> = {}) => ({
  AI_FREE_ENABLED: 'true', AI: { run: vi.fn() }, COACH: { idFromName: vi.fn(), get: vi.fn() },
  ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('site')) }, ...secretos, ...extra,
})
const cuentaValida = (mock: ReturnType<typeof vi.fn>) => mock
  .mockResolvedValueOnce(Response.json({ id: 'usuario', email_confirmed_at: '2026-01-01' }))
  .mockResolvedValueOnce(Response.json([{ user_id: 'usuario' }]))
const punto = { id: 64, idx: 5, dia: 1, kind: 'tarjetas', label: 'Sesión 1/4', done: false, done_at: null }

beforeEach(() => olvidarCachePlan())

describe('proxy al plan de la semana', () => {
  it('sin secretos responde 503 y nunca toca ninguna base', async () => {
    const remoto = vi.fn()
    vi.stubGlobal('fetch', remoto)
    for (const falta of ['PLAN_SUPABASE_URL', 'PLAN_SUPABASE_SERVICE_KEY', 'PLAN_USER_ID']) {
      const env = entornoPlan({ [falta]: undefined })
      const respuesta = await worker.fetch(new Request('https://site/api/plan/semana', { headers: AUTORIZACION }), env)
      expect(respuesta.status).toBe(503)
      expect(await respuesta.json()).toEqual({ error: 'plan no configurado' })
    }
    expect(remoto).not.toHaveBeenCalled()
  })

  it('exige sesión, mismo origen y método antes de mirar el plan', async () => {
    const remoto = vi.fn()
    vi.stubGlobal('fetch', remoto)
    const env = entornoPlan()
    expect((await worker.fetch(new Request('https://site/api/plan/semana'), env)).status).toBe(401)
    expect((await worker.fetch(new Request('https://site/api/plan/semana',
      { headers: { ...AUTORIZACION, Origin: 'https://otro' } }), env)).status).toBe(403)
    expect((await worker.fetch(new Request('https://site/api/plan/semana',
      { method: 'POST', headers: AUTORIZACION }), env)).status).toBe(405)
    expect((await worker.fetch(new Request('https://site/api/plan/checkpoint/no-es-un-id',
      { method: 'PATCH', headers: AUTORIZACION, body: '{"done":true}' }), env)).status).toBe(400)
    expect(remoto).not.toHaveBeenCalled()
  })

  it('devuelve la primera semana del rango que tenga checkpoints y la cachea', async () => {
    const remoto = cuentaValida(vi.fn())
      .mockResolvedValueOnce(Response.json([
        { id: 'pto', title: 'PTO', starts_on: '2026-09-14', ends_on: '2026-09-19', note: null },
        { id: 'S2', title: 'S2 · 14–19 sep · Repro', starts_on: '2026-09-14', ends_on: '2026-09-19', note: 'La nota.' },
      ]))
      // El evento de vacaciones existe en el rango pero no tiene plan que hacer.
      .mockResolvedValueOnce(Response.json([{ event_id: 'S2', ...punto }]))
      // La segunda lectura sólo debería llegar a comprobar la cuenta.
      .mockResolvedValueOnce(Response.json({ id: 'usuario', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([{ user_id: 'usuario' }]))
    vi.stubGlobal('fetch', remoto)
    const pedir = () => worker.fetch(new Request('https://site/api/plan/semana?hoy=2026-09-14', { headers: AUTORIZACION }), entornoPlan())
    expect(await (await pedir()).json()).toEqual({
      eventoId: 'S2', titulo: 'S2 · 14–19 sep · Repro', inicio: '2026-09-14', fin: '2026-09-19', nota: 'La nota.',
      checkpoints: [{ id: 64, idx: 5, dia: 1, kind: 'tarjetas', label: 'Sesión 1/4', done: false, doneAt: null }],
    })
    // Segunda lectura servida del caché: se repite la comprobación de la cuenta,
    // pero ya no se vuelve a consultar la base del plan.
    expect((await pedir()).status).toBe(200)
    expect(remoto).toHaveBeenCalledTimes(6)
    expect(remoto.mock.calls.filter(c => String(c[0]).startsWith(secretos.PLAN_SUPABASE_URL))).toHaveLength(2)
  })

  it('el PATCH devuelve lo releído de la base, no lo que se envió', async () => {
    const remoto = cuentaValida(vi.fn())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json([{ ...punto, done: false, done_at: null }]))
    vi.stubGlobal('fetch', remoto)
    const respuesta = await worker.fetch(new Request('https://site/api/plan/checkpoint/64',
      { method: 'PATCH', headers: AUTORIZACION, body: JSON.stringify({ done: true }) }), entornoPlan())
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toMatchObject({ id: 64, done: false, doneAt: null })
    // La escritura y la relectura van filtradas por el usuario del plan.
    const escritura = remoto.mock.calls[2]
    expect(escritura[0]).toContain(`user_id=eq.${encodeURIComponent(secretos.PLAN_USER_ID)}`)
    expect(JSON.parse(escritura[1].body).done).toBe(true)
    expect(remoto.mock.calls[3][0]).toContain('user_id=eq.')
  })

  it('el PATCH rechaza un id que es de otro user_id', async () => {
    const remoto = cuentaValida(vi.fn())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      // El filtro por usuario no devuelve nada: esa fila no es de este plan.
      .mockResolvedValueOnce(Response.json([]))
    vi.stubGlobal('fetch', remoto)
    const respuesta = await worker.fetch(new Request('https://site/api/plan/checkpoint/1',
      { method: 'PATCH', headers: AUTORIZACION, body: JSON.stringify({ done: true }) }), entornoPlan())
    expect(respuesta.status).toBe(404)
  })

  it('no atiende a una cuenta sin acceso al material', async () => {
    const remoto = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'usuario', email_confirmed_at: '2026-01-01' }))
      .mockResolvedValueOnce(Response.json([]))
    vi.stubGlobal('fetch', remoto)
    expect((await worker.fetch(new Request('https://site/api/plan/semana', { headers: AUTORIZACION }), entornoPlan())).status).toBe(403)
    expect(remoto).toHaveBeenCalledTimes(2)
  })
})
