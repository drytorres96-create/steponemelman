// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import { reconstruirProgreso } from '../store/model'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import type { NbmeAttempt, NbmeQuestionMeta } from '../nbme/types'
import type { PlanCheckpoint, PlanSemana } from '../plan/tipos'
import type { SesionSemanal } from '../semana/tipos'

/**
 * La portada pone el techo. Lo que se comprueba es lo que decide si Yoel cierra el
 * portátil tranquilo: con el día hecho no queda ningún botón de estudiar, un día
 * sin material se ve cerrado y no roto, y el anillo exterior nunca desaparece.
 */
const mock = vi.hoisted(() => ({
  app: vi.fn(), nbme: vi.fn(), historial: vi.fn(), plan: vi.fn(),
}))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'x'.repeat(30) } }) }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: mock.nbme }))
vi.mock('../semana/api', () => ({ cargarHistorialSesiones: mock.historial }))
vi.mock('../plan/api', () => ({ cargarPlanSemana: mock.plan }))

import { Hoy } from '../screens/Hoy'

/** Viernes 25 de septiembre de 2026, 10:00. La semana va del lunes 21 al domingo 27. */
const HOY = (h: number, m = 0) => new Date(2026, 8, 25, h, m).getTime()

let serie = 0
const intento = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: `a-${++serie}`, session_id: `s-${serie}`, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const fallo = (ts: number) => intento(ts, { resultado: 'incorrecta', tipo_error: 'desconocimiento', calificacion: 1 })
const progreso = (id: string, intentos: Intento[]): ProgresoConcepto => reconstruirProgreso(id, intentos, CRITERIOS_POR_DEFECTO)
const respuesta = (questionId: string, submittedAt: number, correct = true): NbmeAttempt => ({
  id: `n-${++serie}:0`, sessionId: `n-${serie}`, position: 0, questionId, revision: 'r1', optionId: 'A',
  correct, submittedAt, reviewedAt: submittedAt, durationMs: 1000,
})
const meta = (id: string): NbmeQuestionMeta => ({
  id, revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [], topic: 'T',
  objective: null, status: 'ready', reasons: [], figureRequired: false, conceptLinks: [],
})

const ids = (prefijo: string, n: number) => Array.from({ length: n }, (_, i) => `${prefijo}${i + 1}`)
const sesion = (id: string, semanaInicio: string, dia: number, conceptos: string[], preguntas: string[] = []): SesionSemanal => ({
  id, semana: 'S3', semanaInicio, dia, orden: 1, titulo: id, subtitulo: null,
  guion: [...conceptos.map(c => ({ kind: 'concepto' as const, id: c })), ...preguntas.map(q => ({ kind: 'pregunta' as const, id: q, revision: 'r1' }))],
  presupuestoMin: 30, estado: 'pendiente', cursor: 0, nbmeSessionId: null, completadaEn: null,
})
const cp = (extra: Partial<PlanCheckpoint>): PlanCheckpoint => ({ id: 1, idx: 1, dia: 1, kind: 'qbank', label: 'AMBOSS', done: false, doneAt: null, ...extra })

let host: HTMLDivElement
let root: Root
let app: { indice: unknown; estado: typeof ESTADO_INICIAL; sincronizacion?: { estado: string; mensaje: string; ultima: number | null } }
let nbme: { state: { sessions: Record<string, unknown>; attempts: Record<string, NbmeAttempt> }; catalog: { questions: NbmeQuestionMeta[] } | null; loading: boolean; error: string | null }

function datos({ progresos = {}, respuestas = [], preguntas = [], conceptos = [] as string[] }:
  { progresos?: Record<string, ProgresoConcepto>; respuestas?: NbmeAttempt[]; preguntas?: string[]; conceptos?: string[] }) {
  app = {
    indice: { n_conceptos: 0, modulos: [{ module_id: 'M', sesiones: [{ session_id: 'S', conceptos: [...conceptos, ...Object.keys(progresos)] }] }], documentos: [], glosario: [], cuarentena: 0 },
    estado: { ...ESTADO_INICIAL, progreso: progresos },
  }
  nbme = {
    state: { sessions: {}, attempts: Object.fromEntries(respuestas.map(r => [r.id, r])) },
    catalog: { questions: preguntas.map(meta) }, loading: false, error: null,
  }
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(HOY(10)))
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  datos({})
  mock.app.mockImplementation(() => app)
  mock.nbme.mockImplementation(() => nbme)
  mock.historial.mockResolvedValue([])
  mock.plan.mockResolvedValue(null)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const pintar = async (props: { onNuevo?: () => void; onCajas?: () => void } = {}) => {
  await act(async () => { root.render(<Hoy onNuevo={props.onNuevo ?? vi.fn()} onCajas={props.onCajas ?? vi.fn()} />) })
  await act(async () => { await Promise.resolve() })
}
const botones = () => [...host.querySelectorAll<HTMLElement>('button, [role="button"]')]
const anillo = () => host.querySelector('.anillo-doble')!

describe('portada Hoy', () => {
  it('con el día completo no se renderiza ningún botón de estudiar', async () => {
    const semana = ids('C', 10)
    datos({
      progresos: Object.fromEntries(semana.map((id, i) => [id, progreso(id, [intento(HOY(8, i))])])),
      respuestas: ids('Q', 5).map((id, i) => respuesta(id, HOY(9, i), i !== 2)),
      preguntas: ids('Q', 5),
    })
    mock.historial.mockResolvedValue([sesion('lunes', '2026-09-21', 1, semana, ids('Q', 5))])
    const onNuevo = vi.fn(), onCajas = vi.fn()
    await pintar({ onNuevo, onCajas })

    // Por rol, no por texto: ni un botón, ni uno gris, ni un «seguir de todas formas».
    expect(botones()).toHaveLength(0)
    expect(host.querySelector('a[href="#modulos"]')).toBeNull()
    expect(anillo().classList.contains('cerrado')).toBe(true)
    expect(host.textContent).toContain('Hoy ya está: 10 conceptos nuevos y 5 preguntas.')
    expect(onNuevo).not.toHaveBeenCalled()
    expect(onCajas).not.toHaveBeenCalled()
  })

  it('un día sin material se presenta cerrado, no vacío ni con error', async () => {
    await pintar()
    expect(botones()).toHaveLength(0)
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(anillo().classList.contains('cerrado')).toBe(true)
    expect(host.textContent).toContain('Hoy ya está: no tocaba nada nuevo ni ninguna caja.')
    expect(host.textContent).toContain('Cajas · hoy no toca ninguna')
    expect(host.textContent).toContain('Nuevo · la semana no trae material por ver')
  })

  it('el anillo exterior cae a su reserva sin lanzar cuando no hay semana en curso', async () => {
    // Hay sesiones, pero de otra semana; el plan de esta semana sí existe.
    mock.historial.mockResolvedValue([sesion('pasada', '2026-09-14', 1, ['X1'])])
    mock.plan.mockResolvedValue({
      eventoId: 'S3', titulo: 'S3 · 21–26 sep · Renal y ácido-base', inicio: '2026-09-21', fin: '2026-09-26', nota: null,
      checkpoints: [
        cp({ id: 1, idx: 1, label: 'StepOneMelman · Sesión de la semana 1/2 · Renal', done: true }),
        cp({ id: 2, idx: 2, dia: 2, label: 'StepOneMelman · Sesión de la semana 2/2 · Ácido-base' }),
        cp({ id: 3, idx: 3, dia: 3, kind: 'podcast', label: 'Audio 1' }),
      ],
    } satisfies PlanSemana)
    await pintar()
    expect(anillo().getAttribute('aria-label')).toContain('Sesiones de la semana hechas: 1 de 2.')
    expect(host.textContent).toContain('Renal y ácido-base')
    // Dos tramos, uno por sesión planificada.
    expect(anillo().querySelectorAll('g')).toHaveLength(2)

    // Sin plan tampoco se rompe: el anillo sigue ahí y dice que no hay semana.
    mock.plan.mockResolvedValue(null)
    await act(async () => { root.unmount() })
    root = createRoot(host)
    await pintar()
    expect(anillo().getAttribute('aria-label')).toContain('Sin semana planificada: 0 de 0.')
  })

  it('el anillo doble lleva las dos cifras en un solo aria-label', async () => {
    const semana = ids('C', 12)
    datos({
      progresos: {
        ...Object.fromEntries(semana.slice(0, 3).map((id, i) => [id, progreso(id, [intento(HOY(8, i))])])),
        // Dos conceptos de otros días que se fallaron: vencen hoy.
        X1: progreso('X1', [fallo(new Date(2026, 8, 22, 9).getTime())]),
        X2: progreso('X2', [fallo(new Date(2026, 8, 22, 10).getTime())]),
      },
      conceptos: semana,
    })
    mock.historial.mockResolvedValue([sesion('lunes', '2026-09-21', 1, semana)])
    await pintar()
    const etiquetados = host.querySelectorAll('.anillo-doble[role="img"]')
    expect(etiquetados).toHaveLength(1)
    expect(anillo().getAttribute('aria-label')).toBe('Hoy, pasos hechos: 3 de 12. Tema de la semana, conceptos cerrados: 0 de 12.')
    expect(anillo().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('cajas primero y lo nuevo después, cada uno a un clic de su primer paso', async () => {
    const semana = ids('C', 12)
    datos({
      progresos: {
        ...Object.fromEntries(semana.slice(0, 3).map((id, i) => [id, progreso(id, [intento(HOY(8, i))])])),
        X1: progreso('X1', [fallo(new Date(2026, 8, 22, 9).getTime())]),
        X2: progreso('X2', [fallo(new Date(2026, 8, 22, 10).getTime())]),
      },
      conceptos: semana, preguntas: ['Q1', 'Q2'],
    })
    mock.historial.mockResolvedValue([sesion('lunes', '2026-09-21', 1, semana, ['Q1', 'Q2'])])
    const onNuevo = vi.fn(), onCajas = vi.fn()
    await pintar({ onNuevo, onCajas })

    const [cajas, nuevo] = botones()
    expect(botones()).toHaveLength(2)
    expect(cajas.textContent).toBe('Empezar las cajas')
    expect(cajas.classList.contains('principal')).toBe(true)
    expect(nuevo.textContent).toBe('Seguir con lo nuevo')
    expect(host.textContent).toContain('0 / 2 cajas')
    expect(host.textContent).toContain('3 / 10 conceptos · 0 / 2 preguntas')
    // Ninguna cuenta de deuda fuera de los desplegables.
    expect(host.textContent).not.toMatch(/venc|pendiente|atrasad|deuda/i)

    await act(async () => { cajas.click() })
    expect(onCajas).toHaveBeenCalledOnce()
    expect(onCajas.mock.calls[0][0].map((i: { id: string }) => i.id)).toEqual(['X1', 'X2'])

    await act(async () => { nuevo.click() })
    expect(onNuevo).toHaveBeenCalledWith({
      conceptIds: ['C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
      preguntas: [{ id: 'Q1', revision: 'r1' }, { id: 'Q2', revision: 'r1' }],
      titulo: 'Nuevo de hoy · 25 sep', nbmeSessionId: null,
    })
  })

  it('una vía cerrada se colapsa a una línea y pierde su botón', async () => {
    const semana = ids('C', 10)
    datos({
      progresos: {
        ...Object.fromEntries(semana.map((id, i) => [id, progreso(id, [intento(HOY(8, i))])])),
        X1: progreso('X1', [fallo(new Date(2026, 8, 22, 9).getTime())]),
      },
      conceptos: semana,
    })
    mock.historial.mockResolvedValue([sesion('lunes', '2026-09-21', 1, semana)])
    await pintar()
    expect(botones().map(b => b.textContent)).toEqual(['Empezar las cajas'])
    expect(host.textContent).toContain('✓Nuevo · 10 / 10 conceptos')
    expect(anillo().classList.contains('cerrado')).toBe(false)
  })

  it('recién abierto, el cierre espera a que llegue el progreso de la cuenta', async () => {
    app = { ...app, sincronizacion: { estado: 'sincronizando', mensaje: 'Sincronizando…', ultima: null } }
    await pintar()
    expect(host.textContent).toContain('Preparando tu día…')
    expect(host.textContent).not.toContain('Hoy ya está')
    app = { ...app, sincronizacion: { estado: 'sincronizado', mensaje: 'Progreso sincronizado', ultima: Date.now() } }
    await pintar()
    expect(host.textContent).toContain('Hoy ya está')
  })

  it('si no llegan las sesiones de la semana, el día no se da por cerrado', async () => {
    mock.historial.mockRejectedValue(new Error('sin red'))
    await pintar()
    expect(anillo().classList.contains('cerrado')).toBe(false)
    expect(host.textContent).not.toContain('Hoy ya está')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar las sesiones de la semana')
  })
})
