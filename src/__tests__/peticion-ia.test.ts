// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ sesion: vi.fn(), uso: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: mock.sesion } } }))
vi.mock('../lib/cuota-ia', () => ({ notificarUsoIA: mock.uso }))
import { solicitarIA } from '../lib/peticion-ia'
import { cuerpoChat, preguntarSobreConcepto } from '../lib/chat-ia'
import { explicarRespuesta } from '../lib/explicacion-ia'
import { calificarConIA } from '../lib/calificacion-ia'
import type { TurnoChat } from '../server/worker'

const red = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mock.sesion.mockResolvedValue({ data: { session: { access_token: 'token-sintetico' } } })
  red.mockReset().mockResolvedValue(Response.json({ respuesta: 'Una explicación sintética suficiente.', apoyo: 'material', evidencia: 'Fragmento sintético literal.' }))
  vi.stubGlobal('fetch', red)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('transporte gratuito y acotado de IA', () => {
  it('funciona sin AbortSignal.any/timeout y notifica también la explicación', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => { throw new Error('navegador antiguo') })
    vi.spyOn(AbortSignal, 'any').mockImplementation(() => { throw new Error('navegador antiguo') })
    red.mockResolvedValue(Response.json({ diferencia: 'Beta no es alfa.', explicacion: 'Alfa es primero.', recordar: 'Alfa primero.', evidencia: 'Alfa es el primer elemento.' }))
    const r = await explicarRespuesta({ conceptId: 'QA-1', questionId: 'QA:0', version: 'qa', formatVersion: 3, index: 0, route: 'repaso', retry: false, answer: 'beta' })
    expect(r.estado).toBe('ok')
    expect(mock.uso).toHaveBeenCalledOnce()
    expect(red.mock.calls[0][1].headers.Authorization).toBe('Bearer token-sintetico')
  })

  it('no envía una petición cancelada ni una sin sesión', async () => {
    const control = new AbortController(); control.abort()
    expect((await solicitarIA('/api/preguntar', {}, 1000, control.signal)).estado).toBe('sin_ia')
    mock.sesion.mockResolvedValue({ data: { session: null } })
    expect((await solicitarIA('/api/preguntar', {}, 1000)).estado).toBe('sin_ia')
    expect(red).not.toHaveBeenCalled()
    expect(mock.uso).not.toHaveBeenCalled()
  })

  it('el límite también protege de una sesión que nunca termina de cargar', async () => {
    vi.useFakeTimers()
    mock.sesion.mockImplementation(() => new Promise(() => {}))
    const r = solicitarIA('/api/preguntar', {}, 1000)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await r).toMatchObject({ estado: 'sin_ia', motivo: expect.stringContaining('tardó demasiado') })
    expect(red).not.toHaveBeenCalled()
  })

  it('un error o una conexión perdida no se reintentan y actualizan el saldo', async () => {
    red.mockResolvedValue(Response.json({ error: 'No verificable.' }, { status: 503, headers: { 'Retry-After': '60' } }))
    expect(await solicitarIA('/api/preguntar', {}, 1000)).toMatchObject({ estado: 'sin_ia', motivo: expect.stringContaining('60 s') })
    red.mockRejectedValue(new TypeError('sin red'))
    expect((await solicitarIA('/api/preguntar', {}, 1000)).estado).toBe('sin_ia')
    expect(red).toHaveBeenCalledTimes(2)
    expect(mock.uso).toHaveBeenCalledTimes(2)
  })

  it('un veredicto desconocido nunca se guarda como acierto', async () => {
    red.mockResolvedValue(Response.json({ veredicto: 'casi', motivo: 'No sé.' }))
    expect((await calificarConIA({ conceptId: 'QA', answer: 'beta', questionId: 'QA:0', version: 'qa', formatVersion: 3, index: 0, route: 'repaso', retry: false })).estado).toBe('sin_ia')
  })

  it('conserva el contrato antiguo de calificación cuando el motivo opcional no viene', async () => {
    for (const veredicto of ['correcta', 'parcial', 'incorrecta']) {
      for (const extra of [{}, { motivo: null }]) {
        red.mockResolvedValue(Response.json({ veredicto, ...extra }))
        expect(await calificarConIA({ conceptId: 'QA', answer: 'beta', questionId: 'QA:0', version: 'qa', formatVersion: 3, index: 0, route: 'repaso', retry: false }))
          .toEqual({ estado: 'ok', veredicto, motivo: '' })
      }
    }
  })
})

describe('contexto útil del chat sin desbordar el cuerpo', () => {
  it('conserva parejas recientes completas, incluso con respuestas Unicode largas', () => {
    const historial: TurnoChat[] = Array.from({ length: 4 }, (_, n) => [
      { rol: 'yo' as const, texto: `Pregunta ${n}` }, { rol: 'ia' as const, texto: '🧠'.repeat(750) },
    ]).flat()
    const cuerpo = cuerpoChat('QA', '¿Por qué?', historial)
    expect(new TextEncoder().encode(JSON.stringify(cuerpo)).byteLength).toBeLessThanOrEqual(6000)
    expect(cuerpo.historial).toEqual(historial.slice(-2))
    expect(cuerpo.historial[0].rol).toBe('yo')
  })

  it('omite turnos huérfanos, limita los ocho turnos y no atribuye apoyo sin cita', async () => {
    const historial: TurnoChat[] = [{ rol: 'yo', texto: 'Pregunta fallida' }]
    expect(cuerpoChat('QA', 'La siguiente', historial).historial).toEqual([])
    const pares = Array.from({ length: 6 }, (_, n) => [{ rol: 'yo' as const, texto: `${n}` }, { rol: 'ia' as const, texto: `Respuesta ${n}` }]).flat()
    expect(cuerpoChat('QA', 'La siguiente', pares).historial).toEqual(pares.slice(-8))
    red.mockResolvedValue(Response.json({ respuesta: 'Una respuesta sintética sin cita.', apoyo: 'material' }))
    expect(await preguntarSobreConcepto('QA', '¿Por qué?')).toMatchObject({ estado: 'ok', respuesta: { apoyo: 'conocimiento' } })
  })
})
