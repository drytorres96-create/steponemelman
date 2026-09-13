import { describe, expect, it } from 'vitest'
import { coberturaSesion, UMBRAL_COMPLETADA } from '../semana/cobertura'
import { construirGuion } from '../semana/guion'

const conceptos = (n: number) => Array.from({ length: n }, (_, i) => `C${i + 1}`)
const preguntas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `Q${i + 1}`, revision: `r${i + 1}` }))
const guion = construirGuion(conceptos(15), preguntas(5))  // 20 pasos

describe('criterio automático de sesión completada', () => {
  it('una sesión sin evidencia no está hecha, aunque el guion exista', () => {
    const c = coberturaSesion(guion, [], [])
    expect(c).toMatchObject({ pasos: 20, hechos: 0, fraccion: 0, cumple: false, primeroPendiente: 0 })
    expect(c.conceptos).toEqual({ total: 15, hechos: 0 })
    expect(c.preguntas).toEqual({ total: 5, hechas: 0 })
  })

  it('recorrer el guion sin responder no la completa: manda la evidencia', () => {
    // Sólo los tres primeros conceptos respondidos: 3 de 20.
    const c = coberturaSesion(guion, ['C1', 'C2', 'C3'], [])
    expect(c.hechos).toBe(3)
    expect(c.cumple).toBe(false)
    expect(c.primeroPendiente).toBe(3)
  })

  it('se completa sola al llegar al umbral, sin esperar al último paso', () => {
    // 14 conceptos y 4 preguntas = 18 de 20 = 90 %, por encima del 85 %.
    const c = coberturaSesion(guion, conceptos(14), ['Q1', 'Q2', 'Q3', 'Q4'])
    expect(c.hechos).toBe(18)
    expect(c.fraccion).toBeCloseTo(0.9)
    expect(c.cumple).toBe(true)
  })

  it('el umbral deja margen para un paso que no se puede cumplir', () => {
    // 17 de 20 = 85 % exacto: cumple. 16 de 20 = 80 %: todavía no.
    expect(coberturaSesion(guion, conceptos(13), ['Q1', 'Q2', 'Q3', 'Q4']).cumple).toBe(true)
    expect(coberturaSesion(guion, conceptos(13), ['Q1', 'Q2', 'Q3']).cumple).toBe(false)
    expect(UMBRAL_COMPLETADA).toBe(0.85)
  })

  it('acertar no entra en el criterio: sólo cuenta haber respondido', () => {
    // La cobertura no recibe resultados, sólo identificadores con intento registrado.
    const todo = coberturaSesion(guion, conceptos(15), ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'])
    expect(todo.fraccion).toBe(1)
    expect(todo.cumple).toBe(true)
    expect(todo.primeroPendiente).toBe(-1)
  })

  it('señala el primer paso sin evidencia para poder volver a él', () => {
    // Falta la pregunta del paso 3 y el concepto del paso 6.
    const c = coberturaSesion(guion, conceptos(15), ['Q2', 'Q3', 'Q4', 'Q5'])
    expect(c.primeroPendiente).toBe(3)
    expect(c.preguntas).toEqual({ total: 5, hechas: 4 })
  })

  it('un guion vacío nunca cumple', () => {
    expect(coberturaSesion([], ['C1'], ['Q1'])).toMatchObject({ pasos: 0, cumple: false, primeroPendiente: -1 })
  })

  it('acepta un umbral distinto al de la aplicación', () => {
    expect(coberturaSesion(guion, conceptos(10), [], 0.5).cumple).toBe(true)
    expect(coberturaSesion(guion, conceptos(10), [], 0.9).cumple).toBe(false)
  })
})
