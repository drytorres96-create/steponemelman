import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NbmeQuestion } from './types'
import type { NbmeSnapshot } from './sync'

const memory = vi.hoisted(() => ({ db: new Map<string, unknown>(), row: null as unknown,
  rpc: vi.fn(), from: vi.fn(), session: vi.fn() }))
vi.mock('../store/db', () => ({ leer: async (key: string) => memory.db.get(key) ?? null,
  escribir: async (key: string, value: unknown) => { memory.db.set(key, structuredClone(value)) } }))
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
let host: HTMLDivElement, root: Root | null, current: ReturnType<typeof useNbme>, denied: boolean
function Harness() { current = useNbme(); return <NbmePlayer onSalir={() => undefined} onEstudiar={() => undefined} /> }
async function mount() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root!.render(<NbmeProvider userId="test-owner"><Harness /></NbmeProvider>) })
  await vi.waitFor(() => expect(current.loading).toBe(false))
}
async function unmount() { await act(async () => root?.unmount()); root = null; host.remove() }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  denied = false; memory.db.clear(); memory.row = null; localStorage.clear(); vi.clearAllMocks()
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
    if (path.endsWith('/catalog')) return Response.json({ schemaVersion: 1, bankVersion: 'test-bank', total: questions.length, questions })
    const refs = JSON.parse(String(init?.body)).refs as { id: string }[]
    return Response.json({ questions: refs.map(ref => questions.find(q => q.id === ref.id)) })
  }))
})
afterEach(async () => { if (root) await unmount(); vi.unstubAllGlobals() })

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
