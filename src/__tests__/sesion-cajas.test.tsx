// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import type { Concepto } from '../schema/concept'
import type { ItemCaja } from '../lib/cajas'
import type { Intento } from '../srs/tipos'
import { identificarPregunta } from '../screens/sesion'

/**
 * El recorrido de las cajas no reescribe ningún reproductor: monta uno u otro por
 * paso y decide qué viene después. Con dobles se comprueba justo eso: que un fallo
 * vuelve cuatro pasos más adelante y como mucho tres veces, y que una pregunta
 * fallada se retoma en su propia sesión en lugar de abrir otra.
 */
const mock = vi.hoisted(() => {
  const crear = <T,>(valor: T) => ({ valor, oyentes: new Set<() => void>() })
  return {
    app: crear<Record<string, unknown>>({}),
    nbme: crear<{ sessions: Record<string, { id: string; initial: { id: string; revision: string }[]; paused: boolean }>; attempts: Record<string, unknown>; activeSessionId: string | null }>(
      { sessions: {}, attempts: {}, activeSessionId: null }),
    intento: { correct: true } as { correct: boolean },
    reproductor: vi.fn(),
    jugador: vi.fn(),
    startSession: vi.fn(),
    resumeSession: vi.fn(),
    nextQuestion: vi.fn(),
    cargarConceptos: vi.fn(),
  }
})
const emitir = (almacen: { oyentes: Set<() => void> }) => almacen.oyentes.forEach(o => o())

vi.mock('../store/estado', async () => {
  const { useSyncExternalStore } = await import('react')
  const indice = { n_conceptos: 3, modulos: [], documentos: [], glosario: [], cuarentena: 0 }
  const suscribir = (o: () => void) => { mock.app.oyentes.add(o); return () => { mock.app.oyentes.delete(o) } }
  const acciones = {
    indice,
    guardarReanudable: (r: unknown) => { mock.app.valor = { ...mock.app.valor, reanudable: r }; emitir(mock.app) },
  }
  return { useApp: () => ({ ...acciones, estado: useSyncExternalStore(suscribir, () => mock.app.valor) }) }
})
vi.mock('../nbme/NbmeProvider', async () => {
  const { useSyncExternalStore } = await import('react')
  const suscribir = (o: () => void) => { mock.nbme.oyentes.add(o); return () => { mock.nbme.oyentes.delete(o) } }
  const catalog = { questions: [{ id: 'Q1', revision: 'r1', status: 'ready' }] }
  return { useNbme: () => ({
    state: useSyncExternalStore(suscribir, () => mock.nbme.valor), catalog, loading: false, busy: false, error: null,
    sessionView: { attempt: { ...mock.intento, conflict: false } },
    startSession: mock.startSession, resumeSession: mock.resumeSession, nextQuestion: mock.nextQuestion,
  }) }
})
vi.mock('../data/corpus', () => ({ cargarConceptos: mock.cargarConceptos }))
vi.mock('../screens/Reproductor', () => ({ Reproductor: (props: {
  cola: { conceptos: Concepto[]; sessionId: string }; onTramoCompleto: () => void
  modoCaja: { reintento: boolean; avisoFallo: string }
}) => {
  mock.reproductor({ id: props.cola.conceptos[0].concept_id, sessionId: props.cola.sessionId, ...props.modoCaja })
  return <div><p>Reproductor de conceptos {props.cola.conceptos[0].concept_id}</p><button onClick={props.onTramoCompleto}>Terminar paso</button></div>
} }))
vi.mock('../nbme/NbmePlayer', () => ({ NbmePlayer: (props: { onPasoCompleto: () => void }) => {
  mock.jugador()
  return <div><p>Reproductor de preguntas</p><button onClick={props.onPasoCompleto}>Continuar</button></div>
} }))

import { SesionCajas } from '../screens/SesionCajas'

const item = (tipo: ItemCaja['tipo'], id: string): ItemCaja => ({ tipo, id, caja: 2, vence: 0, hecho: false })
const concepto = (id: string) => ({ concept_id: id } as Concepto)

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  mock.app.valor = { ...ESTADO_INICIAL, progreso: {} }
  mock.app.oyentes.clear()
  mock.nbme.valor = { sessions: {}, attempts: {}, activeSessionId: null }
  mock.nbme.oyentes.clear()
  mock.intento.correct = true
  mock.cargarConceptos.mockImplementation(async (ids: string[]) => new Map(ids.map(id => [id, concepto(id)])))
  let n = 0
  mock.startSession.mockImplementation(async (refs: { id: string; revision: string }[]) => {
    const id = `nbme-${++n}`
    mock.nbme.valor = { ...mock.nbme.valor, sessions: { ...mock.nbme.valor.sessions, [id]: { id, initial: refs, paused: false } }, activeSessionId: id }
    emitir(mock.nbme)
    return true
  })
  mock.resumeSession.mockImplementation(async (id: string) => {
    // Como el proveedor real: retomar activa la sesión y le quita la pausa.
    const sesion = mock.nbme.valor.sessions[id]
    mock.nbme.valor = { ...mock.nbme.valor, sessions: { ...mock.nbme.valor.sessions, [id]: { ...sesion, paused: false } }, activeSessionId: id }
    emitir(mock.nbme)
    return true
  })
  mock.nextQuestion.mockImplementation(() => {
    mock.nbme.valor = { ...mock.nbme.valor, activeSessionId: null }
    emitir(mock.nbme)
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  vi.restoreAllMocks()
})

const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(texto))!
const esperar = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() }) }

/** Registra el resultado del paso de concepto que está montado, como haría el reproductor real. */
function responder(resultado: 'correcta' | 'incorrecta') {
  const { id, sessionId } = mock.reproductor.mock.calls.at(-1)![0]
  const progreso = (mock.app.valor.progreso ?? {}) as Record<string, { intentos: Intento[] }>
  const previo = progreso[id]?.intentos ?? []
  const intento = { ts: Date.now() + previo.length, session_id: sessionId, pregunta_id: identificarPregunta(sessionId, 0, id),
    resultado, calificacion: resultado === 'correcta' ? 3 : 1 } as Intento
  mock.app.valor = { ...mock.app.valor, progreso: { ...progreso, [id]: { concept_id: id, intentos: [...previo, intento] } } }
  emitir(mock.app)
}

/** Como `checkAnswer` en el proveedor real: el intento queda registrado y la vista se repinta. */
function responderPregunta(correct: boolean) {
  mock.intento.correct = correct
  mock.nbme.valor = { ...mock.nbme.valor }
  emitir(mock.nbme)
}

async function terminarConcepto(resultado: 'correcta' | 'incorrecta') {
  await act(async () => { responder(resultado) })
  await act(async () => { boton('Terminar paso').click() })
  await esperar()
}

describe('recorrido de las cajas', () => {
  it('un concepto fallado vuelve cuatro pasos después, como corrección', async () => {
    const items = ['A', 'B', 'C', 'D', 'E'].map(id => item('concepto', id))
    await act(async () => { root.render(<SesionCajas items={items} titulo="Cajas de hoy · 25 sep" onSalir={vi.fn()} />) })
    await esperar()
    expect(host.textContent).toContain('Reproductor de conceptos A')
    expect(host.textContent).toContain('Paso 1 de 5')
    expect(mock.reproductor.mock.calls.at(-1)![0]).toMatchObject({ id: 'A', reintento: false })
    expect(mock.reproductor.mock.calls.at(-1)![0].sessionId).toMatch(/:0$/)

    await terminarConcepto('incorrecta')
    expect(host.textContent).toContain('Paso 2 de 6')
    for (const id of ['B', 'C', 'D']) {
      expect(host.textContent).toContain(`Reproductor de conceptos ${id}`)
      await terminarConcepto('correcta')
    }
    // Cuatro pasos después del fallo vuelve A, marcado como reintento y con su propia sesión de paso.
    expect(host.textContent).toContain('Reproductor de conceptos A')
    expect(host.textContent).toContain('vuelve tras un fallo')
    expect(mock.reproductor.mock.calls.at(-1)![0]).toMatchObject({ id: 'A', reintento: true })
    expect(mock.reproductor.mock.calls.at(-1)![0].sessionId).toMatch(/:4$/)
    await terminarConcepto('correcta')
    await terminarConcepto('correcta')
    expect(host.textContent).toContain('Cajas hechas')
    expect(host.textContent).toContain('Un fallo volvió a la caja 1')
  })

  it('tres reinserciones como máximo; a la cuarta se deja para otro día', async () => {
    await act(async () => { root.render(<SesionCajas items={[item('concepto', 'A')]} titulo="Cajas" onSalir={vi.fn()} />) })
    await esperar()
    for (let vez = 0; vez < 4; vez++) {
      expect(host.textContent).toContain('Reproductor de conceptos A')
      expect(mock.reproductor.mock.calls.at(-1)![0].avisoFallo).toContain(vez < 3 ? 'otra vez' : 'otro día')
      await terminarConcepto('incorrecta')
    }
    expect(host.textContent).toContain('Cajas hechas')
    const pasos = mock.reproductor.mock.calls.filter(c => c[0].id === 'A').map(c => String(c[0].sessionId).split(':').at(-1))
    expect(pasos.filter((d, i, lista) => lista.indexOf(d) === i)).toEqual(['0', '1', '2', '3'])
  })

  it('otro día, una pregunta con el reintento pendiente retoma su sesión en lugar de abrir otra', async () => {
    const ayer = Date.now() - 86_400_000
    mock.nbme.valor = {
      sessions: { vieja: { id: 'vieja', title: 'Cajas', initial: [{ id: 'Q1', revision: 'r1' }], paused: true } } as never,
      attempts: { 'vieja:0': { id: 'vieja:0', sessionId: 'vieja', position: 0, questionId: 'Q1', revision: 'r1', optionId: 'B',
        correct: false, submittedAt: ayer, reviewedAt: ayer, durationMs: 1000 } },
      activeSessionId: null,
    }
    await act(async () => { root.render(<SesionCajas items={[item('pregunta', 'Q1')]} titulo="Cajas de hoy · 25 sep" onSalir={vi.fn()} />) })
    await esperar()
    expect(mock.startSession).not.toHaveBeenCalled()
    expect(mock.resumeSession).toHaveBeenCalledExactlyOnceWith('vieja')
    expect(host.textContent).toContain('Reproductor de preguntas')
  })

  it('una pregunta fallada se retoma en su propia sesión NBME, sin abrir otra', async () => {
    const items = [item('pregunta', 'Q1'), item('concepto', 'B'), item('concepto', 'C'), item('concepto', 'D')]
    await act(async () => { root.render(<SesionCajas items={items} titulo="Cajas de hoy · 25 sep" onSalir={vi.fn()} />) })
    await esperar()
    expect(mock.startSession).toHaveBeenCalledExactlyOnceWith([{ id: 'Q1', revision: 'r1' }], { title: 'Cajas', budgetMinutes: null })
    expect(host.textContent).toContain('Reproductor de preguntas')

    await act(async () => { responderPregunta(false) })
    await act(async () => { boton('Continuar').click() })
    await esperar()
    expect(mock.nextQuestion).toHaveBeenCalledOnce()
    for (const id of ['B', 'C', 'D']) {
      expect(host.textContent).toContain(`Reproductor de conceptos ${id}`)
      await terminarConcepto('correcta')
    }
    // La reinserción retoma la misma sesión: su reintento es exactamente esa pregunta.
    expect(host.textContent).toContain('Reproductor de preguntas')
    expect(mock.resumeSession).toHaveBeenCalledExactlyOnceWith('nbme-1')
    expect(mock.startSession).toHaveBeenCalledOnce()
    await act(async () => { responderPregunta(true) })
    await act(async () => { boton('Continuar').click() })
    await esperar()
    expect(host.textContent).toContain('Cajas hechas')
  })
})
