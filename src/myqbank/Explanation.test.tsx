import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NbmeQuestion } from '../nbme/types'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
import { explanationHash, sourceIdentity, type EditorialExplanation } from './editorial'

const fake = vi.hoisted(() => ({ user: { id: 'QA-owner' } as { id: string } | null, query: vi.fn(), read: vi.fn(), write: vi.fn(), db: new Map<string, unknown>() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: fake.user }) }))
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: fake.query }) }) }) } }))
vi.mock('../store/db', () => ({ leer: fake.read, escribir: fake.write }))
vi.mock('./AnnotationProvider', () => ({ useAnnotations: () => ({ rows: [], ready: true, save: vi.fn() }) }))
import { Explanation } from './Explanation'

const original = 'Synthetic original explanation.'
let testId = 0
let source = { ...myqbankConcepts[0], explicacion: original }
const highlightSource = { material: 'concept' as const, sourceId: source.concept_id, sourceRevision: 'qa', variantId: '', editorialVersion: '' }
let host: HTMLDivElement, root: Root, commits: string[]
function Capture() { useLayoutEffect(() => { commits.push(host.textContent ?? '') }); return null }
const render = async (question: typeof source | NbmeQuestion = source, figures: { assetId: string; sha256?: string }[] = []) => {
  await act(async () => root.render(<><Explanation source={question} highlightSource={highlightSource} figures={figures}/><Capture/></>))
}
const waitForText = async (text: string) => {
  await vi.waitFor(async () => { await act(async () => {}); expect(host.textContent).toContain(text) })
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(finish => { resolve = finish }); return { promise, resolve } }
async function approved(question: typeof source | NbmeQuestion = source, text = 'Explicación sintética revisada.') {
  const identity = await sourceIdentity(question)
  const value: EditorialExplanation = { schemaVersion: 1, language: 'es', version: 'qa-approved', review: 'approved', source: identity,
    sections: [{ id: 'idea', label: 'Key idea', heading: 'Idea', status: 'available', paragraphs: [text] }],
    evidence: [{ sectionId: 'idea', sourceRef: 'https://example.org/synthetic', locator: 'Synthetic reference' }],
    independentReview: { author: 'Synthetic author', reviewer: 'Independent synthetic reviewer', kind: 'ai', reviewedAt: '2026-10-14T12:00:00Z', sourceHash: identity.sourceHash, contentHash: '0'.repeat(64) } }
  value.independentReview!.contentHash = await explanationHash(value)
  return value
}
const cacheKey = (value: EditorialExplanation, user = 'QA-owner') => `myqbank-explanation:${user}:${value.source.sourceHash}`
const expectUnavailable = () => {
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Explanation unavailable')
  expect(host.textContent).not.toContain(original)
  expect(host.querySelector('button')?.textContent).toBe('Retry explanation')
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  source = { ...myqbankConcepts[0], explicacion: original, respuesta_canonica: `synthetic test ${++testId}` }
  fake.user = { id: 'QA-owner' }; fake.db.clear(); vi.resetAllMocks(); commits = []
  fake.read.mockImplementation(async (key: string) => fake.db.get(key))
  fake.write.mockImplementation(async (key: string, value: unknown) => { fake.db.set(key, value) })
  fake.query.mockResolvedValue({ data: null, error: null })
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

describe('explanation loading without unsafe original fallback', () => {
  it('shows only loading until the exact reviewed companion arrives, without an original flash', async () => {
    const value = await approved(), request = deferred<{ data: { payload: EditorialExplanation }; error: null }>()
    fake.query.mockReturnValue(request.promise)
    const added: string[] = []
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => added.push(node.textContent ?? ''))))
    observer.observe(host, { childList: true, subtree: true })
    await render(); await vi.waitFor(() => expect(fake.query).toHaveBeenCalledTimes(1))
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading explanation…')
    expect(host.textContent).not.toContain(original)
    await act(async () => request.resolve({ data: { payload: value }, error: null }))
    await waitForText(value.sections[0].paragraphs![0])
    expect(added.join(' ')).not.toContain(original); observer.disconnect()
    expect(host.querySelector('.mq-explanation-content')?.getAttribute('lang')).toBe('es')
    expect(host.textContent).not.toContain('independent AI review')
    expect(fake.db.get(cacheKey(value))).toEqual(value)
  })
  it('allows original sections only after an online response confirms the row is absent', async () => {
    const request = deferred<{ data: null; error: null }>(); fake.query.mockReturnValue(request.promise)
    await render(); expect(host.textContent).not.toContain(original)
    await act(async () => request.resolve({ data: null, error: null })); await waitForText(original)
    expect(host.querySelector('.mq-explanation-content')?.getAttribute('lang')).toBe('en')
    expect(fake.write).toHaveBeenCalledWith(`myqbank-explanation:QA-owner:${(await sourceIdentity(source)).sourceHash}`, null, { estricto: true })
  })
  it('invalidates a cached companion after confirmed online removal so it cannot return offline', async () => {
    const value = await approved(); fake.db.set(cacheKey(value), value)
    await render(); await waitForText(original)
    expect(fake.db.get(cacheKey(value))).toBeNull()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => root.render(null)); await render()
    await waitForText('Explanation unavailable'); expectUnavailable()
    expect(host.textContent).not.toContain(value.sections[0].paragraphs![0])
    expect(fake.query).toHaveBeenCalledTimes(1)
  })
  it.each(['response error', 'rejected request'])('uses only the exact approved cache after %s', async failure => {
    const value = await approved(); fake.db.set(cacheKey(value), value)
    if (failure === 'response error') fake.query.mockResolvedValue({ data: null, error: new Error('network') })
    else fake.query.mockRejectedValue(new Error('network'))
    await render(); await waitForText(value.sections[0].paragraphs![0])
    expect(host.textContent).not.toContain(original)
    expect(fake.read).toHaveBeenCalledWith(cacheKey(value)); expect(fake.write).not.toHaveBeenCalled()
    expect(fake.db.get(cacheKey(value))).toEqual(value)
  })
  it('offers an accessible retry after an online failure without cache and recovers', async () => {
    fake.query.mockResolvedValue({ data: null, error: new Error('network') })
    await render(); await waitForText('Explanation unavailable'); expectUnavailable()
    const value = await approved(); fake.query.mockResolvedValue({ data: { payload: value }, error: null })
    await act(async () => host.querySelector('button')!.click()); await waitForText(value.sections[0].paragraphs![0])
    expect(fake.query).toHaveBeenCalledTimes(2); expect(host.textContent).not.toContain(original)
  })
  it('keeps offline cache misses unavailable without requesting or writing anything', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await render(); await waitForText('Explanation unavailable'); expectUnavailable()
    expect(fake.query).not.toHaveBeenCalled(); expect(fake.write).not.toHaveBeenCalled()
  })
  it('renders the exact approved offline cache', async () => {
    const value = await approved(); fake.db.set(cacheKey(value), value)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await render(); await waitForText(value.sections[0].paragraphs![0])
    expect(host.textContent).not.toContain(original); expect(fake.query).not.toHaveBeenCalled()
  })
  it.each(['malformed', 'hash changed', 'pending', 'empty payload'])('blocks and revokes a present invalid record (%s) in cache', async invalid => {
    const value = await approved(); fake.db.set(cacheKey(value), value)
    const payload = invalid === 'malformed' ? {} : invalid === 'hash changed' ? { ...value, version: 'unreviewed-change' }
      : invalid === 'pending' ? { ...value, review: 'pending' } : null
    fake.query.mockResolvedValue({ data: { payload }, error: null })
    await render(); await waitForText('Explanation unavailable'); expectUnavailable()
    expect(host.textContent).not.toContain(value.sections[0].paragraphs![0])
    expect(fake.write).toHaveBeenCalledWith(cacheKey(value), null, { estricto: true }); expect(fake.db.get(cacheKey(value))).toBeNull()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => root.render(null)); await render()
    await waitForText('Explanation unavailable'); expectUnavailable()
    expect(host.textContent).not.toContain(value.sections[0].paragraphs![0])
  })
  it('does not treat an incomplete response as absence or an authoritative revocation', async () => {
    const value = await approved(); fake.db.set(cacheKey(value), value)
    fake.query.mockResolvedValue({ data: undefined, error: null })
    await render(); await waitForText('Explanation unavailable'); expectUnavailable()
    expect(fake.write).not.toHaveBeenCalled(); expect(fake.db.get(cacheKey(value))).toEqual(value)
  })
  it.each(['missing', 'pending'])('blocks revoked cache across retry and remount even if its %s tombstone cannot persist', async reason => {
    const value = await approved(); fake.db.set(cacheKey(value), value)
    fake.query.mockResolvedValue({ data: reason === 'missing' ? null : { payload: { ...value, review: 'pending' } }, error: null })
    fake.write.mockRejectedValue(new Error('Storage unavailable'))
    await render(); await waitForText('Explanation unavailable'); expectUnavailable()
    expect(fake.db.get(cacheKey(value))).toEqual(value)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => host.querySelector('button')!.click()); await waitForText('Explanation unavailable'); expectUnavailable()
    await act(async () => root.render(null)); await render(); await waitForText('Explanation unavailable'); expectUnavailable()
    expect(host.textContent).not.toContain(value.sections[0].paragraphs![0]); expect(fake.read).not.toHaveBeenCalled()
    // A fresh accepted response and successful storage can restore offline availability.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    fake.query.mockResolvedValue({ data: { payload: value }, error: null })
    fake.write.mockImplementation(async (key: string, payload: unknown) => { fake.db.set(key, payload) })
    await act(async () => host.querySelector('button')!.click()); await waitForText(value.sections[0].paragraphs![0])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => root.render(null)); await render(); await waitForText(value.sections[0].paragraphs![0])
  })
  it('refuses cached text with a changed source or content hash even under the expected cache key', async () => {
    const value = await approved(), changed = { ...source, respuesta_canonica: 'different' }
    const identity = await sourceIdentity(changed)
    fake.db.set(`myqbank-explanation:QA-owner:${identity.sourceHash}`, value)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await render(changed); await waitForText('Explanation unavailable'); expectUnavailable()
    fake.db.set(cacheKey(value), { ...value, version: 'changed-after-review' })
    await render(); await waitForText('Explanation unavailable'); expectUnavailable()
  })
  it('cannot display a different account’s cached explanation after switching users', async () => {
    const value = await approved(); fake.db.set(cacheKey(value), value)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await render(); await waitForText(value.sections[0].paragraphs![0])
    fake.user = { id: 'QA-other' }; commits = []; await render()
    expect(commits[0]).not.toContain(value.sections[0].paragraphs![0])
    await waitForText('Explanation unavailable'); expectUnavailable()
    expect(fake.read).toHaveBeenLastCalledWith(cacheKey(value, 'QA-other'))
    expect(fake.db.get(cacheKey(value))).toEqual(value)
  })
  it('cannot display the preceding source while the next request is pending', async () => {
    const value = await approved(); fake.query.mockResolvedValueOnce({ data: { payload: value }, error: null })
    await render(); await waitForText(value.sections[0].paragraphs![0])
    fake.query.mockReturnValue(new Promise(() => {})); commits = []
    await render({ ...source, respuesta_canonica: 'changed' })
    expect(commits[0]).toContain('Loading explanation…')
    expect(commits[0]).not.toContain(value.sections[0].paragraphs![0]); expect(host.textContent).not.toContain(original)
  })
  it.each(['source', 'account'])('ignores a late response after the %s changes', async change => {
    const value = await approved(), request = deferred<{ data: { payload: EditorialExplanation }; error: null }>()
    fake.query.mockReturnValueOnce(request.promise).mockResolvedValue({ data: null, error: new Error('network') })
    await render(); await vi.waitFor(() => expect(fake.query).toHaveBeenCalledTimes(1))
    if (change === 'account') fake.user = { id: 'QA-other' }
    await render(change === 'source' ? { ...source, respuesta_canonica: 'changed' } : source)
    await waitForText('Explanation unavailable')
    await act(async () => request.resolve({ data: { payload: value }, error: null }))
    expectUnavailable(); expect(host.textContent).not.toContain(value.sections[0].paragraphs![0]); expect(fake.write).not.toHaveBeenCalled()
  })
  it('blocks cached explanations until all reviewed figures match, without falling back', async () => {
    const question: NbmeQuestion = { id: 'QA-NBME', revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [], topic: 'Synthetic', objective: null,
      status: 'ready', reasons: [], figureRequired: true, conceptLinks: [], stem: 'Synthetic question', options: [{ id: 'A', text: 'Alpha' }], answer: 'A', explanation: original,
      figures: [{ assetId: 'QA-figure', alt: 'Synthetic figure' }], provenance: { sourceFile: 'synthetic', sourceRecordId: 'qa', notes: [] } }
    const value = await approved(question)
    value.independentReview!.figures = [{ assetId: 'QA-figure', md5: 'a'.repeat(32), sha256: 'b'.repeat(64) }]
    fake.db.set(cacheKey(value), value); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await render(question); await waitForText('Explanation unavailable'); expectUnavailable()
    await render(question, [{ assetId: 'QA-figure', sha256: 'c'.repeat(64) }]); expectUnavailable()
    await render(question, [{ assetId: 'QA-figure', sha256: 'b'.repeat(64) }]); await waitForText(value.sections[0].paragraphs![0])
    expect(host.textContent).not.toContain(original)
  })
  it('hides accepted content immediately on sign out', async () => {
    const value = await approved(); fake.query.mockResolvedValue({ data: { payload: value }, error: null })
    await render(); await waitForText(value.sections[0].paragraphs![0])
    fake.user = null; commits = []; await render(); await waitForText('Explanation unavailable'); expectUnavailable()
    expect(commits[0]).not.toContain(value.sections[0].paragraphs![0])
  })
})
