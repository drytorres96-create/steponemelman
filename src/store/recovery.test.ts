import { describe, expect, it } from 'vitest'
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
    const recovered = recoverSavedCopies(a, b, combinarEstados)!
    expect(recovered.state.sesiones.map(s => s.id).sort()).toEqual(['backup', 'local'])
    expect(recovered.snapshot.revision).toBe(3)
    expect(recovered).toEqual(recoverSavedCopies(b, a, combinarEstados))
  })
  it('retains independent NBME sessions from both copies of the same generation', () => {
    const recovered = recoverSavedCopies(copy(nbme('local'), 2, 'same', 100), copy(nbme('backup'), 3, 'same', 90), mergeNbmeStates)!
    expect(Object.keys(recovered.state.sessions).sort()).toEqual(['backup', 'local'])
    expect(recovered.snapshot.revision).toBe(3)
  })
  it('never revives concept history from an older reset generation, even with a later device clock', () => {
    const old = copy(study('before-reset'), 2, 'old', 900)
    const reset = copy(ESTADO_INICIAL, 3, 'new', 100)
    expect(recoverSavedCopies(old, reset, combinarEstados)).toEqual(reset)
    expect(recoverSavedCopies(reset, old, combinarEstados)).toEqual(reset)
  })
  it('never revives NBME history from an older reset generation, even with a later device clock', () => {
    const old = copy(nbme('before-reset'), 2, 'old', 900)
    const reset = copy(emptyNbmeState(), 3, 'new', 100)
    expect(recoverSavedCopies(old, reset, mergeNbmeStates)).toEqual(reset)
    expect(recoverSavedCopies(reset, old, mergeNbmeStates)).toEqual(reset)
  })
  it('keeps a sole readable backup and accepts an unsynchronized first session', () => {
    const unsynced = { state: study('offline'), snapshot: null, savedAt: 100 }
    expect(recoverSavedCopies(null, unsynced, combinarEstados)).toBe(unsynced)
    expect(recoverSavedCopies(unsynced, null, combinarEstados)).toBe(unsynced)
    expect(recoverSavedCopies(null, null, combinarEstados)).toBeNull()
  })
  it('retains the known generation even when a more recent copy has no remote snapshot', () => {
    const known = copy(study('known'), 3, 'generation', 100)
    const fresh = { state: study('offline'), snapshot: null, savedAt: 900 }
    const recovered = recoverSavedCopies<EstadoApp, typeof known | typeof fresh>(known, fresh, combinarEstados)!
    expect(recovered.snapshot?.generation).toBe('generation')
    expect(recovered.state.sesiones.map(s => s.id).sort()).toEqual(['known', 'offline'])
  })
})
