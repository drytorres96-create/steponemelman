import type { ReactNode } from 'react'
import type { Concepto } from '../schema/concept'
import type { NbmeQuestion } from '../nbme/types'
import { versionPregunta } from '../screens/sesion'
import { myqbankEnabled } from './activation'
import { Highlighter, type HighlightSource } from './HighlightText'
import { Explanation } from './Explanation'

/** The daily and boxes engines keep their queue, grading and recovery semantics. */
export function StudyHighlights({ children, selectionKey }: { children: ReactNode; selectionKey: string }) {
  return myqbankEnabled() ? <Highlighter selectionKey={selectionKey}>{children}</Highlighter> : <>{children}</>
}
export function legacyHighlightSource(source: Concepto | NbmeQuestion): HighlightSource {
  return 'concept_id' in source
    ? { material: 'concept', sourceId: source.concept_id, sourceRevision: versionPregunta(source), variantId: source.variante_id ?? '', editorialVersion: '' }
    : { material: 'nbme', sourceId: source.id, sourceRevision: source.revision, variantId: '', editorialVersion: '' }
}
export function AdaptiveExplanation({ source, figures }: { source: Concepto | NbmeQuestion; figures?: {assetId: string; sha256?: string}[] }) {
  return <Explanation source={source} highlightSource={legacyHighlightSource(source)} figures={figures}/>
}
