// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ sesion: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: mock.sesion } } }))
import { ajustarHistorial, pedirPractica, preguntarAlTutor } from '../lib/chat-claude'
import { PeticionChatZ, type OrigenChat, type TurnoChat } from '../lib/contexto-chat'

const concepto: OrigenChat = { tipo: 'concepto', resultado: 'parcial', presentacion: { conceptId: 'QA-1', answer: 'beta', questionId: 'QA:0',
  version: 'qa', formatVersion: 3, index: 0, route: 'repaso', retry: false } }
const nbme: OrigenChat = { tipo: 'nbme', questionId: 'NBME28-P0001', revision: 'r1', optionId: 'C' }
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).byteLength
const pares = (n: number, largo = 1500): TurnoChat[] => Array.from({ length: n }, (_, k) =>
  [{ rol: 'yo' as const, texto: `Pregunta ${k}` }, { rol: 'ia' as const, texto: 'é'.repeat(largo) }]).flat()

const red = vi.fn()
const cuerpoEnviado = () => JSON.parse(red.mock.calls.at(-1)![1].body as string)
const ejercicio = (n: number) => ({ tipo: 'verdadero_falso', enunciado: `La afirmación número ${n} es cierta en este caso.`, verdadero: n % 2 === 0, explicacion: 'Porque así lo exige el mecanismo descrito.' })

beforeEach(() => {
  vi.clearAllMocks()
  mock.sesion.mockResolvedValue({ data: { session: { access_token: 'token-sintetico' } } })
  red.mockReset()
  vi.stubGlobal('fetch', red)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('historial que cabe en la petición', () => {
  it('conserva las parejas recientes completas y el cuerpo nunca supera el tope del servidor', () => {
    const base = PeticionChatZ.parse({ ...concepto, accion: 'mensaje', mensaje: 'x'.repeat(400), historial: [], evitar: [] })
    const h = ajustarHistorial(pares(6), base)
    expect(bytes({ ...base, historial: h })).toBeLessThanOrEqual(6000)
    expect(h.length % 2).toBe(0)
    expect(h.length).toBeGreaterThan(0)
    expect(h[0].rol).toBe('yo'); expect(h[1].rol).toBe('ia')
    expect(h.at(-2)?.texto).toBe('Pregunta 5')
  })

  it('descarta turnos huérfanos y recorta cada turno a lo que acepta el servidor', () => {
    const base = PeticionChatZ.parse({ ...nbme, accion: 'mensaje', mensaje: 'Hola', historial: [], evitar: [] })
    expect(ajustarHistorial([{ rol: 'yo', texto: 'Sin respuesta' }], base)).toEqual([])
    expect(ajustarHistorial([{ rol: 'ia', texto: 'Suelta' }, { rol: 'yo', texto: 'A' }, { rol: 'ia', texto: 'B' }], base))
      .toEqual([{ rol: 'yo', texto: 'A' }, { rol: 'ia', texto: 'B' }])
    expect(ajustarHistorial(pares(1, 4000), base)[1].texto.length).toBeLessThanOrEqual(1500)
    expect(ajustarHistorial(pares(7, 200), base)).toHaveLength(8)
  })
})

describe('preguntar al tutor', () => {
  it('la revisión explícita viaja sólo en esa petición y conserva los límites del historial', async () => {
    red.mockResolvedValue(Response.json({ respuesta: 'Explicación revisada con el material sintético.' }))
    await preguntarAlTutor(nbme, 'Revisa la respuesta anterior.', pares(6), undefined, true)
    expect(cuerpoEnviado().revisionSonnet).toBe(true)
    expect(bytes(cuerpoEnviado())).toBeLessThanOrEqual(5600)
    expect(PeticionChatZ.safeParse(cuerpoEnviado()).success).toBe(true)
    await preguntarAlTutor(nbme, 'Ahora explica otra cosa.', pares(1))
    expect(cuerpoEnviado()).not.toHaveProperty('revisionSonnet')
  })
  it('manda solo identificadores y el mensaje; el cuerpo cumple el contrato del servidor', async () => {
    red.mockResolvedValue(Response.json({ respuesta: 'Primero cae el filtrado glomerular y por eso sube la creatinina.', source: { title: 'Melman · Renal', page: 12 } }))
    const r = await preguntarAlTutor(concepto, '  Explícame el mecanismo paso a paso ', pares(2, 300))
    expect(r).toEqual({ estado: 'ok', texto: 'Primero cae el filtrado glomerular y por eso sube la creatinina.', fuente: { title: 'Melman · Renal', page: 12 } })
    const cuerpo = cuerpoEnviado()
    expect(PeticionChatZ.safeParse(cuerpo).success).toBe(true)
    expect(cuerpo).toMatchObject({ tipo: 'concepto', accion: 'mensaje', mensaje: 'Explícame el mecanismo paso a paso' })
    expect(red.mock.calls.at(-1)![0]).toBe('/api/ia/chat')
    expect(red.mock.calls.at(-1)![1].headers.Authorization).toBe('Bearer token-sintetico')
  })

  it('para una pregunta NBME manda pregunta, revisión y opción elegida', async () => {
    red.mockResolvedValue(Response.json({ respuesta: 'La opción C ignora el dato que manda en el enunciado.' }))
    expect((await preguntarAlTutor(nbme, '¿Hay un stem killer en esta pregunta?', [])).estado).toBe('ok')
    expect(cuerpoEnviado()).toMatchObject({ tipo: 'nbme', questionId: 'NBME28-P0001', revision: 'r1', optionId: 'C' })
    expect(PeticionChatZ.safeParse(cuerpoEnviado()).success).toBe(true)
  })

  it('no manda mensajes vacíos ni acepta una respuesta inutilizable', async () => {
    expect((await preguntarAlTutor(concepto, '   ', [])).estado).toBe('sin_ia')
    expect(red).not.toHaveBeenCalled()
    red.mockResolvedValue(Response.json({ respuesta: 'ok' }))
    expect(await preguntarAlTutor(concepto, 'Hola', [])).toMatchObject({ estado: 'sin_ia' })
  })

  it('traslada el motivo del servidor cuando Claude no está disponible', async () => {
    red.mockResolvedValue(Response.json({ error: 'Claude no tiene saldo disponible ahora.', codigo: 'credito' }, { status: 503 }))
    expect(await preguntarAlTutor(concepto, 'Hola', [])).toEqual({ estado: 'sin_ia', motivo: 'Claude no tiene saldo disponible ahora.', codigo: 'credito' })
  })
})

describe('pedir una ronda de recuperación activa', () => {
  it('valida lo recibido con el mismo contrato y limita lo que se pide evitar', async () => {
    red.mockResolvedValue(Response.json({ ejercicios: [1, 2, 3, 4].map(ejercicio) }))
    const r = await pedirPractica(nbme, Array.from({ length: 20 }, (_, n) => `Enunciado previo ${n} ${'x'.repeat(200)}`))
    expect(r.estado === 'ok' && r.ejercicios).toHaveLength(4)
    const cuerpo = cuerpoEnviado()
    expect(cuerpo).toMatchObject({ accion: 'practica' })
    expect(cuerpo.evitar).toHaveLength(12)
    expect(cuerpo.evitar.every((e: string) => e.length <= 100)).toBe(true)
    expect(PeticionChatZ.safeParse(cuerpo).success).toBe(true)
  })

  it('descarta una ronda con ejercicios rotos en lugar de enseñarlos', async () => {
    red.mockResolvedValue(Response.json({ ejercicios: [ejercicio(1), { tipo: 'completar', enunciado: 'Sin hueco alguno aquí', respuesta: 'x', explicacion: 'No sirve.' }, ejercicio(3)] }))
    expect(await pedirPractica(concepto, [])).toMatchObject({ estado: 'sin_ia' })
  })
})
