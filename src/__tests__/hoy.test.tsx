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
import type { Concepto } from '../schema/concept'

/**
 * La portada pone el techo. Lo que se comprueba es lo que decide si Yoel cierra el
 * portátil tranquilo: con el día hecho no queda ningún botón de estudiar ni la tabla
 * de por qué, un día sin material se ve cerrado y no roto, el anillo exterior nunca
 * desaparece, y lo que antes eran Mi semana, Recuperación y Progreso sólo aparece
 * al abrir su desplegable.
 */
const mock = vi.hoisted(() => ({
  app: vi.fn(), nbme: vi.fn(), historial: vi.fn(), plan: vi.fn(),
  corpus: vi.fn(), conceptos: vi.fn(), adherencia: vi.fn(),
}))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'x'.repeat(30) } }) }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: mock.nbme }))
vi.mock('../semana/api', () => ({ cargarHistorialSesiones: mock.historial }))
vi.mock('../plan/api', () => ({
  cargarPlanSemana: mock.plan, cargarAdherencia: mock.adherencia, cargarTopics: async () => [],
  marcarCheckpoint: vi.fn(), PlanEscrituraError: class extends Error {},
}))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.corpus, cargarConceptos: mock.conceptos, cargarModulo: vi.fn() }))

import { Hoy } from '../screens/Hoy'
import { vistaDesdeHash } from '../App'

/** Jueves 24 de septiembre de 2026, 10:00: un día entre semana. La semana va del lunes 21 al domingo 27. */
const HOY = (h: number, m = 0) => new Date(2026, 8, 24, h, m).getTime()

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
  mock.corpus.mockResolvedValue([])
  mock.conceptos.mockResolvedValue(new Map())
  mock.adherencia.mockResolvedValue([])
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const pintar = async (props: { onNuevo?: () => void; onCajas?: () => void; onBiblioteca?: () => void } = {}) => {
  await act(async () => {
    root.render(<Hoy onNuevo={props.onNuevo ?? vi.fn()} onCajas={props.onCajas ?? vi.fn()} onBiblioteca={props.onBiblioteca ?? vi.fn()} />)
  })
  await act(async () => { await Promise.resolve() })
}
const botones = () => [...host.querySelectorAll<HTMLElement>('button, [role="button"]')]
const boton = (texto: string) => botones().find(b => b.textContent === texto)!
const anillo = () => host.querySelector('.anillo-doble')!
const resumenes = () => [...host.querySelectorAll('summary')].map(s => s.textContent)
/** Abre un desplegable de la portada y deja que su contenido termine de cargar. */
const abrir = async (titulo: string) => {
  const resumen = [...host.querySelectorAll('summary')].find(s => s.textContent === titulo)!
  await act(async () => { resumen.click() })
  await act(async () => { await Promise.resolve() })
}

/** Diez conceptos nuevos y cinco preguntas vistos hoy: las dos vías cerradas. */
function diaCompleto() {
  const semana = ids('C', 10)
  datos({
    progresos: Object.fromEntries(semana.map((id, i) => [id, progreso(id, [intento(HOY(8, i))])])),
    respuestas: ids('Q', 5).map((id, i) => respuesta(id, HOY(9, i), i !== 2)),
    preguntas: ids('Q', 5),
  })
  mock.historial.mockResolvedValue([sesion('lunes', '2026-09-21', 1, semana, ids('Q', 5))])
}

/** Un día a medias: un concepto y una pregunta fallados el martes vuelven hoy en sus cajas. */
function diaConCajas() {
  const semana = ids('C', 12)
  datos({
    progresos: { X1: progreso('X1', [fallo(new Date(2026, 8, 22, 9).getTime())]) },
    respuestas: [respuesta('Q9', new Date(2026, 8, 22, 10).getTime(), false)],
    conceptos: semana, preguntas: ['Q9'],
  })
  mock.historial.mockResolvedValue([sesion('lunes', '2026-09-21', 1, semana)])
}
const conceptoX1 = {
  concept_id: 'X1', objetivo: 'Objetivo sintético de la caja X1',
  clasificacion: { disciplina_primaria: 'Fisiología', tema: 'Tema sintético' },
  interaccion: { recomendada: 'recuperacion_libre' },
} as unknown as Concepto

describe('portada Hoy', () => {
  it('con el día completo no se renderiza ningún botón de estudiar', async () => {
    diaCompleto()
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

  it('con el día completo no aparece la tabla de detalle', async () => {
    diaCompleto()
    await pintar()
    // Sólo queda «Cómo va todo»: ni el porqué de las cajas ni otra puerta al estudio.
    expect(resumenes()).toEqual(['Cómo va todo'])
    expect(host.textContent).not.toContain('Lo que estoy cerrando')
    expect(host.textContent).not.toContain('Quiero hacer algo más')
    expect(host.textContent).not.toContain('Caja de hoy')
    expect(mock.conceptos).not.toHaveBeenCalled()
  })

  it('con el día abierto, «Lo que estoy cerrando» explica cada caja al abrirse, y no antes', async () => {
    diaConCajas()
    mock.conceptos.mockResolvedValue(new Map([['X1', conceptoX1]]))
    await pintar()
    expect(resumenes()).toEqual(['Cómo va todo', 'Lo que estoy cerrando', 'Quiero hacer algo más'])
    // Plegado no carga ni pinta nada: la tabla es para mirar por qué, no para decidir.
    expect(mock.conceptos).not.toHaveBeenCalled()
    expect(host.querySelector('table')).toBeNull()

    await abrir('Lo que estoy cerrando')
    expect(mock.conceptos).toHaveBeenCalledWith(['X1'], expect.anything())
    const filas = [...host.querySelectorAll('tbody tr')]
    expect(filas).toHaveLength(2)
    const concepto = filas.find(f => f.textContent?.includes('Objetivo sintético de la caja X1'))!
    expect(concepto.textContent).toContain('caja 1')
    expect(concepto.textContent).toContain('Por hacer')
    expect(concepto.textContent).toContain('3 respuestas correctas independientes')
    const pregunta = filas.find(f => f.textContent?.includes('NBME 27 · pregunta 1'))!
    expect(pregunta.textContent).toContain('caja 1')
    expect(pregunta.textContent).toContain('3 aciertos en días distintos')
  })

  it('«Quiero hacer algo más» lleva a la biblioteca sólo cuando se abre a propósito', async () => {
    diaConCajas()
    const onBiblioteca = vi.fn()
    await pintar({ onBiblioteca })
    expect(host.textContent).not.toContain('Elegir preguntas')
    await abrir('Quiero hacer algo más')
    await act(async () => { boton('Elegir preguntas').click() })
    expect(onBiblioteca).toHaveBeenCalledExactlyOnceWith('preguntas')
    await act(async () => { boton('Elegir conceptos').click() })
    expect(onBiblioteca).toHaveBeenLastCalledWith('conceptos')
  })

  it('«Cómo va todo» reúne las cifras, la adherencia y el plan de la semana, también con el día cerrado', async () => {
    mock.adherencia.mockResolvedValue([{ eventoId: 'S2', titulo: 'S2 · 14–19 sep · Reproductivo', inicio: '2026-09-14', hechas: 3, tareas: 4 }])
    mock.plan.mockResolvedValue({
      eventoId: 'S3', titulo: 'S3 · 21–26 sep · Renal y ácido-base', inicio: '2026-09-21', fin: '2026-09-26', nota: null,
      checkpoints: [cp({ id: 1, idx: 1, dia: 4, label: 'AMBOSS Renal · 20 preguntas' })],
    } satisfies PlanSemana)
    await pintar()
    expect(anillo().classList.contains('cerrado')).toBe(true)
    // Nada de esto se carga mientras el desplegable siga cerrado.
    expect(mock.corpus).not.toHaveBeenCalled()
    expect(mock.adherencia).not.toHaveBeenCalled()

    await abrir('Cómo va todo')
    expect(host.querySelector('[aria-label="Resumen de esta semana"]')).not.toBeNull()
    expect(host.querySelector('#horizonte-titulo')?.textContent).toContain('Cubrir el material en')
    expect(host.querySelector('.plan-adherencia')?.textContent).toContain('75 %')
    // El calendario de la semana va aquí dentro, con el día de hoy abierto.
    expect(host.querySelector('.plan-dia-titulo[aria-expanded="true"]')?.textContent).toContain('HOY · jueves')
    expect(host.textContent).toContain('AMBOSS Renal · 20 preguntas')
  })

  it('los hashes antiguos resuelven a Hoy', () => {
    for (const hash of ['#semana', '#recuperacion', '#progreso', '#repaso']) {
      window.history.replaceState(null, '', `/${hash}`)
      expect(vistaDesdeHash()).toBe('hoy')
    }
    // Lo que sigue en el menú discreto conserva su propio enlace.
    window.history.replaceState(null, '', '/#modulos')
    expect(vistaDesdeHash()).toBe('modulos')
    window.history.replaceState(null, '', '/')
  })

  it('el viernes sale cerrado desde que amanece: sin botones y sin cuentas, aunque haya material y cajas', async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 3, 5))
    const semana = ids('C', 12)
    datos({
      progresos: { X1: progreso('X1', [fallo(new Date(2026, 8, 22, 9).getTime())]) },
      respuestas: [respuesta('Q9', new Date(2026, 8, 22, 10).getTime(), false)],
      conceptos: semana, preguntas: ['Q1', 'Q9'],
    })
    mock.historial.mockResolvedValue([sesion('lunes', '2026-09-21', 1, semana, ['Q1'])])
    const onNuevo = vi.fn(), onCajas = vi.fn()
    await pintar({ onNuevo, onCajas })

    expect(botones()).toHaveLength(0)
    expect(anillo().classList.contains('cerrado')).toBe(true)
    expect(host.querySelector('.hoy-ahora')?.textContent).toBe('Viernes: hoy no toca nada, a propósito. Lo que venza hoy entra el sábado.')
    // Sin cuentas: ni en la línea de lo que toca ni en los bloques, aunque venzan cajas.
    expect(host.querySelector('.hoy-ahora')?.textContent).not.toMatch(/\d/)
    expect(host.querySelector('.hoy-bloques')?.textContent).not.toMatch(/\d/)
    expect(host.textContent).toContain('Cajas · el viernes no toca ninguna')
    expect(host.textContent).toContain('Nuevo · el viernes no toca')
    // Ni la tabla del porqué ni otra puerta al estudio: estudiar un viernes es ir al menú a propósito.
    expect(resumenes()).toEqual(['Cómo va todo'])
    expect(anillo().getAttribute('aria-label')).toContain('Hoy, viernes sin estudio, pasos hechos: 0 de 0.')
    expect(onNuevo).not.toHaveBeenCalled()
    expect(onCajas).not.toHaveBeenCalled()
  })

  it('el viernes sigue cerrado aunque no lleguen las sesiones de la semana', async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 10))
    mock.historial.mockRejectedValue(new Error('sin red'))
    await pintar()
    expect(botones()).toHaveLength(0)
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(anillo().classList.contains('cerrado')).toBe(true)
  })

  it('el fin de semana el techo sube a 20 conceptos, 10 preguntas y 70 cajas, sin contar lo que queda fuera', async () => {
    vi.setSystemTime(new Date(2026, 8, 26, 10))
    const semana = ids('C', 25), preguntas = ids('Q', 12)
    // 75 fallos del martes vencen hoy: entran 70 y los otros cinco esperan sin dejar rastro.
    const progresos = Object.fromEntries(ids('X', 75).map((id, i) => [id, progreso(id, [fallo(new Date(2026, 8, 22, 9, i).getTime())])]))
    datos({ progresos, conceptos: semana, preguntas })
    mock.historial.mockResolvedValue([sesion('lunes', '2026-09-21', 1, semana, preguntas)])
    const onCajas = vi.fn()
    await pintar({ onCajas })

    expect(host.textContent).toContain('0 / 70 cajas')
    expect(host.textContent).toContain('0 / 20 conceptos · 0 / 10 preguntas')
    expect(anillo().getAttribute('aria-label')).toContain('Hoy, pasos hechos: 0 de 100.')
    expect(host.textContent).not.toMatch(/\b75\b|\b5 (cajas|pendientes)/)
    await act(async () => { boton('Empezar las cajas').click() })
    expect(onCajas.mock.calls[0][0]).toHaveLength(70)
    expect(onCajas.mock.calls[0][1]).toBe('Cajas de hoy · 26 sep')
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
      titulo: 'Nuevo de hoy · 24 sep', nbmeSessionId: null,
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
