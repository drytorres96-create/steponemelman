// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL, reconstruirProgreso } from '../store/model'
import { CRITERIOS_POR_DEFECTO, dominioVigente } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import type { NbmeAttempt, NbmeQuestionMeta } from '../nbme/types'
import type { Concepto } from '../schema/concept'
import { instanteEstudio } from '../lib/calendario-estudio'

/**
 * La visión a futuro es la meta de 43 días, no el corpus repartido. Lo que se comprueba
 * es lo que Yoel ve al abrir «Cómo va todo»: las dos metas, cuánto lleva, dónde va la
 * línea y adónde le lleva el ritmo, sin cifras que el día no pueda cumplir y sin alarma
 * cuando va por debajo.
 */
const mock = vi.hoisted(() => ({ app: vi.fn(), nbme: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: mock.nbme }))

import { ProgresoMeta } from '../screens/ProgresoMeta'

/** Hora del plan en Nueva York, incluso cuando la máquina de pruebas está en otra zona. */
const f = (mes: number, dia: number, h = 9) => instanteEstudio({ anio: 2026, mes, dia }, h)
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
 * El martes 27-oct, día 16: 20 conceptos dominados el 17-oct y 30 el 22-oct, más uno de
 * antes del 12-oct que no cuenta. Preguntas, que sólo entran el fin de semana: 5 el
 * sábado 17 y 4 el sábado 24, más cinco de antes y una de ellas repetida dentro de la
 * ventana, que tampoco cuentan.
 */
function dosSemanas() {
  progreso.C0 = dominado('C0', f(10, 5))
  for (let i = 1; i <= 20; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 17))
  for (let i = 21; i <= 50; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 22))
  const respuestas = [
    ...Array.from({ length: 5 }, (_, i) => respuesta(`Q${i}`, f(10, 5))),
    respuesta('Q0', f(10, 18)),
    ...Array.from({ length: 5 }, (_, i) => respuesta(`Q${10 + i}`, f(10, 17))),
    ...Array.from({ length: 4 }, (_, i) => respuesta(`Q${40 + i}`, f(10, 24))),
  ]
  nbme.state.attempts = Object.fromEntries(respuestas.map(r => [r.id, r]))
}

describe('visión a futuro', () => {
  it('reproduce el día 13 y muestra exactamente cuánto falta para alcanzar, superar y completar cada meta', async () => {
    // Sábado 24-oct, día 13: 14 dominados antes de la ventana y 10 dentro; 40 preguntas antes, 3 dentro y una repetida.
    for (let i = 0; i < 14; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 5))
    for (let i = 14; i < 24; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 20))
    const respuestas = [
      ...Array.from({ length: 40 }, (_, i) => respuesta(`Q${i}`, f(10, 5))),
      ...Array.from({ length: 3 }, (_, i) => respuesta(`Q${i + 40}`, f(10, 17))),
      respuesta('Q40', f(10, 20)),
    ]
    nbme.state.attempts = Object.fromEntries(respuestas.map(r => [r.id, r]))
    await pintar(f(10, 24, 16))
    expect(texto()).toContain('Día 13 de 43')
    expect(barra('Conceptos con dominio demostrado en esta meta')?.getAttribute('aria-valuetext')).toBe('10 de 180; la línea va por 18')
    expect(barra('Preguntas NBME respondidas')?.getAttribute('aria-valuetext')).toBe('3 de 44; la línea va por 7')
    expect(texto()).toContain('Para alcanzar la línea: 8. Para superarla: 9. Para completar la meta: 170.')
    expect(texto()).toContain('Para alcanzar la línea: 4. Para superarla: 5. Para completar la meta: 41.')
    expect(texto()).not.toContain('Cómo avanzan las líneas y el dominio')
    expect(texto()).not.toContain('Cada concepto conserva un solo historial')
  })

  it('sobrepasar la meta conserva el excedente real y un valor accesible dentro del rango de la barra', async () => {
    for (let i = 0; i < 185; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 20))
    await pintar(f(10, 24, 16))
    const b = barra('Conceptos con dominio demostrado en esta meta')!
    expect(texto()).toContain('185 / 180 · 103 %')
    expect(texto()).toContain('Meta completada · 5 por encima.')
    expect(b.getAttribute('aria-valuenow')).toBe('180')
    expect(b.getAttribute('aria-valuetext')).toContain('185 de 180')
    expect(b.getAttribute('aria-valuetext')).toContain('meta superada')
    expect((b.firstElementChild as HTMLElement).style.width).toBe('100%')
  })

  it('es la meta de 43 días: dos metas, el día en que va y lo hecho desde el 12-oct', async () => {
    dosSemanas()
    await pintar(f(10, 27, 10))
    expect(host.querySelector('#meta-titulo')?.textContent).toBe('Meta de 43 días: 180 conceptos y 44 preguntas')
    expect(texto()).toContain('Día 16 de 43, del 12 oct al 23 nov. Después quedan unas 4 semanas para consolidar antes del examen.')
    expect(barra('Conceptos con dominio demostrado en esta meta')?.getAttribute('aria-valuetext')).toBe('50 de 180; la línea va por 40')
    expect(texto()).toContain('Dominio demostrado total: 51 conceptos.')
    expect(barra('Preguntas NBME respondidas')?.getAttribute('aria-valuetext')).toBe('9 de 44; la línea va por 15')
    expect(texto()).toContain('50 / 180 · 28 %')
    expect(texto()).toContain('9 / 44 · 20 %')
    // El reparto del corpus no vuelve: nada de «cubrir el material» ni semanas de cientos.
    expect(texto()).not.toContain('Cubrir el material')
    // Por nodo de texto: al concatenar la tabla, «140», «37» y «22 nov» forman un 372 que no se pinta en ningún sitio.
    const nodos: string[] = []
    const recorrido = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
    while (recorrido.nextNode()) nodos.push(recorrido.currentNode.textContent ?? '')
    expect(nodos.length).toBeGreaterThan(0)
    expect(nodos.filter(t => t.includes('372'))).toEqual([])
  })

  it('dice dónde va la línea y a qué distancia, sin alarma cuando va por debajo', async () => {
    dosSemanas()
    await pintar(f(10, 27, 10))
    expect(texto()).toContain('La línea va por 40. Vas 10 por delante.')
    expect(texto()).toContain('La línea va por 15. Vas 6 por debajo.')
    const debajo = [...host.querySelectorAll('.meta-rumbo')].find(p => p.textContent?.includes('por debajo'))!
    expect(debajo.className).not.toMatch(/ambar|rojo/)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('proyecta al 23-nov con el ritmo de la última semana, y no antes de dos semanas', async () => {
    dosSemanas()
    await pintar(f(10, 27, 10))
    // Conceptos: 30 en la última semana frente a ~35 de línea → 50 + 30/35,1 × (180 − 39,5) ≈ 170.
    expect(texto()).toContain('Si sigues como la última semana: ~170 el 23 nov.')
    // Preguntas: 4 frente a ~7,3 de línea → 9 + 4/7,33 × (44 − 14,7) ≈ 25.
    expect(texto()).toContain('Si sigues como la última semana: ~25 el 23 nov.')
    expect(texto()).not.toContain('La proyección sale')

    // Sábado 17-oct, día 6: todavía no hay dos semanas de ritmo.
    await pintar(f(10, 17, 10))
    expect(texto()).not.toContain('Si sigues como la última semana')
    expect(texto()).toContain('La proyección sale el 26 oct')
  })

  it('la tabla lleva la línea semana a semana hasta el 23-nov, con la semana de hoy marcada', async () => {
    await pintar(f(10, 27, 10))
    const filas = [...host.querySelectorAll('.meta-tabla tbody tr')]
    expect(filas).toHaveLength(7)
    expect(filas.at(-1)?.textContent).toBe('23 nov18044')
    expect(host.querySelector('.meta-tabla tr.meta-actual th')?.textContent).toBe('1 nov esta semana')
  })

  it('un repaso pendiente conserva el dominio demostrado y muestra su mantenimiento separado', async () => {
    for (let i = 1; i <= 30; i++) progreso[`C${i}`] = dominado(`C${i}`, f(10, 20))
    const ahora = f(11, 20, 10)
    // El escenario tiene sentido sólo si el mantenimiento ya está pendiente.
    expect(dominioVigente(progreso.C1, CRITERIOS_POR_DEFECTO, ahora)).toBe(false)
    await pintar(ahora)
    expect(barra('Conceptos con dominio demostrado en esta meta')?.getAttribute('aria-valuetext')).toMatch(/^30 de 180;/)
    expect(texto()).toContain('0 al día · 30 pendientes de repaso')
  })

  it('calcula con los IDs del índice sin cargar el contenido y sin fechar un dominio desconocido', async () => {
    progreso.C1 = dominado('C1', f(10, 20))
    progreso.C2 = { ...dominado('C2', f(10, 20)), dominado_en: null }
    progreso.fuera = dominado('fuera', f(10, 20))
    const cargarDetalleConceptos = vi.fn()
    vi.setSystemTime(new Date(f(10, 27, 10)))
    await act(async () => root.render(<ProgresoMeta conceptIds={['C1', 'C2', 'C1']} cargarDetalleConceptos={cargarDetalleConceptos} />))
    expect(cargarDetalleConceptos).not.toHaveBeenCalled()
    expect(barra('Conceptos con dominio demostrado en esta meta')?.getAttribute('aria-valuenow')).toBe('1')
    expect(texto()).toContain('Dominio demostrado total: 2 conceptos.')
  })

  it('mientras carga el banco no recorta la meta de preguntas a cero', async () => {
    nbme.catalog = null
    await pintar(f(10, 27, 10))
    expect(host.querySelector('#meta-titulo')?.textContent).toBe('Meta de 43 días: 180 conceptos y 44 preguntas')
    expect(barra('Preguntas NBME respondidas')).toBeNull()
    expect(texto()).toContain('Cargando las preguntas NBME…')
  })

  it('antes del 12-oct dice cuándo empieza, y pasado el 23-nov que terminó', async () => {
    await pintar(f(10, 11, 10))
    expect(texto()).toContain('Empieza el 12 oct y termina el 23 nov.')
    expect(host.querySelector('.meta-tabla tr.meta-actual')).toBeNull()
    await pintar(f(11, 30, 10))
    expect(texto()).toContain('Terminó el 23 nov.')
    expect(texto()).not.toContain('Si sigues como la última semana')
  })
})
