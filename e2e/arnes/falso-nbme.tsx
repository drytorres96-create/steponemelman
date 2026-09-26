import { useSyncExternalStore } from 'react'
import { activateNbmeSession, deriveNbmeSession, emptyNbmeState, reviewNbmeAnswer, startNbmeSession, submitNbmeAnswer, updateNbmeSession } from '@app/nbme/model'
import { catalogo, respuestas } from './escena'
// Doble del proveedor NBME que usa el modelo real: abre, responde y revisa sesiones de verdad.
// Las preguntas son texto sintético sin contenido clínico.
const pregunta = (id: string) => ({ id, revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [], topic: 'T',
  objective: 'Synthetic objective: the answer follows from the demo mechanism described in the stem.', status: 'ready', reasons: [], figureRequired: false, conceptLinks: [],
  stem: 'A 45-year-old synthetic patient presents with a demonstration finding after a long synthetic history. Laboratory studies are pending. Which of the following is the most likely explanation?',
  options: 'ABCDE'.split('').map(l => ({ id: l, text: `Synthetic option ${l}` })), answer: 'C', explanation: 'Synthetic explanation.', figures: [],
  provenance: { sourceFile: 'demo', sourceRecordId: id, notes: [] } })
let state: any = { ...emptyNbmeState(), attempts: Object.fromEntries(respuestas.map((r: any) => [r.id, r])) }
let seleccion: string | null = null
let n = 0
const oyentes = new Set<() => void>()
const catalog = { schemaVersion: 1, bankVersion: '1', total: catalogo.length, questions: catalogo }
function construir() {
  const id = state.activeSessionId
  const sessionView = id ? deriveNbmeSession(state, id) : null
  const currentQuestion = sessionView?.current ? pregunta(sessionView.current.id) : null
  return {
    catalog, state, currentSession: id ? state.sessions[id] : null, sessionView, currentQuestion, sessionQuestions: [],
    selectedOption: seleccion, currentFeedback: sessionView?.phase === 'feedback' ? sessionView.attempt : null,
    filters: state.filters, loading: false, questionLoading: false, busy: false, elapsedMs: 0, budgetReached: false, error: null,
    storageWarning: null, localNotice: null, dismissLocalNotice() {}, syncStatus: { state: 'synced', message: 'Preguntas sincronizadas', lastSyncedAt: Date.now() }, catalogStale: false,
    startSession: async (refs: any[], opciones: any = {}) => { state = startNbmeSession(state, { id: `demo-${++n}`, title: opciones.title ?? 'Demo', refs }); seleccion = null; avisar(); return true },
    resumeSession: async (sid: string) => { state = activateNbmeSession(state, sid); avisar(); return true },
    selectAnswer: (op: string) => { seleccion = op; avisar() },
    checkAnswer: () => { const v = construir(); if (!v.sessionView?.current || !seleccion) return; state = submitNbmeAnswer(state, state.activeSessionId, v.sessionView.current.position, pregunta(v.sessionView.current.id) as any, seleccion, 8000); avisar() },
    nextQuestion: () => { const sid = state.activeSessionId; const v = sid ? deriveNbmeSession(state, sid) : null; if (sid && v?.current) state = reviewNbmeAnswer(state, sid, v.current.position); seleccion = null; avisar() },
    pauseSession: () => { const sid = state.activeSessionId; if (sid) state = updateNbmeSession(state, sid, { paused: true }); avisar() },
    discardSession: () => true, attemptsInSession: () => 0, continueSession() {}, continueWithoutBudget() {}, setFilters() {},
    syncNow: async () => true, reloadCatalog: async () => {}, retryQuestionLoad: async () => {}, loadFigure: async () => new Blob(),
  }
}
let valor = construir()
function avisar() { valor = construir(); oyentes.forEach(o => o()) }
const suscribir = (o: () => void) => { oyentes.add(o); return () => { oyentes.delete(o) } }
export function useNbme() { return useSyncExternalStore(suscribir, () => valor) }
export function NbmeProvider({ children }: { children: unknown }) { return children }
