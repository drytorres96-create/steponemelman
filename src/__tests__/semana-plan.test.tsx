// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import type { PlanCheckpoint, PlanSemana } from '../plan/tipos'
import type { SesionSemanal } from '../semana/tipos'

/**
 * La portada es el plan de la semana. Lo que se comprueba aquí es lo que decide
 * si Yoel empieza o no: un solo día abierto, el descanso sin casilla, la sesión
 * preparada dentro de su día, y una marca que la base no aceptó deshecha en
 * pantalla. Y que sin plan la pantalla siga sirviendo.
 */

const mock = vi.hoisted(() => ({
  sesiones: vi.fn(), plan: vi.fn(), marcar: vi.fn(),
}))
vi.mock('../store/estado', () => ({ useApp: () => ({ estado: { ...ESTADO_INICIAL } }) }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'x'.repeat(30) } }) }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({ state: { attempts: {} } }) }))
vi.mock('../semana/api', () => ({ cargarSesionesSemana: mock.sesiones }))
vi.mock('../plan/api', () => ({
  cargarPlanSemana: mock.plan,
  marcarCheckpoint: mock.marcar,
  PlanEscrituraError: class extends Error {},
}))

import { Semana } from '../screens/Semana'

const cp = (extra: Partial<PlanCheckpoint>): PlanCheckpoint =>
  ({ id: 1, idx: 1, dia: 1, kind: 'qbank', label: 'AMBOSS', done: false, doneAt: null, ...extra })

const SESION: SesionSemanal = {
  id: 'sesion-1', semana: 'S2', semanaInicio: '2026-09-14', dia: 1, orden: 1,
  titulo: 'Farmacología endocrina 1/4 · Tiroides y suprarrenal', subtitulo: 'Antitiroideos y Wolff-Chaikoff.',
  guion: [{ kind: 'concepto', id: 'CPT-1' }, { kind: 'concepto', id: 'CPT-2' }],
  presupuestoMin: 30, estado: 'pendiente', cursor: 0, nbmeSessionId: null, completadaEn: null,
}

const PLAN: PlanSemana = {
  eventoId: 'S2', titulo: 'S2 · 14–19 sep · Reproductivo (1/2) + banco de Psiquiatría',
  inicio: '2026-09-14', fin: '2026-09-19', nota: 'Esta semana va así porque el banco de Psiquiatría cierra.',
  checkpoints: [
    cp({ id: 11, idx: 1, dia: 1, kind: 'qbank', label: 'AMBOSS Psiquiatría · 14 preguntas', done: true }),
    cp({ id: 64, idx: 2, dia: 1, kind: 'tarjetas',
      label: 'StepOneMelman · Sesión de la semana 1/4 · Farmacología endocrina · Tiroides y suprarrenal' }),
    cp({ id: 68, idx: 3, dia: 1, kind: 'podcast', label: 'Audio 1 · Antipsicóticos' }),
    cp({ id: 17, idx: 4, dia: 2, kind: 'qbank', label: 'AMBOSS Embarazo · 13 preguntas' }),
    cp({ id: 19, idx: 5, dia: 4, kind: 'descanso', label: 'Descanso' }),
  ],
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  vi.useFakeTimers()
  // Lunes 14 de septiembre de 2026: el primer día de la semana del plan.
  vi.setSystemTime(new Date(2026, 8, 14, 5, 30))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  mock.sesiones.mockResolvedValue([SESION])
  mock.plan.mockResolvedValue(PLAN)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const pintar = async (onAbrir = vi.fn()) => {
  await act(async () => {
    root.render(<Semana onAbrir={onAbrir} onRecuperacion={vi.fn()} onBiblioteca={vi.fn()} />)
  })
  await act(async () => { await Promise.resolve() })
  return onAbrir
}
const dias = () => [...host.querySelectorAll<HTMLButtonElement>('.plan-dia-titulo')]
const diaDe = (texto: string) => dias().find(b => b.textContent?.includes(texto))!
const seccionDe = (texto: string) => diaDe(texto).closest('.plan-dia')!
const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(texto))!
const botonExacto = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === texto)!

describe('la portada muestra el plan de la semana', () => {
  it('abre el día de hoy y deja el resto plegado', async () => {
    await pintar()
    expect(host.textContent).toContain('S2 · 14–19 sep')
    const abiertos = dias().filter(b => b.getAttribute('aria-expanded') === 'true')
    expect(abiertos).toHaveLength(1)
    expect(abiertos[0].textContent).toContain('HOY · lunes')
    expect(dias()).toHaveLength(3)
    // Sólo el día abierto pinta sus filas: la pantalla llena es lo que frena.
    expect(host.querySelectorAll('.plan-lista')).toHaveLength(1)
    expect(host.textContent).toContain('AMBOSS Psiquiatría · 14 preguntas')
    expect(host.textContent).not.toContain('AMBOSS Embarazo')
  })

  it('cuenta lo hecho sin meter el descanso en el total', async () => {
    await pintar()
    // Cuatro tareas y un descanso; una hecha.
    expect(host.textContent).toContain('1 de 4 hechos')
    expect(seccionDe('martes').textContent).toContain('1 pendiente')
    expect(seccionDe('jueves').textContent).toContain('Descanso')
  })

  it('el día de descanso no lleva casilla ni cronómetro', async () => {
    await pintar()
    await act(async () => { diaDe('jueves').click() })
    const jueves = seccionDe('jueves')
    expect(jueves.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    expect(jueves.querySelector('.plan-descanso')?.textContent).toContain('Hoy no se estudia')
    // Abrir otro día cierra el de hoy: nunca hay dos abiertos a la vez.
    expect(dias().filter(b => b.getAttribute('aria-expanded') === 'true')).toHaveLength(1)
  })

  it('la sesión preparada es una fila más de su día, con su tarjeta dentro', async () => {
    const onAbrir = await pintar()
    // No hay sección aparte de sesiones: la tarjeta vive dentro de la fila del checkpoint.
    expect(host.querySelectorAll('.semana-grid')).toHaveLength(0)
    const fila = host.querySelector('.plan-fila-sesion')!
    expect(fila.textContent).toContain('Antitiroideos y Wolff-Chaikoff.')
    expect(fila.textContent).toContain('2 conceptos · ~30 min')
    await act(async () => { boton('Empezar sesión').click() })
    expect(onAbrir).toHaveBeenCalledWith(SESION, expect.any(Function))

    // Completar la sesión marca su checkpoint del plan: se acabó marcar dos veces.
    mock.marcar.mockResolvedValue({ ...PLAN.checkpoints[1], done: true })
    await act(async () => { await onAbrir.mock.calls[0][1]() })
    expect(mock.marcar).toHaveBeenCalledWith(64, true, 'x'.repeat(30))
  })

  it('el audio se marca con «Oído» y no abre cronómetro', async () => {
    await pintar()
    mock.marcar.mockResolvedValue({ ...PLAN.checkpoints[2], done: true })
    await act(async () => { boton('Oído').click() })
    expect(mock.marcar).toHaveBeenCalledWith(68, true, 'x'.repeat(30))
    expect(host.querySelector('.cronometro')).toBeNull()
  })

  it('una tarea con minutos abre el panel de foco y sólo marca si se lo pides', async () => {
    await pintar()
    // El banco del martes: media hora prevista y ningún reproductor propio que abrir.
    await act(async () => { diaDe('martes').click() })
    await act(async () => { botonExacto('Empezar').click() })
    expect(host.textContent).toContain('AMBOSS Embarazo · 13 preguntas')
    expect(host.querySelector('.cronometro')).toBeTruthy()
    await act(async () => { boton('Dejarlo para luego').click() })
    expect(mock.marcar).not.toHaveBeenCalled()
  })

  it('deshace la marca y enseña el motivo cuando la base no la acepta', async () => {
    await pintar()
    mock.marcar.mockRejectedValue(new Error('offline'))
    const casilla = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
    expect(casilla.checked).toBe(false)
    await act(async () => { casilla.click() })
    expect(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].checked).toBe(false)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No se pudo guardar')
  })

  it('sin plan cae a las sesiones preparadas y lo dice en una línea', async () => {
    mock.plan.mockResolvedValue(null)
    await pintar()
    expect(host.textContent).toContain('El plan no está disponible ahora mismo. Estas son las sesiones de la semana.')
    expect(host.querySelectorAll('.semana-grid')).toHaveLength(1)
    expect(host.textContent).toContain('Farmacología endocrina 1/4 · Tiroides y suprarrenal')
    expect(host.querySelectorAll('.plan-dia')).toHaveLength(0)
  })

  it('la nota de la semana va plegada, no ocupando la primera pantalla', async () => {
    await pintar()
    const nota = [...host.querySelectorAll('details')].find(d => d.textContent?.includes('Por qué esta semana es así'))!
    expect(nota.open).toBe(false)
    expect(nota.textContent).toContain('el banco de Psiquiatría cierra')
  })
})
