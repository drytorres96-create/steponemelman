import { describe, expect, it } from 'vitest'
import { hayConceptosPendientes } from '../lib/conceptos-pendientes'
import type { Reanudable } from '../store/model'

const guardada: Reanudable = { modulo: 'M', sesion: 'repaso', indice: 1, ts: 1,
  sessionId: 'guardada', conceptIds: ['C1', 'C2', 'C1'], cantidadInicial: 2 }

describe('pasos conceptuales pendientes para ponerse al día', () => {
  it('sin punto guardado no hay una sesión que retomar', () => {
    expect(hayConceptosPendientes(null)).toBe(false)
  })
  it('incluye los reintentos aunque se haya terminado la primera vuelta', () => {
    expect(hayConceptosPendientes({ ...guardada, indice: 2 })).toBe(true)
  })
  it.each([3, 4])('un índice %i fuera de la cola es un resumen, no trabajo pendiente', indice => {
    const resumen = { ...guardada, indice }
    const previo = structuredClone(resumen)
    expect(hayConceptosPendientes(resumen)).toBe(false)
    expect(resumen).toEqual(previo)
  })
  it('una cola vacía no bloquea la recuperación', () => {
    expect(hayConceptosPendientes({ ...guardada, conceptIds: [], indice: 0 })).toBe(false)
  })
  it('conserva la continuación heredada sin orden exacto de conceptos', () => {
    expect(hayConceptosPendientes({ modulo: 'M', sesion: 'guiada', indice: 9, ts: 1 })).toBe(true)
  })
})
