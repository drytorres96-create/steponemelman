import { describe, expect, it } from 'vitest'
import { progresoPorForma } from '../nbme/formas'
import type { NbmeAttempt, NbmeCatalog, NbmeState } from '../nbme/types'

const DIA = 24 * 3_600_000
const HOY = new Date(2026, 8, 13).getTime()
const LUNES = new Date(2026, 8, 7).getTime()

const meta = (id: string, form: '27' | '28' | '29', status: 'ready' | 'blocked' = 'ready') => ({
  id, revision: `rev-${id}`, form, section: 1, item: 1, page: 1, systems: [], disciplines: [],
  topic: 'Endocrino', objective: null, status, reasons: [], figureRequired: false, conceptLinks: [],
})
const catalogo = (): NbmeCatalog => ({
  schemaVersion: 1, bankVersion: 'v1', total: 5,
  questions: [meta('A27', '27'), meta('B27', '27'), meta('C27', '27'), meta('X27', '27', 'blocked'), meta('A28', '28')],
})
const intento = (id: string, questionId: string, correct: boolean, submittedAt: number, conflict = false): NbmeAttempt => ({
  id, sessionId: 'sesion', position: 0, questionId, revision: `rev-${questionId}`, optionId: 'A',
  correct, submittedAt, reviewedAt: submittedAt, durationMs: 1000, ...(conflict ? { conflict } : {}),
})
const estado = (attempts: NbmeAttempt[]): NbmeState => ({
  version: 1, bankVersion: 'v1', discarded: {}, sessions: {},
  attempts: Object.fromEntries(attempts.map(a => [a.id, a])),
  activeSessionId: null, activeChangedAt: 0,
  filters: { form: 'all', system: '', discipline: '', status: 'all', quality: 'ready', size: 10, budgetMinutes: null },
  filtersChangedAt: 0,
})
const forma27 = (state: NbmeState, desde = 0) => progresoPorForma(state, catalogo(), desde)[0]

describe('progreso por forma NBME', () => {
  it('cuenta sólo las preguntas calificables de cada forma', () => {
    const filas = progresoPorForma(estado([]), catalogo())
    expect(filas.map(f => [f.form, f.total])).toEqual([['27', 3], ['28', 1], ['29', 0]])
    expect(filas[0]).toMatchObject({ vistas: 0, correctas: 0, incorrectas: 0, nuevas: 0, primeraVez: 0, reincidentes: 0, porcentaje: 0 })
  })

  it('separa vistas, correctas, incorrectas y aciertos a la primera', () => {
    const fila = forma27(estado([
      intento('1', 'A27', true, HOY),                    // acierto limpio a la primera
      intento('2', 'B27', false, HOY),                   // fallada, sigue incorrecta
      intento('3', 'C27', false, HOY - DIA),             // fallada y después corregida
      intento('4', 'C27', true, HOY),
    ]))
    expect(fila).toMatchObject({ vistas: 3, correctas: 2, incorrectas: 1, primeraVez: 1, reincidentes: 0 })
    expect(fila.porcentaje).toBeCloseTo(1)
  })

  it('reincidente es fallar dos veces o más, no fallar una vez', () => {
    const unaVez = forma27(estado([intento('1', 'A27', false, HOY)]))
    expect(unaVez).toMatchObject({ incorrectas: 1, reincidentes: 0 })
    const dosVeces = forma27(estado([
      intento('1', 'A27', false, HOY - DIA), intento('2', 'A27', false, HOY),
    ]))
    expect(dosVeces).toMatchObject({ vistas: 1, incorrectas: 1, reincidentes: 1 })
  })

  it('una respuesta en conflicto entre dispositivos no se cuenta como acierto', () => {
    const fila = forma27(estado([intento('1', 'A27', true, HOY, true)]))
    expect(fila).toMatchObject({ vistas: 1, correctas: 0, incorrectas: 1, primeraVez: 0 })
  })

  it('la ventana semanal deja fuera lo anterior al lunes', () => {
    const state = estado([
      intento('1', 'A27', true, LUNES - DIA),   // semana pasada
      intento('2', 'B27', true, HOY),           // esta semana
    ])
    expect(forma27(state, 0)).toMatchObject({ vistas: 2, correctas: 2, primeraVez: 2 })
    expect(forma27(state, LUNES)).toMatchObject({ vistas: 1, correctas: 1, primeraVez: 1 })
  })

  it('repetir esta semana una pregunta fallada antes no cuenta como acierto a la primera', () => {
    const state = estado([
      intento('1', 'A27', false, LUNES - DIA),
      intento('2', 'A27', true, HOY),
    ])
    // La pregunta no es nueva en la ventana: su primer intento fue la semana pasada.
    expect(forma27(state, LUNES)).toMatchObject({ vistas: 1, correctas: 1, nuevas: 0, primeraVez: 0 })
    expect(forma27(state, 0)).toMatchObject({ vistas: 1, correctas: 1, nuevas: 1, primeraVez: 0 })
  })

  it('sin catálogo devuelve las tres formas a cero en vez de romperse', () => {
    expect(progresoPorForma(estado([intento('1', 'A27', true, HOY)]), null))
      .toEqual([27, 28, 29].map(n => ({ form: String(n), total: 0, vistas: 0, correctas: 0,
        incorrectas: 0, nuevas: 0, primeraVez: 0, reincidentes: 0, porcentaje: 0 })))
  })
})
