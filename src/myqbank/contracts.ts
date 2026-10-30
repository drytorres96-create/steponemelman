/** View contracts only. No changes to NbmeState, StudyState, storage or their serializers. */
export type Material = 'nbme' | 'concepts' | 'mixed'
export type BlockMode = 'tutor' | 'test'
export type Theme = 'dark' | 'light'
export type EditorialStatus = 'available' | 'not_applicable' | 'pending'
export interface ExplanationSection {
  id: string
  label: string
  status: EditorialStatus
  heading: string
  paragraphs?: readonly string[]
  bullets?: readonly string[]
  drill?: { prompt: string; answer: string }
}
export function availableSections(sections: readonly ExplanationSection[]) {
  return sections.filter(section => section.status === 'available' &&
    (section.paragraphs?.some(text => text.trim().length > 0) || section.bullets?.some(text => text.trim().length > 0) ||
      !!(section.drill?.prompt.trim() && section.drill.answer.trim())))
}

/** Apply to every view: rail, result, explanation, summaries and dashboard. */
export const canReveal = (mode: BlockMode, submitted: boolean, completed: boolean) =>
  submitted && (mode === 'tutor' || completed)

export interface SourceIdentity {
  kind: 'nbme' | 'concept'
  id: string
  revision: string
  variantId?: string
  sourceHash: string
}
/** Future private companion asset. Does not change original question/answer identities. */
export interface ExplanationContract {
  schemaVersion: 1
  source: SourceIdentity
  language: 'es'
  version: string
  review: 'pending' | 'approved'
  sections: readonly ExplanationSection[]
  evidence: readonly { sectionId: string; sourceRef: string; locator: string }[]
}
export interface AnnotationContract {
  ownerId: string
  id: string
  source: SourceIdentity
  kind: 'flag' | 'highlight'
  region?: string
  quote?: { exact: string; prefix: string; suffix: string; start: number; end: number }
  revision: number
  updatedAt: string
  deletedAt: string | null
}
export type Pool = 'unused' | 'incorrect' | 'flagged' | 'skipped' | 'learning'
export interface EligibleItem {
  id: string
  kind: 'nbme' | 'concept'
  systems: readonly string[]
  pools: readonly Pool[]
}
/** Selection model for the visual preview; production scheduling remains the existing engine. */
export function selectUniqueItems<T extends EligibleItem>(items: readonly T[], material: Material,
  systems: readonly string[], pools: readonly Pool[]): T[] {
  const eligible = items.filter(item => (material === 'mixed' || item.kind === (material === 'nbme' ? 'nbme' : 'concept')) &&
    item.systems.some(system => systems.includes(system)) && item.pools.some(pool => pools.includes(pool)))
  return [...new Map(eligible.map(item => [`${item.kind}:${item.id}`, item])).values()]
}
export const safePercent = (part: number, total: number): number | null =>
  total > 0 ? Math.min(100, Math.max(0, Math.round(part / total * 100))) : null
