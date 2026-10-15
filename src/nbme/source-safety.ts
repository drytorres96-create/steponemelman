import { z } from 'zod'

export const NBME_SOURCE_SAFETY_PATH = 'myqbank/source-safety/v1.json'
const identifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .refine(value => value.trim() === value)
const RuleZ = z.object({
  source: z.object({ kind: z.literal('nbme'), id: identifier, revision: identifier,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  originalRecovery: z.literal('reviewed_only'),
}).strict()
const PolicyZ = z.object({ schemaVersion: z.literal(1), version: identifier,
  review: z.literal('approved'), rules: z.array(RuleZ).max(10000),
}).strict().refine(value => new Set(value.rules.map(rule => rule.source.id)).size === value.rules.length)
export type NbmeSourceSafety = z.infer<typeof PolicyZ>
export function readNbmeSourceSafety(value: unknown): NbmeSourceSafety | null {
  const parsed = PolicyZ.safeParse(value)
  return parsed.success ? parsed.data : null
}
/** A changed revision/hash is not medical clearance. Only a reviewed policy update
 * can remove a hold. The exact source identity in each rule is its audit anchor. */
export function originalRecoveryAllowed(policy: NbmeSourceSafety | null, questionId: string): boolean {
  return !!policy && !policy.rules.some(rule => rule.source.id === questionId)
}
