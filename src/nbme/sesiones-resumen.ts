import { deriveNbmeSession, isNbmeSessionArchived } from './model'
import type { NbmeSession, NbmeState } from './types'

/** La barra muestra la primera vuelta; las correcciones nunca reescriben sus colores. */
export function resumenSesionNbme(state: NbmeState, session: NbmeSession) {
  const view = deriveNbmeSession(state, session.id)!
  const correct = view.firstCorrect
  const wrong = view.firstAnswered - view.firstCorrect - view.firstConflicts
  const unanswered = view.initialCount - correct - wrong
  return { view, correct, wrong, unanswered,
    percentage: (count: number) => count * 100 / view.initialCount,
    status: view.phase === 'complete' ? 'Completada' : view.firstAnswered === view.initialCount ? 'Primera vuelta completada' : view.firstAnswered ? 'A medias' : 'Sin empezar' }
}

export function sesionesVisiblesNbme(state: NbmeState): NbmeSession[] {
  return Object.values(state.sessions).filter(session => !isNbmeSessionArchived(state, session.id) && session.title !== 'Cajas')
    .sort((a, b) => b.controlChangedAt - a.controlChangedAt || a.id.localeCompare(b.id))
}
