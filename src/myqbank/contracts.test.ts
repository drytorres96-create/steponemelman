import { describe, expect, it } from 'vitest'
import { availableSections, canReveal, safePercent, selectUniqueItems, type EligibleItem, type ExplanationSection } from './contracts'

describe('My Q Bank presentation contracts', () => {
  it('unions intersecting pools and systems without adding the same opportunity twice', () => {
    const a: EligibleItem = { id: 'a', kind: 'nbme', systems: ['renal','cardio'], pools: ['incorrect','flagged'] }
    const b: EligibleItem = { id: 'b', kind: 'concept', systems: ['renal'], pools: ['unused'] }
    expect(selectUniqueItems([a, a, b], 'mixed', ['renal','cardio'], ['incorrect','flagged','unused']).map(i => i.id)).toEqual(['a','b'])
    expect(selectUniqueItems([a,b], 'concepts', ['renal'], ['unused']).map(i => i.id)).toEqual(['b'])
    expect(selectUniqueItems([a,b], 'nbme', [], ['unused'])).toEqual([])
  })
  it('does not convert missing accuracy into a zero or render unavailable teaching sections', () => {
    expect(safePercent(0,0)).toBeNull()
    expect(safePercent(0,3)).toBe(0)
    const section: ExplanationSection = { id: 'key', label: 'Key idea', status: 'available', heading: 'Clave', paragraphs: ['Texto respaldado.'] }
    expect(availableSections([section, { ...section, id: 'choices', status: 'not_applicable' }, { ...section, id: 'pattern', status: 'pending' }, { ...section, id: 'empty', paragraphs: [] }, { ...section, id: 'blank', paragraphs: ['  '] }, { ...section, id: 'drill', paragraphs: [], drill: { prompt: 'Pregunta', answer: '' } }])).toEqual([section])
  })
  it.each([
    ['test',false,false,false], ['test',true,false,false], ['test',false,true,false], ['test',true,true,true],
    ['tutor',false,false,false], ['tutor',true,false,true], ['tutor',false,true,false], ['tutor',true,true,true],
  ] as const)('%s submitted=%s completed=%s reveals=%s', (mode, submitted, completed, expected) => {
    expect(canReveal(mode, submitted, completed)).toBe(expected)
  })
})
