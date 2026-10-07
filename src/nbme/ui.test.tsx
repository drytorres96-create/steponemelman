import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyNbmeState, deriveNbmeSession, reviewNbmeAnswer, startNbmeSession, submitNbmeAnswer } from './model'
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
    busy: false, error: null, storageWarning: null, localNotice: null, dismissLocalNotice: vi.fn(), elapsedMs: 0, budgetReached: false,
    syncStatus: { state: 'synced', message: '', lastSyncedAt: 1 },
    startSession: vi.fn().mockResolvedValue(true), selectAnswer: vi.fn(), checkAnswer: vi.fn(), nextQuestion: vi.fn(),
    discardSession: vi.fn().mockReturnValue(true), attemptsInSession: vi.fn().mockReturnValue(0),
    archiveSession: vi.fn().mockReturnValue(true), reviewSessionFailures: vi.fn().mockResolvedValue([]),
    catalogStale: false,
    pauseSession: vi.fn(), resumeSession: vi.fn().mockResolvedValue(true), continueSession: vi.fn(), continueWithoutBudget: vi.fn(),
    setFilters: vi.fn(), syncNow: vi.fn().mockResolvedValue(true), reloadCatalog: vi.fn().mockResolvedValue(undefined),
    retryQuestionLoad: vi.fn().mockResolvedValue(undefined), loadFigure: vi.fn().mockResolvedValue(new Blob()),
  }
  mock.context.mockImplementation(() => context)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)!
const click = async (label: string) => { expect(button(label)).toBeTruthy(); await act(async () => button(label).click()) }
const prepareSession = () => {
  const state = startNbmeSession(emptyNbmeState(), { id: 'QA-session', title: 'Synthetic session', refs: [{ id: question.id, revision: question.revision }] }, 100)
  context = { ...context, state, currentSession: state.sessions['QA-session'], sessionView: deriveNbmeSession(state, 'QA-session'), currentQuestion: question }
}

it('offers per-session actions, explains preserved progress and shows completion with first-round colors', async () => {
  prepareSession()
  context.state = submitNbmeAnswer(context.state, 'QA-session', 0, question, 'A', 10, 200)
  context.state = reviewNbmeAnswer(context.state, 'QA-session', 0, 201)
  context.state = submitNbmeAnswer(context.state, 'QA-session', 1, question, 'I', 10, 300)
  context.state = reviewNbmeAnswer(context.state, 'QA-session', 1, 301)
  await act(async () => root.render(<NbmeLibrary onStart={exit} />))
  expect(host.textContent).toContain('Completada')
  const bar = host.querySelector('[role="img"]')!
  expect(bar.getAttribute('aria-label')).toContain('0 correctas (0%), 1 equivocadas (100%), 0 sin respuesta válida (0%)')
  expect(button('Continuar').disabled).toBe(true)
  await click('Borrar sesión')
  expect(host.textContent).toContain('Tus respuestas, aciertos, errores y el progreso de conceptos se conservan.')
  expect(context.discardSession).not.toHaveBeenCalled()
  await click('Sí, borrar sesión')
  expect(context.archiveSession).toHaveBeenCalledExactlyOnceWith('QA-session')
  expect(context.discardSession).not.toHaveBeenCalled()
})

it('opens a failed-question review without starting a new block and returns to the saved sessions', async () => {
  prepareSession()
  context.state = submitNbmeAnswer(context.state, 'QA-session', 0, question, 'A', 10, 200)
  const original = context.state.attempts['QA-session:0']
  vi.mocked(context.reviewSessionFailures).mockResolvedValue([{ question, attempt: original }])
  await act(async () => root.render(<NbmeLibrary onStart={exit} />))
  await click('Ver solo falladas (1)')
  expect(context.reviewSessionFailures).toHaveBeenCalledWith('QA-session', expect.any(AbortSignal))
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Tu respuesta original')
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Respuesta correcta')
  expect(context.startSession).not.toHaveBeenCalled()
  expect(context.nextQuestion).not.toHaveBeenCalled()
  await click('Volver a mis sesiones')
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(context.state.attempts['QA-session:0']).toEqual(original)
})

function mockFigures() {
  const observers: IntersectionObserverCallback[] = []
  const images: Array<{ onload: (() => void) | null; onerror: (() => void) | null }> = []
  let n = 0
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => `blob:synthetic-${++n}`)
    static revokeObjectURL = vi.fn()
  })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { observers.push(callback) }
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = 1200
    src = ''
    constructor() { images.push(this) }
  })
  return {
    show: () => observers.at(-1)!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    load: () => images.at(-1)!.onload?.(), fail: () => images.at(-1)!.onerror?.(),
  }
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
    expect(host.textContent).not.toContain('NBME 27 · sección 1 · pregunta 1 · página 1')
    expect(host.querySelector('.nbme-option-state')).toBeNull()
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
    expect(host.textContent).toContain('Fuente: NBME 27 · sección 1 · pregunta 1 · página 1')
    expect(host.querySelector('.nbme-option.correct')?.textContent).toContain('Respuesta correcta')
    // El fundamento importado se conserva íntegro y se lee sin abrir controles.
    const objetivo = [...host.querySelectorAll('.nbme-feedback .nbme-source-text')].find(item => item.textContent?.includes(source.trim()))!
    expect(objetivo).toBeTruthy()
    expect(objetivo.closest('details')).toBeNull()
    expect(host.textContent).toContain('Objetivo del aprendizaje')
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

  it('a new question stays new in feedback and expands NBME without revealing the source beforehand', async () => {
    prepareSession()
    context.currentQuestion = { ...question, distractorExplanations: { A: 'Synthetic reason why A does not answer the question.' } }
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(host.textContent).toContain('National Board of Medical Examiners (NBME)')
    expect(host.textContent).toContain('Pregunta nueva aquí')
    expect(host.textContent).not.toContain(context.currentQuestion.objective)
    expect(host.textContent).not.toContain(context.currentQuestion.explanation)
    expect(host.textContent).not.toContain(context.currentQuestion.distractorExplanations!.A)
    context.state = submitNbmeAnswer(context.state, 'QA-session', 0, context.currentQuestion, 'I', 10, 200)
    context.sessionView = deriveNbmeSession(context.state, 'QA-session')
    context.currentFeedback = context.sessionView!.attempt
    context.selectedOption = 'I'
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(host.textContent).toContain('Pregunta nueva aquí')
    expect(host.textContent).not.toContain('Pregunta ya practicada aquí')
    expect(host.textContent).toContain(question.objective)
    expect(host.textContent).toContain(question.explanation)
  })

  it('a question practiced in an earlier block stays marked as practiced after submission', async () => {
    prepareSession()
    context.state = startNbmeSession(context.state, { id: 'QA-previous', title: 'Earlier block', refs: [{ id: question.id, revision: question.revision }] }, 1)
    context.state = submitNbmeAnswer(context.state, 'QA-previous', 0, question, 'I', 10, 20)
    context.state = reviewNbmeAnswer(context.state, 'QA-previous', 0, 30)
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(host.textContent).toContain('Pregunta ya practicada aquí')
    context.state = submitNbmeAnswer(context.state, 'QA-session', 0, question, 'I', 10, 200)
    context.sessionView = deriveNbmeSession(context.state, 'QA-session')
    context.currentFeedback = context.sessionView!.attempt
    context.selectedOption = 'I'
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(host.textContent).toContain('Pregunta ya practicada aquí')
  })

  it('later practice does not relabel feedback from the original new presentation', async () => {
    prepareSession()
    context.state = submitNbmeAnswer(context.state, 'QA-session', 0, question, 'I', 10, 200)
    context.state = startNbmeSession(context.state, { id: 'QA-later', title: 'Later block', refs: [{ id: question.id, revision: question.revision }] }, 300)
    context.state = submitNbmeAnswer(context.state, 'QA-later', 0, question, 'I', 10, 400)
    context.sessionView = deriveNbmeSession(context.state, 'QA-session')
    context.currentFeedback = context.sessionView!.attempt
    context.selectedOption = 'I'
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(host.textContent).toContain('Pregunta nueva aquí')
    expect(host.textContent).not.toContain('Pregunta ya practicada aquí')
  })

  it('a retry is marked as correction after explanation and preserves the initial score', async () => {
    prepareSession()
    context.state = submitNbmeAnswer(context.state, 'QA-session', 0, question, 'A', 10, 200)
    context.state = reviewNbmeAnswer(context.state, 'QA-session', 0, 201)
    context.sessionView = deriveNbmeSession(context.state, 'QA-session')
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(host.textContent).toContain('Pregunta ya practicada aquí')
    expect(host.textContent).toContain('Corrección tras ver la explicación')
    expect(host.textContent).not.toContain(question.explanation)
    context.state = submitNbmeAnswer(context.state, 'QA-session', 1, question, 'I', 10, 300)
    context.sessionView = deriveNbmeSession(context.state, 'QA-session')
    context.currentFeedback = context.sessionView!.attempt
    context.selectedOption = 'I'
    const original = context.state.attempts['QA-session:0']
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(host.textContent).toContain('Esta corrección tuvo la explicación previa. Se registra aparte de la primera vuelta.')
    expect(context.sessionView!.firstCorrect).toBe(0)
    expect(context.sessionView!.retryCount).toBe(1)
    expect(context.state.attempts['QA-session:0']).toBe(original)
    expect(context.state.attempts['QA-session:1'].correct).toBe(true)
  })

  it('shows the chosen distractor explanation immediately and preserves letters and complete source text', async () => {
    prepareSession()
    const source = 'A complete synthetic explanation. '.repeat(40)
    context.currentQuestion = { ...question, explanation: source, distractorExplanations: {
      A: 'Synthetic reason A is incorrect.', B: 'Synthetic reason B is incorrect.',
    } }
    const options = context.currentQuestion.options
    context.state = submitNbmeAnswer(context.state, 'QA-session', 0, context.currentQuestion, 'A', 10, 200)
    context.sessionView = deriveNbmeSession(context.state, 'QA-session')
    context.currentFeedback = context.sessionView!.attempt
    context.selectedOption = 'A'
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    const visible = [...host.querySelectorAll('.nbme-feedback .nbme-source-text')].filter(item => !item.closest('details'))
    expect(visible.some(item => item.textContent?.includes(source.trim()))).toBe(true)
    expect(visible.some(item => item.textContent?.includes('Synthetic reason A is incorrect.'))).toBe(true)
    expect(visible.some(item => item.textContent?.includes('Synthetic reason B is incorrect.'))).toBe(false)
    expect(host.textContent).toContain('Por qué tu opción no responde')
    expect(host.querySelector('.nbme-feedback details')?.textContent).toContain('Synthetic reason B is incorrect.')
    expect(host.querySelector('.nbme-feedback details')?.textContent).not.toContain('Synthetic reason A is incorrect.')
    expect(context.currentQuestion.options).toBe(options)
    expect([...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map(input => input.value)).toEqual('ABCDEFGHI'.split(''))
    expect(context.state.attempts['QA-session:0'].optionId).toBe('A')
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

  it('defers the download until the viewport and blocks grading until image decoding finishes', async () => {
    const figures = mockFigures()
    prepareSession()
    context.currentQuestion = { ...question, figureRequired: true, figures: [{ assetId: 'synthetic', alt: 'Synthetic figure' }] }
    context.selectedOption = 'I'
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(context.loadFigure).not.toHaveBeenCalled()
    expect(button('Comprobar respuesta').disabled).toBe(true)
    await act(async () => figures.show())
    expect(context.loadFigure).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('Cargando figura')
    expect(button('Comprobar respuesta').disabled).toBe(true)
    await act(async () => figures.load())
    expect(button('Comprobar respuesta').disabled).toBe(false)
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:synthetic-1')
    await act(async () => root.render(<div />))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-1')
  })

  it('a decode error stays blocked, revokes its URL and retries without changing the answer', async () => {
    const figures = mockFigures()
    prepareSession()
    context.currentQuestion = { ...question, figureRequired: true, figures: [{ assetId: 'synthetic', alt: 'Synthetic figure' }] }
    context.selectedOption = 'I'
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    await act(async () => figures.show())
    await act(async () => figures.fail())
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No se pudo cargar la figura')
    expect(button('Comprobar respuesta').disabled).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-1')
    await click('Reintentar figura')
    await act(async () => figures.show())
    await act(async () => figures.load())
    expect(context.loadFigure).toHaveBeenCalledTimes(2)
    expect(button('Comprobar respuesta').disabled).toBe(false)
    expect(context.selectedOption).toBe('I')
  })

  it('aborts a pending download on exit and never publishes its late result', async () => {
    const figures = mockFigures()
    prepareSession()
    context.currentQuestion = { ...question, figureRequired: true, figures: [{ assetId: 'synthetic', alt: 'Synthetic figure' }] }
    let resolve: (blob: Blob) => void = () => {}
    context.loadFigure = vi.fn((_id, _signal) => new Promise<Blob>(done => { resolve = done }))
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    await act(async () => figures.show())
    const signal = vi.mocked(context.loadFigure).mock.calls[0][1]!
    await act(async () => root.render(<div />))
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(new Blob(['synthetic'])))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(host.querySelector('img')).toBeNull()
  })

  it('a new figure revision invalidates the old URLs and blocks grading until its own decode completes', async () => {
    const figures = mockFigures()
    prepareSession()
    context.currentQuestion = { ...question, figureRequired: true, figures: [{ assetId: 'synthetic', alt: 'Synthetic figure' }] }
    context.selectedOption = 'I'
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    await act(async () => figures.show())
    await act(async () => figures.load())
    expect(button('Comprobar respuesta').disabled).toBe(false)
    await click('Ampliar figura')
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()
    context.currentQuestion = { ...context.currentQuestion, revision: 'r2' }
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-1')
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(button('Comprobar respuesta').disabled).toBe(true)
    await act(async () => figures.show())
    await act(async () => figures.load())
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:synthetic-2')
    expect(button('Comprobar respuesta').disabled).toBe(false)
  })

  it('without IntersectionObserver it loads immediately and aborts decoding with one URL revocation on exit', async () => {
    const figures = mockFigures()
    vi.stubGlobal('IntersectionObserver', undefined)
    prepareSession()
    context.currentQuestion = { ...question, figureRequired: true, figures: [{ assetId: 'synthetic', alt: 'Synthetic figure' }] }
    await act(async () => root.render(<NbmePlayer onSalir={exit} />))
    expect(context.loadFigure).toHaveBeenCalledOnce()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    const signal = vi.mocked(context.loadFigure).mock.calls[0][1]!
    await act(async () => root.render(<div />))
    expect(signal.aborted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:synthetic-1')
    await act(async () => figures.load())
    expect(host.querySelector('img')).toBeNull()
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
