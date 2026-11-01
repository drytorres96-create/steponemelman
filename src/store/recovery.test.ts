import { describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL, combinarEstados, type EstadoApp } from './model'
import { emptyNbmeState, mergeNbmeStates, startNbmeSession } from '../nbme/model'
import { recoverSavedCopies } from './recovery'

const copy = <T,>(state: T, revision: number, generation: string, savedAt: number) => ({
  state, snapshot: { state, revision, generation, updated_at: '2026-10-30T00:00:00Z' }, savedAt,
})
const study = (id: string): EstadoApp => ({ ...ESTADO_INICIAL,
  sesiones: [{ id, inicio: 1, fin: null, modulo: 'qa', ruta: 'repaso', vistos: 0, correctos: 0, ms: 0 }] })
const nbme = (id: string) => startNbmeSession(emptyNbmeState(), {
  id, title: 'Synthetic', refs: [{ id: 'QA', revision: 'r1' }],
}, 1)

describe('durable backup recovery', () => {
  it('retains independent concept sessions from both copies of the same generation', () => {
    const a = copy(study('local'), 2, 'same', 100)
    const b = copy(study('backup'), 3, 'same', 90)
    const recovered = recoverSavedCopies(a, b, combinarEstados).saved!
    expect(recovered.state.sesiones.map(s => s.id).sort()).toEqual(['backup', 'local'])
    expect(recovered.snapshot.revision).toBe(3)
    expect(recovered).toEqual(recoverSavedCopies(b, a, combinarEstados).saved)
  })
  it('retains independent NBME sessions from both copies of the same generation', () => {
    const recovered = recoverSavedCopies(copy(nbme('local'), 2, 'same', 100), copy(nbme('backup'), 3, 'same', 90), mergeNbmeStates).saved!
    expect(Object.keys(recovered.state.sessions).sort()).toEqual(['backup', 'local'])
    expect(recovered.snapshot.revision).toBe(3)
  })
  it('never revives concept history from an older reset generation, even with a later device clock', () => {
    const old = copy(study('before-reset'), 2, 'old', 900)
    const reset = copy(ESTADO_INICIAL, 3, 'new', 100)
    expect(recoverSavedCopies(old, reset, combinarEstados)).toEqual({ saved: reset, unversioned: null })
    expect(recoverSavedCopies(reset, old, combinarEstados)).toEqual({ saved: reset, unversioned: null })
  })
  it('never revives NBME history from an older reset generation, even with a later device clock', () => {
    const old = copy(nbme('before-reset'), 2, 'old', 900)
    const reset = copy(emptyNbmeState(), 3, 'new', 100)
    expect(recoverSavedCopies(old, reset, mergeNbmeStates)).toEqual({ saved: reset, unversioned: null })
    expect(recoverSavedCopies(reset, old, mergeNbmeStates)).toEqual({ saved: reset, unversioned: null })
  })
  it('keeps a sole readable backup and accepts an unsynchronized first session', () => {
    const unsynced = { state: study('offline'), snapshot: null, savedAt: 100 }
    expect(recoverSavedCopies(null, unsynced, combinarEstados).saved).toBe(unsynced)
    expect(recoverSavedCopies(unsynced, null, combinarEstados).saved).toBe(unsynced)
    expect(recoverSavedCopies(null, null, combinarEstados)).toEqual({ saved: null, unversioned: null })
  })
  it.each([50, 100, 900])('separates unversioned concept history with savedAt=%i from a known generation in either storage slot', savedAt => {
    const known = copy(study('known'), 3, 'generation', 100)
    const fresh = { state: study('offline'), snapshot: null, savedAt }
    const merge = vi.fn(combinarEstados)
    for (const [primary, backup] of [[known, fresh], [fresh, known]]) {
      const recovered = recoverSavedCopies(primary, backup, merge)
      expect(recovered.saved).toBe(known)
      expect(recovered.unversioned).toBe(fresh)
    }
    expect(merge).not.toHaveBeenCalled()
  })
  it.each([50, 100, 900])('separates unversioned NBME history with savedAt=%i from a confirmed reset in either storage slot', savedAt => {
    const reset = copy(emptyNbmeState(), 3, 'after-reset', 100)
    const old = { state: nbme('before-reset'), snapshot: null, savedAt }
    const merge = vi.fn(mergeNbmeStates)
    for (const [primary, backup] of [[reset, old], [old, reset]]) {
      const recovered = recoverSavedCopies(primary, backup, merge)
      expect(recovered.saved).toBe(reset)
      expect(recovered.unversioned).toBe(old)
    }
    expect(merge).not.toHaveBeenCalled()
  })
  it('still combines two initial offline copies without assigning a generation', () => {
    const a = { state: study('a'), snapshot: null, savedAt: 100 }
    const b = { state: study('b'), snapshot: null, savedAt: 200 }
    const recovered = recoverSavedCopies(a, b, combinarEstados)
    expect(recovered.saved?.state.sesiones.map(s => s.id).sort()).toEqual(['a', 'b'])
    expect(recovered.saved?.snapshot).toBeNull()
    expect(recovered.unversioned).toBeNull()
    expect(recovered).toEqual(recoverSavedCopies(b, a, combinarEstados))
  })
})
