import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NbmeQuestion } from './types'
import type { NbmeSnapshot } from './sync'

const memory = vi.hoisted(() => ({ db: new Map<string, unknown>(), row: null as unknown,
  read: vi.fn<(key: string) => Promise<unknown>>(), rpc: vi.fn(), from: vi.fn(), session: vi.fn() }))
vi.mock('../store/db', () => ({ leer: (key: string) => memory.read(key),
  escribir: async (key: string, value: unknown) => { memory.db.set(key, structuredClone(value)) },
  borrar: async (keys: string[]) => { for (const key of keys) memory.db.delete(key) } }))
vi.mock('../lib/supabase', () => ({ supabase: { from: memory.from, rpc: memory.rpc, auth: { getSession: memory.session } } }))
import { NbmeProvider, useNbme } from './NbmeProvider'
import { NbmePlayer } from './NbmePlayer'

const question: NbmeQuestion = { id: 'NBME27-P0001', revision: 'synthetic-v1', form: '27',
  section: 1, item: 1, page: 1, systems: ['Endocrino'], disciplines: ['Fisiología'], topic: 'Synthetic',
  objective: 'Synthetic objective', status: 'ready', reasons: [], figureRequired: false, conceptLinks: [],
  stem: 'Synthetic question for testing only.', options: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }],
  answer: 'B', explanation: 'Synthetic explanation.', figures: [],
  provenance: { sourceFile: 'test', sourceRecordId: 'test', notes: [] } }
const questions = [question, { ...question, id: 'NBME28-P0001', form: '28' as const }]
let host: HTMLDivElement, root: Root | null, current: ReturnType<typeof useNbme>, denied: boolean, withdrawn: boolean
let revised: boolean, assetFailure: 401 | 403 | 409 | 422 | null, replacedAsset: boolean
function requestedRefs() {
  const fetchMock = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }
  return fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/questions'))
    .flatMap(([, init]) => JSON.parse(String(init?.body)).refs as { id: string; revision: string }[])
}
function Harness() { current = useNbme(); return <NbmePlayer onSalir={() => undefined} onEstudiar={() => undefined} /> }
async function mount() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root!.render(<NbmeProvider userId="test-owner"><Harness /></NbmeProvider>) })
  await vi.waitFor(() => expect(current.loading).toBe(false))
}
async function unmount() { await act(async () => root?.unmount()); root = null; host.remove() }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  denied = false; withdrawn = false; revised = false; assetFailure = null; replacedAsset = false
  memory.db.clear(); memory.row = null; localStorage.clear(); vi.clearAllMocks()
  memory.read.mockImplementation(async key => memory.db.get(key) ?? null)
  memory.session.mockResolvedValue({ data: { session: { user: { id: 'test-owner' }, access_token: 'synthetic-token' } }, error: null })
  memory.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: structuredClone(memory.row), error: null }) }) }) }))
  memory.rpc.mockImplementation(async (_name, args) => {
    const previous = memory.row as NbmeSnapshot | null
    if (args.p_expected_revision !== (previous?.revision ?? 0)) return { data: { ok: false, kind: 'conflict', row: previous }, error: null }
    memory.row = { user_id: 'test-owner', state: structuredClone(args.p_state), revision: (previous?.revision ?? 0) + 1,
      generation: 'synthetic-generation', updated_at: new Date().toISOString() }
    return { data: { ok: true, kind: 'saved', row: structuredClone(memory.row) }, error: null }
  })
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (denied) return Response.json({}, { status: 403 })
    if (path.endsWith('/catalog')) return Response.json({ schemaVersion: 1, bankVersion: 'test-bank', total: questions.length,
      questions: questions.map(q => ({ ...q,
        ...(withdrawn && q.id === question.id ? { status: 'blocked' } : {}),
        ...(revised && q.id === question.id ? { revision: 'synthetic-v2' } : {}) })) })
    if (assetFailure !== null) return Response.json({}, { status: assetFailure })
    const refs = JSON.parse(String(init?.body)).refs as { id: string }[]
    return Response.json({ questions: refs.map(ref => {
      const q = questions.find(q => q.id === ref.id)
      return replacedAsset && q?.id === question.id ? { ...q, revision: 'synthetic-v2', answer: 'A' } : q
    }) })
  }))
})
afterEach(async () => { if (root) await unmount(); vi.unstubAllGlobals() })

it('sets aside a corrupt local copy and recovers the questions from the account instead of blocking the bank', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([question])).toBe(true) })
  await act(async () => { expect(await current.syncNow()).toBe(true) })
  const id = current.currentSession!.id
  await unmount()
  const broken = { userId: 'test-owner', state: { broken: true }, snapshot: null, savedAt: 1 }
  memory.db.set('nbme-state:test-owner', broken)
  localStorage.setItem('step1-backup:nbme-state:test-owner', '{ broken')
  await mount()
  await vi.waitFor(() => expect(current.syncStatus.state).toBe('synced'))
  expect(current.error).toBeNull()
  expect(current.localNotice).toContain('estaba dañada')
  expect(current.state.sessions[id]).toBeTruthy()
  const setAside = [...memory.db.keys()].find(key => key.startsWith('apartada:nbme-state:test-owner:'))
  expect(memory.db.get(setAside!)).toMatchObject({ copia: broken, respaldo: '{ broken' })
  // The fresh copy that replaced it is valid again.
  expect(memory.db.get('nbme-state:test-owner')).toMatchObject({ userId: 'test-owner', state: { sessions: { [id]: expect.anything() } } })
  await act(async () => current.dismissLocalNotice())
  expect(current.localNotice).toBeNull()
})

it('resumes a saved correction and selected draft on a second device without changing the first result', async () => {
  await mount()
  await act(async () => { expect(await current.startSession(questions)).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('A'))
  await act(async () => current.checkAnswer())
  expect(current.currentFeedback?.correct).toBe(false)
  await act(async () => current.nextQuestion())
  expect(current.currentQuestion?.id).toBe(questions[1].id)
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.checkAnswer())
  await act(async () => current.nextQuestion())
  expect(current.currentQuestion?.id).toBe(question.id)
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.pauseSession())
  await act(async () => { expect(await current.syncNow(), JSON.stringify({ status: current.syncStatus, row: memory.row })).toBe(true) })
  await unmount()
  memory.db.clear(); localStorage.clear()
  await mount()
  await act(async () => { expect(await current.resumeSession(id)).toBe(true) })
  expect(current.selectedOption).toBe('B')
  expect(host.querySelector<HTMLInputElement>('input[value="B"]')?.checked).toBe(true)
  await act(async () => current.checkAnswer())
  await act(async () => current.nextQuestion())
  expect(current.sessionView?.phase).toBe('complete')
  expect(current.sessionView?.firstCorrect).toBe(1)
  expect(current.sessionView?.firstAnswered).toBe(2)
  expect(current.sessionView?.pendingErrors).toBe(0)
  await act(async () => { expect(await current.syncNow()).toBe(true) })
  expect(Object.keys((memory.row as NbmeSnapshot).state.attempts)).toHaveLength(3)
  expect(memory.from.mock.calls.every(([table]) => table === 'nbme_state')).toBe(true)
  expect(memory.rpc.mock.calls.every(([name]) => name === 'sync_nbme_state')).toBe(true)
})

it('reuses a catalog fetched moments ago only when asked, and never once it is ten minutes old', async () => {
  await mount()
  await vi.waitFor(() => expect(current.catalog).not.toBeNull())
  const fetchMock = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }
  const catalogFetches = () => fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/catalog')).length
  const initial = catalogFetches()
  expect(initial).toBe(1)
  // A box question right after the catalog arrived does not download ~180 KB again.
  await act(async () => { expect(await current.startSession([question], { reuseRecentCatalog: true })).toBe(true) })
  expect(catalogFetches()).toBe(initial)
  // An ordinary start still refreshes it: that is the guard against a bank updated in between.
  await act(async () => { expect(await current.startSession([questions[1]])).toBe(true) })
  expect(catalogFetches()).toBe(initial + 1)
  // Ten minutes later it is no longer recent, and a box question refreshes it too.
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60_000 + 1)
  try {
    await act(async () => { expect(await current.startSession([question], { reuseRecentCatalog: true })).toBe(true) })
    expect(catalogFetches()).toBe(initial + 2)
  } finally { clock.mockRestore() }
})

it('checks authorization before resuming cached material and preserves progress after denial', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([question])).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.pauseSession())
  denied = true
  await act(async () => { expect(await current.resumeSession(id)).toBe(false) })
  expect(current.catalog).toBeNull()
  expect(current.currentQuestion).toBeNull()
  expect(current.state.sessions[id]).toBeDefined()
  await act(async () => current.checkAnswer())
  expect(Object.keys(current.state.attempts)).toHaveLength(0)
  expect(current.error).toContain('acceso al banco')
})

it('preserves a selected draft and past results when the current catalog withdraws a cached question', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([questions[1], question])).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.checkAnswer())
  await act(async () => current.nextQuestion())
  await act(async () => current.selectAnswer('A'))
  const attempts = structuredClone(current.state.attempts)
  const drafts = structuredClone(current.state.sessions[id].drafts)
  withdrawn = true
  await act(async () => current.reloadCatalog())
  await act(async () => current.checkAnswer())
  expect(current.state.attempts).toEqual(attempts)
  expect(current.state.sessions[id].drafts).toEqual(drafts)
  expect(current.currentQuestion?.id).toBe(question.id)
  expect(host.textContent).toContain('Pregunta pendiente de revisión')
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(0)
  expect(current.error).toContain('revisión de la fuente')
})

it('resumes the same saved block against its exact ready revision after the catalog publishes a newer one', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([question], { title: 'Bloque guardado', budgetMinutes: 10 })).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.pauseSession())
  const saved = structuredClone(current.state.sessions[id])
  revised = true
  vi.mocked(globalThis.fetch).mockClear()
  await act(async () => { expect(await current.resumeSession(id)).toBe(true) })
  expect(requestedRefs()).toEqual([{ id: question.id, revision: question.revision }])
  expect(Object.keys(current.state.sessions)).toEqual([id])
  expect(current.currentSession).toMatchObject({ id, title: saved.title, initial: saved.initial,
    startedAt: saved.startedAt, budgetMinutes: 10, drafts: saved.drafts, paused: false })
  expect(current.currentSession!.elapsedMs).toBeGreaterThanOrEqual(saved.elapsedMs)
  expect(current.currentQuestion).toEqual(question)
  expect(current.selectedOption).toBe('B')
  expect(current.state.attempts).toEqual({})
  expect(current.error).toBeNull()
})

it.each(['corrected', 'withdrawn'] as const)('continues remaining work on another device without validating or loading an already finished %s question', async (change) => {
  await mount()
  await act(async () => { expect(await current.startSession(questions)).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.checkAnswer())
  await act(async () => current.nextQuestion())
  await act(async () => current.selectAnswer('A'))
  await act(async () => current.pauseSession())
  const attempts = structuredClone(current.state.attempts)
  const drafts = structuredClone(current.state.sessions[id].drafts)
  await act(async () => { expect(await current.syncNow()).toBe(true) })
  await unmount()
  memory.db.clear(); localStorage.clear()
  revised = change === 'corrected'; withdrawn = change === 'withdrawn'
  vi.mocked(globalThis.fetch).mockClear()
  await mount()
  await act(async () => { await current.syncNow() })
  expect(current.state.sessions[id]).toBeDefined()
  await act(async () => { expect(await current.resumeSession(id)).toBe(true) })
  expect(requestedRefs()).toEqual([{ id: questions[1].id, revision: questions[1].revision }])
  expect(current.currentSession!.id).toBe(id)
  expect(current.sessionView).toMatchObject({ phase: 'question', index: 1, firstAnswered: 1, firstCorrect: 1 })
  expect(current.state.attempts).toEqual(attempts)
  expect(current.currentSession!.drafts).toEqual(drafts)
  expect(current.selectedOption).toBe('A')
  expect(current.error).toBeNull()
})

it('retains the original feedback, selected letter and retry after revalidating a historical revision', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([question])).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('A'))
  await act(async () => current.checkAnswer())
  await act(async () => current.pauseSession())
  const feedback = structuredClone(current.state.attempts[`${id}:0`])
  revised = true
  await act(async () => { expect(await current.resumeSession(id)).toBe(true) })
  expect(current.sessionView?.phase).toBe('feedback')
  expect(current.currentFeedback).toEqual(feedback)
  expect(current.selectedOption).toBe('A')
  expect(current.currentQuestion?.revision).toBe(question.revision)
  await act(async () => current.nextQuestion())
  const reviewedFirst = structuredClone(current.state.attempts[`${id}:0`])
  expect(current.sessionView?.current).toMatchObject({ position: 1, round: 1, revision: question.revision })
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.pauseSession())
  const drafts = structuredClone(current.state.sessions[id].drafts)
  vi.mocked(globalThis.fetch).mockClear()
  await act(async () => { expect(await current.resumeSession(id)).toBe(true) })
  expect(requestedRefs()).toEqual([{ id: question.id, revision: question.revision }])
  expect(current.currentSession!.id).toBe(id)
  expect(current.currentSession!.drafts).toEqual(drafts)
  expect(current.selectedOption).toBe('B')
  expect(current.state.attempts[`${id}:0`]).toEqual(reviewedFirst)
  await act(async () => current.checkAnswer())
  await act(async () => current.nextQuestion())
  expect(current.sessionView).toMatchObject({ phase: 'complete', firstAnswered: 1, firstCorrect: 0, retryCount: 1 })
  expect(Object.keys(current.state.attempts)).toHaveLength(2)
  expect(current.state.attempts[`${id}:0`]).toEqual(reviewedFirst)
  expect(current.state.attempts[`${id}:1`]).toMatchObject({ questionId: question.id, revision: question.revision,
    optionId: 'B', correct: true })
})

it.each([401, 403, 409, 422] as const)('revalidates cached historical content by network and preserves drafts and history after an asset response %i', async (status) => {
  await mount()
  await act(async () => { expect(await current.startSession([questions[1], question])).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.checkAnswer())
  await act(async () => current.nextQuestion())
  await act(async () => current.selectAnswer('A'))
  await act(async () => current.pauseSession())
  const attempts = structuredClone(current.state.attempts)
  const saved = structuredClone(current.state.sessions[id])
  revised = true; assetFailure = status
  vi.mocked(globalThis.fetch).mockClear()
  await act(async () => { expect(await current.resumeSession(id)).toBe(false) })
  expect(requestedRefs()).toEqual([{ id: question.id, revision: question.revision }])
  expect(Object.keys(current.state.sessions)).toEqual([id])
  expect(current.state.sessions[id]).toEqual(saved)
  expect(current.state.attempts).toEqual(attempts)
  expect(current.state.discarded).toEqual({})
  expect(current.error).not.toBeNull()
  await act(async () => current.checkAnswer())
  expect(current.state.attempts).toEqual(attempts)
  if (status === 401 || status === 403) {
    expect(current.catalog).toBeNull()
    expect(current.currentQuestion).toBeNull()
  }
})

it('rejects a server substitution of the saved revision without rewriting the block or answer letters', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([question])).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.pauseSession())
  const saved = structuredClone(current.state.sessions[id])
  revised = true; replacedAsset = true
  vi.mocked(globalThis.fetch).mockClear()
  await act(async () => { expect(await current.resumeSession(id)).toBe(false) })
  expect(requestedRefs()).toEqual([{ id: question.id, revision: question.revision }])
  expect(current.state.sessions[id]).toEqual(saved)
  expect(current.state.attempts).toEqual({})
  expect(current.error).not.toBeNull()
})

it('keeps a changed historical revision paused offline until its exact asset can be revalidated', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([question])).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.pauseSession())
  const saved = structuredClone(current.state.sessions[id])
  revised = true
  await act(async () => current.reloadCatalog())
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  try {
    vi.mocked(globalThis.fetch).mockClear()
    await act(async () => { expect(await current.resumeSession(id)).toBe(false) })
    expect(requestedRefs()).toEqual([])
    expect(current.state.sessions[id]).toEqual(saved)
    expect(current.state.attempts).toEqual({})
    expect(current.error).not.toBeNull()
  } finally { online.mockRestore() }
})

it('still resumes an unchanged exact cached revision offline with the saved option', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([question])).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => current.pauseSession())
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  try {
    vi.mocked(globalThis.fetch).mockClear()
    await act(async () => { expect(await current.resumeSession(id)).toBe(true) })
    expect(requestedRefs()).toEqual([])
    expect(current.currentSession!.id).toBe(id)
    expect(current.selectedOption).toBe('B')
  } finally { online.mockRestore() }
})

it('waits for the initial catalog before automatically loading an unpaused block restored on a device without cache', async () => {
  await mount()
  await act(async () => { expect(await current.startSession([question])).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => { expect(await current.syncNow()).toBe(true) })
  const initial = structuredClone(current.state.sessions[id].initial)
  const drafts = structuredClone(current.state.sessions[id].drafts)
  await unmount()
  memory.db.clear(); localStorage.clear()
  const originalFetch = vi.mocked(globalThis.fetch).getMockImplementation()!
  let releaseCatalog = () => undefined as void
  const catalogPending = new Promise<void>(resolve => { releaseCatalog = resolve })
  vi.mocked(globalThis.fetch).mockClear()
  vi.mocked(globalThis.fetch).mockImplementation(async (...args) => {
    if (String(args[0]).endsWith('/catalog')) await catalogPending
    return originalFetch(...args)
  })
  await mount()
  expect(current.state.activeSessionId).toBe(id)
  expect(current.state.sessions[id].paused).toBe(false)
  expect(current.catalog).toBeNull()
  expect(current.currentQuestion).toBeNull()
  expect(requestedRefs()).toEqual([])
  expect(current.error).toBeNull()
  await act(async () => { releaseCatalog() })
  await vi.waitFor(() => expect(current.currentQuestion).toEqual(question))
  expect(requestedRefs()).toEqual([{ id: question.id, revision: question.revision }])
  expect(current.currentSession!.id).toBe(id)
  expect(current.currentSession!.initial).toEqual(initial)
  expect(current.currentSession!.drafts).toEqual(drafts)
  expect(current.selectedOption).toBe('B')
  expect(current.error).toBeNull()
  await act(async () => current.checkAnswer())
  expect(current.currentFeedback).toMatchObject({ questionId: question.id, revision: question.revision,
    optionId: 'B', correct: true })
})

it('does not let a concurrent old cache load replace the required network validation of a historical revision', async () => {
  await mount()
  await act(async () => { expect(await current.startSession(questions)).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => { expect(await current.syncNow()).toBe(true) })
  const initial = structuredClone(current.state.sessions[id].initial)
  const drafts = structuredClone(current.state.sessions[id].drafts)
  await unmount()
  const cacheKey = (q: NbmeQuestion) => `nbme-question:test-owner:${JSON.stringify([q.id, q.revision])}`
  let releaseFirst = () => undefined as void
  let releaseSecond = () => undefined as void
  const firstPending = new Promise<void>(resolve => { releaseFirst = resolve })
  const secondPending = new Promise<void>(resolve => { releaseSecond = resolve })
  let firstReads = 0, secondReads = 0
  memory.read.mockImplementation(async key => {
    if (key === cacheKey(question)) { firstReads++; await firstPending }
    if (key === cacheKey(questions[1])) { secondReads++; await secondPending }
    return memory.db.get(key) ?? null
  })
  vi.mocked(globalThis.fetch).mockClear()
  await mount()
  await vi.waitFor(() => expect(firstReads).toBe(1))
  expect(secondReads).toBe(1)
  revised = true; assetFailure = 422
  let resumed: Promise<boolean> | null = null
  await act(async () => { resumed = current.resumeSession(id) })
  await vi.waitFor(() => expect(secondReads).toBe(2))
  // The previous catalog's cache read inserts r1 while resume is still waiting
  // for another ref. That insertion must not satisfy forced validation.
  await act(async () => { releaseFirst() })
  await act(async () => { releaseSecond(); expect(await resumed).toBe(false) })
  expect(requestedRefs()).toContainEqual({ id: question.id, revision: question.revision })
  expect(current.currentQuestion).toBeNull()
  expect(current.currentSession!.id).toBe(id)
  expect(current.currentSession!.initial).toEqual(initial)
  expect(current.currentSession!.drafts).toEqual(drafts)
  expect(current.error).not.toBeNull()
  await act(async () => current.checkAnswer())
  expect(current.state.attempts).toEqual({})
  expect(current.state.discarded).toEqual({})
})

it('ignores an obsolete cache read that finishes after the exact historical asset was rejected', async () => {
  await mount()
  await act(async () => { expect(await current.startSession(questions)).toBe(true) })
  const id = current.currentSession!.id
  await act(async () => current.selectAnswer('B'))
  await act(async () => { expect(await current.syncNow()).toBe(true) })
  const initial = structuredClone(current.state.sessions[id].initial)
  const drafts = structuredClone(current.state.sessions[id].drafts)
  await unmount()
  let release = () => undefined as void
  const pending = new Promise<void>(resolve => { release = resolve })
  const oldKey = `nbme-question:test-owner:${JSON.stringify([question.id, question.revision])}`
  let oldReads = 0
  memory.read.mockImplementation(async key => {
    if (key === oldKey) { oldReads++; await pending }
    return memory.db.get(key) ?? null
  })
  await mount()
  await vi.waitFor(() => expect(oldReads).toBe(1))
  revised = true; assetFailure = 422
  await act(async () => { expect(await current.resumeSession(id)).toBe(false) })
  expect(current.currentQuestion).toBeNull()
  const failure = current.error
  expect(failure).not.toBeNull()
  await act(async () => { release() })
  expect(current.currentQuestion).toBeNull()
  expect(current.error).toBe(failure)
  expect(current.currentSession!.id).toBe(id)
  expect(current.currentSession!.initial).toEqual(initial)
  expect(current.currentSession!.drafts).toEqual(drafts)
  await act(async () => current.checkAnswer())
  expect(current.state.attempts).toEqual({})
  expect(current.state.discarded).toEqual({})
})
