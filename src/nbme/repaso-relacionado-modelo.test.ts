// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claveRepasoRelacionado, guardarRepasoRelacionado, leerRepasoRelacionado, type RepasoRelacionadoGuardado } from './repaso-relacionado-modelo'
const origen = { sessionId: 'block', attemptId: 'block:2', questionId: 'question', revision: 'r1', position: 2 }
const repaso = (): RepasoRelacionadoGuardado => ({ version: 1, ownerId: 'owner', origen, ids: ['concept-a', 'concept-b'], terminado: false,
  continuacion: { modulo: 'nbme:block', sesion: 'repaso', indice: 1, ts: 100, sessionId: 'practice', conceptIds: ['concept-a', 'concept-b'],
    paso: { indice: 1, pistas: 0, fuenteConsultada: false, explicacionPrevia: false, confianza: null, msActivo: 30 } } })
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('continuación de repaso dentro del mismo bloque NBME', () => {
  it('retoma la cola exacta, el paso y origen sin escribir la continuación general', () => {
    localStorage.setItem('step1-respaldo:cuenta:owner', 'original-general-queue')
    expect(guardarRepasoRelacionado(repaso())).toBe(true)
    expect(leerRepasoRelacionado('owner', origen)).toEqual(repaso())
    expect(localStorage.getItem('step1-respaldo:cuenta:owner')).toBe('original-general-queue')
  })
  it('aísla cuenta, revisión y oportunidad aunque compartan la misma pregunta', () => {
    guardarRepasoRelacionado(repaso())
    expect(leerRepasoRelacionado('other-owner', origen)).toBeNull()
    expect(leerRepasoRelacionado('owner', { ...origen, revision: 'r2' })).toBeNull()
    expect(leerRepasoRelacionado('owner', { ...origen, position: 3 })).toBeNull()
    expect(leerRepasoRelacionado('owner', { ...origen, sessionId: 'other' })).toBeNull()
  })
  it.each([
    { ids: ['concept-a', 'concept-a'] },
    { continuacion: { ...repaso().continuacion, indice: 3 } },
    { continuacion: { ...repaso().continuacion, conceptIds: ['concept-a'] } },
    { continuacion: null },
  ])('rechaza continuaciones parciales o inválidas %j', cambios => {
    localStorage.setItem(claveRepasoRelacionado('owner', origen), JSON.stringify({ ...repaso(), ...cambios }))
    expect(leerRepasoRelacionado('owner', origen)).toBeNull()
  })
  it('conserva un repaso terminado como terminado', () => {
    guardarRepasoRelacionado({ ...repaso(), terminado: true, continuacion: null })
    expect(leerRepasoRelacionado('owner', origen)?.terminado).toBe(true)
  })
  it('señala un fallo de almacenamiento sin lanzar una excepción', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(guardarRepasoRelacionado(repaso())).toBe(false)
  })
})
