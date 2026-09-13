import { describe, expect, it } from 'vitest'
import { construirPlanHorizonte, repartirHorizonte, SEMANAS_HORIZONTE } from '../lib/plan-horizonte'

describe('reparto del horizonte', () => {
  it('suma exactamente lo que queda, sin perder ni inventar nada', () => {
    for (const restantes of [0, 1, 7, 55, 120, 1234, 4001]) {
      const reparto = repartirHorizonte(restantes, 10)
      expect(reparto).toHaveLength(10)
      expect(reparto.reduce((a, b) => a + b, 0)).toBe(restantes)
      expect(reparto.every(n => Number.isInteger(n) && n >= 0)).toBe(true)
    }
  })

  it('carga por delante: cada semana pide igual o menos que la anterior', () => {
    const reparto = repartirHorizonte(1000, 10)
    expect(reparto[0]).toBeGreaterThan(reparto[9])
    for (let i = 1; i < reparto.length; i++) expect(reparto[i]).toBeLessThanOrEqual(reparto[i - 1])
  })

  it('con pesos 10..9..1 la primera semana se lleva 10/55 del total', () => {
    // 550 entre pesos que suman 55 da exactamente 100, 90, 80… sin redondeos.
    expect(repartirHorizonte(550, 10)).toEqual([100, 90, 80, 70, 60, 50, 40, 30, 20, 10])
  })

  it('no se rompe con entradas absurdas', () => {
    expect(repartirHorizonte(-5, 10).reduce((a, b) => a + b, 0)).toBe(0)
    expect(repartirHorizonte(10, 0)).toEqual([10])
    expect(repartirHorizonte(10, 1)).toEqual([10])
  })
})

describe('plan de diez semanas', () => {
  const base = { totalConceptos: 550, dominados: 0, totalPreguntas: 275, respondidas: 0, desde: new Date(2026, 8, 13) }

  it('reparte conceptos y preguntas y acumula hasta cubrir el material', () => {
    const plan = construirPlanHorizonte(base)
    expect(plan.semanas).toHaveLength(SEMANAS_HORIZONTE)
    expect(plan.semanas[0]).toMatchObject({ indice: 1, conceptos: 100, preguntas: 50, acumuladoConceptos: 100, acumuladoPreguntas: 50 })
    expect(plan.semanas[1]).toMatchObject({ indice: 2, conceptos: 90, preguntas: 45, acumuladoConceptos: 190, acumuladoPreguntas: 95 })
    expect(plan.semanas.at(-1)).toMatchObject({ acumuladoConceptos: 550, acumuladoPreguntas: 275 })
    expect(plan).toMatchObject({ restanConceptos: 550, restanPreguntas: 275, objetivoConceptos: 100, objetivoPreguntas: 50 })
  })

  it('las semanas arrancan el lunes de la semana en curso', () => {
    // El 13-sep-2026 es domingo: su lunes es el 7.
    const plan = construirPlanHorizonte(base)
    expect(plan.semanas[0].inicio).toBe('2026-09-07')
    expect(plan.semanas[1].inicio).toBe('2026-09-14')
    expect(plan.semanas[9].inicio).toBe('2026-11-09')
  })

  it('se recalcula desde lo que queda: avanzar baja los objetivos siguientes', () => {
    const antes = construirPlanHorizonte(base)
    const despues = construirPlanHorizonte({ ...base, dominados: 275 })
    expect(despues.restanConceptos).toBe(275)
    expect(despues.semanas[0].conceptos).toBeLessThan(antes.semanas[0].conceptos)
    expect(despues.semanas.at(-1)!.acumuladoConceptos).toBe(550)
  })

  it('el plan termina en cuanto no queda material', () => {
    const plan = construirPlanHorizonte({ ...base, dominados: 550, respondidas: 275 })
    expect(plan.restanConceptos).toBe(0)
    expect(plan.semanas.every(s => s.conceptos === 0 && s.preguntas === 0)).toBe(true)
    expect(plan.semanas[0].acumuladoConceptos).toBe(550)
  })

  it('no deja que un contador adelantado pase del total publicado', () => {
    const plan = construirPlanHorizonte({ ...base, dominados: 900, respondidas: -3 })
    expect(plan.baseConceptos).toBe(550)
    expect(plan.basePreguntas).toBe(0)
    expect(plan.restanConceptos).toBe(0)
  })
})
