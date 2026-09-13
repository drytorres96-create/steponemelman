// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import type { Concepto } from '../schema/concept'
import type { SesionSemanal } from '../semana/tipos'

/**
 * El orquestador no reescribe ningún reproductor: monta uno u otro según el paso
 * y mueve el cursor. Con dobles y sin red se comprueba justo eso —qué se monta en
 * cada paso y qué se persiste al consumir el último.
 */
const mock = vi.hoisted(() => {
  const estado: { valor: Record<string, unknown>; oyentes: Set<() => void> } = {
    valor: {}, oyentes: new Set(),
  }
  return {
    estado,
    editar(fn: (previo: Record<string, unknown>) => Record<string, unknown>) {
      estado.valor = fn(estado.valor)
      estado.oyentes.forEach(o => o())
    },
    reproductor: vi.fn(),
    jugadorPreguntas: vi.fn(),
    guardarAvance: vi.fn(),
    cargarConceptos: vi.fn(),
    nextQuestion: vi.fn(),
    resumeSession: vi.fn(),
    startSession: vi.fn(),
  }
})

// Las referencias del contexto son estables, como en el proveedor real: un `indice`
// nuevo en cada render reabriría la sesión en bucle.
vi.mock('../store/estado', async () => {
  const { useSyncExternalStore } = await import('react')
  const indice = { n_conceptos: 3, modulos: [], documentos: [], glosario: [], cuarentena: 0 }
  const suscribir = (o: () => void) => { mock.estado.oyentes.add(o); return () => { mock.estado.oyentes.delete(o) } }
  const leer = () => mock.estado.valor
  const acciones = {
    indice,
    guardarReanudable: (r: unknown) => mock.editar(p => ({ ...p, reanudable: r })),
    progresoDe: () => undefined,
    iniciarSesion: () => 'sesion-estudio',
    cerrarSesion: () => {},
  }
  return { useApp: () => ({ ...acciones, estado: useSyncExternalStore(suscribir, leer) }) }
})
const ESTADO_NBME = {
  sessions: { 'nbme-1': { id: 'nbme-1', title: 'Mixta', initial: [{ id: 'NBME27-P0009', revision: 'rev-1' }],
    startedAt: 1, paused: false, controlChangedAt: 1, elapsedMs: 0, budgetMinutes: null, continueUnlimited: false, drafts: {} } },
  attempts: {}, activeSessionId: 'nbme-1',
}
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({
  state: ESTADO_NBME, catalog: null, loading: false, busy: false,
  startSession: mock.startSession, resumeSession: mock.resumeSession, nextQuestion: mock.nextQuestion,
  pauseSession: () => {},
}) }))
vi.mock('../data/corpus', () => ({ cargarConceptos: mock.cargarConceptos }))
vi.mock('../semana/api', () => ({ guardarAvance: mock.guardarAvance }))
vi.mock('../screens/Reproductor', () => ({ Reproductor: (props: { cola: { conceptos: Concepto[] }; indiceInicial: number; onTramoCompleto?: () => void }) => {
  mock.reproductor({ ids: props.cola.conceptos.map(c => c.concept_id), indiceInicial: props.indiceInicial })
  return <div><p>Reproductor de conceptos</p><button onClick={props.onTramoCompleto}>Terminar tramo</button></div>
} }))
vi.mock('../nbme/NbmePlayer', () => ({ NbmePlayer: (props: { modoPaso?: boolean; onPasoCompleto?: () => void }) => {
  mock.jugadorPreguntas({ modoPaso: props.modoPaso })
  return <div><p>Reproductor de preguntas</p><button onClick={props.onPasoCompleto}>Revisar y continuar</button></div>
} }))

import { SesionMixta } from '../semana/SesionMixta'

const concepto = (id: string) => ({ concept_id: id } as Concepto)
const sesion: SesionSemanal = {
  id: 'semana-1', semana: 'S2', semanaInicio: '2026-09-14', dia: 3, orden: 1,
  titulo: 'Farmacología endocrina 1/4', subtitulo: 'Tiroides y suprarrenal',
  guion: [
    { kind: 'concepto', id: 'C1' }, { kind: 'concepto', id: 'C2' }, { kind: 'concepto', id: 'C3' },
    { kind: 'pregunta', id: 'NBME27-P0009', revision: 'rev-1' },
  ],
  presupuestoMin: 30, estado: 'pendiente', cursor: 0, nbmeSessionId: 'nbme-1', completadaEn: null,
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  mock.estado.valor = { ...ESTADO_INICIAL }
  mock.estado.oyentes.clear()
  mock.cargarConceptos.mockResolvedValue(new Map([['C1', concepto('C1')], ['C2', concepto('C2')], ['C3', concepto('C3')]]))
  mock.guardarAvance.mockResolvedValue({ ok: true })
  mock.resumeSession.mockResolvedValue(true)
  mock.startSession.mockResolvedValue(true)
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

describe('orquestador de la sesión mixta', () => {
  it('recorre el guion montando un reproductor u otro y cierra la sesión al final', async () => {
    const salir = vi.fn()
    await act(async () => { root.render(<SesionMixta sesion={sesion} onSalir={salir} />) })

    // Paso 0: el tramo entero de conceptos hasta la siguiente pregunta.
    expect(host.textContent).toContain('Reproductor de conceptos')
    expect(mock.reproductor.mock.calls.at(-1)?.[0]).toEqual({ ids: ['C1', 'C2', 'C3'], indiceInicial: 0 })
    expect(host.textContent).not.toContain('Reproductor de preguntas')
    // La sesión NBME del guion se retoma en lugar de abrirse otra.
    expect(mock.resumeSession).toHaveBeenCalledWith('nbme-1')
    expect(mock.startSession).not.toHaveBeenCalled()

    // Paso 3: terminado el tramo, toma el relevo el reproductor de preguntas, en modo paso.
    await act(async () => { boton('Terminar tramo').click() })
    expect(host.textContent).toContain('Reproductor de preguntas')
    expect(host.textContent).not.toContain('Reproductor de conceptos')
    expect(mock.jugadorPreguntas.mock.calls.at(-1)?.[0]).toEqual({ modoPaso: true })
    expect(mock.guardarAvance).toHaveBeenCalledWith('semana-1', { cursor: 3, estado: 'en_curso' })

    // Último paso consumido: la sesión queda completada y con fecha de cierre.
    await act(async () => { boton('Revisar y continuar').click() })
    expect(mock.nextQuestion).toHaveBeenCalledOnce()
    const ultimo = mock.guardarAvance.mock.calls.at(-1)!
    expect(ultimo[0]).toBe('semana-1')
    expect(ultimo[1]).toMatchObject({ cursor: 4, estado: 'completada' })
    expect(typeof ultimo[1].completadaEn).toBe('string')
    expect(host.textContent).toContain('Sesión terminada')

    await act(async () => { boton('Volver a mis sesiones').click() })
    expect(salir).toHaveBeenCalledOnce()
  })

  it('retoma desde el cursor guardado sin repetir lo ya recorrido', async () => {
    await act(async () => { root.render(<SesionMixta sesion={{ ...sesion, cursor: 2, estado: 'en_curso' }} onSalir={vi.fn()} />) })
    expect(mock.reproductor.mock.calls.at(-1)?.[0]).toEqual({ ids: ['C1', 'C2', 'C3'], indiceInicial: 2 })
  })

  it('una sesión efímera de recuperación no escribe en weekly_sessions', async () => {
    await act(async () => { root.render(<SesionMixta efimera sesion={sesion} onSalir={vi.fn()} />) })
    await act(async () => { boton('Terminar tramo').click() })
    expect(host.textContent).toContain('Reproductor de preguntas')
    expect(mock.guardarAvance).not.toHaveBeenCalled()
  })
})
