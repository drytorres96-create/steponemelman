import { it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import { validateEditorialDelivery } from './intake'

const source = { kind: 'nbme', id: 'QA-1', revision: 'qa1', sourceHash: 'a'.repeat(64) }
const task = { taskId: 'qa-task', sourceTable: 'nbme_assets', sourcePath: 'questions/QA-1/qa1.json', sourceMd5: 'b'.repeat(32), source, mode: 'draft_companion' }
const batch = { schemaVersion: 1, assignmentId: 'qa-assignment', batchId: 'qa-batch', items: [task] }
function delivery() {
  return { schemaVersion: 1, assignmentId: batch.assignmentId, batchId: batch.batchId, status: 'draft', items: [{ ...task,
    adaptation: { schemaVersion: 1, language: 'es', version: 'qa-draft', review: 'pending', source,
      sections: [{ id: 'idea', label: 'Key idea', heading: 'Ejemplo sintético', status: 'available', paragraphs: ['Alfa es la referencia de prueba.'] }],
      evidence: [{ sectionId: 'idea', sourceRef: 'https://example.org/qa', locator: 'Synthetic test only' }] },
    authoring: { author: 'QA writer', authoredAt: '2026-10-14T12:00:00Z', status: 'ready_for_independent_review', issues: [],
      sectionDecisions: [], referencesChecked: [], figuresReviewed: [], proposedSourceCorrections: [] } }] }
}
it('queues a source-matched draft with its exact text hash and never approves it', async () => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  const result = await validateEditorialDelivery(batch, delivery())
  expect(result.approvalGranted).toBe(false)
  expect(result.counts).toEqual({ total: 1, readyForIndependentReview: 1, blocked: 0 })
  expect(result.items[0].contentHash).toMatch(/^[a-f0-9]{64}$/)
})
it('rejects duplicates, missing IDs, changed sources, forged approval and unsafe evidence', async () => {
  for (const mutate of [
    (d: any) => d.items.push(d.items[0]), (d: any) => d.items.pop(),
    (d: any) => d.items[0].taskId = 'other', (d: any) => d.items[0].sourceMd5 = 'c'.repeat(32),
    (d: any) => d.items[0].adaptation.review = 'approved', (d: any) => d.items[0].adaptation.independentReview = {},
    (d: any) => d.items[0].adaptation.source = { ...source, revision: 'other' },
    (d: any) => d.items[0].adaptation.evidence[0].sourceRef = 'javascript:alert(1)',
    (d: any) => d.items[0].adaptation.evidence[0].sectionId = 'missing',
    (d: any) => d.items[0].adaptation.sections.push(d.items[0].adaptation.sections[0]),
    (d: any) => d.items[0].authoring.issues.push('Unresolved contradiction'),
  ]) { const d = delivery(); mutate(d); await expect(validateEditorialDelivery(batch, d)).rejects.toThrow() }
})
it('keeps source repairs blocked with specific reasons and rejects apparent completion', async () => {
  const repair = { ...batch, items: [{ ...task, mode: 'investigate_source_defect' }] }
  await expect(validateEditorialDelivery(repair, delivery())).rejects.toThrow()
  const d: any = delivery(); d.items[0].adaptation = null; d.items[0].authoring.status = 'blocked'
  await expect(validateEditorialDelivery(repair, d)).rejects.toThrow()
  d.items[0].authoring.issues = ['Synthetic source lacks its required figure.']
  expect((await validateEditorialDelivery(repair, d)).counts.blocked).toBe(1)
})

it('accepts a documented blocked source without inventing its missing publishable hash', async () => {
  const {sourceHash: _hash, ...blockedSource}=source
  const repair={...batch,items:[{...task,source:blockedSource,mode:'investigate_source_defect'}]}
  const d:any=delivery();d.items[0].source=blockedSource;d.items[0].adaptation=null
  d.items[0].authoring.status='blocked';d.items[0].authoring.issues=['Required figure unavailable in original source.']
  expect((await validateEditorialDelivery(repair,d)).counts.blocked).toBe(1)
})
