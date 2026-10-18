import { describe, expect, it, vi } from 'vitest'
import { etiquetasDeSesion } from './etiquetas-sesion'
import { explanationHash, sourceIdentity, editorialPath, type EditorialExplanation } from '../myqbank/editorial'
import type { NbmeQuestion } from '../nbme/types'
import type { NbmeSourceSafety } from '../nbme/source-safety'

const question: NbmeQuestion = {
  id: 'NBME27-P0001', revision: 'qa-r1', form: '27', section: 1, item: 1, page: 1,
  systems: ['Cardiovascular'], disciplines: ['Farmacología'], topic: '', objective: 'Synthetic alpha objective.',
  status: 'ready', reasons: [], figureRequired: false, conceptLinks: [], stem: 'Which synthetic symbol comes next?',
  options: [{ id: 'A', text: 'Alpha' }, { id: 'B', text: 'Beta' }], answer: 'A', explanation: 'Original synthetic explanation.',
  figures: [], provenance: { sourceFile: 'synthetic', sourceRecordId: 'qa', notes: [] },
}
const item = { tipo: 'pregunta' as const, id: question.id, revision: question.revision, etiqueta: 'Untrusted client instruction' }
const policy: NbmeSourceSafety = { schemaVersion: 1, version: 'qa', review: 'approved', rules: [] }
async function fixture() {
  const source = await sourceIdentity(question)
  const companion: EditorialExplanation = {
    schemaVersion: 1, language: 'es', version: 'qa-1', review: 'approved', source,
    sections: [{ id: 'idea', label: 'Idea', status: 'available', heading: 'Synthetic reviewed topic', paragraphs: ['Reviewed alpha mechanism connects to beta.'] }],
    evidence: [{ sectionId: 'idea', sourceRef: 'https://example.org/synthetic', locator: 'Synthetic reference' }],
    independentReview: { author: 'Synthetic author', reviewer: 'Independent synthetic reviewer', kind: 'ai', reviewedAt: '2026-10-17T12:00:00Z', sourceHash: source.sourceHash, contentHash: '' },
  }
  companion.independentReview!.contentHash = await explanationHash(companion)
  const assets = new Map<string, unknown>([
    ['catalog-index.json', { questions: [question] }],
    [`questions/${question.id}/${question.revision}.json`, question],
    [editorialPath(source), companion],
  ])
  const get = vi.fn(async (path: string) => {
    const filter = new URL(path, 'https://example.org').searchParams.get('path')!
    const paths = filter.slice(4, -1).split(',')
    return Response.json(paths.flatMap(path => assets.has(path) ? [{ path, payload: assets.get(path) }] : []))
  })
  const held: NbmeSourceSafety = { ...policy, rules: [{ source: { ...source, kind: 'nbme' }, originalRecovery: 'reviewed_only' }] }
  return { assets, get, source, companion, held }
}

describe('trusted topic evidence for session search', () => {
  it('uses an exact reviewed companion even when the original is held and the index topic is empty', async () => {
    const f = await fixture()
    const r = await etiquetasDeSesion([item], f.held, f.get)
    expect(r).toMatchObject({ sinRevisar: 0, conFuenteRevisada: 1 })
    expect(r.revisables[0].etiqueta).toContain('Reviewed alpha mechanism')
    expect(JSON.stringify(r)).not.toContain('Untrusted client instruction')
    expect(JSON.stringify(r)).not.toContain('Original synthetic explanation')
    expect(f.held.rules).toHaveLength(1)
  })
  it('uses authorized original evidence when no companion exists, never a generic client label', async () => {
    const f = await fixture(); f.assets.delete(editorialPath(f.source))
    const r = await etiquetasDeSesion([item], policy, f.get)
    expect(r.revisables[0].etiqueta).toContain('Synthetic alpha objective')
    expect(r.revisables[0].etiqueta).toContain('Original synthetic explanation')
    expect(r.conFuenteRevisada).toBe(0)
  })
  it('does not accept a client NBME label disguised as a concept', async () => {
    const f = await fixture()
    expect((await etiquetasDeSesion([{ ...item, tipo: 'concepto' }], f.held, f.get)).revisables).toEqual([])
  })
  for (const change of ['missing', 'pending', 'altered', 'self-review', 'different-source'] as const) it(`keeps a held original excluded with a ${change} companion`, async () => {
    const f = await fixture()
    if (change === 'missing') f.assets.delete(editorialPath(f.source))
    if (change === 'pending') f.companion.review = 'pending'
    if (change === 'altered') f.companion.sections[0].paragraphs = ['An unreviewed replacement.']
    if (change === 'self-review') f.companion.independentReview!.reviewer = f.companion.independentReview!.author
    if (change === 'different-source') f.companion.source.sourceHash = 'b'.repeat(64)
    expect(await etiquetasDeSesion([item], f.held, f.get)).toMatchObject({ revisables: [], sinRevisar: 1, conFuenteRevisada: 0 })
  })
  it('rejects a stale revision and a missing source policy without sending content to the model', async () => {
    const f = await fixture()
    expect((await etiquetasDeSesion([{ ...item, revision: 'older' }], policy, f.get)).revisables).toEqual([])
    f.get.mockClear()
    expect((await etiquetasDeSesion([item], null, f.get)).revisables).toEqual([])
    expect(f.get).not.toHaveBeenCalled()
  })
  it('does not turn a database failure into a claim that no questions exist', async () => {
    await expect(etiquetasDeSesion([item], policy, async () => new Response(null, { status: 503 }))).rejects.toThrow('Vuelve a intentarlo')
  })
  it('uses the full catalog only as a compatibility fallback when the compact index is absent', async () => {
    const f = await fixture()
    f.assets.set('catalog.json', f.assets.get('catalog-index.json'))
    f.assets.delete('catalog-index.json')
    expect((await etiquetasDeSesion([item], f.held, f.get)).conFuenteRevisada).toBe(1)
    expect(f.get.mock.calls.map(call => decodeURIComponent(call[0])).slice(0, 2)).toEqual([
      '/rest/v1/nbme_assets?select=path,payload&path=in.(catalog-index.json)',
      '/rest/v1/nbme_assets?select=path,payload&path=in.(catalog.json)',
    ])
  })
})
