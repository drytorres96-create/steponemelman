// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ, type Concepto } from '../schema/concept'
import type { NbmeAttempt, NbmeQuestion } from './types'
const mock = vi.hoisted(() => ({ nbme: vi.fn(), app: vi.fn(), load: vi.fn(), next: vi.fn(), activity: vi.fn() }))
vi.mock('./NbmeProvider', () => ({ useNbme: mock.nbme }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.load }))
vi.mock('./RecuperacionNbme', () => ({ RecuperacionNbme: ({ onTerminar, onActividad }: any) => <>
  <button onClick={() => onActividad(true)}>IA sintética</button><button onClick={() => onTerminar('siguiente')}>IA siguiente</button>
</> }))
vi.mock('../screens/Reproductor', () => ({ Reproductor: ({ onSalir, onTramoCompleto, continuacion }: any) => <>
  <h2>Pregunta Melman real</h2><button onClick={onSalir}>Pausar repaso</button>
  <button onClick={() => { continuacion.guardar(null); onTramoCompleto() }}>Terminar repaso sintético</button>
</> }))
import { RecuperacionTrasFallo } from './RecuperacionTrasFallo'
const conceptos = Array.from({ length: 8 }, (_, i) => ConceptoZ.parse({ concept_id: `concept-${i}`, objetivo: `Synthetic objective ${i}`,
  source: { doc: 'QA', doc_title: 'Synthetic material', page: 1, item_id: `item-${i}`, fragment: 'Synthetic source fragment' },
  afirmacion: 'Synthetic claim', respuesta_canonica: 'Synthetic answer', explicacion: 'Synthetic explanation',
  step: 'step1', calidad: { confianza: .9, estado: 'aprobado' }, interaccion: { recomendada: 'opcion_multiple' },
  evaluacion: { pregunta: 'Synthetic question' }, pistas: ['One', 'Two', 'Three'],
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Renal', tema: 'Synthetic', tipo_conocimiento: 'Mecanismo', dificultad: 1 } })) as Concepto[]
const pregunta = { id: 'q', revision: 'r1', status: 'ready', topic: '', objective: '', explanation: '', stem: 'Synthetic question',
  options: [{ id: 'A', text: 'Synthetic answer' }, { id: 'B', text: 'Synthetic incorrect' }], answer: 'A',
  conceptLinks: conceptos.map(c => ({ conceptId: c.concept_id, relation: 'tested', confidence: .9, review: 'reviewed' })) } as NbmeQuestion
const intento = { id: 'block:0', sessionId: 'block', position: 0, questionId: 'q', revision: 'r1', optionId: 'B', correct: false } as NbmeAttempt
let host: HTMLDivElement, root: Root, context: any
const button = (s: string) => [...host.querySelectorAll('button')].find(b => b.textContent === s)!
const click = async (s: string) => { expect(button(s)).toBeTruthy(); await act(async () => button(s).click()) }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear(); vi.clearAllMocks()
  context = { currentSession: { id: 'block' }, sessionView: { phase: 'feedback', current: { position: 0 } },
    currentQuestion: pregunta, currentFeedback: intento, catalog: { questions: [pregunta] },
    pauseSession: vi.fn(), resumeSession: vi.fn().mockResolvedValue(true) }
  mock.nbme.mockImplementation(() => context)
  mock.app.mockReturnValue({ indice: { modulos: [] }, iniciarSesion: vi.fn().mockReturnValue('melman-session') })
  mock.load.mockResolvedValue(conceptos)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<RecuperacionTrasFallo pregunta={pregunta} intento={intento}
    onActividad={mock.activity} onSiguiente={mock.next} />))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
describe('regreso al bloque original tras recuperar un error', () => {
  it('ofrece seis conceptos y permite ampliar sin contar sugerencias como práctica', async () => {
    expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(6)
    await click('Ver más conceptos (2)')
    expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(8)
    expect(context.pauseSession).not.toHaveBeenCalled()
    expect(mock.next).not.toHaveBeenCalled()
  })
  it('pausa el bloque durante Melman y vuelve a la misma oportunidad al terminar', async () => {
    await click('Practicar conceptos seleccionados')
    expect(context.pauseSession).toHaveBeenCalledOnce()
    expect(mock.activity).toHaveBeenCalledWith(true)
    await click('Terminar repaso sintético')
    expect(host.textContent).toContain('Repaso terminado')
    await click('Volver a la pregunta original')
    expect(context.resumeSession).toHaveBeenCalledExactlyOnceWith('block')
    expect(mock.next).not.toHaveBeenCalled()
    expect(mock.activity).toHaveBeenLastCalledWith(false)
  })
  it('avanza solo al elegir siguiente, incluso con doble pulsación', async () => {
    let resolver!: (v: boolean) => void
    context.resumeSession.mockReturnValue(new Promise<boolean>(resolve => { resolver = resolve }))
    await click('Practicar conceptos seleccionados'); await click('Terminar repaso sintético')
    await act(async () => { button('Ir a la siguiente pregunta').click(); button('Ir a la siguiente pregunta').click() })
    await act(async () => resolver(true))
    expect(context.resumeSession).toHaveBeenCalledOnce()
    expect(mock.next).toHaveBeenCalledOnce()
  })
  it('no avanza otra pregunta si cambia el bloque mientras se reanuda', async () => {
    let resolver!: (v: boolean) => void
    context.resumeSession.mockReturnValue(new Promise<boolean>(resolve => { resolver = resolve }))
    await click('IA sintética')
    await click('IA siguiente')
    context = { ...context, currentSession: { id: 'other-block' } }
    await act(async () => { root.render(<RecuperacionTrasFallo pregunta={pregunta} intento={intento} onActividad={mock.activity} onSiguiente={mock.next} />) })
    await act(async () => resolver(true))
    expect(mock.next).not.toHaveBeenCalled()
    expect(host.textContent).toContain('No se pudo retomar el bloque original')
  })
  it('espera al contexto comprometido antes de devolver el control tras una carga histórica', async () => {
    let resolver!: (v: boolean) => void
    context.resumeSession.mockReturnValue(new Promise<boolean>(resolve => { resolver = resolve }))
    await click('IA siguiente')
    context = { ...context, busy: true, questionLoading: true, currentQuestion: null }
    await act(async () => root.render(<RecuperacionTrasFallo pregunta={pregunta} intento={intento} onActividad={mock.activity} onSiguiente={mock.next} />))
    await act(async () => resolver(true))
    expect(mock.next).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Retomando el bloque original')
    context = { ...context, busy: false, questionLoading: false, currentQuestion: pregunta }
    await act(async () => root.render(<RecuperacionTrasFallo pregunta={pregunta} intento={intento} onActividad={mock.activity} onSiguiente={mock.next} />))
    expect(mock.next).toHaveBeenCalledOnce()
  })
  it('conserva la recuperación y no crea otro bloque si falla reanudar', async () => {
    context.resumeSession.mockResolvedValue(false)
    await click('Practicar conceptos seleccionados'); await click('Pausar repaso')
    expect(host.textContent).toContain('No se pudo retomar el bloque original')
    expect(mock.next).not.toHaveBeenCalled()
  })
})
