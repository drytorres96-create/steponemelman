// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ sesion: vi.fn(), uso: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mock.sesion } } }))
vi.mock('./cuota-ia', () => ({ notificarUsoIA: mock.uso }))
import { generarRecuperacionNbme } from './recuperacion-nbme-ia'

const origen = { qid: 'QA-PENDING', revision: 'qa-r1', optionId: 'B', attemptId: 'qa-session:0' }
const contenido = { objetivo: 'Recover the order of an invented token list.', ejercicios: [
  { id: 'qa-1', tipo: 'completar', pregunta: 'The first invented token is ____.', respuesta: 'alpha', explicacion: 'Alpha is first.', evidencia: 'The first invented token is alpha.' },
  { id: 'qa-2', tipo: 'verdadero_falso', pregunta: 'Alpha is first in the invented list.', respuesta: 'Verdadero', explicacion: 'This matches the invented list.', evidencia: 'Alpha is first in the invented list.' },
  { id: 'qa-3', tipo: 'seleccion', pregunta: 'Which token is second in the invented list?', respuesta: 'beta', alternativas: ['alpha', 'beta', 'gamma'], explicacion: 'Beta is second.', evidencia: 'The second invented token is beta.' },
] }

const red = vi.fn()
let completar: (respuesta: Response) => void
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  mock.sesion.mockResolvedValue({ data: { session: { access_token: 'token-sintetico' } } })
  red.mockImplementation((_ruta: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    completar = resolve
    init.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
  }))
  vi.stubGlobal('fetch', red)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('espera acotada de la recuperación NBME', () => {
  it('recibe una recuperación válida después de 25 segundos sin abortar ni repetir la petición', async () => {
    const pendiente = generarRecuperacionNbme(origen)
    await vi.advanceTimersByTimeAsync(26_000)
    expect(red).toHaveBeenCalledOnce()
    const [ruta, init] = red.mock.calls[0]
    expect(ruta).toBe('/api/ia/recuperacion-nbme')
    expect(JSON.parse(init.body)).toEqual({ questionId: origen.qid, revision: origen.revision, optionId: origen.optionId })
    expect(init.signal.aborted).toBe(false)
    completar(Response.json(contenido))
    expect(await pendiente).toEqual({ estado: 'ok', data: contenido })
    expect(red).toHaveBeenCalledOnce()
    expect(mock.uso).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('termina a los 90 segundos sin reintentos automáticos y libera el temporizador', async () => {
    const pendiente = generarRecuperacionNbme(origen)
    await vi.advanceTimersByTimeAsync(89_999)
    const signal = red.mock.calls[0][1].signal as AbortSignal
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(signal.aborted).toBe(true)
    expect(await pendiente).toMatchObject({ estado: 'sin_ia', motivo: expect.stringContaining('tardó demasiado') })
    expect(red).toHaveBeenCalledOnce()
    expect(mock.uso).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('una cancelación del usuario aborta de inmediato y no espera el nuevo límite', async () => {
    const control = new AbortController()
    const pendiente = generarRecuperacionNbme(origen, control.signal)
    await vi.advanceTimersByTimeAsync(2_000)
    control.abort()
    expect(await pendiente).toEqual({ estado: 'sin_ia', motivo: 'Cancelado.' })
    expect(red.mock.calls[0][1].signal.aborted).toBe(true)
    expect(red).toHaveBeenCalledOnce()
    expect(mock.uso).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
