import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ query: vi.fn(), path: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: fake.path }) }) } }))
import { loadNbmeSourceSafety } from './nbme-source-safety'
import { NBME_SOURCE_SAFETY_PATH } from '../nbme/source-safety'
const policy = { schemaVersion: 1, version: 'qa-1', review: 'approved', rules: [] }
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  fake.path.mockReturnValue({ abortSignal: () => ({ maybeSingle: fake.query }) })
  fake.query.mockResolvedValue({ data: { payload: policy }, error: null })
})
afterEach(() => vi.restoreAllMocks())
describe('current source safety policy', () => {
  it('reads the exact private path on each call, without persisting policy', async () => {
    expect(await loadNbmeSourceSafety()).toEqual(policy)
    expect(fake.path).toHaveBeenCalledWith('path', NBME_SOURCE_SAFETY_PATH)
    fake.query.mockResolvedValue({ data: null, error: null })
    expect(await loadNbmeSourceSafety()).toBeNull()
    expect(fake.query).toHaveBeenCalledTimes(2)
  })
  it.each(['offline', 'transport', 'rejected', 'missing', 'malformed'])('fails closed for %s after an earlier success', async failure => {
    expect(await loadNbmeSourceSafety()).toEqual(policy)
    if (failure === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    else if (failure === 'rejected') fake.query.mockRejectedValue(new Error('Synthetic failure'))
    else fake.query.mockResolvedValue({ data: failure === 'malformed' ? { payload: {} } : null,
      error: failure === 'transport' ? new Error('Synthetic transport error') : null })
    expect(await loadNbmeSourceSafety()).toBeNull()
  })
})
