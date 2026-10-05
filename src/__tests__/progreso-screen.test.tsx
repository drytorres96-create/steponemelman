// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Concepto, Indice } from '../schema/concept'
import { ESTADO_INICIAL } from '../store/model'

const mock = vi.hoisted(() => ({ app: vi.fn(), cargarTodo: vi.fn(), cifras: vi.fn(), meta: vi.fn(), adherencia: vi.fn(), calendario: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargarTodo }))
vi.mock('../screens/ProgresoCifras', () => ({ BandaDeCifras: (props: unknown) => mock.cifras(props) }))
vi.mock('../screens/ProgresoMeta', () => ({ ProgresoMeta: (props: unknown) => mock.meta(props) }))
vi.mock('../screens/ProgresoAdherencia', () => ({ BandaAdherencia: () => mock.adherencia() }))
vi.mock('../screens/CalendarioSemana', () => ({ CalendarioSemana: () => mock.calendario() }))
import { ResumenProgreso } from '../screens/Progreso'

type PropsIndicadores = { conceptIds: string[]; conceptos?: Concepto[]; cargarDetalleConceptos?: () => Promise<Concepto[]> }
let root: Root, host: HTMLDivElement, indice: Indice | null
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  indice = { modulos: [{ module_id: 'M1', sesiones: [{ conceptos: ['A', 'B'] }, { conceptos: ['B', 'C'] }] },
    { module_id: 'M2', sesiones: [{ conceptos: ['C', 'D'] }] }] } as Indice
  mock.app.mockImplementation(() => ({ indice, estado: ESTADO_INICIAL }))
  mock.cargarTodo.mockResolvedValue([])
  mock.cifras.mockImplementation((props: PropsIndicadores) => <button onClick={() => { void props.cargarDetalleConceptos?.() }}>Ver evidencia sintética</button>)
  mock.meta.mockImplementation(() => <p>Meta sintética</p>)
  mock.adherencia.mockImplementation(() => <p data-testid="adherencia">Adherencia sintética</p>)
  mock.calendario.mockImplementation(() => <p data-testid="calendario">Calendario sintético</p>)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const render = async () => { await act(async () => root.render(<ResumenProgreso />)) }
async function toggle(open: boolean) {
  await act(async () => {
    const details = host.querySelector('details')!; details.open = open; details.dispatchEvent(new Event('toggle'))
  })
}

describe('entrada a progreso sin descargar material ni montar el plan cerrado', () => {
  it('pasa IDs únicos del índice a los indicadores y carga contenido sólo a petición del detalle', async () => {
    await render()
    expect(mock.cargarTodo).not.toHaveBeenCalled()
    expect(mock.adherencia).not.toHaveBeenCalled()
    expect(mock.calendario).not.toHaveBeenCalled()
    expect([...host.querySelectorAll('.premium-progress-card h2')].map(h => h.textContent)).toEqual(['Trabajo realizado', 'Dominio demostrado', 'Mantenimiento al día'])
    const cifras = mock.cifras.mock.calls[0][0] as PropsIndicadores
    const meta = mock.meta.mock.calls[0][0] as PropsIndicadores
    expect(cifras.conceptIds).toEqual(['A', 'B', 'C', 'D'])
    expect(meta.conceptIds).toBe(cifras.conceptIds)
    expect(cifras.conceptos).toBeUndefined()
    expect(meta.conceptos).toBeUndefined()
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(mock.cargarTodo).toHaveBeenCalledExactlyOnceWith(indice!.modulos)
  })

  it('monta adherencia y calendario al abrir Mi semana y mi plan, y los desmonta al cerrar', async () => {
    await render()
    expect(host.querySelector('summary')?.textContent).toBe('Mi semana y mi plan')
    expect(host.querySelector('[data-testid="adherencia"]')).toBeNull()
    expect(host.querySelector('[data-testid="calendario"]')).toBeNull()
    await toggle(true)
    expect(mock.adherencia).toHaveBeenCalled()
    expect(mock.calendario).toHaveBeenCalled()
    expect(host.querySelector('[data-testid="adherencia"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="calendario"]')).not.toBeNull()
    expect(mock.cargarTodo).not.toHaveBeenCalled()
    await toggle(false)
    expect(host.querySelector('[data-testid="adherencia"]')).toBeNull()
    expect(host.querySelector('[data-testid="calendario"]')).toBeNull()
  })

  it('espera el índice sin descargar el corpus y actualiza IDs y cargador al llegar', async () => {
    indice = null
    await render()
    expect(mock.cifras.mock.calls.at(-1)![0].conceptIds).toEqual([])
    expect(mock.cargarTodo).not.toHaveBeenCalled()
    indice = { modulos: [{ module_id: 'nuevo', sesiones: [{ conceptos: ['Y', 'Y', 'Z'] }] }] } as Indice
    await render()
    expect(mock.meta.mock.calls.at(-1)![0].conceptIds).toEqual(['Y', 'Z'])
    expect(mock.cargarTodo).not.toHaveBeenCalled()
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(mock.cargarTodo).toHaveBeenCalledExactlyOnceWith(indice.modulos)
  })
})
