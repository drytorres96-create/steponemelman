import { describe, expect, it } from 'vitest'
import { emptyNbmeState, startNbmeSession, submitNbmeAnswer, reviewNbmeAnswer, deriveNbmeSession } from './model'
import { NbmeSyncEngine, parseNbmeSnapshot, stableNbmeJson, type NbmeSnapshot, type NbmeSyncTransport } from './sync'
import type { NbmeQuestion, NbmeState } from './types'

const question: NbmeQuestion = { id: 'test-question', revision: 'r1', form: '27', section: 1, item: 1, page: 1,
  systems: [], disciplines: [], topic: 'Synthetic fixture', objective: null, status: 'ready', reasons: [],
  figureRequired: false, conceptLinks: [], stem: 'Synthetic nonmedical question',
  options: [{ id: 'A', text: 'Option one' }, { id: 'B', text: 'Option two' }], answer: 'A', explanation: null,
  figures: [], provenance: { sourceFile: 'fixture', sourceRecordId: 'fixture', notes: [] } }
function session(id: string, now = 1): NbmeState {
  return startNbmeSession(emptyNbmeState(), { id, title: id, refs: [{ id: question.id, revision: question.revision }] }, now)
}
function row(state: NbmeState, revision = 1, generation = 'generation-1'): NbmeSnapshot {
  return { user_id: 'owner', state, revision, generation, updated_at: '2026-09-11T00:00:00Z' }
}
function memoryTransport(initial: NbmeSnapshot | null = null) {
  let remote = initial
  let saves = 0
  const transport: NbmeSyncTransport = {
    load: async () => remote,
    save: async ({ state, expectedRevision, generation }) => {
      saves++
      if (remote && remote.generation !== generation) return { ok: false, kind: generation ? 'reset' : 'conflict', row: remote }
      if (expectedRevision !== (remote?.revision ?? 0)) return { ok: false, kind: 'conflict', row: remote }
      remote = row(state, (remote?.revision ?? 0) + 1)
      return { ok: true, kind: 'saved', row: remote }
    },
  }
  return { transport, current: () => remote, saveCount: () => saves, replace: (next: NbmeSnapshot | null) => { remote = next } }
}
describe('Independent NBME synchronization', () => {
  it('retains sessions and answers from two offline devices after compare-and-swap conflict', async () => {
    const server = memoryTransport()
    let a = submitNbmeAnswer(session('session-a'), 'session-a', 0, question, 'A', 10, 2)
    let b = submitNbmeAnswer(session('session-b', 3), 'session-b', 0, question, 'B', 20, 4)
    const one = new NbmeSyncEngine(server.transport, { getLocal: () => a, setLocal: next => { a = next } })
    const two = new NbmeSyncEngine(server.transport, { getLocal: () => b, setLocal: next => { b = next } })
    await one.flush()
    await two.flush()
    await one.fetchAndMerge()
    expect(Object.keys(server.current()!.state.sessions)).toEqual(['session-a', 'session-b'])
    expect(Object.keys(a.attempts)).toHaveLength(2)
    expect(stableNbmeJson(a)).toBe(stableNbmeJson(b))
  })
  it('preserves an answer made during an in-flight write', async () => {
    let local = session('session-a')
    const server = memoryTransport()
    let release!: () => void
    let started!: () => void
    const begun = new Promise<void>(resolve => { started = resolve })
    const wait = new Promise<void>(resolve => { release = resolve })
    let first = true
    const engine = new NbmeSyncEngine({ ...server.transport, save: async input => {
      if (first) { first = false; started(); await wait }
      return server.transport.save(input)
    } }, { getLocal: () => local, setLocal: next => { local = next } })
    const pending = engine.flush()
    await begun
    local = submitNbmeAnswer(local, 'session-a', 0, question, 'B', 10, 5)
    release()
    await pending
    expect(server.saveCount()).toBe(2)
    expect(server.current()!.state.attempts['session-a:0'].optionId).toBe('B')
  })
  it('retains conflicting same-opportunity answers without scoring either as first-pass correct', async () => {
    const initial = session('shared-session')
    let a = reviewNbmeAnswer(submitNbmeAnswer(initial, 'shared-session', 0, question, 'A', 10, 2), 'shared-session', 0, 3)
    let b = submitNbmeAnswer(initial, 'shared-session', 0, question, 'B', 10, 4)
    const server = memoryTransport()
    await new NbmeSyncEngine(server.transport, { getLocal: () => a, setLocal: next => { a = next } }).flush()
    await new NbmeSyncEngine(server.transport, { getLocal: () => b, setLocal: next => { b = next } }).flush()
    const view = deriveNbmeSession(server.current()!.state, 'shared-session')!
    expect(view.firstCorrect).toBe(0)
    expect(view.firstConflicts).toBe(1)
    expect(view.phase).toBe('question')
    expect(view.current!.round).toBe(1)
  })
  it('does not recreate a deleted remote row using an old cached snapshot', async () => {
    const initial = row(session('session-a'))
    const server = memoryTransport(null)
    let local = initial.state
    const engine = new NbmeSyncEngine(server.transport, { getLocal: () => local, setLocal: next => { local = next } }, initial)
    await expect(engine.fetchAndMerge()).rejects.toThrow('ya no existe')
    expect(server.saveCount()).toBe(0)
  })
  it('adopts a new generation without bringing old sessions back', async () => {
    const initial = row(session('old-session'))
    const server = memoryTransport(row(emptyNbmeState(), 2, 'generation-2'))
    let local = initial.state
    const engine = new NbmeSyncEngine(server.transport, { getLocal: () => local, setLocal: next => { local = next } }, initial)
    await engine.fetchAndMerge()
    await engine.flush()
    expect(Object.keys(local.sessions)).toHaveLength(0)
    expect(server.saveCount()).toBe(0)
  })
  it('rejects malformed cloud states and deduplicates concurrent flush calls', async () => {
    expect(parseNbmeSnapshot({ ...row(emptyNbmeState()), revision: -1 })).toBeNull()
    expect(parseNbmeSnapshot({ ...row(emptyNbmeState()), state: { version: 99 } })).toBeNull()
    let local = session('session-a')
    const server = memoryTransport()
    const engine = new NbmeSyncEngine(server.transport, { getLocal: () => local, setLocal: next => { local = next } })
    const first = engine.flush()
    expect(engine.flush()).toBe(first)
    await first
    expect(server.saveCount()).toBe(1)
  })
})
