import { describe, expect, it } from 'vitest'
import { azarAcumulado, azarDeIntento, porcentajeAzar, UMBRAL_AZAR } from '../srs/azar'
import { aciertosVigentes, evaluarDominio, CRITERIOS_POR_DEFECTO, DESCUENTO_POR_FALLO } from '../srs/mastery'
import { nuevoProgreso, programar, DIA } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'

const base = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: `i-${ts}-${extra.resultado ?? 'correcta'}`, session_id: `s-${ts}`, ts,
  calificacion: 3, resultado: 'correcta', interaccion: 'recuperacion_libre',
  recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, ms: 3000, tipo_error: 'ninguno', confianza_declarada: 3,
  fuente_consultada: false, explicacion_previa: false, ...extra,
})
const fallo = (ts: number) => base(ts, { resultado: 'incorrecta', tipo_error: 'desconocimiento' })
const progresoCon = (intentos: Intento[]) => ({ ...nuevoProgreso('C'), intentos })

describe('evidencia contra el azar', () => {
  it('tasa cada formato por lo fácil que es acertarlo sin saber', () => {
    expect(azarDeIntento(base(1))).toBe(0.05)
    expect(azarDeIntento(base(1, { recuperacion_activa: false, tipo_evidencia: undefined, interaccion: 'opcion_multiple' }))).toBe(0.25)
    expect(azarDeIntento(base(1, { recuperacion_activa: false, tipo_evidencia: undefined, interaccion: 'verdadero_falso' }))).toBe(0.5)
    expect(azarDeIntento(base(1, { recuperacion_activa: false, tipo_evidencia: 'aplicacion', interaccion: 'caso_clinico' }))).toBe(0.1)
    // Un formato desconocido no premia ni castiga de más.
    expect(azarDeIntento(base(1, { recuperacion_activa: false, tipo_evidencia: undefined, interaccion: 'formato-nuevo' }))).toBe(0.25)
  })

  it('la evidencia se multiplica, no se suma', () => {
    const libre = [base(1), base(2)]
    expect(azarAcumulado(libre)).toBeCloseTo(0.0025)
    expect(azarAcumulado(libre)).toBeLessThanOrEqual(UMBRAL_AZAR)

    const mcq = (n: number) => Array.from({ length: n }, (_, i) =>
      base(i, { recuperacion_activa: false, tipo_evidencia: undefined, interaccion: 'opcion_multiple' }))
    expect(azarAcumulado(mcq(3))).toBeCloseTo(0.015625)
    expect(azarAcumulado(mcq(3))).toBeGreaterThan(UMBRAL_AZAR)
    expect(azarAcumulado(mcq(4))).toBeCloseTo(0.00390625)
    expect(azarAcumulado(mcq(4))).toBeLessThanOrEqual(UMBRAL_AZAR)
  })

  it('sin aciertos la probabilidad de que sea suerte es total', () => {
    expect(azarAcumulado([])).toBe(1)
  })

  it('se formatea con la precisión que hace falta para verla bajar', () => {
    expect(porcentajeAzar(0.25)).toBe('25.0 %')
    expect(porcentajeAzar(0.015625)).toBe('1.6 %')
    expect(porcentajeAzar(0.0039)).toBe('0.39 %')
    expect(porcentajeAzar(0.0000001)).toBe('< 0,01 %')
  })

  it('verdadero o falso nunca acredita por sí solo: 0,5 elevado a lo que sea tarda en bajar', () => {
    const vf = (n: number) => Array.from({ length: n }, (_, i) =>
      base(i, { recuperacion_activa: false, tipo_evidencia: undefined, interaccion: 'verdadero_falso' }))
    expect(azarAcumulado(vf(3))).toBe(0.125)
    expect(azarAcumulado(vf(6))).toBeCloseTo(0.015625)
    expect(azarAcumulado(vf(7))).toBeLessThanOrEqual(UMBRAL_AZAR)
  })
})

describe('retroceso: un fallo descuenta dos aciertos, no los borra todos', () => {
  it('conserva la evidencia anterior salvo los dos aciertos más recientes', () => {
    const p = progresoCon([base(1), base(2), base(3), base(4), fallo(5)])
    expect(DESCUENTO_POR_FALLO).toBe(2)
    expect(aciertosVigentes(p).map(i => i.ts)).toEqual([1, 2])
  })

  it('dos fallos seguidos descuentan cuatro, y nunca por debajo de cero', () => {
    expect(aciertosVigentes(progresoCon([base(1), base(2), base(3), fallo(4), fallo(5)])).map(i => i.ts)).toEqual([])
    expect(aciertosVigentes(progresoCon([base(1), fallo(2), fallo(3), fallo(4)]))).toEqual([])
  })

  it('acertar después de fallar recupera terreno sobre lo que quedó', () => {
    const p = progresoCon([base(1), base(2), base(3), base(4), fallo(5), base(6)])
    expect(aciertosVigentes(p).map(i => i.ts)).toEqual([1, 2, 6])
  })

  it('una respuesta por revisar no suma ni resta', () => {
    const p = progresoCon([base(1), base(2), base(3, { resultado: 'revision' })])
    expect(aciertosVigentes(p).map(i => i.ts)).toEqual([1, 2])
  })

  it('un acierto con ayuda no suma, pero tampoco protege del descuento', () => {
    const p = progresoCon([base(1), base(2), base(3, { explicacion_previa: true }), fallo(4)])
    expect(aciertosVigentes(p).map(i => i.ts)).toEqual([])
  })

  it('un fallo retira el dominio sin devolver el concepto al principio', () => {
    const t = Date.now()
    let p = nuevoProgreso('D')
    for (const d of [0, 3, 6]) p = programar(p, base(t + d * DIA), t + d * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 6 * DIA).cumple).toBe(true)

    p = programar(p, fallo(t + 9 * DIA), t + 9 * DIA)
    const tras = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 9 * DIA)
    expect(tras.cumple).toBe(false)
    // Queda un acierto vigente: el fallo costó dos, no los tres.
    expect(tras.detalle.find(d => d.clave === 'aciertos')!.valor).toBe('1')
  })
})
