import type { NbmeQuestion } from './types'
import './editorial-variant.css'

type Source = Pick<NbmeQuestion, 'revision' | 'provenance'>

/** Identify the question source itself, independently of its teaching companion. */
export function isEditorialNbmeVariant(question: Source): boolean {
  const marker = question.provenance.editorialDerivedEvaluation
  return !!marker && typeof marker === 'object' && !Array.isArray(marker)
    && 'status' in marker && marker.status === 'approved'
    && 'reviewKind' in marker && marker.reviewKind === 'ai'
}

export function EditorialVariantBadge({ question }: { question: Source }) {
  return isEditorialNbmeVariant(question)
    ? <span className="nbme-editorial-badge" lang="es">Variante editorial · revisada por IA</span>
    : null
}
