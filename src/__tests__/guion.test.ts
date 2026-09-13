import { describe, expect, it } from 'vitest'
import { construirGuion, pasoActual, posicionEnCola, separarGuion, tramoDeConceptos } from '../semana/guion'
import type { Paso } from '../semana/tipos'

const conceptos = (n: number) => Array.from({ length: n }, (_, i) => `C${i + 1}`)
const preguntas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `Q${i + 1}`, revision: `r${i + 1}` }))
const forma = (guion: Paso[]) => guion.map(p => (p.kind === 'concepto' ? 'C' : 'Q')).join('')

describe('construirGuion', () => {
  it('intercala una pregunta cada tres conceptos con 15 y 5', () => {
    const guion = construirGuion(conceptos(15), preguntas(5))
    expect(forma(guion)).toBe('CCCQ'.repeat(5))
    expect(guion).toHaveLength(20)
    expect(guion[3]).toEqual({ kind: 'pregunta', id: 'Q1', revision: 'r1' })
    expect(guion[4]).toEqual({ kind: 'concepto', id: 'C4' })
  })

  it('deja los sobrantes al final con 14 y 5', () => {
    const guion = construirGuion(conceptos(14), preguntas(5))
    expect(forma(guion)).toBe('CCCQCCCQCCCQCCCQCCQ')
    expect(guion).toHaveLength(19)
    expect(guion.at(-1)).toEqual({ kind: 'pregunta', id: 'Q5', revision: 'r5' })
    expect(separarGuion(guion).conceptIds).toEqual(conceptos(14))
  })

  it('no inventa preguntas cuando se agotan, con 13 y 4', () => {
    const guion = construirGuion(conceptos(13), preguntas(4))
    expect(forma(guion)).toBe('CCCQCCCQCCCQCCCQC')
    expect(guion).toHaveLength(17)
    expect(guion.at(-1)).toEqual({ kind: 'concepto', id: 'C13' })
  })

  it('acepta listas vacías sin romperse', () => {
    expect(construirGuion([], [])).toEqual([])
    expect(forma(construirGuion([], preguntas(3)))).toBe('QQQ')
    expect(forma(construirGuion(conceptos(4), []))).toBe('CCCC')
  })

  it('es determinista', () => {
    const a = construirGuion(conceptos(15), preguntas(5))
    const b = construirGuion(conceptos(15), preguntas(5))
    expect(a).toEqual(b)
  })
})

describe('separarGuion', () => {
  it('conserva el orden original de cada cola', () => {
    const guion = construirGuion(conceptos(7), preguntas(3))
    const { conceptIds, preguntas: qs } = separarGuion(guion)
    expect(conceptIds).toEqual(conceptos(7))
    expect(qs).toEqual(preguntas(3))
  })
})

describe('posicionEnCola', () => {
  const guion = construirGuion(conceptos(15), preguntas(5))
  it('sitúa el primer paso al principio de su cola', () => {
    expect(posicionEnCola(guion, 0)).toBe(0)
    expect(posicionEnCola(guion, 3)).toBe(0)
  })
  it('sitúa el paso posterior a una pregunta', () => {
    expect(posicionEnCola(guion, 4)).toBe(3)
    expect(posicionEnCola(guion, 7)).toBe(1)
  })
  it('sitúa el último paso', () => {
    expect(posicionEnCola(guion, 19)).toBe(4)
    expect(posicionEnCola(guion, 18)).toBe(14)
  })
  it('rechaza índices fuera del guion', () => {
    expect(posicionEnCola(guion, -1)).toBe(-1)
    expect(posicionEnCola(guion, 20)).toBe(-1)
  })
})

describe('pasoActual', () => {
  const guion = construirGuion(conceptos(6), preguntas(2))
  it('devuelve el paso del cursor guardado', () => {
    expect(pasoActual(guion, 0)).toEqual({ kind: 'concepto', id: 'C1' })
    expect(pasoActual(guion, 3)).toEqual({ kind: 'pregunta', id: 'Q1', revision: 'r1' })
  })
  it('devuelve null con el cursor al final', () => {
    expect(pasoActual(guion, guion.length)).toBeNull()
    expect(pasoActual(guion, guion.length + 5)).toBeNull()
    expect(pasoActual([], 0)).toBeNull()
  })
})

describe('tramoDeConceptos', () => {
  const guion = construirGuion(conceptos(14), preguntas(5))
  it('agrupa los conceptos consecutivos y sitúa el punto de entrada', () => {
    expect(tramoDeConceptos(guion, 0)).toEqual({ ids: ['C1', 'C2', 'C3'], desde: 0, inicio: 0 })
    expect(tramoDeConceptos(guion, 5)).toEqual({ ids: ['C4', 'C5', 'C6'], desde: 1, inicio: 4 })
    expect(tramoDeConceptos(guion, 17)).toEqual({ ids: ['C13', 'C14'], desde: 1, inicio: 16 })
  })
  it('no devuelve tramo sobre un paso de pregunta o fuera del guion', () => {
    expect(tramoDeConceptos(guion, 3).ids).toEqual([])
    expect(tramoDeConceptos(guion, 99).ids).toEqual([])
  })
})
