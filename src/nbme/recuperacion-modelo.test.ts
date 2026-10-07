// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ pedir: vi.fn() }))
vi.mock('../lib/peticion-ia', () => ({ solicitarIA: mock.pedir }))
import { generarRecuperacionNbme } from '../lib/recuperacion-nbme-ia'
import { avanzarRecuperacion, claveRecuperacion, crearRecuperacion, esContenidoRecuperacion, esRecuperacionGuardada,
  evaluarRecuperacion, guardarRecuperacion, leerRecuperacion, responderRecuperacion, type ContenidoRecuperacion } from './recuperacion-modelo'

const origen = { qid: 'QA-P0001', revision: 'qa-r1', optionId: 'B', attemptId: 'qa-session:0' }
const contenido: ContenidoRecuperacion = { objetivo: 'Recover the synthetic alphabet order.', ejercicios: [
  { id: 'qa-1', tipo: 'completar', pregunta: 'The first synthetic token is ____.', respuesta: 'alpha', explicacion: 'Alpha comes first.', evidencia: 'The first synthetic token is alpha.' },
  { id: 'qa-2', tipo: 'verdadero_falso', pregunta: 'The first synthetic token is alpha.', respuesta: 'Verdadero', explicacion: 'This matches the source.', evidencia: 'The first synthetic token is alpha.' },
  { id: 'qa-3', tipo: 'seleccion', pregunta: 'The second synthetic token is ____.', respuesta: 'beta', alternativas: ['alpha', 'beta', 'gamma'], explicacion: 'Beta comes second.', evidencia: 'The second synthetic token is beta.' },
  { id: 'qa-4', tipo: 'discriminar', pregunta: 'The last synthetic token is ____.', respuesta: 'gamma', alternativas: ['beta', 'gamma'], explicacion: 'Gamma comes last.', evidencia: 'The last synthetic token is gamma.' },
] }
function almacen() {
  const valores = new Map<string, string>()
  return { getItem: (k: string) => valores.get(k) ?? null, setItem: (k: string, v: string) => { valores.set(k, v) }, valores }
}

describe('recuperación aislada y finita', () => {
  it('acepta cuatro formatos y evalúa con reglas deterministas sin IA ni notas del corpus', () => {
    expect(esContenidoRecuperacion(contenido)).toBe(true)
    expect(evaluarRecuperacion(contenido.ejercicios[0], ' ALPHA ')).toBe(true)
    expect(evaluarRecuperacion(contenido.ejercicios[0], 'alphabet')).toBe(false)
    expect(evaluarRecuperacion(contenido.ejercicios[1], 'Falso')).toBe(false)
    expect(evaluarRecuperacion(contenido.ejercicios[2], 'beta')).toBe(true)
    expect(evaluarRecuperacion(contenido.ejercicios[3], 'gamma')).toBe(true)
  })

  it('no avanza antes de comprobar ni sobrescribe una respuesta ya comprobada', () => {
    const inicial = crearRecuperacion('qa-owner', origen, contenido, 1)
    expect(avanzarRecuperacion(inicial, 2)).toBe(inicial)
    expect(responderRecuperacion(inicial, '', 2)).toBe(inicial)
    const contestada = responderRecuperacion(inicial, 'beta', 2)
    expect(responderRecuperacion(contestada, 'alpha', 3)).toBe(contestada)
    expect(contestada.respuestas).toEqual([{ ejercicioId: 'qa-1', respuesta: 'beta', correcta: false }])
  })

  it('conserva una elección errónea de hasta 180 caracteres admitida por la API', () => {
    const larga = 'synthetic alternative '.repeat(7).trim()
    const material: ContenidoRecuperacion = { ...contenido, ejercicios: contenido.ejercicios.map((e, i) => i === 2
      ? { ...e, alternativas: ['alpha', 'beta', larga] } : e) }
    let sesion = crearRecuperacion('qa-owner', origen, material, 1)
    sesion = avanzarRecuperacion(responderRecuperacion(sesion, 'alpha', 2), 3)
    sesion = avanzarRecuperacion(responderRecuperacion(sesion, 'Verdadero', 4), 5)
    sesion = responderRecuperacion(sesion, larga, 6)
    expect(sesion.respuestas[2]).toMatchObject({ respuesta: larga, correcta: false })
    expect(guardarRecuperacion(sesion, almacen())).toBe(true)
  })

  it('cierra tras el último ejercicio y conserva errores sin inventar dominio', () => {
    let sesion = crearRecuperacion('qa-owner', origen, contenido, 1)
    for (const respuesta of ['alpha', 'Falso', 'beta', 'gamma']) {
      sesion = avanzarRecuperacion(responderRecuperacion(sesion, respuesta, 2), 3)
    }
    expect(sesion.cursor).toBe(4)
    expect(sesion.cerrada).toBe(true)
    expect(sesion.respuestas.filter(r => r.correcta)).toHaveLength(3)
    expect(esRecuperacionGuardada(sesion, 'qa-owner', origen)).toBe(true)
    expect(avanzarRecuperacion(sesion)).toBe(sesion)
    expect(responderRecuperacion(sesion, 'alpha')).toBe(sesion)
    expect(sesion).not.toHaveProperty('conceptos')
  })

  it('la ausencia de campos nuevos no altera una cuenta antigua sin recuperaciones', () => {
    const local = almacen()
    const previo = JSON.stringify({ version: 1, attempts: { old: { optionId: 'B' } } })
    local.setItem('step1-backup:nbme-state:qa-owner', previo)
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'vacio' })
    expect(local.getItem('step1-backup:nbme-state:qa-owner')).toBe(previo)
  })

  it('retoma contenido, respuesta comprobada y borrador por cuenta, revisión y oportunidad', () => {
    const local = almacen()
    const sesion = responderRecuperacion(crearRecuperacion('qa-owner', origen, contenido, 1), 'alpha', 2)
    expect(guardarRecuperacion(sesion, local)).toBe(true)
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'ok', sesion })
    expect(leerRecuperacion('qa-other', origen, local)).toEqual({ estado: 'vacio' })
    expect(leerRecuperacion('qa-owner', { ...origen, revision: 'qa-r2' }, local)).toEqual({ estado: 'vacio' })
    expect(leerRecuperacion('qa-owner', { ...origen, attemptId: 'another-session:0' }, local)).toEqual({ estado: 'vacio' })
    const pendiente = { ...avanzarRecuperacion(sesion, 3), borrador: 'Verdadero' }
    expect(guardarRecuperacion(pendiente, local)).toBe(true)
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'ok', sesion: pendiente })
  })

  it('una pestaña desfasada no borra respuestas ni retrocede el cursor guardado por otra', () => {
    const local = almacen()
    const pestañaB = crearRecuperacion('qa-owner', origen, contenido, 1)
    const pestañaA = avanzarRecuperacion(responderRecuperacion(pestañaB, 'alpha', 2), 3)
    expect(guardarRecuperacion(pestañaA, local)).toBe(true)
    // Una respuesta errónea y un borrador posterior en la copia antigua no reemplazan el avance.
    expect(guardarRecuperacion(responderRecuperacion(pestañaB, 'beta', 5), local)).toBe(false)
    expect(guardarRecuperacion({ ...pestañaB, borrador: 'alpha', actualizadaEn: 6 }, local)).toBe(false)
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'ok', sesion: pestañaA })
    const siguiente = responderRecuperacion(pestañaA, 'Verdadero', 7)
    expect(guardarRecuperacion(siguiente, local)).toBe(true)
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'ok', sesion: siguiente })
  })

  it('mantiene el cierre y las respuestas comprobadas aunque otra copia tenga timestamp más reciente', () => {
    const local = almacen()
    const inicial = crearRecuperacion('qa-owner', origen, contenido, 1)
    let completa = inicial
    for (const respuesta of ['alpha', 'Verdadero', 'beta', 'gamma']) completa = avanzarRecuperacion(responderRecuperacion(completa, respuesta, 2), 3)
    expect(guardarRecuperacion(completa, local)).toBe(true)
    expect(guardarRecuperacion({ ...inicial, contenido: { ...contenido, cached: true }, actualizadaEn: 99 }, local)).toBe(false)
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'ok', sesion: completa })
    const conflicto = { ...completa, respuestas: [{ ...completa.respuestas[0], respuesta: 'beta', correcta: false }, ...completa.respuestas.slice(1)], actualizadaEn: 100 }
    expect(guardarRecuperacion(conflicto, local)).toBe(false)
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'ok', sesion: completa })
  })

  it('permite guardar una regeneración distinta solicitada para la misma oportunidad', () => {
    const local = almacen()
    const anterior = avanzarRecuperacion(responderRecuperacion(crearRecuperacion('qa-owner', origen, contenido, 1), 'alpha', 2), 3)
    expect(guardarRecuperacion(anterior, local)).toBe(true)
    const otra = crearRecuperacion('qa-owner', origen, { ...contenido, objetivo: 'Recover a different synthetic objective.' }, 4)
    expect(guardarRecuperacion(otra, local)).toBe(true)
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'ok', sesion: otra })
  })

  it.each([
    (s: ReturnType<typeof crearRecuperacion>) => ({ ...s, version: 99 }),
    (s: ReturnType<typeof crearRecuperacion>) => ({ ...s, ownerId: 'other' }),
    (s: ReturnType<typeof crearRecuperacion>) => ({ ...s, origen: { ...origen, revision: 'other' } }),
    (s: ReturnType<typeof crearRecuperacion>) => ({ ...s, cursor: 2 }),
    (s: ReturnType<typeof crearRecuperacion>) => ({ ...s, cerrada: true }),
    (s: ReturnType<typeof crearRecuperacion>) => ({ ...s, respuestas: [{ ejercicioId: 'qa-1', respuesta: 'wrong', correcta: true }], borrador: 'wrong' }),
  ])('rechaza datos guardados alterados o de otra identidad', alterar => {
    const local = almacen(), sesion = crearRecuperacion('qa-owner', origen, contenido, 1)
    local.setItem(claveRecuperacion('qa-owner', origen)!, JSON.stringify(alterar(sesion)))
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'invalido' })
  })

  it('rechaza JSON ilegible y falla de guardado de forma explícita', () => {
    const local = almacen()
    local.setItem(claveRecuperacion('qa-owner', origen)!, '{ broken')
    expect(leerRecuperacion('qa-owner', origen, local)).toEqual({ estado: 'invalido' })
    const bloqueado = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') } }
    expect(leerRecuperacion('qa-owner', origen, bloqueado)).toEqual({ estado: 'sin_almacenamiento' })
    expect(guardarRecuperacion(crearRecuperacion('qa-owner', origen, contenido, 1), bloqueado)).toBe(false)
  })

  it('rechaza contenido incompleto, opciones ambiguas, formato o respuesta no compatibles', () => {
    const cambiar = (extra: object) => ({ ...contenido, ejercicios: [{ ...contenido.ejercicios[0], ...extra }, ...contenido.ejercicios.slice(1)] })
    expect(esContenidoRecuperacion({ ...contenido, ejercicios: contenido.ejercicios.slice(0, 2) })).toBe(false)
    expect(esContenidoRecuperacion(cambiar({ tipo: 'inventado' }))).toBe(false)
    expect(esContenidoRecuperacion(cambiar({ evidencia: '' }))).toBe(false)
    expect(esContenidoRecuperacion(cambiar({ respuesta: 'one two three four five six seven' }))).toBe(false)
    expect(esContenidoRecuperacion(cambiar({ id: 'qa-2' }))).toBe(false)
    expect(esContenidoRecuperacion(cambiar({ source: { title: 'Synthetic', page: -1 } }))).toBe(false)
    expect(esContenidoRecuperacion(cambiar({ source: { title: 'Synthetic', page: 3, conceptId: '../unsafe' } }))).toBe(false)
    expect(esContenidoRecuperacion(cambiar({ tipo: 'seleccion', alternativas: ['alpha', 'Alpha', 'beta'] }))).toBe(false)
    expect(esContenidoRecuperacion(cambiar({ tipo: 'seleccion', alternativas: ['one', 'two', 'three'], respuesta: 'four' }))).toBe(false)
    expect(claveRecuperacion('', origen)).toBeNull()
    expect(claveRecuperacion('qa-owner', { ...origen, optionId: '../A' })).toBeNull()
  })
})

describe('cliente IA manual', () => {
  beforeEach(() => { mock.pedir.mockReset().mockResolvedValue({ estado: 'ok', data: contenido }) })
  it('envía sólo pregunta/revisión/opción/razonamiento con timeout y señal existentes', async () => {
    const control = new AbortController()
    expect(await generarRecuperacionNbme({ ...origen, razonamiento: '  I picked the second token.  ' }, control.signal)).toEqual({ estado: 'ok', data: contenido })
    expect(mock.pedir).toHaveBeenCalledWith('/api/ia/recuperacion-nbme',
      { questionId: 'QA-P0001', revision: 'qa-r1', optionId: 'B', razonamiento: 'I picked the second token.' }, 90_000, control.signal)
  })
  it('deniega respuestas o entradas malformadas y conserva el fallback de cuota', async () => {
    mock.pedir.mockResolvedValue({ estado: 'ok', data: { ejercicios: [] } })
    expect((await generarRecuperacionNbme(origen)).estado).toBe('sin_ia')
    mock.pedir.mockResolvedValue({ estado: 'sin_ia', motivo: 'Cuota agotada.' })
    expect(await generarRecuperacionNbme(origen)).toEqual({ estado: 'sin_ia', motivo: 'Cuota agotada.' })
    mock.pedir.mockClear()
    expect((await generarRecuperacionNbme({ ...origen, optionId: '' })).estado).toBe('sin_ia')
    expect(mock.pedir).not.toHaveBeenCalled()
  })
})
