import { z } from 'zod'
import type { Concepto } from '../schema/concept'
import type { NbmeQuestion } from '../nbme/types'
import { fundamentoEditorial } from '../lib/fuente-docente'
import { versionPregunta } from '../screens/sesion'
import type { ExplanationSection } from './contracts'

const content = z.string().trim().min(1).max(10000)
export const ExplanationZ = z.object({ schemaVersion: z.literal(1), language: z.literal('es'), version: content,
  review: z.enum(['pending', 'approved']), source: z.object({ kind: z.enum(['nbme', 'concept']), id: content, revision: content,
    variantId: z.string().optional(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }),
  sections: z.array(z.object({ id: content, label: content, status: z.enum(['available', 'pending', 'not_applicable']), heading: content,
    paragraphs: z.array(content).max(8).optional(), bullets: z.array(content).max(8).optional(), drill: z.object({ prompt: content, answer: content }).optional() })).max(5),
  evidence: z.array(z.object({ sectionId: content, sourceRef: content, locator: content })).min(1),
  independentReview: z.object({ reviewer: content, author: content, reviewedAt: z.string().datetime(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
})
export type EditorialExplanation = z.infer<typeof ExplanationZ>
export function canonicalJson(value: unknown): string {
  return Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]` : value && typeof value === 'object'
    ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
    : JSON.stringify(value) ?? 'null'
}
export async function sourceIdentity(source: Concepto | NbmeQuestion): Promise<EditorialExplanation['source']> {
  const concept = 'concept_id' in source
  const payload = concept ? { question: source.evaluacion, answer: source.respuesta_canonica, explanation: source.explicacion,
    source: source.source, editorial: source.revision_editorial, pattern: source.patron, format: source.interaccion.recomendada, variant: source.variante_id }
    : { stem: source.stem, options: source.options, answer: source.answer, explanation: source.explanation, figures: source.figures, objective: source.objective }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(payload)))
  return { kind: concept ? 'concept' : 'nbme', id: concept ? source.concept_id : source.id,
    revision: concept ? versionPregunta(source) : source.revision, ...(concept && source.variante_id ? { variantId: source.variante_id } : {}),
    sourceHash: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('') }
}
export function editorialPath(source: EditorialExplanation['source']): string {
  return `myqbank/explanations/v1/${encodeURIComponent(source.id)}/${encodeURIComponent(source.revision)}/${encodeURIComponent(source.variantId ?? 'base')}.json`
}
export function acceptedExplanation(raw: unknown, source: EditorialExplanation['source']): EditorialExplanation | null {
  const parsed = ExplanationZ.safeParse(raw)
  if (!parsed.success) return null
  const value = parsed.data
  if (value.review !== 'approved' || !value.independentReview || value.independentReview.reviewer === value.independentReview.author
    || value.independentReview.sourceHash !== source.sourceHash || canonicalJson(value.source) !== canonicalJson(source)
    || new Set(value.sections.map(s => s.id)).size !== value.sections.length
    || value.sections.some(s => s.status === 'available' && !value.evidence.some(e => e.sectionId === s.id))) return null
  return value
}
/** Existing reviewed text only. No automatic generation or invented alternatives. */
export function fallbackSections(source: Concepto | NbmeQuestion): ExplanationSection[] {
  if ('concept_id' in source) {
    const explanation = source.revision_editorial ? fundamentoEditorial(source) ?? source.explicacion : source.explicacion
    const sections: ExplanationSection[] = [{ id: 'idea', label: 'Key idea', status: 'available', heading: 'Idea central', paragraphs: [explanation] }]
    if (source.evaluacion.opciones?.length && source.evaluacion.opciones.every(o => o.correcta || o.por_que?.trim())) sections.push({ id: 'choices', label: 'Every choice', status: 'available', heading: 'Por qué cambia la respuesta',
      bullets: source.evaluacion.opciones.map(o => `${o.texto}: ${o.por_que || source.respuesta_canonica}`) })
    if (source.patron?.trim()) sections.push({ id: 'pattern', label: 'Pattern', status: 'available', heading: 'Patrón', paragraphs: [source.patron] })
    return sections
  }
  return source.explanation?.trim() ? [{ id: 'original', label: 'Explanation', status: 'available', heading: 'Original explanation', paragraphs: [source.explanation] }] : []
}
