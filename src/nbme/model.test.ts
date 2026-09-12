import { describe, expect, it } from 'vitest'
import type { NbmeQuestion, NbmeState } from './types'
import { activateNbmeSession, deriveNbmeSession, emptyNbmeState, mergeNbmeStates, parseNbmeState, questionProgress, reviewNbmeAnswer,
  setNbmeDraft, startNbmeSession, submitNbmeAnswer, summarizeNbmeState, updateNbmeFilters, updateNbmeSession,
  discardNbmeSession, countNbmeSessionAttempts, setNbmeBankVersion, MAX_LAPIDAS } from './model'

const question = (id = 'NBME27-P0001'): NbmeQuestion => ({ id, revision: 'rev1', form: '27', section: 1, item: 1, page: 1,
  systems: ['Renal'], disciplines: ['Fisiología'], topic: 'QA', objective: null, status: 'ready', reasons: [], figureRequired: false,
  conceptLinks: [], stem: 'Synthetic QA only.', options: [{ id: 'A', text: 'Alpha' }, { id: 'B', text: 'Beta' }], answer: 'A',
  explanation: 'Synthetic explanation.', figures: [], provenance: { sourceFile: 'synthetic', sourceRecordId: id, notes: [] } })
const q = question(), q2 = question('NBME27-P0002'), q3 = question('NBME27-P0003')
const start = (qs = [q]) => startNbmeSession(emptyNbmeState(), { id: 'S1', title: 'QA', refs: qs.map(x => ({ id: x.id, revision: x.revision })), budgetMinutes: 10 }, 1000)
const view = (s: NbmeState) => deriveNbmeSession(s, 'S1')!

describe('independent private-question state', () => {
  it('keeps first-attempt scoring unchanged across repeated corrections and exact resume', () => {
    let s = start()
    expect(view(s).pendingErrors).toBe(0)
    s = submitNbmeAnswer(s, 'S1', 0, q, 'B', 900, 2000)
    expect(view(s).phase).toBe('feedback')
    expect(view(s).firstCorrect).toBe(0)
    expect(view(s).pendingErrors).toBe(1)
    s = reviewNbmeAnswer(s, 'S1', 0, 3000)
    expect(view(s).current).toMatchObject({ id: q.id, position: 1, round: 1 })
    s = submitNbmeAnswer(s, 'S1', 1, q, 'B', 800, 4000)
    s = reviewNbmeAnswer(s, 'S1', 1, 5000)
    s = submitNbmeAnswer(s, 'S1', 2, q, 'A', 700, 6000)
    expect(view(s).pendingErrors).toBe(0)
    s = reviewNbmeAnswer(s, 'S1', 2, 7000)
    expect(view(s).phase).toBe('complete')
    expect(view(s).firstCorrect).toBe(0)
    expect(s.activeSessionId).toBeNull()
    expect(summarizeNbmeState(s)).toMatchObject({ seen: 1, firstCorrect: 0, firstEvaluated: 1, totalAttempts: 3, pendingErrors: 0, completedSessions: 1 })
    expect(parseNbmeState(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('does not count unanswered questions or a correct-feedback screen as pending errors', () => {
    let s = start([q, q2, q3])
    expect(view(s).unresolved).toBe(0)
    s = submitNbmeAnswer(s, 'S1', 0, q, 'A', 10, 2000)
    expect(view(s).unresolved).toBe(0)
    s = reviewNbmeAnswer(s, 'S1', 0, 2001)
    s = submitNbmeAnswer(s, 'S1', 1, q2, 'B', 10, 3000)
    expect(view(s).unresolved).toBe(1)
    s = reviewNbmeAnswer(s, 'S1', 1, 3001)
    s = submitNbmeAnswer(s, 'S1', 2, q3, 'A', 10, 4000)
    s = reviewNbmeAnswer(s, 'S1', 2, 4001)
    expect(view(s).current).toMatchObject({ id: q2.id, position: 4, round: 1 })
  })

  it('deduplicates a repeated submit and a repeated Next without changing the answer', () => {
    const base = start()
    const sent = submitNbmeAnswer(base, 'S1', 0, q, 'B', 10, 2000)
    expect(submitNbmeAnswer(sent, 'S1', 0, q, 'A', 20, 3000)).toBe(sent)
    const next = reviewNbmeAnswer(sent, 'S1', 0, 3000)
    expect(reviewNbmeAnswer(next, 'S1', 0, 4000)).toBe(next)
    expect(Object.keys(next.attempts)).toHaveLength(1)
  })

  it('merges an offline answer with a pause and preserves its retry rather than losing a queue', () => {
    const base = start([q, q2])
    const a = reviewNbmeAnswer(submitNbmeAnswer(base, 'S1', 0, q, 'B', 50, 2000), 'S1', 0, 2500)
    const b = updateNbmeSession(base, 'S1', { paused: true, elapsedMs: 5000 }, 3000)
    const merged = mergeNbmeStates(a, b)
    expect(merged).toEqual(mergeNbmeStates(b, a))
    expect(view(merged).queue.map(x => [x.id, x.position])).toEqual([[q.id, 0], [q2.id, 1], [q.id, 2]])
    expect(merged.sessions.S1.paused).toBe(true)
    expect(activateNbmeSession(merged, 'S1', 4000).sessions.S1.paused).toBe(false)
    expect(view(merged).phase).toBe('question')
  })

  it('retains conflicting submissions conservatively, excludes first score and requires a correction', () => {
    const base = start()
    const a = submitNbmeAnswer(base, 'S1', 0, q, 'A', 10, 2000)
    const b = submitNbmeAnswer(base, 'S1', 0, q, 'B', 20, 2100)
    const merged = mergeNbmeStates(a, b)
    expect(merged.attempts['S1:0']).toMatchObject({ optionId: 'A', conflict: true })
    expect(view(merged)).toMatchObject({ firstCorrect: 0, firstConflicts: 1, pendingErrors: 1 })
    expect(summarizeNbmeState(merged)).toMatchObject({ firstEvaluated: 0, firstConflicts: 1 })
    expect(questionProgress(merged, q.id).firstCorrect).toBeNull()
    const next = reviewNbmeAnswer(merged, 'S1', 0, 3000)
    expect(view(next).current?.round).toBe(1)
  })

  it('converges associatively when mutable review/draft fields accompany a conflict', () => {
    const base = start()
    const a = submitNbmeAnswer(base, 'S1', 0, q, 'A', 10, 2000)
    const b = submitNbmeAnswer(base, 'S1', 0, q, 'B', 20, 2000)
    const c = updateNbmeSession(reviewNbmeAnswer(a, 'S1', 0, 4000), 'S1', { paused: true, elapsedMs: 1000 }, 5000)
    const left = mergeNbmeStates(mergeNbmeStates(a, b), c)
    const right = mergeNbmeStates(a, mergeNbmeStates(b, c))
    expect(left).toEqual(right)
    expect(mergeNbmeStates(left, left)).toEqual(left)
  })

  it('keeps retries for different questions identifiable when device histories branch', () => {
    const base = start([q, q2])
    let a = reviewNbmeAnswer(submitNbmeAnswer(base, 'S1', 0, q, 'A', 10, 2000), 'S1', 0, 2001)
    a = reviewNbmeAnswer(submitNbmeAnswer(a, 'S1', 1, q2, 'B', 10, 3000), 'S1', 1, 3001)
    a = submitNbmeAnswer(a, 'S1', 3, q2, 'A', 10, 4000)
    const b = submitNbmeAnswer(base, 'S1', 0, q, 'B', 10, 2000)
    const merged = mergeNbmeStates(a, b)
    expect(merged.attempts['S1:3'].questionId).toBe(q2.id)
    expect(view(merged).current).toMatchObject({ id: q.id, position: 2 })
    expect(parseNbmeState(merged)).toEqual(merged)
  })

  it('pins question revisions, blocks ungradable questions and preserves all nine options', () => {
    const many = { ...q, options: [...'ABCDEFGHI'].map(x => ({ id: x, text: `Option ${x}` })), answer: 'I' }
    expect(submitNbmeAnswer(start(), 'S1', 0, many, 'I', 20, 2000).attempts['S1:0'].correct).toBe(true)
    expect(() => submitNbmeAnswer(start(), 'S1', 0, { ...q, revision: 'rev2' }, 'A', 20, 2000)).toThrow()
    expect(() => submitNbmeAnswer(start(), 'S1', 0, { ...q, status: 'blocked' }, 'A', 20, 2000)).toThrow()
    expect(() => submitNbmeAnswer(start(), 'S1', 0, { ...q, figureRequired: true }, 'A', 20, 2000)).toThrow()
  })

  it('merges elapsed time by maximum, keeps draft and filter edits without touching concepts', () => {
    const base = start()
    const a = updateNbmeFilters(updateNbmeSession(base, 'S1', { elapsedMs: 1000 }), { form: '28' }, 5000)
    const b = setNbmeDraft(updateNbmeSession(base, 'S1', { elapsedMs: 800 }), 'S1', 0, 'B', 6000)
    const merged = mergeNbmeStates(a, b)
    expect(merged.sessions.S1.elapsedMs).toBe(1000)
    expect(merged.sessions.S1.drafts['0'].optionId).toBe('B')
    expect(merged.filters.form).toBe('28')
    expect(merged).not.toHaveProperty('progreso')
  })

  it('rejects malformed, foreign and corrupted history without turning it into a new state', () => {
    const good = submitNbmeAnswer(start(), 'S1', 0, q, 'A', 10, 2000)
    expect(parseNbmeState({ ...good, attempts: { ...good.attempts, 'S1:0': { ...good.attempts['S1:0'], questionId: q2.id } } })).toBeNull()
    expect(parseNbmeState({ ...good, activeSessionId: 'missing' })).toBeNull()
    expect(parseNbmeState({ ...good, sessions: JSON.parse('{"__proto__":{}}') })).toBeNull()
    expect(parseNbmeState({ version: 1, progreso: {}, sesiones: [] })).toBeNull()
  })
})

describe('descartar un bloque que ya no puede terminarse', () => {
  it('borra la sesión y sus intentos, y el estado resultante sigue siendo válido', () => {
    let s = start([q, q2])
    s = submitNbmeAnswer(s, 'S1', 0, q, 'B', 900, 2000)
    s = reviewNbmeAnswer(s, 'S1', 0, 3000)
    expect(countNbmeSessionAttempts(s, 'S1')).toBe(1)

    const limpio = discardNbmeSession(s, 'S1', 9000)
    expect(limpio.sessions.S1).toBeUndefined()
    expect(countNbmeSessionAttempts(limpio, 'S1')).toBe(0)
    expect(Object.keys(limpio.attempts)).toHaveLength(0)
    expect(limpio.activeSessionId).toBeNull()
    // Un intento huérfano invalidaría el estado completo: se comprueba que siga siendo legible.
    expect(parseNbmeState(JSON.parse(JSON.stringify(limpio)))).not.toBeNull()
  })
  it('no toca los intentos de los demás bloques', () => {
    let s = start([q, q2])
    s = submitNbmeAnswer(s, 'S1', 0, q, 'A', 500, 2000)
    s = reviewNbmeAnswer(s, 'S1', 0, 2500)
    s = startNbmeSession(s, { id: 'S2', title: 'Otro', refs: [{ id: q3.id, revision: q3.revision }] }, 3000)
    s = submitNbmeAnswer(s, 'S2', 0, q3, 'A', 400, 4000)
    expect(countNbmeSessionAttempts(s, 'S2')).toBe(1)

    const limpio = discardNbmeSession(s, 'S2', 9000)
    expect(limpio.sessions.S1).toBeDefined()
    expect(countNbmeSessionAttempts(limpio, 'S1')).toBe(1)
    expect(limpio.sessions.S2).toBeUndefined()
    expect(parseNbmeState(JSON.parse(JSON.stringify(limpio)))).not.toBeNull()
  })
  it('descartar un bloque inexistente no cambia nada', () => {
    const s = start()
    expect(discardNbmeSession(s, 'NO-EXISTE')).toBe(s)
  })
})

describe('bankVersion como clave de invalidación', () => {
  it('sella la versión del banco y conserva la identidad del estado si no cambió', () => {
    const s = emptyNbmeState('1.0.0')
    const sellado = setNbmeBankVersion(s, '1.0.0-392d86977641-safety162')
    expect(sellado.bankVersion).toBe('1.0.0-392d86977641-safety162')
    expect(setNbmeBankVersion(sellado, '1.0.0-392d86977641-safety162')).toBe(sellado)
  })
  it('el estado sellado sigue pasando la validación', () => {
    const sellado = setNbmeBankVersion(start(), '1.6.2-corregido')
    expect(parseNbmeState(JSON.parse(JSON.stringify(sellado)))?.bankVersion).toBe('1.6.2-corregido')
  })
})

describe('las lápidas impiden que la unión resucite un bloque descartado', () => {
  it('el bloque descartado no vuelve al mezclar con una copia que todavía lo tiene', () => {
    let remoto = start([q, q2])
    remoto = submitNbmeAnswer(remoto, 'S1', 0, q, 'B', 900, 2000)
    remoto = reviewNbmeAnswer(remoto, 'S1', 0, 3000)
    expect(countNbmeSessionAttempts(remoto, 'S1')).toBe(1)

    // Este es el caso que hacía inútil el botón: descartar y sincronizar contra el remoto vivo.
    const local = discardNbmeSession(remoto, 'S1', 9000)
    const unido = mergeNbmeStates(local, remoto)
    expect(unido.sessions.S1).toBeUndefined()
    expect(countNbmeSessionAttempts(unido, 'S1')).toBe(0)
    expect(unido.activeSessionId).toBeNull()
    expect(unido.discarded.S1).toBe(9000)
    expect(parseNbmeState(JSON.parse(JSON.stringify(unido)))?.sessions.S1).toBeUndefined()
  })
  it('la lápida sobrevive en los dos sentidos de la mezcla', () => {
    const remoto = start([q])
    const local = discardNbmeSession(remoto, 'S1', 9000)
    expect(mergeNbmeStates(remoto, local).sessions.S1).toBeUndefined()
    expect(mergeNbmeStates(local, remoto).sessions.S1).toBeUndefined()
  })
  it('no entierra los bloques que no se descartaron', () => {
    let s = start([q])
    s = startNbmeSession(s, { id: 'S2', title: 'Otro', refs: [{ id: q2.id, revision: q2.revision }] }, 3000)
    s = submitNbmeAnswer(s, 'S2', 0, q2, 'A', 400, 4000)
    const unido = mergeNbmeStates(discardNbmeSession(s, 'S1', 9000), s)
    expect(unido.sessions.S1).toBeUndefined()
    expect(unido.sessions.S2).toBeDefined()
    expect(countNbmeSessionAttempts(unido, 'S2')).toBe(1)
  })
  it('un estado guardado antes de las lápidas se lee sin ellas', () => {
    const antiguo = JSON.parse(JSON.stringify(start([q]))) as Record<string, unknown>
    delete antiguo.discarded
    const leido = parseNbmeState(antiguo)
    expect(leido).not.toBeNull()
    expect(leido!.discarded).toEqual({})
    expect(leido!.sessions.S1).toBeDefined()
  })
  it('poda las lápidas para que no crezcan sin límite', () => {
    let s = emptyNbmeState()
    for (let i = 0; i < MAX_LAPIDAS + 30; i++) {
      s = startNbmeSession(s, { id: `B${i}`, title: 'x', refs: [{ id: q.id, revision: q.revision }] }, 1000 + i)
      s = discardNbmeSession(s, `B${i}`, 1000 + i)
    }
    expect(Object.keys(s.discarded)).toHaveLength(MAX_LAPIDAS)
    expect(s.discarded[`B${MAX_LAPIDAS + 29}`]).toBeDefined()
  })
})
