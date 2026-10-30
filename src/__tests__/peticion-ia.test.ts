// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ sesion: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: mock.sesion } } }))
import { solicitarIA } from '../lib/peticion-ia'
import { calificarConIA } from '../lib/calificacion-ia'

const red = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mock.sesion.mockResolvedValue({ data: { session: { access_token: 'token-sintetico' } } })
  red.mockReset().mockResolvedValue(Response.json({ respuesta: 'Una explicación sintética suficiente.', apoyo: 'material', evidencia: 'Fragmento sintético literal.' }))
  vi.stubGlobal('fetch', red)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('transporte acotado de IA', () => {
  it('funciona sin AbortSignal.any/timeout y manda el token de la sesión', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => { throw new Error('navegador antiguo') })
    vi.spyOn(AbortSignal, 'any').mockImplementation(() => { throw new Error('navegador antiguo') })
    red.mockResolvedValue(Response.json({ veredicto: 'correcta', motivo: 'Coincide.' }))
    const r = await calificarConIA({ conceptId: 'QA-1', questionId: 'QA:0', version: 'qa', formatVersion: 3, index: 0, route: 'repaso', retry: false, answer: 'beta' })
    expect(r.estado).toBe('ok')
    expect(red.mock.calls[0][1].headers.Authorization).toBe('Bearer token-sintetico')
  })

  it('no envía una petición cancelada ni una sin sesión', async () => {
    const control = new AbortController(); control.abort()
    expect((await solicitarIA('/api/ia/chat', {}, 1000, control.signal)).estado).toBe('sin_ia')
    mock.sesion.mockResolvedValue({ data: { session: null } })
    expect((await solicitarIA('/api/ia/chat', {}, 1000)).estado).toBe('sin_ia')
    expect(red).not.toHaveBeenCalled()
  })

  it('el límite también protege de una sesión que nunca termina de cargar', async () => {
    vi.useFakeTimers()
    mock.sesion.mockImplementation(() => new Promise(() => {}))
    const r = solicitarIA('/api/ia/chat', {}, 1000)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await r).toMatchObject({ estado: 'sin_ia', motivo: expect.stringContaining('tardó demasiado') })
    expect(red).not.toHaveBeenCalled()
  })

  it('el plazo termina aunque el transporte no obedezca la cancelación', async () => {
    vi.useFakeTimers()
    red.mockImplementation(() => new Promise(() => {}))
    const r = solicitarIA('/api/ia/chat', {}, 1000)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await r).toMatchObject({ estado: 'sin_ia', motivo: expect.stringContaining('tardó demasiado') })
    expect(red).toHaveBeenCalledTimes(1)
    expect(red.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('cancelar mientras llega el cuerpo no devuelve un éxito tardío', async () => {
    let terminar!: (value: unknown) => void
    const leer = vi.fn(() => new Promise(resolve => { terminar = resolve }))
    red.mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: leer })
    const control = new AbortController()
    const r = solicitarIA('/api/ia/chat', {}, 1000, control.signal)
    await vi.waitFor(() => expect(leer).toHaveBeenCalledTimes(1))
    control.abort()
    expect(await r).toEqual({ estado: 'sin_ia', motivo: 'Cancelado.' })
    terminar({ respuesta: 'Una respuesta que llegó después de cancelar.' })
    expect(red).toHaveBeenCalledTimes(1)
  })

  it('el plazo incluye el cuerpo de una respuesta con cabeceras ya recibidas', async () => {
    vi.useFakeTimers()
    red.mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: () => new Promise(() => {}) })
    const r = solicitarIA('/api/ia/chat', {}, 1000)
    await vi.advanceTimersByTimeAsync(1001)
    expect(await r).toMatchObject({ estado: 'sin_ia', motivo: expect.stringContaining('tardó demasiado') })
  })

  it('un error o una conexión perdida no se reintentan', async () => {
    red.mockResolvedValue(Response.json({ error: 'No verificable.' }, { status: 503, headers: { 'Retry-After': '60' } }))
    expect(await solicitarIA('/api/ia/chat', {}, 1000)).toMatchObject({ estado: 'sin_ia', motivo: expect.stringContaining('60 s') })
    red.mockRejectedValue(new TypeError('sin red'))
    expect((await solicitarIA('/api/ia/chat', {}, 1000)).estado).toBe('sin_ia')
    expect(red).toHaveBeenCalledTimes(2)
  })

  it('un veredicto desconocido nunca se guarda como acierto', async () => {
    red.mockResolvedValue(Response.json({ veredicto: 'casi', motivo: 'No sé.' }))
    expect((await calificarConIA({ conceptId: 'QA', answer: 'beta', questionId: 'QA:0', version: 'qa', formatVersion: 3, index: 0, route: 'repaso', retry: false })).estado).toBe('sin_ia')
  })

  it('conserva la procedencia de una respuesta aceptada sin atribuirla a un modelo', async () => {
    red.mockResolvedValue(Response.json({ veredicto: 'correcta', motivo: 'Aceptada.', origen: 'respuesta_aceptada' }))
    expect(await calificarConIA({ conceptId: 'QA', answer: 'alpha', questionId: 'QA:0', version: 'qa', formatVersion: 3, index: 0, route: 'repaso', retry: false }))
      .toEqual({ estado: 'ok', veredicto: 'correcta', motivo: 'Aceptada.', origen: 'respuesta_aceptada' })
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
