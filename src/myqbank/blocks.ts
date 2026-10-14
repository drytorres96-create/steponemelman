import { z } from 'zod'
import { ConceptoZ } from '../schema/concept'

const stamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const id = z.string().min(1).max(512).refine(s => !Object.hasOwn(Object.prototype, s) && s !== 'prototype')
export const InteractionDraftZ = z.object({
  text: z.string().max(2000).optional(), choice: z.number().int().min(0).max(100).nullable().optional(),
  sequence: z.array(z.number().int().min(0).max(100)).max(100).optional(),
  mapping: z.record(z.union([z.string().max(100), z.number().int().min(0).max(100)])).optional(),
  active: z.union([z.string().max(100), z.number().int().min(0).max(100)]).nullable().optional(),
})
export type InteractionDraft = z.infer<typeof InteractionDraftZ>
export const BlockEntryZ = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('nbme'), id, revision: id }),
  z.object({ kind: z.literal('concept'), id, revision: id, concept: ConceptoZ }),
])
export type BlockEntry = z.infer<typeof BlockEntryZ>
const mark = z.object({ value: z.boolean(), changedAt: stamp })
export const StudyBlockZ = z.object({
  id, title: z.string().min(1).max(300), mode: z.enum(['tutor', 'test']), createdAt: stamp,
  entries: z.array(BlockEntryZ).min(1).max(80), cursor: z.number().int().min(0).max(79), changedAt: stamp,
  paused: z.boolean(), completedAt: stamp.optional(), archivedAt: stamp.optional(),
  drafts: z.record(z.object({ value: InteractionDraftZ, changedAt: stamp })),
  skipped: z.record(mark), flags: z.record(mark), reviewed: z.record(mark),
  retryOf: id.optional(),
  timeMs: z.record(z.record(stamp.max(3_600_000))).optional(),
}).superRefine((b, ctx) => {
  if (b.cursor >= b.entries.length || new Set(b.entries.map(e => `${e.kind}:${e.id}`)).size !== b.entries.length
    || b.entries.some(e => e.kind === 'concept' && e.id !== e.concept.concept_id)
    || b.completedAt !== undefined && b.completedAt < b.createdAt
    || ['drafts', 'skipped', 'flags', 'reviewed', 'timeMs'].some(field => Object.keys(b[field as 'flags'] ?? {}).some(k => !/^\d{1,2}$/.test(k) || Number(k) >= b.entries.length))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid block identity or position' })
  }
})
export type StudyBlock = z.infer<typeof StudyBlockZ>
export function parseBlocks(value: unknown): Record<string, StudyBlock> | null {
  const parsed = z.record(StudyBlockZ).safeParse(value)
  if (!parsed.success || Object.keys(parsed.data).length > 10000 || Object.entries(parsed.data).some(([id, block]) => id !== block.id)) return null
  return parsed.data
}
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(',')}}` : JSON.stringify(v) ?? 'null'
function mergeMap<T extends { changedAt: number }>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map(k => {
    const x = a[k], y = b[k]
    return [k, !x || !y ? x ?? y : x.changedAt > y.changedAt || x.changedAt === y.changedAt && stable(x) >= stable(y) ? x : y]
  }))
}
/** Immutable presentation and mode; independent per-position clocks avoid losing another tab's draft. */
export function mergeBlock(a: StudyBlock, b: StudyBlock): StudyBlock {
  if (a.id !== b.id || a.createdAt !== b.createdAt || a.mode !== b.mode || stable(a.entries) !== stable(b.entries)) throw new Error('Incompatible saved block')
  const primary = a.changedAt > b.changedAt || a.changedAt === b.changedAt && stable(a) >= stable(b) ? a : b
  return { ...primary, drafts: mergeMap(a.drafts, b.drafts), skipped: mergeMap(a.skipped, b.skipped),
    flags: mergeMap(a.flags, b.flags), reviewed: mergeMap(a.reviewed, b.reviewed),
    ...(a.timeMs || b.timeMs ? { timeMs: Object.fromEntries([...new Set([...Object.keys(a.timeMs ?? {}), ...Object.keys(b.timeMs ?? {})])].sort().map(position => [position,
      Object.fromEntries([...new Set([...Object.keys(a.timeMs?.[position] ?? {}), ...Object.keys(b.timeMs?.[position] ?? {})])].sort().map(run => [run, Math.max(a.timeMs?.[position]?.[run] ?? 0, b.timeMs?.[position]?.[run] ?? 0)]))])) } : {}),
    ...(a.completedAt !== undefined || b.completedAt !== undefined ? { completedAt: Math.max(a.completedAt ?? 0, b.completedAt ?? 0), paused: true } : {}),
    ...(a.archivedAt !== undefined || b.archivedAt !== undefined ? { archivedAt: Math.max(a.archivedAt ?? 0, b.archivedAt ?? 0) } : {}) }
}
export function mergeBlocks(a: Record<string, StudyBlock> = {}, b: Record<string, StudyBlock> = {}): Record<string, StudyBlock> {
  return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map(id => [id, a[id] && b[id] ? mergeBlock(a[id], b[id]) : a[id] ?? b[id]]))
}
export function createBlock(id: string, entries: BlockEntry[], mode: StudyBlock['mode'], now = Date.now(), retryOf?: string): StudyBlock {
  return StudyBlockZ.parse({ id, entries, mode, title: `${entries.length}-item ${mode === 'test' ? 'Test' : 'Tutor'} block`, createdAt: now,
    cursor: 0, changedAt: now, paused: false, drafts: {}, skipped: {}, flags: {}, reviewed: {}, ...(retryOf ? { retryOf } : {}) })
}
export function blockOpportunity(blockId: string, position: number): string { return `${blockId}:mq:${position}` }
export function patchBlock(block: StudyBlock, patch: Partial<Pick<StudyBlock, 'cursor' | 'paused' | 'completedAt' | 'archivedAt'>>, now = Date.now()): StudyBlock {
  return StudyBlockZ.parse({ ...block, ...patch, changedAt: Math.max(now, block.changedAt + 1) })
}
export function markBlock(block: StudyBlock, field: 'flags' | 'skipped' | 'reviewed', position: number, value: boolean, now = Date.now()): StudyBlock {
  return StudyBlockZ.parse({ ...block, [field]: { ...block[field], [position]: { value, changedAt: Math.max(now, (block[field][position]?.changedAt ?? 0) + 1) } } })
}
export function draftBlock(block: StudyBlock, position: number, value: InteractionDraft, now = Date.now()): StudyBlock {
  if (block.completedAt !== undefined) return block
  return StudyBlockZ.parse({ ...block, drafts: { ...block.drafts, [position]: { value, changedAt: Math.max(now, (block.drafts[position]?.changedAt ?? 0) + 1) } } })
}
/** Per-view monotonic counters retain time across reloads without duplicating a synced segment. */
export function timeBlock(block: StudyBlock, position: number, run: string, ms: number): StudyBlock {
  if (block.completedAt !== undefined) return block
  return StudyBlockZ.parse({ ...block, timeMs: { ...block.timeMs, [position]: { ...block.timeMs?.[position],
    [run]: Math.max(block.timeMs?.[position]?.[run] ?? 0, Math.min(3_600_000, Math.max(0, Math.round(ms)))) } } })
}
export function blockTime(block: StudyBlock, position: number): number { return Math.min(3_600_000, Object.values(block.timeMs?.[position] ?? {}).reduce((a, b) => a + b, 0)) }
