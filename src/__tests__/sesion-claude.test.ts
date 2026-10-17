// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ sesion: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: mock.sesion } } }))
import { etiquetaCorta, pedirEntender, pedirHilo, pedirRevision } from '../lib/sesion-claude'
import { MAX_ETIQUETA, PeticionSesionZ, type ConsultaSesion, type ItemHilo, type ItemRevision, type TurnoSesion } from '../lib/contexto-sesion'

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

describe('pedir que Claude entienda el pedido', () => {
  const yo = (texto: string): TurnoSesion => ({ rol: 'yo', texto })
  const consultaOk = { fuente: 'mixto', sistemas: ['Hematológico y oncológico'], disciplinas: [], terminos: ['oncología'], estados: [], minutos: 20, titulo: 'Hematología y oncología' }

  it('manda la conversación por la ruta de sesión y el cuerpo cumple el contrato del servidor', async () => {
    red.mockResolvedValue(Response.json({ tipo: 'consulta', consulta: consultaOk, cached: false }))
    const r = await pedirEntender([yo('hazme una sesión de hematología')], 0)
    expect(r).toEqual({ estado: 'ok', tipo: 'consulta', consulta: consultaOk })
    const [ruta, init] = red.mock.calls[0]
    expect(ruta).toBe('/api/ia/sesion')
    expect(init.headers.Authorization).toBe('Bearer token-sintetico')
    expect(PeticionSesionZ.safeParse(JSON.parse(init.body)).success).toBe(true)
  })
  it('una pregunta de seguimiento llega con sus opciones, y sólo si todavía quedan preguntas', async () => {
    const pregunta = { tipo: 'pregunta', texto: '¿Solo NBME, solo conceptos o mixto?', opciones: ['Solo NBME', 'Solo conceptos', 'Mixto'] }
    red.mockResolvedValue(Response.json(pregunta))
    expect(await pedirEntender([yo('hematología')], 0)).toEqual({ estado: 'ok', ...pregunta })
    const agotadas = await pedirEntender([yo('hematología')], 2)
    expect(agotadas.estado).toBe('sin_ia')
  })
  it('manda como mucho los últimos siete turnos y cuántas preguntas se hicieron', async () => {
    red.mockResolvedValue(Response.json({ tipo: 'consulta', consulta: consultaOk }))
    const turnos: TurnoSesion[] = Array.from({ length: 9 }, (_, n) => (n % 2 === 0 ? yo(`turno ${n}`) : { rol: 'ia', texto: `turno ${n}` }))
    await pedirEntender(turnos, 1)
    const cuerpo = JSON.parse(red.mock.calls[0][1].body)
    expect(cuerpo.mensajes).toHaveLength(7)
    expect(cuerpo.mensajes[0].texto).toBe('turno 2')
    expect(cuerpo.preguntasHechas).toBe(1)
  })
  it('no sale a la red sin nada que interpretar', async () => {
    expect((await pedirEntender([], 0)).estado).toBe('sin_ia')
    expect(red).not.toHaveBeenCalled()
  })
  it('una respuesta fuera del vocabulario cerrado se descarta aunque el servidor la diera por buena', async () => {
    for (const salida of [
      { tipo: 'consulta', consulta: { ...consultaOk, sistemas: ['Dermatología'] } },
      { tipo: 'consulta', consulta: { ...consultaOk, estados: ['las_que_odio'] } },
      { tipo: 'pregunta', texto: '¿Cuál?', opciones: ['Solo una'] },
      { tipo: 'otra_cosa' }, 'texto suelto', null,
    ]) {
      red.mockResolvedValue(Response.json(salida))
      expect((await pedirEntender([yo('hematología')], 0)).estado).toBe('sin_ia')
    }
  })
  it('un error del servidor llega como «sin IA» con su motivo', async () => {
    red.mockResolvedValue(Response.json({ error: 'Claude todavía no está conectado.', codigo: 'sin_clave' }, { status: 503 }))
    expect(await pedirEntender([yo('hematología')], 0)).toEqual({ estado: 'sin_ia', motivo: 'Claude todavía no está conectado.' })
    red.mockRejectedValue(new Error('offline'))
    expect((await pedirEntender([yo('hematología')], 0)).estado).toBe('sin_ia')
  })
  it('cancelar la petición la corta sin dejar la pantalla esperando', async () => {
    const ctl = new AbortController()
    red.mockImplementation((_r: string, init: RequestInit) => new Promise((_ok, no) => { init.signal!.addEventListener('abort', () => no(new DOMException('abort', 'AbortError'))) }))
    const espera = pedirEntender([yo('hematología')], 0, ctl.signal)
    await vi.waitFor(() => expect(red).toHaveBeenCalled())
    ctl.abort()
    expect((await espera).estado).toBe('sin_ia')
  })
})

describe('pedir que Claude revise los candidatos', () => {
  const consulta: ConsultaSesion = { fuente: 'mixto', sistemas: ['Hematológico y oncológico'], disciplinas: [], terminos: ['oncología'], estados: [], minutos: 20, titulo: 'Hematología y oncología' }
  const items = (n: number): ItemRevision[] => Array.from({ length: n }, (_, k) => ({ tipo: 'concepto' as const, id: `QA-${k}`, etiqueta: `Tema ${k}: objetivo del concepto` }))

  it('manda el pedido, la consulta y sólo ids y etiquetas, con el límite propio de esta fase', async () => {
    red.mockResolvedValue(Response.json({ ids: ['QA-1', 'QA-3'], sinRevisar: 0, cached: false }))
    const r = await pedirRevision('hematología y oncología', consulta, items(5))
    expect(r).toEqual({ estado: 'ok', ids: ['QA-1', 'QA-3'], sinRevisar: 0 })
    const [ruta, init] = red.mock.calls[0]
    expect(ruta).toBe('/api/ia/sesion')
    const cuerpo = JSON.parse(init.body)
    expect(PeticionSesionZ.safeParse(cuerpo).success).toBe(true)
    expect(cuerpo.fase).toBe('revisar')
    expect(Object.keys(cuerpo.items[0]).sort()).toEqual(['etiqueta', 'id', 'tipo'])
  })
  it('150 candidatas caben en el cuerpo permitido para esta fase', async () => {
    red.mockResolvedValue(Response.json({ ids: [], sinRevisar: 0 }))
    const largas = items(150).map(i => ({ ...i, etiqueta: 'x'.repeat(90) }))
    expect((await pedirRevision('hematología', consulta, largas)).estado).toBe('ok')
    expect(red).toHaveBeenCalledTimes(1)
    expect(JSON.parse(red.mock.calls[0][1].body).items).toHaveLength(150)
  })
  it('no manda más de 150 aunque le lleguen más', async () => {
    red.mockResolvedValue(Response.json({ ids: [] }))
    await pedirRevision('hematología', consulta, items(200))
    expect(JSON.parse(red.mock.calls[0][1].body).items).toHaveLength(150)
  })
  it('sin candidatas no sale a la red', async () => {
    expect(await pedirRevision('hematología', consulta, [])).toEqual({ estado: 'ok', ids: [], sinRevisar: 0 })
    expect(red).not.toHaveBeenCalled()
  })
  it('sólo se aceptan ids que se enviaron, sin repetidos', async () => {
    red.mockResolvedValue(Response.json({ ids: ['QA-1', 'QA-1', 'inventado', 7, null, 'QA-2'], sinRevisar: 2 }))
    expect(await pedirRevision('hematología', consulta, items(4))).toEqual({ estado: 'ok', ids: ['QA-1', 'QA-2'], sinRevisar: 2 })
  })
  it('un «sin revisar» raro se trata como cero', async () => {
    for (const sinRevisar of [-1, 1.5, 'tres', null]) {
      red.mockResolvedValue(Response.json({ ids: ['QA-1'], sinRevisar }))
      expect(await pedirRevision('hematología', consulta, items(3))).toMatchObject({ estado: 'ok', sinRevisar: 0 })
    }
  })
  it('una respuesta sin lista de ids, o un error del servidor, es «sin IA»', async () => {
    red.mockResolvedValue(Response.json({ ids: 'QA-1' }))
    expect((await pedirRevision('hematología', consulta, items(3))).estado).toBe('sin_ia')
    red.mockResolvedValue(Response.json({ error: 'Se alcanzó el límite de uso de hoy.', codigo: 'limite' }, { status: 429 }))
    expect(await pedirRevision('hematología', consulta, items(3))).toMatchObject({ estado: 'sin_ia' })
  })
  it('una consulta fuera del contrato no sale al servidor', async () => {
    await expect(pedirRevision('hematología', { ...consulta, minutos: 7 } as never, items(2))).rejects.toThrow()
    expect(red).not.toHaveBeenCalled()
  })
})
