import { describe, expect, it } from 'vitest'
import { cercaniaDominio } from '../srs/cercania'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import { reconstruirProgreso } from '../store/model'
import type { Intento } from '../srs/tipos'

const HORA = 3_600_000
const T0 = new Date(2026, 8, 13, 20, 30).getTime()

const acierto = (ts: number, sesion: string, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: `a-${ts}-${sesion}`, session_id: sesion, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const fallo = (ts: number, sesion: string): Intento =>
  acierto(ts, sesion, { resultado: 'incorrecta', tipo_error: 'desconocimiento', attempt_id: `f-${ts}` })

const progreso = (intentos: Intento[]) => reconstruirProgreso('C1', intentos, CRITERIOS_POR_DEFECTO)
const cercania = (intentos: Intento[], ahora: number) =>
  cercaniaDominio(progreso(intentos), CRITERIOS_POR_DEFECTO, ahora)

describe('cercanía al dominio', () => {
  it('tres aciertos en menos de un día no se cierran con otro acierto: falta esperar', () => {
    // El caso real: dos aciertos anoche y uno esta mañana, el umbral pide 96 h de separación.
    const intentos = [acierto(T0, 's1'), acierto(T0 + 2 * HORA, 's2'), acierto(T0 + 15.6 * HORA, 's3')]
    const ahora = T0 + 16 * HORA
    const c = cercania(intentos, ahora)
    expect(c.cumple).toBe(false)
    expect(c.bastaUnAcierto).toBe(false)
    expect(c.esperandoSeparacion).toBe(true)
    expect(c.disponibleDesde).toBe(T0 + 48 * HORA)
    expect(c.faltan).toEqual(['separadas ≥ 48 h'])
  })

  it('cuando de verdad falta un acierto lo dice, y ese acierto lo cierra', () => {
    // Dos aciertos ya separados más de 48 h: sólo falta el tercero.
    const intentos = [acierto(T0, 's1'), acierto(T0 + 60 * HORA, 's2')]
    const ahora = T0 + 61 * HORA
    const c = cercania(intentos, ahora)
    expect(c.bastaUnAcierto).toBe(true)
    expect(c.esperandoSeparacion).toBe(false)
    expect(c.disponibleDesde).toBeNull()
    expect(c.faltan).toContain('3 respuestas correctas independientes')

    const cerrado = cercania([...intentos, acierto(ahora, 's3')], ahora + 1)
    expect(cerrado.cumple).toBe(true)
    expect(cerrado.faltan).toEqual([])
  })

  it('un concepto ya dominado no pide nada más', () => {
    const intentos = [acierto(T0, 's1'), acierto(T0 + 25 * HORA, 's2'), acierto(T0 + 50 * HORA, 's3')]
    const c = cercania(intentos, T0 + 51 * HORA)
    expect(c).toEqual({ cumple: true, bastaUnAcierto: false, esperandoSeparacion: false, disponibleDesde: null, faltan: [] })
  })

  it('con dos criterios pendientes no promete que baste un acierto ni da fecha', () => {
    // Un solo acierto: le faltan aciertos y separación a la vez.
    const c = cercania([acierto(T0, 's1')], T0 + HORA)
    expect(c.bastaUnAcierto).toBe(false)
    expect(c.esperandoSeparacion).toBe(false)
    expect(c.disponibleDesde).toBeNull()
    expect(c.faltan.length).toBeGreaterThan(1)
  })

  it('el reloj de la separación arranca tras el último fallo, no en el primer intento', () => {
    // Aciertos viejos, un fallo, y después aciertos nuevos: la evidencia vigente es la posterior.
    const intentos = [
      acierto(T0, 's1'), acierto(T0 + 200 * HORA, 's2'),
      fallo(T0 + 300 * HORA, 's3'),
      acierto(T0 + 310 * HORA, 's4'), acierto(T0 + 312 * HORA, 's5'), acierto(T0 + 314 * HORA, 's6'),
    ]
    const c = cercania(intentos, T0 + 315 * HORA)
    expect(c.esperandoSeparacion).toBe(true)
    expect(c.disponibleDesde).toBe(T0 + 310 * HORA + 48 * HORA)
  })

  it('un acierto con ayuda no cuenta como punto de partida de la separación', () => {
    const intentos = [
      acierto(T0, 's1', { explicacion_previa: true }),
      acierto(T0 + 2 * HORA, 's2'), acierto(T0 + 4 * HORA, 's3'), acierto(T0 + 6 * HORA, 's4'),
    ]
    const c = cercania(intentos, T0 + 7 * HORA)
    expect(c.esperandoSeparacion).toBe(true)
    // Arranca en el primero independiente, el de +2 h, no en el que llevó explicación previa.
    expect(c.disponibleDesde).toBe(T0 + 2 * HORA + 48 * HORA)
  })

  it('sin ningún acierto vigente no inventa una fecha', () => {
    const c = cercania([fallo(T0, 's1')], T0 + HORA)
    expect(c.bastaUnAcierto).toBe(false)
    expect(c.disponibleDesde).toBeNull()
  })
})
