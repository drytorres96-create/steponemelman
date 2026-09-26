import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyNbmeState, deriveNbmeSession, startNbmeSession, submitNbmeAnswer } from './model'
import type { NbmeQuestion } from './types'
import type { useNbme } from './NbmeProvider'

const mock = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock('./NbmeProvider', () => ({ useNbme: mock.context }))
import { NbmeLibrary } from './NbmeLibrary'
import { NbmePlayer } from './NbmePlayer'

const question: NbmeQuestion = {
  id: 'QA-one', revision: 'r1', form: '27', section: 1, item: 1, page: 1,
  systems: ['Endocrino'], disciplines: ['Farmacología'], topic: 'Hidden topic',
  objective: 'Hidden source objective', status: 'ready', reasons: [], figureRequired: false,
  conceptLinks: [{ conceptId: 'QA-concept', relation: 'foundation', confidence: .85, review: 'suggested' }],
  stem: 'Synthetic question without medical content.', options: 'ABCDEFGHI'.split('').map(id => ({ id, text: `Option ${id}` })),
  answer: 'I', explanation: 'Hidden full explanation', figures: [],
  provenance: { sourceFile: 'synthetic.json', sourceRecordId: 'QA-one', notes: [] },
}
let host: HTMLDivElement, root: Root, context: ReturnType<typeof useNbme>
const exit = vi.fn(), study = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const state = emptyNbmeState()
  context = {
    catalog: { schemaVersion: 1, bankVersion: 'r1', total: 1, questions: [question] }, state,
    currentSession: null, sessionView: null, currentQuestion: null, sessionQuestions: [],
    selectedOption: null, currentFeedback: null, filters: state.filters, loading: false, questionLoading: false,
    busy: false, error: null, storageWarning: null, elapsedMs: 0, budgetReached: false,
    syncStatus: { state: 'synced', message: '', lastSyncedAt: 1 },
    startSession: vi.fn().mockResolvedValue(true), selectAnswer: vi.fn(), checkAnswer: vi.fn(), nextQuestion: vi.fn(),
    discardSession: vi.fn().mockReturnValue(true), attemptsInSession: vi.fn().mockReturnValue(0),
    catalogStale: false,
    pauseSession: vi.fn(), resumeSession: vi.fn().mockResolvedValue(true), continueSession: vi.fn(), continueWithoutBudget: vi.fn(),
    setFilters: vi.fn(), syncNow: vi.fn().mockResolvedValue(true), reloadCatalog: vi.fn().mockResolvedValue(undefined),
    retryQuestionLoad: vi.fn().mockResolvedValue(undefined), loadFigure: vi.fn().mockResolvedValue(new Blob()),
  }
  mock.context.mockImplementation(() => context)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)!
const click = async (label: string) => { expect(button(label)).toBeTruthy(); await act(async () => button(label).click()) }
const prepareSession = () => {
  const state = startNbmeSession(emptyNbmeState(), { id: 'QA-session', title: 'Synthetic session', refs: [{ id: question.id, revision: question.revision }] }, 100)
  context = { ...context, state, currentSession: state.sessions['QA-session'], sessionView: deriveNbmeSession(state, 'QA-session'), currentQuestion: question }
}

describe('NBME study interface', () => {
  it('combines system, discipline and form and excludes blocked items from start', async () => {
    context.catalog = { schemaVersion: 1, bankVersion: 'r1', total: 4, questions: [question,
      { ...question, id: 'QA-other-system', systems: ['Cardiovascular'] },
      { ...question, id: 'QA-other-form', form: '28' }, { ...question, id: 'QA-blocked', status: 'blocked' }] }
    context.filters = { ...context.filters, system: 'Endocrino', discipline: 'Farmacología', form: '27' }
    await act(async () => root.render(<NbmeLibrary onStart={exit} />))
    const start = [...host.querySelectorAll('button')].find(item => item.textContent?.startsWith('Comenzar 1'))!
    await act(async () => start.click())
    expect(context.startSession).toHaveBeenCalledExactlyOnceWith([{ id: question.id, revision: question.revision }], expect.any(Object))
    expect(exit).toHaveBeenCalledOnce()
    expect(host.querySelector('details')?.open).toBe(false)
  })

  it('keeps answers, objectives and concept links hidden until submission; supports option I and pause', async () => {
    prepareSession()
    await act(async () => root.render(<NbmePlayer onSalir={exit} onEstudiar={study} />))
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(9)
    expect(host.textContent).not.toContain(question.objective)
    expect(host.textContent).not.toContain(question.explanation)
    expect(host.textContent).not.toContain(question.topic)
    expect(host.textContent).not.toContain('Explorar conceptos relacionados')
    expect(host.textContent).toContain('Correcciones pendientes: 0')
    expect(button('Comprobar respuesta').disabled).toBe(true)
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true })))
    expect(context.selectAnswer).toHaveBeenCalledExactlyOnceWith('I')
    expect(context.checkAnswer).not.toHaveBeenCalled()
    context.selectedOption = 'I'
    await act(async () => root.render(<NbmePlayer onSalir={exit} onEstudiar={study} />))
    await click('Comprobar respuesta')
    expect(context.checkAnswer).toHaveBeenCalledOnce()
    await click('Pausar y guardar')
    expect(context.pauseSession).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledOnce()
  })

  it('shows feedback and suggested concepts only after answering and preserves the NBME session before concept study', async () => {
    prepareSession()
    const source = 'A complete synthetic educational objective. '.repeat(35)
    context.currentQuestion = { ...question, objective: source }
    context.state = submitNbmeAnswer(context.state, 'QA-session', 0, context.currentQuestion, 'A', 10, 200)
    context.sessionView = deriveNbmeSession(context.state, 'QA-session')
    context.currentFeedback = context.sessionView!.attempt
    context.selectedOption = 'A'
    await act(async () => root.render(<NbmePlayer onSalir={exit} onEstudiar={study} />))
    expect(host.textContent).toContain('Correcciones pendientes: 1')
    expect(host.textContent).toContain('Leer fundamento completo')
    // La presentación recorta el espaciado sobrante de la extracción; el texto se conserva íntegro.
    expect([...host.querySelectorAll('details')].some(item => item.textContent?.includes(source.trim()))).toBe(true)
    expect(host.textContent).toContain('Relación sugerida; confirma que corresponde al fundamento.')
    await click('Explorar conceptos relacionados')
    expect(context.pauseSession).toHaveBeenCalledOnce()
    expect(study).toHaveBeenCalledExactlyOnceWith(['QA-concept'])
    expect(context.nextQuestion).not.toHaveBeenCalled()
    expect(Object.keys(context.state.attempts)).toHaveLength(1)
  })

  it('as a session step it leaves counting to the session, says where a miss goes and keeps the keyboard flow', async () => {
    prepareSession()
    context.selectedOption = 'I'
    const onPaso = vi.fn()
    const aviso = 'Vuelve a la caja 1 y aparecerá otra vez dentro de unos pasos.'
    const pintar = () => act(async () => root.render(<NbmePlayer modoPaso avisoFallo={aviso} etiquetaSalida="Volver a Hoy" onSalir={exit} onPasoCompleto={onPaso} />))
    await pintar()
    expect(host.textContent).not.toContain('Correcciones pendientes')
    expect(host.textContent).not.toContain('Primera vuelta')
    expect(host.querySelector('.nbme-session-progress')).toBeNull()
    expect(host.querySelector('#nbme-question-title')?.textContent).toBe('Pregunta NBME')
    // Intro checks the option picked by letter, and the key press is consumed there.
    const intro = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => { document.dispatchEvent(intro) })
    expect(context.checkAnswer).toHaveBeenCalledOnce()
    expect(intro.defaultPrevented).toBe(true)

    context.state = submitNbmeAnswer(context.state, 'QA-session', 0, question, 'A', 10, 200)
    context.sessionView = deriveNbmeSession(context.state, 'QA-session')
    context.currentFeedback = context.sessionView!.attempt
    context.selectedOption = 'A'
    await pintar()
    expect(host.textContent).toContain(aviso)
    expect(host.textContent).not.toContain('volverá durante la práctica')
    expect(document.activeElement?.textContent).toBe('Continuar')
    await click('Continuar')
    expect(onPaso).toHaveBeenCalledOnce()
    expect(context.nextQuestion).not.toHaveBeenCalled()
  })

  it('Enter on a focused button activates that button instead of checking the answer', async () => {
    prepareSession()
    context.selectedOption = 'I'
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    const pausar = button('Pausar y guardar')
    pausar.focus()
    await act(async () => { pausar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    expect(context.checkAnswer).not.toHaveBeenCalled()
  })

  it('prevents grading when a required figure is unavailable and exposes storage problems', async () => {
    prepareSession()
    context.currentQuestion = { ...question, figureRequired: true, figures: [] }
    context.selectedOption = 'I'
    context.storageWarning = 'No se pudo guardar en este dispositivo.'
    await act(async () => root.render(<NbmePlayer onSalir={exit} onEstudiar={study} />))
    expect(button('Comprobar respuesta').disabled).toBe(true)
    expect(host.textContent).toContain('Falta una figura necesaria')
    expect(host.textContent).toContain(context.storageWarning)
    expect(host.textContent).not.toContain('El progreso está guardado en este dispositivo.')
  })

  it('blocks illegible answer choices and their keyboard shortcuts', async () => {
    prepareSession()
    context.currentQuestion = { ...question, options: [{ id: 'A', text: '2.6 rng.\' dL' }, { id: 'B', text: 'Synthetic' }] }
    context.selectedOption = 'A'
    await act(async () => root.render(<NbmePlayer onSalir={exit} onEstudiar={study} />))
    expect(host.textContent).toContain('Pregunta pendiente de revisión')
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(0)
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true })))
    expect(context.selectAnswer).not.toHaveBeenCalled()
    expect(context.checkAnswer).not.toHaveBeenCalled()
  })
})
