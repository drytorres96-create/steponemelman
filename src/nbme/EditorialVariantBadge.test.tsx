import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EditorialVariantBadge, isEditorialNbmeVariant } from './EditorialVariantBadge'

const original = { revision: '36cbb99ffca88ab1', provenance: { sourceFile: 'synthetic', sourceRecordId: 'QA', notes: [] } }

describe('editorial NBME source identification', () => {
  it.each(['36cbb99ffca88ab1', 'synthetic-r1', 'uncurated-r1', 'noneditorial-r1', 'source-editorially-reviewed'])
    ('does not label an ordinary revision %s or companion notes', revision => {
      const question = { revision, provenance: { ...original.provenance, notes: ['Editorial companion reviewed by AI.'] } }
      expect(isEditorialNbmeVariant(question)).toBe(false)
      expect(renderToStaticMarkup(<EditorialVariantBadge question={question}/>)).toBe('')
    })

  it.each(['36cbb99ffca88ab1-editorial20261029r1', '36cbb99ffca88ab1-editorial20261029r2', 'source-editorial-v2', 'curated-r1', 'source.curated20261029r1'])
    ('does not infer review approval from an editorial revision name %s', revision => {
      expect(isEditorialNbmeVariant({ ...original, revision })).toBe(false)
    })

  it('shows the Spanish disclosure from explicit provenance without exposing or changing private metadata', () => {
    const question = { ...original, provenance: { ...original.provenance, editorialDerivedEvaluation: {
      authorRunId: 'private-synthetic-author', originalRevision: 'original-r1', originalSourceHash: 'synthetic-hash',
      change: 'Synthetic editorial discriminator', status: 'approved', reviewKind: 'ai',
    } } }
    const before = JSON.stringify(question)
    const markup = renderToStaticMarkup(<EditorialVariantBadge question={question}/>)
    expect(markup).toBe('<span class="nbme-editorial-badge" lang="es">Variante editorial · revisada por IA</span>')
    expect(markup).not.toContain('private-synthetic-author')
    expect(JSON.stringify(question)).toBe(before)
  })

  it.each([false, true, null, '', 'false', [], 0, {}, { status: 'approved' }, { status: 'approved', reviewKind: 'human' }, { status: 'not_approved_not_for_publication', reviewKind: 'ai' }, { status: 'pending', reviewKind: 'ai' }].map(marker => ({ marker })))('ignores an unapproved provenance value $marker', ({ marker }) => {
    expect(isEditorialNbmeVariant({ ...original, provenance: { ...original.provenance, editorialDerivedEvaluation: marker } })).toBe(false)
  })
})
