import { z } from 'zod'
const stamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const AnnotationZ = z.object({
  material: z.enum(['nbme', 'concept']), sourceId: z.string().min(1).max(512), sourceRevision: z.string().min(1).max(512),
  variantId: z.string().max(512).default(''), kind: z.enum(['highlight', 'flag']), region: z.string().min(1).max(200),
  editorialVersion: z.string().max(100).default(''), quote: z.string().max(4000), prefix: z.string().max(100), suffix: z.string().max(100),
  start: z.number().int().nonnegative(), end: z.number().int().nonnegative(), changedAt: stamp, deleted: z.boolean(),
}).refine(a => a.kind === 'flag' || a.quote.length > 0 && a.end > a.start)
export type Annotation = z.infer<typeof AnnotationZ>
export interface AnnotationRecord { id: string; payload: Annotation; revision: number; dirty: boolean }
export const canonicalAnnotation = (a: Annotation): string => JSON.stringify(AnnotationZ.parse(a))
export function mergeAnnotation(a: Annotation, b: Annotation): Annotation {
  if (a.material !== b.material || a.sourceId !== b.sourceId || a.sourceRevision !== b.sourceRevision || a.region !== b.region) throw new Error('Annotation identity changed')
  if (a.deleted !== b.deleted) return a.deleted ? a : b
  return a.changedAt > b.changedAt || a.changedAt === b.changedAt && canonicalAnnotation(a) >= canonicalAnnotation(b) ? a : b
}
/** Exact offsets first; otherwise a unique literal match with context. Never move an ambiguous mark. */
export function anchorAnnotation(text: string, a: Annotation): { start: number; end: number } | null {
  const matches = (start: number) => text.slice(start, start + a.quote.length) === a.quote
    && (!a.prefix || text.slice(Math.max(0, start - a.prefix.length), start) === a.prefix)
    && (!a.suffix || text.slice(start + a.quote.length, start + a.quote.length + a.suffix.length) === a.suffix)
  if (matches(a.start)) return { start: a.start, end: a.start + a.quote.length }
  const candidates: number[] = []
  for (let at = text.indexOf(a.quote); at >= 0; at = text.indexOf(a.quote, at + 1)) if (matches(at)) candidates.push(at)
  return candidates.length === 1 ? { start: candidates[0], end: candidates[0] + a.quote.length } : null
}
