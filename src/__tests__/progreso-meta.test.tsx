// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL, reconstruirProgreso } from '../store/model'
import { CRITERIOS_POR_DEFECTO, dominioVigente } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import type { NbmeAttempt, NbmeQuestionMeta } from '../nbme/types'
import type { Concepto } from '../schema/concept'

/**
 * La visión a futuro es la meta de 60 días, no el corpus repartido. Lo que se comprueba
 * es lo que Yoel ve al abrir «Cómo va todo»: las dos metas, cuánto lleva, dónde va la
 * línea y adónde le lleva el ritmo, sin cifras que el día no pueda cumplir y sin alarma
 * cuando va por debajo.
 */
const mock = vi.hoisted(() => ({ app: vi.fn(), nbme: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: mock.nbme }))

import { ProgresoMeta } from '../screens/ProgresoMeta'

const f = (mes: number, dia: number, h = 9) => new Date(2026, mes - 1, dia, h).getTime()
let serie = 0
const acierto = (ts: number): Intento => ({
  attempt_id: `a-${++serie}`, session_id: `s-${serie}`, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  pregunta_version: 'sintetica-v1', evaluador_version: 'sintetico-v1',
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null,
})
/** Un concepto que cumple los criterios con su tercer acierto, que cae en `ultimo`. */
const dominado = (id: string, ultimo: number): ProgresoConcepto =>
  reconstruirProgreso(id, [acierto(ultimo - 5 * 86_400_000), acierto(ultimo - 3 * 86_400_000), acierto(ultimo)], CRITERIOS_POR_DEFECTO)
const pregunta = (id: string): NbmeQuestionMeta => ({
  id, revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [], topic: 'T',
  objective: null, status: 'ready', reasons: [], figureRequired: false, conceptLinks: [],
})
const respuesta = (questionId: string, submittedAt: number): NbmeAttempt => ({
  id: `n-${++serie}:0`, sessionId: `n-${serie}`, position: 0, questionId, revision: 'r1', optionId: 'A',
  correct: true, submittedAt, reviewedAt: submittedAt, durationMs: 1000,
})
const conceptos = Array.from({ length: 600 }, (_, i) => ({ concept_id: `C${i}` }) as Concepto)

let host: HTMLDivElement
let root: Root
let progreso: Record<string, ProgresoConcepto>
let nbme: { state: { attempts: Record<string, NbmeAttempt> }; catalog: { questions: NbmeQuestionMeta[] } | null; error: string | null }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  progreso = {}
  nbme = { state: { attempts: {} }, catalog: { questions: Array.from({ length: 300 }, (_, i) => pregunta(`Q${i}`)) }, error: null }
  mock.app.mockImplementation(() => ({ estado: { ...ESTADO_INICIAL, progreso } }))
  mock.nbme.mockImplementation(() => nbme)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const pintar = async (ahora: number) => {
  vi.setSystemTime(new Date(ahora))
  await act(async () => root.render(<ProgresoMeta conceptos={conceptos} />))
}
const texto = () => host.textContent ?? ''
const barra = (titulo: string) => host.querySelector(`[role="progressbar"][aria-label="${titulo}"]`)

/**
 * El sábado 10-oct, día 16: 30 conceptos dominados el 1-oct y 50 el 6-oct, más uno de
 * antes del 25-sep que no cuenta. Preguntas: 20 la primera semana y 18 la segunda, más
 * cinco de antes y una de ellas repetida dentro de la ventana, que tampoco cuentan.
 */
function dosSemanas() {
  progreso.C0 = dominado('C0', f(9, 15))
  for (let i = 1; i <= 30; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 1))
  for (let i = 31; i <= 80; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 6))
  const respuestas = [
    ...Array.from({ length: 5 }, (_, i) => respuesta(`Q${i}`, f(9, 20))),
    respuesta('Q0', f(10, 5)),
    ...Array.from({ length: 20 }, (_, i) => respuesta(`Q${10 + i}`, f(9, 28))),
    ...Array.from({ length: 18 }, (_, i) => respuesta(`Q${40 + i}`, f(10, 7))),
  ]
  nbme.state.attempts = Object.fromEntries(respuestas.map(r => [r.id, r]))
}

describe('visión a futuro', () => {
  it('reproduce el día 13 y muestra exactamente cuánto falta para alcanzar, superar y completar cada meta', async () => {
    for (let i = 0; i < 14; i++) progreso[`C${i}`] = dominado(`C${i}`, f(9, 20))
    for (let i = 14; i < 31; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 1))
    const respuestas = [
      ...Array.from({ length: 40 }, (_, i) => respuesta(`Q${i}`, f(9, 20))),
      ...Array.from({ length: 23 }, (_, i) => respuesta(`Q${i + 40}`, f(10, 1))),
      respuesta('Q40', f(10, 6)),
    ]
    nbme.state.attempts = Object.fromEntries(respuestas.map(r => [r.id, r]))
    await pintar(f(10, 7, 16))
    expect(texto()).toContain('Día 13 de 60')
    expect(barra('Conceptos con dominio demostrado en esta meta')?.getAttribute('aria-valuetext')).toBe('17 de 510; la línea va por 50')
    expect(barra('Preguntas NBME respondidas')?.getAttribute('aria-valuetext')).toBe('23 de 255; la línea va por 52')
    expect(texto()).toContain('Para alcanzar la línea: 33. Para superarla: 34. Para completar la meta: 493.')
    expect(texto()).toContain('Para alcanzar la línea: 29. Para superarla: 30. Para completar la meta: 232.')
  })

  it('sobrepasar la meta conserva el excedente real y un valor accesible dentro del rango de la barra', async () => {
    for (let i = 0; i < 515; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 1))
    await pintar(f(10, 7, 16))
    const b = barra('Conceptos con dominio demostrado en esta meta')!
    expect(texto()).toContain('515 / 510 · 101 %')
    expect(texto()).toContain('Meta completada · 5 por encima.')
    expect(b.getAttribute('aria-valuenow')).toBe('510')
    expect(b.getAttribute('aria-valuetext')).toContain('515 de 510')
    expect(b.getAttribute('aria-valuetext')).toContain('meta superada')
    expect((b.firstElementChild as HTMLElement).style.width).toBe('100%')
  })

  it('es la meta de 60 días: dos metas, el día en que va y lo hecho desde el 25-sep', async () => {
    dosSemanas()
    await pintar(f(10, 10, 10))
    expect(host.querySelector('#meta-titulo')?.textContent).toBe('Meta de 60 días: 510 conceptos y 255 preguntas')
    expect(texto()).toContain('Día 16 de 60, del 25 sept al 23 nov. Después quedan unas 4 semanas para consolidar antes del examen.')
    expect(barra('Conceptos con dominio demostrado en esta meta')?.getAttribute('aria-valuetext')).toBe('80 de 510; la línea va por 67')
    expect(texto()).toContain('Dominio demostrado total: 81 conceptos.')
    expect(barra('Preguntas NBME respondidas')?.getAttribute('aria-valuetext')).toBe('38 de 255; la línea va por 59')
    expect(texto()).toContain('80 / 510 · 16 %')
    expect(texto()).toContain('38 / 255 · 15 %')
    // El reparto del corpus no vuelve: nada de «cubrir el material» ni semanas de cientos.
    expect(texto()).not.toContain('Cubrir el material')
    expect(texto()).not.toContain('372')
  })

  it('dice dónde va la línea y a qué distancia, sin alarma cuando va por debajo', async () => {
    dosSemanas()
    await pintar(f(10, 10, 10))
    expect(texto()).toContain('La línea va por 67. Vas 13 por delante.')
    expect(texto()).toContain('La línea va por 59. Vas 21 por debajo.')
    const debajo = [...host.querySelectorAll('.meta-rumbo')].find(p => p.textContent?.includes('por debajo'))!
    expect(debajo.className).not.toMatch(/ambar|rojo/)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('proyecta al 23-nov con el ritmo de la última semana, y no antes de dos semanas', async () => {
    dosSemanas()
    await pintar(f(10, 10, 10))
    expect(texto()).toContain('Si sigues como la última semana: ~411 el 23 nov.')
    expect(texto()).toContain('Si sigues como la última semana: ~157 el 23 nov.')
    expect(texto()).not.toContain('La proyección sale')

    await pintar(f(9, 30, 10))
    expect(texto()).not.toContain('Si sigues como la última semana')
    expect(texto()).toContain('La proyección sale el 9 oct')
  })

  it('la tabla lleva la línea semana a semana hasta el 23-nov, con la semana de hoy marcada', async () => {
    await pintar(f(10, 10, 10))
    const filas = [...host.querySelectorAll('.meta-tabla tbody tr')]
    expect(filas).toHaveLength(10)
    expect(filas.at(-1)?.textContent).toBe('23 nov510255')
    expect(host.querySelector('.meta-tabla tr.meta-actual th')?.textContent).toBe('11 oct esta semana')
  })

  it('un repaso pendiente conserva el dominio demostrado y muestra su mantenimiento separado', async () => {
    for (let i = 1; i <= 30; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 1))
    const ahora = f(11, 20, 10)
    // El escenario tiene sentido sólo si el mantenimiento ya está pendiente.
    expect(dominioVigente(progreso.C1, CRITERIOS_POR_DEFECTO, ahora)).toBe(false)
    await pintar(ahora)
    expect(barra('Conceptos con dominio demostrado en esta meta')?.getAttribute('aria-valuetext')).toMatch(/^30 de 510;/)
    expect(texto()).toContain('0 al día · 30 pendientes de repaso')
  })

  it('calcula con los IDs del índice sin cargar el contenido y sin fechar un dominio desconocido', async () => {
    progreso.C1 = dominado('C1', f(10, 1))
    progreso.C2 = { ...dominado('C2', f(10, 1)), dominado_en: null }
    progreso.fuera = dominado('fuera', f(10, 1))
    const cargarDetalleConceptos = vi.fn()
    vi.setSystemTime(new Date(f(10, 10, 10)))
    await act(async () => root.render(<ProgresoMeta conceptIds={['C1', 'C2', 'C1']} cargarDetalleConceptos={cargarDetalleConceptos} />))
    expect(cargarDetalleConceptos).not.toHaveBeenCalled()
    expect(barra('Conceptos con dominio demostrado en esta meta')?.getAttribute('aria-valuenow')).toBe('1')
    expect(texto()).toContain('Dominio demostrado total: 2 conceptos.')
  })

  it('mientras carga el banco no recorta la meta de preguntas a cero', async () => {
    nbme.catalog = null
    await pintar(f(10, 10, 10))
    expect(host.querySelector('#meta-titulo')?.textContent).toBe('Meta de 60 días: 510 conceptos y 255 preguntas')
    expect(barra('Preguntas NBME respondidas')).toBeNull()
    expect(texto()).toContain('Cargando las preguntas NBME…')
  })

  it('antes del 25-sep dice cuándo empieza, y pasado el 23-nov que terminó', async () => {
    await pintar(f(9, 24, 10))
    expect(texto()).toContain('Empieza el 25 sept y termina el 23 nov.')
    expect(host.querySelector('.meta-tabla tr.meta-actual')).toBeNull()
    await pintar(f(11, 30, 10))
    expect(texto()).toContain('Terminó el 23 nov.')
    expect(texto()).not.toContain('Si sigues como la última semana')
  })
})
