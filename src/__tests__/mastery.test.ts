import { describe, it, expect } from 'vitest'
import { nuevoProgreso, programar, DIA } from '../srs/fsrs'
import { CRITERIOS_POR_DEFECTO, evaluarDominio, calcularEstado, etapa } from '../srs/mastery'
import type { Intento } from '../srs/tipos'

const it3 = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  ts, calificacion: 3, interaccion: 'recuperacion_libre', recuperacion_activa: true,
  pistas_usadas: 0, ms: 3000, tipo_error: 'ninguno', confianza_declarada: 3, ...extra,
})

describe('criterios de dominio', () => {
  it('un solo acierto no basta para dominar', () => {
    const t = Date.now()
    const p = programar(nuevoProgreso('X'), it3(t), t)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t).cumple).toBe(false)
    expect(calcularEstado(p, CRITERIOS_POR_DEFECTO, t)).not.toBe('dominado')
  })
  it('tres recuperaciones en dos sesiones separadas y sin pistas sí bastan', () => {
    const t = Date.now()
    let p = programar(nuevoProgreso('X'), it3(t), t)
    p = programar(p, it3(t + 2 * DIA), t + 2 * DIA)
    p = programar(p, it3(t + 5 * DIA), t + 5 * DIA)
    const ev = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)
    expect(ev.cumple).toBe(true)
    expect(ev.detalle.every(d => d.cumplido)).toBe(true)
  })
  it('el reconocimiento no equivale a la recuperación libre', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA, { recuperacion_activa: false, interaccion: 'opcion_multiple' }), t + d * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(false)
  })
  it('acertar siempre con pistas impide el dominio', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA, { pistas_usadas: 2 }), t + d * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(false)
  })
  it('una confusión reciente bloquea el dominio', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    p = programar(p, { ...it3(t + 6 * DIA), calificacion: 1, tipo_error: 'confusion_conceptos' }, t + 6 * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 6 * DIA).cumple).toBe(false)
  })
  it('un concepto dominado que después falla pasa a reaprendizaje', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    p = { ...p, dominado_en: t + 5 * DIA }
    p = programar(p, { ...it3(t + 40 * DIA), calificacion: 1, tipo_error: 'desconocimiento' }, t + 40 * DIA)
    expect(calcularEstado(p, CRITERIOS_POR_DEFECTO, t + 40 * DIA)).toBe('reaprendizaje')
  })
  it('los criterios son configurables', () => {
    const t = Date.now()
    const p = programar(nuevoProgreso('X'), it3(t), t)
    const laxos = { ...CRITERIOS_POR_DEFECTO, recuperaciones: 1, sesiones: 1, separacionHoras: 0 }
    expect(evaluarDominio(p, laxos, t).cumple).toBe(true)
  })
  it('las etapas visibles progresan', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    expect(etapa(p)).toBe('exposicion')
    p = programar(p, { ...it3(t), calificacion: 1, tipo_error: 'desconocimiento' }, t)
    expect(etapa(p)).toBe('comprension')
    p = programar(p, it3(t + DIA), t + DIA)
    expect(etapa(p)).toBe('recuperacion')
    p = programar(p, it3(t + 2 * DIA), t + 2 * DIA)
    expect(etapa(p)).toBe('consolidacion')
  })
  it('cuenta sesiones reales por UUID aunque ocurran el mismo día', () => {
    const t = Date.now()
    const criterios = { ...CRITERIOS_POR_DEFECTO, recuperaciones: 2, sesiones: 2, separacionHoras: 0 }
    let p = programar(nuevoProgreso('SES'), it3(t, { session_id: 'sesion-a', resultado: 'correcta' }), t)
    p = programar(p, it3(t + 1000, { session_id: 'sesion-b', resultado: 'correcta' }), t + 1000)
    expect(evaluarDominio(p, criterios, t + 1000).cumple).toBe(true)

    let misma = programar(nuevoProgreso('UNA'), it3(t, { session_id: 'sesion-a', resultado: 'correcta' }), t)
    misma = programar(misma, it3(t + 2 * DIA, { session_id: 'sesion-a', resultado: 'correcta' }), t + 2 * DIA)
    expect(evaluarDominio(misma, criterios, t + 2 * DIA).cumple).toBe(false)
  })
})
