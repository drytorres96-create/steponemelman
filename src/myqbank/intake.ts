import { z } from 'zod'
import { canonicalJson, editorialPath, ExplanationZ, explanationHash } from './editorial'

const text = z.string().trim().min(1)
const hash = z.string().regex(/^[a-f0-9]{32}$/)
// Four blocked NBME sources intentionally have no publishable sourceHash.
const AssignmentSourceZ = ExplanationZ.shape.source.partial({ sourceHash: true })
const TaskZ = z.object({ taskId: text, sourceTable: z.enum(['corpus_assets', 'nbme_assets']), sourcePath: text, sourceMd5: hash,
  source: AssignmentSourceZ, mode: text, proposedPath: text.optional() }).passthrough()
const BatchZ = z.object({ schemaVersion: z.literal(1), assignmentId: text, batchId: text, items: z.array(TaskZ).min(1) })
const ItemZ = z.object({ taskId: text, sourceTable: text, sourcePath: text, sourceMd5: hash, source: AssignmentSourceZ,
  adaptation: z.unknown(), authoring: z.object({ author: text, status: z.enum(['ready_for_independent_review', 'blocked']),
    issues: z.array(z.unknown()), sectionDecisions: z.unknown(), referencesChecked: z.unknown(), figuresReviewed: z.unknown(),
    proposedSourceCorrections: z.unknown() }).passthrough() }).passthrough()
const DeliveryZ = z.object({ schemaVersion: z.literal(1), assignmentId: text, batchId: text, status: z.literal('draft'), items: z.array(ItemZ) })
const labels: Record<string, string> = { idea: 'Key idea', stem: 'Read the stem', mechanism: 'Mechanism', choices: 'Every choice', pattern: 'Pattern', drills: 'Drills' }

/** Structural intake only. It cannot grant editorial approval or publish content. */
export async function validateEditorialDelivery(assignment: unknown, delivery: unknown) {
  const batch = BatchZ.parse(assignment), incoming = DeliveryZ.parse(delivery)
  if (incoming.assignmentId !== batch.assignmentId || incoming.batchId !== batch.batchId) throw Error('Assignment or batch mismatch.')
  const expected = new Map(batch.items.map(t => [t.taskId, t]))
  if (expected.size !== batch.items.length || incoming.items.length !== expected.size
    || new Set(incoming.items.map(i => i.taskId)).size !== expected.size) throw Error('Each assigned task must appear exactly once.')
  const items = []
  for (const item of incoming.items) {
    const task = expected.get(item.taskId)
    if (!task || item.sourceTable !== task.sourceTable || item.sourcePath !== task.sourcePath || item.sourceMd5 !== task.sourceMd5
      || canonicalJson(item.source) !== canonicalJson(task.source)) throw Error(`Source mismatch: ${item.taskId}`)
    if (!Object.values(item.authoring).some(value => z.string().datetime({ offset: true }).safeParse(value).success)) throw Error('Authoring needs its actual ISO timestamp.')
    for (const field of ['sectionDecisions', 'referencesChecked', 'figuresReviewed', 'proposedSourceCorrections']) {
      if (!(field in item.authoring)) throw Error(`Missing authoring record: ${field}`)
    }
    if (item.authoring.status === 'blocked') {
      if (item.adaptation !== null || !item.authoring.issues.length || item.authoring.issues.some(i => !i || canonicalJson(i) === '""')) throw Error('Blocked items need explicit reasons and no adaptation.')
      items.push({ ...item, contentHash: null, intakeStatus: 'blocked' as const })
      continue
    }
    if (task.mode !== 'draft_companion' || item.authoring.issues.length) throw Error('Unresolved source or authoring issues cannot enter the review queue.')
    if (!item.adaptation || typeof item.adaptation !== 'object' || 'independentReview' in item.adaptation) throw Error('Drafts must not assign independent approval.')
    const adaptation = ExplanationZ.parse(item.adaptation)
    if (adaptation.language !== 'es' || adaptation.review !== 'pending' || canonicalJson(adaptation.source) !== canonicalJson(task.source)
      || (task.proposedPath && editorialPath(adaptation.source) !== task.proposedPath)) throw Error('Draft identity or review status mismatch.')
    if (!adaptation.sections.some(s => s.status === 'available') || new Set(adaptation.sections.map(s => s.id)).size !== adaptation.sections.length
      || adaptation.sections.some(s => labels[s.id] !== s.label || (s.status === 'available' &&
        (!(s.paragraphs?.length || s.bullets?.length || s.drill) || !adaptation.evidence.some(e => e.sectionId === s.id))))
      || adaptation.evidence.some(e => !adaptation.sections.some(s => s.id === e.sectionId && s.status === 'available'))) throw Error('Section applicability, content or evidence is incomplete.')
    items.push({ ...item, adaptation, contentHash: await explanationHash(adaptation), intakeStatus: 'awaiting_independent_review' as const })
  }
  return { schemaVersion: 1, assignmentId: batch.assignmentId, batchId: batch.batchId, approvalGranted: false,
    counts: { total: items.length, readyForIndependentReview: items.filter(i => i.intakeStatus === 'awaiting_independent_review').length,
      blocked: items.filter(i => i.intakeStatus === 'blocked').length }, items }
}
