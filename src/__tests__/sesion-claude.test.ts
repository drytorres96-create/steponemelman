// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ sesion: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: mock.sesion } } }))
import { etiquetaCorta, pedirHilo } from '../lib/sesion-claude'
import { MAX_ETIQUETA, PeticionSesionZ, type ItemHilo } from '../lib/contexto-sesion'

const item = (extra: Partial<ItemHilo> = {}): ItemHilo => ({ tipo: 'concepto', id: 'QA-1', etiqueta: 'Enzimas: distinguir dos cosas', senales: ['fallo_reciente'], ...extra })
const red = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mock.sesion.mockResolvedValue({ data: { session: { access_token: 'token-sintetico' } } })
  red.mockReset()
  vi.stubGlobal('fetch', red)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('pedir el hilo de las sugeridas', () => {
  it('manda la fase y las etiquetas por la ruta de sesión, con el token, y el cuerpo cumple el contrato del servidor', async () => {
    red.mockResolvedValue(Response.json({ hilo: 'Giran en torno a las hormonas; empieza por la primera.', cached: false }))
    const r = await pedirHilo([item(), item({ id: 'QA-2' })])
    expect(r).toEqual({ estado: 'ok', hilo: 'Giran en torno a las hormonas; empieza por la primera.' })
    const [ruta, init] = red.mock.calls[0]
    expect(ruta).toBe('/api/ia/sesion')
    expect(init.headers.Authorization).toBe('Bearer token-sintetico')
    expect(PeticionSesionZ.safeParse(JSON.parse(init.body)).success).toBe(true)
  })
  it('no sale a la red sin nada que resumir ni con más de cinco ítems', async () => {
    expect((await pedirHilo([])).estado).toBe('sin_ia')
    expect(red).not.toHaveBeenCalled()
    red.mockResolvedValue(Response.json({ hilo: 'Una frase suficientemente larga.' }))
    await pedirHilo(Array.from({ length: 8 }, (_, n) => item({ id: `QA-${n}` })))
    expect(JSON.parse(red.mock.calls[0][1].body).items).toHaveLength(5)
  })
  it('una frase con formato, vacía o demasiado larga no se enseña', async () => {
    for (const hilo of ['', 'corta', '**Negrita** en medio de una frase', 'x'.repeat(241), 3, null]) {
      red.mockResolvedValue(Response.json({ hilo }))
      expect((await pedirHilo([item()])).estado).toBe('sin_ia')
    }
  })
  it('un error del servidor llega como «sin IA» con su motivo, sin romper nada', async () => {
    red.mockResolvedValue(Response.json({ error: 'Claude todavía no está conectado.', codigo: 'sin_clave' }, { status: 503 }))
    expect(await pedirHilo([item()])).toEqual({ estado: 'sin_ia', motivo: 'Claude todavía no está conectado.' })
    red.mockRejectedValue(new Error('offline'))
    expect((await pedirHilo([item()])).estado).toBe('sin_ia')
  })
  it('las etiquetas se limpian a una línea y al tope del servidor', () => {
    expect(etiquetaCorta('  Tema \n con\t saltos ')).toBe('Tema con saltos')
    expect(etiquetaCorta('x'.repeat(500))).toHaveLength(MAX_ETIQUETA)
  })
})
