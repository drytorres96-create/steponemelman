import { describe, expect, it } from 'vitest'
import { readNbmeSourceSafety, originalRecoveryAllowed } from './source-safety'

const policy = { schemaVersion: 1, version: 'synthetic-1', review: 'approved', rules: [{
  source: { kind: 'nbme', id: 'QA-held', revision: 'r1', sourceHash: 'a'.repeat(64) }, originalRecovery: 'reviewed_only',
}] }
describe('private NBME source safety contract', () => {
  it('holds a listed ID regardless of source revision and allows unrelated originals only under a valid policy', () => {
    const parsed = readNbmeSourceSafety(policy)
    expect(parsed).not.toBeNull()
    expect(originalRecoveryAllowed(parsed, 'QA-held')).toBe(false)
    expect(originalRecoveryAllowed(parsed, 'QA-other')).toBe(true)
    expect(originalRecoveryAllowed(null, 'QA-other')).toBe(false)
  })
  it.each([null, {}, { ...policy, review: 'pending' }, { ...policy, schemaVersion: 2 },
    { ...policy, rules: [...policy.rules, ...policy.rules] }, { ...policy, unexpected: true },
    { ...policy, rules: [{ ...policy.rules[0], source: { ...policy.rules[0].source, sourceHash: 'broken' } }] },
    { ...policy, rules: [{ ...policy.rules[0], originalRecovery: 'allowed' }] },
    ...['', ' ', 'QA-held ', ' QA-held', 'QA held', 'QA-held\n', 'QA/held'].map(id => ({ ...policy,
      rules: [{ ...policy.rules[0], source: { ...policy.rules[0].source, id } }] })),
    { ...policy, rules: [{ ...policy.rules[0], source: { ...policy.rules[0].source, revision: ' r1' } }] },
    { ...policy, version: ' ' },
  ])('rejects missing or ambiguous policy %#', value => {
    expect(readNbmeSourceSafety(value)).toBeNull()
  })
})
