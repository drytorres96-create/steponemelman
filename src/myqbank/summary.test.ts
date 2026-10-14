import { describe, expect, it } from 'vitest'
import { explanationPreview } from './summary'

describe('clinical previews preserve literal text', () => {
  it('keeps decimals, units, abbreviations, negations and the beginning of the paragraph', () => {
    const text = 'No indica acidosis: pH 7.4, dosis 2.5 mg y riesgo 1.5%. El Sr. Pérez mantiene Na+ de 140 mmol/L.'
    expect(explanationPreview(text)).toBe(text)
    const long = `${text} ${'Una oración adicional completa. '.repeat(50)}`
    const preview = explanationPreview(long)
    expect(long.startsWith(preview)).toBe(true)
    expect(preview).toContain('No indica acidosis: pH 7.4, dosis 2.5 mg y riesgo 1.5%.')
    expect(preview.length).toBeLessThan(long.length)
  })
  it('keeps a long first sentence intact and falls back safely without Segmenter', () => {
    const text = `No ${'excluir '.repeat(90)}el diagnóstico.`
    expect(explanationPreview(text)).toBe(text)
    const original = Intl.Segmenter
    try {
      Object.defineProperty(Intl, 'Segmenter', {value:undefined,configurable:true})
      expect(explanationPreview(text)).toBe(text)
    } finally { Object.defineProperty(Intl, 'Segmenter', {value:original,configurable:true}) }
  })
})
