import { emptyNbmeState, startNbmeSession, submitNbmeAnswer, updateNbmeSession } from '../../src/nbme/model'
import type { NbmeCatalog, NbmeQuestion, NbmeState } from '../../src/nbme/types'

/** Exclusively synthetic content and progress, shared by the browser and its routed API. */
export const NBME_REAL_SESSION = 'preguntas-guardadas-revision'
export const NBME_REAL_USER = 'cuenta-demo'
export const NBME_REAL_TOKEN = 'QA-token-sintetico-sin-acceso-real'
const inicio = new Date('2026-10-05T11:00:00Z').getTime()
export function preguntaNbmeReal(id: string, revision = 'synthetic-r1'): NbmeQuestion {
  return { id, revision, form: '27', section: 1, item: id === 'Q3' ? 3 : 4, page: 1,
    systems: [], disciplines: [], topic: 'Synthetic mechanism', objective: 'Synthetic objective for the saved version.',
    status: 'ready', reasons: [], figureRequired: false, conceptLinks: [],
    stem: `Synthetic saved question ${id}. This fixture contains no clinical material. Which demonstration option follows?`,
    options: ['A', 'B', 'C', 'D', 'E'].map(letter => ({ id: letter, text: `Synthetic saved option ${letter}` })),
    answer: 'C', explanation: 'Synthetic saved explanation: option C follows from the demonstration.',
    figures: [], provenance: { sourceFile: 'synthetic-fixture', sourceRecordId: id, notes: [] } }
}
export function estadoNbmeReal(): NbmeState {
  let state = startNbmeSession(emptyNbmeState('synthetic-bank-r1'), { id: NBME_REAL_SESSION,
    title: 'Preguntas sintéticas pendientes', budgetMinutes: 20,
    refs: [{ id: 'Q3', revision: 'synthetic-r1' }, { id: 'Q4', revision: 'synthetic-r1' }] }, inicio)
  state = submitNbmeAnswer(state, NBME_REAL_SESSION, 0, preguntaNbmeReal('Q3'), 'B', 8000, inicio + 8000)
  state = updateNbmeSession(state, NBME_REAL_SESSION, { paused: true, elapsedMs: 12000 }, inicio + 12000)
  return { ...state, activeSessionId: null, activeChangedAt: inicio + 12000 }
}
export function catalogoNbmeReal(): NbmeCatalog {
  const questions = [preguntaNbmeReal('Q3', 'synthetic-r2'), preguntaNbmeReal('Q4'),
    ...Array.from({ length: 300 }, (_, i) => preguntaNbmeReal(`P${i}`))]
  return { schemaVersion: 1, bankVersion: 'synthetic-bank-r2', total: questions.length,
    questions: questions.map(({ stem: _stem, options: _options, answer: _answer, explanation: _explanation,
      figures: _figures, provenance: _provenance, ...meta }) => meta) }
}

declare global { interface Window { __leerNbmeReal: () => NbmeState } }
