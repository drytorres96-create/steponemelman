// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Concepto, Indice } from '../schema/concept'
import { ESTADO_INICIAL, reconstruirProgreso } from '../store/model'
import type { Intento } from '../srs/tipos'

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
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })
const render = async () => { await act(async () => root.render(<ResumenProgreso />)) }
async function toggle(open: boolean) {
  await act(async () => {
    const details = host.querySelector('details')!; details.open = open; details.dispatchEvent(new Event('toggle'))
  })
}

describe('entrada a progreso sin descargar material ni montar el plan cerrado', () => {
  it('actualiza el mantenimiento al vencer con la pantalla abierta y conserva dominio e historial', async () => {
    vi.useFakeTimers()
    const ahora = Date.parse('2026-10-07T12:00:00-04:00')
    vi.setSystemTime(ahora)
    const intentos: Intento[] = [5, 3, 0].map((d, n) => ({ attempt_id: `sintetico-${n}`, session_id: `sesion-${n}`, ts: ahora - d * 86_400_000,
      calificacion: 3, resultado: 'correcta', interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
      pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false, ms: 1000, tipo_error: 'ninguno', confianza_declarada: null }))
    const p = { ...reconstruirProgreso('A', intentos, ESTADO_INICIAL.criterios), proxima: ahora + 30_000 }
    const estado = { ...ESTADO_INICIAL, progreso: { A: p } }
    const anterior = structuredClone(estado)
    mock.app.mockImplementation(() => ({ indice, estado }))
    await render()
    const tarjeta = (nombre: string) => [...host.querySelectorAll('article')].find(a => a.querySelector('h2')?.textContent === nombre)!
    expect(tarjeta('Mantenimiento al día').textContent).toContain('1 / 1')
    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    expect(tarjeta('Mantenimiento al día').textContent).toContain('0 / 1')
    expect(tarjeta('Mantenimiento al día').textContent).toContain('1 pendientes de repaso')
    expect(tarjeta('Dominio demostrado').querySelector('strong')?.textContent).toBe('1')
    expect(estado).toEqual(anterior)
  })

  it('pasa IDs únicos del índice a los indicadores y carga contenido sólo a petición del detalle', async () => {
    await render()
    expect(mock.cargarTodo).not.toHaveBeenCalled()
    expect(mock.adherencia).not.toHaveBeenCalled()
    expect(mock.calendario).not.toHaveBeenCalled()
    expect([...host.querySelectorAll('.premium-progress-card h2')].map(h => h.textContent)).toEqual(['Conceptos vistos', 'Dominio demostrado', 'Mantenimiento al día'])
    const vistos = host.querySelector<HTMLProgressElement>('progress[aria-label="Progreso de conceptos vistos"]')!
    expect(vistos.value).toBe(0)
    expect(vistos.max).toBe(4)
    expect(host.textContent).toContain('0 con práctica registrada.')
    expect(host.textContent).not.toContain('Abrir un concepto cuenta como visto')
    expect(host.textContent).not.toContain('Cumplen tus criterios de evidencia')
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
