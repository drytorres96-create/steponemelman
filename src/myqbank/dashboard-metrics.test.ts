import { expect, it } from 'vitest'
import { poolsForMaterial, systemMetrics } from './dashboard-metrics'
import type { BankItem } from './selection'

it('calculates Mixed concept coverage separately from NBME accuracy', () => {
  const base = { revision: 'r', systems: ['Renal'], pools: [] }
  const items: BankItem[] = [
    { ...base, id: 'q1', kind: 'nbme', seen: true, firstCorrect: true },
    { ...base, id: 'q2', kind: 'nbme', seen: true, firstCorrect: false },
    { ...base, id: 'c1', kind: 'concept', seen: false, firstCorrect: null },
    { ...base, id: 'c2', kind: 'concept', seen: true, firstCorrect: null },
  ]
  expect(systemMetrics(items, 'Renal', 'mixed')).toMatchObject({ seen: 3, coverageSeen: 1, coverageTotal: 2, n: 2, accuracy: 50 })
  expect(systemMetrics(items.filter(i => i.kind === 'nbme'), 'Renal', 'nbme')).toMatchObject({ coverageSeen: 2, coverageTotal: 2 })
})
it('removes a hidden concept-only pool when switching to NBME', () => {
  expect(poolsForMaterial(['learning'], 'nbme')).toEqual(['unused'])
  expect(poolsForMaterial(['learning', 'flagged'], 'nbme')).toEqual(['flagged'])
  expect(poolsForMaterial([], 'nbme')).toEqual([])
  expect(poolsForMaterial(['learning'], 'mixed')).toEqual(['learning'])
})
