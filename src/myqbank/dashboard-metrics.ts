import { safePercent, type Material, type Pool } from './contracts'
import type { BankItem } from './selection'

/** Learning is a concept-only pool; never leave an invisible filter active. */
export function poolsForMaterial(pools: Pool[], material: Material): Pool[] {
  if (material !== 'nbme') return pools
  const visible = pools.filter(pool => pool !== 'learning')
  return visible.length || !pools.length ? visible : ['unused']
}

/** In Mixed, coverage is specific to concepts and accuracy to NBME questions. */
export function systemMetrics(items: BankItem[], system: string, material: Material) {
  const group = items.filter(item => item.systems.includes(system))
  const scored = group.filter(item => item.kind === 'nbme' && item.firstCorrect !== null)
  const coverage = material === 'mixed' ? group.filter(item => item.kind === 'concept') : group
  return { id: system, seen: group.filter(item => item.seen).length,
    coverageSeen: coverage.filter(item => item.seen).length, coverageTotal: coverage.length,
    n: scored.length, accuracy: safePercent(scored.filter(item => item.firstCorrect).length, scored.length) }
}
