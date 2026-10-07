// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveNbmeSession, emptyNbmeState, startNbmeSession, submitNbmeAnswer } from './model'
import type { NbmeQuestion } from './types'
const mocks = vi.hoisted(() => ({ context: vi.fn(), mount: vi.fn(), unmount: vi.fn(), activity: vi.fn() }))
vi.mock('./NbmeProvider', () => ({ useNbme: mocks.context }))
vi.mock('./RecuperacionTrasFallo', () => ({ RecuperacionTrasFallo: ({ onSiguiente, onActividad }: any) => {
  useEffect(() => { mocks.mount(); return () => { mocks.unmount() } }, [])
  return <section><button onClick={() => onActividad(true)}>Abrir recuperación sintética</button>
    <button onClick={onSiguiente}>Siguiente tras recuperación sintética</button></section>
} }))
import { NbmePlayer } from './NbmePlayer'
const q: NbmeQuestion = { id: 'q1', revision: 'saved-r1', form: '29', section: 1, item: 1, page: 1,
  status: 'ready', reasons: [], systems: [], disciplines: [], topic: 'Synthetic', objective: 'Synthetic objective',
  figureRequired: false, figures: [], conceptLinks: [], stem: 'Synthetic saved question with no clinical data.',
  options: [{ id: 'A', text: 'Synthetic correct' }, { id: 'B', text: 'Synthetic incorrect' }], answer: 'A',
  explanation: 'Synthetic source explanation', provenance: { sourceFile: 'QA', sourceRecordId: 'q1', notes: [] } }
let host: HTMLDivElement, root: Root, context: any
const render = () => act(async () => root.render(<NbmePlayer recuperarErrores onSalir={vi.fn()} onRecuperacion={mocks.activity} />))
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  const state = submitNbmeAnswer(startNbmeSession(emptyNbmeState(), { id: 'block', title: 'Synthetic block', refs: [{ id: q.id, revision: q.revision }] }, 100), 'block', 0, q, 'B', 100, 200)
  context = { state, currentSession: state.sessions.block, sessionView: deriveNbmeSession(state, 'block'),
    currentQuestion: q, currentFeedback: state.attempts['block:0'], selectedOption: 'B',
    catalog: { questions: [{ ...q, revision: 'new-r2' }] }, questionLoading: false, busy: false, loading: false,
    syncStatus: { state: 'synced' }, pauseSession: vi.fn(), nextQuestion: vi.fn(), loadFigure: vi.fn() }
  mocks.context.mockImplementation(() => context)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await render()
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
describe('identidad del host durante revalidación de una revisión histórica', () => {
  it('mantiene el host y la pausa mixta al retirar temporalmente la pregunta durante carga autorizada', async () => {
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Abrir recuperación sintética')!.click())
    mocks.activity.mockClear()
    context = { ...context, currentQuestion: null, busy: true, questionLoading: true }
    await render()
    expect(mocks.mount).toHaveBeenCalledOnce()
    expect(mocks.unmount).not.toHaveBeenCalled()
    expect(mocks.activity).not.toHaveBeenCalledWith(false)
    context = { ...context, currentQuestion: q, busy: false, questionLoading: false }
    await render()
    const next = [...host.querySelectorAll('button')].find(b => b.textContent === 'Siguiente tras recuperación sintética')!
    await act(async () => next.click())
    expect(context.nextQuestion).toHaveBeenCalledOnce()
    expect(mocks.mount).toHaveBeenCalledOnce()
  })
  it('limpia el host y el indicador mixto cuando cambia la oportunidad', async () => {
    mocks.activity.mockClear()
    context = { ...context, sessionView: { ...context.sessionView, phase: 'question', current: { id: 'q2', revision: 'r1', position: 1 } }, currentFeedback: null, currentQuestion: null }
    await render()
    expect(mocks.unmount).toHaveBeenCalledOnce()
    expect(mocks.activity).toHaveBeenCalledWith(false)
  })
  it('no conserva contenido histórico después de finalizar una carga sin permiso o sin pregunta', async () => {
    context = { ...context, currentQuestion: null, busy: false, questionLoading: false }
    await render()
    expect(mocks.unmount).toHaveBeenCalledOnce()
    expect(host.textContent).not.toContain('Siguiente tras recuperación sintética')
  })
})
