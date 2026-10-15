import type { EstadoApp } from '../store/model'
import type { Intento } from '../srs/tipos'
import { evidenciaIndependiente } from '../srs/mastery'
import { blockOpportunity, type StudyBlock } from './blocks'

type LearningState = Pick<EstadoApp, 'myqbankBlocks' | 'progreso' | 'criterios'>
export function learningExposures(blocks: Record<string, StudyBlock> = {}): Map<string, number> {
  const exposures = new Map<string, number>()
  for (const block of Object.values(blocks)) for (const [position, record] of Object.entries(block.learning ?? {})) {
    const entry = block.entries[Number(position)]
    if (entry?.kind === 'concept') exposures.set(entry.id, Math.max(exposures.get(entry.id) ?? 0, record.viewedAt))
  }
  return exposures
}
/** Reuse the saved separation criterion: immediate practice cannot become independent by starting another block. */
export function recentLearning(state: LearningState, conceptId: string, now: number): boolean {
  const viewedAt = learningExposures(state.myqbankBlocks).get(conceptId)
  return viewedAt !== undefined && now - viewedAt < state.criterios.separacionHoras * 3_600_000
}
export function awaitingRecall(state: LearningState, conceptId: string, viewedAt: number): boolean {
  return !state.progreso[conceptId]?.intentos.some(attempt => attempt.ts > viewedAt && attempt.ts - viewedAt >= state.criterios.separacionHoras * 3_600_000 && evidenciaIndependiente(attempt)
    && (!attempt.session_id || state.myqbankBlocks?.[attempt.session_id]?.mode !== 'test' || state.myqbankBlocks[attempt.session_id].completedAt !== undefined))
}
/** A second device cannot erase evidence that this same opportunity used teaching. */
export function retainLearningEvidence(attempt: Intento, blocks: Record<string, StudyBlock>): Intento {
  const block = attempt.session_id ? blocks[attempt.session_id] : undefined
  const assisted = block && Object.keys(block.learning ?? {}).some(k => attempt.pregunta_id === blockOpportunity(block.id, Number(k)))
  return assisted && !attempt.explicacion_previa ? { ...attempt, explicacion_previa: true } : attempt
}
