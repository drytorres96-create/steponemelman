import { describe, expect, it } from 'vitest'
import { filterLabSections, LAB_SECTIONS } from './lab-values'

describe('USMLE reference coverage and lookup', () => {
  const rows = LAB_SECTIONS.flatMap(s => s.rows)
  it('keeps all reviewed entries and the three official pages, including non-serum tests', () => {
    expect(rows).toHaveLength(114)
    expect(new Set(rows.map(r => r.id)).size).toBe(114)
    expect([7,8,9].map(page => LAB_SECTIONS.filter(s => s.page === page).flatMap(s => s.rows).length)).toEqual([41,39,34])
    expect(rows.filter(r => r.si === null).map(r => r.id)).toEqual(['bmi'])
    expect(filterLabSections('', 'urine')[0].rows).toHaveLength(4)
    expect(filterLabSections('', 'csf')[0].rows).toHaveLength(6)
  })
  it('finds abbreviations, specimen and subgroup together across sections', () => {
    expect(filterLabSections('  TIBC ')[0].rows.map(r => r.id)).toEqual(['tibc'])
    expect(filterLabSections('csf glucose')[0].rows.map(r => r.id)).toEqual(['csf-glucose'])
    expect(filterLabSections('FSH midcycle')[0].rows.map(r => r.id)).toEqual(['fsh-midcycle'])
    expect(filterLabSections('PaO2')[0].rows.map(r => r.id)).toEqual(['po2'])
    expect(filterLabSections('not-a-test')).toEqual([])
  })
  it('preserves timing, specimen context and non-interchangeable SI representations', () => {
    expect(rows.find(r => r.id === 'cortisol-2000')).toMatchObject({context:'2000 h',reference:'<50% of 0800 h',si:'Fraction of 0800 h: <0.50'})
    expect(rows.find(r => r.id === 'ph')).toMatchObject({reference:'7.35–7.45',si:'[H⁺] 36–44 nmol/L'})
    expect(rows.filter(r => /^(hydroxycorticosteroids|ketosteroids)-/.test(r.id)).every(r => r.context?.includes('24-hour urine'))).toBe(true)
    expect(rows.find(r => r.id === 'hba1c')).toMatchObject({reference:'≤6%',si:'≤42 mmol/mol'})
  })
})
