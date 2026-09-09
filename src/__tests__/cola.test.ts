import { describe, expect, it } from 'vitest'
import { reinsertarTrasFallo } from '../lib/cola'

describe('reinserción de fallos', () => {
  it('conserva una copia pendiente aunque falle el último ítem', () => {
    const cola = ['A', 'B', 'C']
    const siguiente = reinsertarTrasFallo(cola, 2, 4)
    expect(siguiente).toEqual(['A', 'B', 'C', 'C'])
    expect(siguiente.length).toBeGreaterThan(2 + 1)
    expect(cola).toEqual(['A', 'B', 'C'])
  })

  it('también funciona en una cola de un solo concepto', () => {
    expect(reinsertarTrasFallo(['A'], 0, 3)).toEqual(['A', 'A'])
  })
})
