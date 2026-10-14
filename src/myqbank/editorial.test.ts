import { describe, expect, it } from 'vitest'
import { acceptedExplanation, reviewedFiguresMatch, explanationHash, fallbackSections, sourceIdentity, type EditorialExplanation } from './editorial'
import { availableSections } from './contracts'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
import { webcrypto } from 'node:crypto'

describe('source-matched, independently reviewed explanations', () => {
  it('refuses pending, missing review, changed answers, variants and hashes', async () => {
    Object.defineProperty(globalThis, 'crypto', {value:webcrypto, configurable:true})
    const source = await sourceIdentity(myqbankConcepts[1])
    const approved: EditorialExplanation = {schemaVersion:1,language:'es',version:'qa1',review:'approved',source,
      sections:[{id:'idea',label:'Key idea',heading:'Idea',status:'available',paragraphs:['Texto sintético.']}],
      evidence:[{sectionId:'idea',sourceRef:'https://example.org/synthetic',locator:'QA'}],
      independentReview:{author:'Synthetic author',reviewer:'Synthetic independent reviewer',kind:'ai',contentHash:'0'.repeat(64),reviewedAt:'2026-10-14T12:00:00Z',sourceHash:source.sourceHash}}
    approved.independentReview!.contentHash = await explanationHash(approved)
    expect(await acceptedExplanation(approved,source)).toEqual(approved)
    const withFigure={...approved,independentReview:{...approved.independentReview!,figures:[{assetId:'QA-figure',md5:'a'.repeat(32),sha256:'b'.repeat(64)}]}}
    expect(reviewedFiguresMatch(withFigure,[{assetId:'QA-figure'}],[{assetId:'QA-figure',sha256:'b'.repeat(64)}])).toBe(true)
    expect(reviewedFiguresMatch(withFigure,[{assetId:'QA-figure'}],[{assetId:'QA-figure',sha256:'c'.repeat(64)}])).toBe(false)
    expect(reviewedFiguresMatch(withFigure,[{assetId:'QA-figure'}],[])).toBe(false)
    expect(reviewedFiguresMatch(withFigure,[{assetId:'other'}],[{assetId:'QA-figure',sha256:'b'.repeat(64)}])).toBe(false)
    expect(await acceptedExplanation({...approved,review:'pending'},source)).toBeNull()
    expect(await acceptedExplanation({...approved,independentReview:undefined},source)).toBeNull()
    expect(await acceptedExplanation({...approved,independentReview:{...approved.independentReview,reviewer:'Synthetic author'}},source)).toBeNull()
    expect(await acceptedExplanation(approved,{...source,variantId:'different'})).toBeNull()
    const changed = await sourceIdentity({...myqbankConcepts[1],respuesta_canonica:'changed answer'})
    expect(changed.sourceHash).not.toBe(source.sourceHash)
    expect(await acceptedExplanation(approved,changed)).toBeNull()
    expect(await acceptedExplanation({...approved,evidence:[]},source)).toBeNull()

    expect(await acceptedExplanation({...approved,sections:[{...approved.sections[0],paragraphs:['A different claim.']}]},source)).toBeNull()
    expect(await acceptedExplanation({...approved,evidence:[{...approved.evidence[0],sourceRef:'changed-reference'}]},source)).toBeNull()
    expect(await acceptedExplanation({...approved,independentReview:{...approved.independentReview,reviewer:'  SYNTHETIC   AUTHOR '}},source)).toBeNull()
    expect(await acceptedExplanation({...approved,independentReview:{...approved.independentReview,kind:undefined}},source)).toBeNull()
    const empty = {...approved,sections:[{...approved.sections[0],paragraphs:[]}]}
    empty.independentReview = {...approved.independentReview!,contentHash:await explanationHash(empty)}
    expect(await acceptedExplanation(empty,source)).toBeNull()

  })
  it('fallback does not fabricate mechanisms, distractors, patterns or drills', () => {
    const free = myqbankConcepts[0]
    expect(availableSections(fallbackSections(free)).map(s=>s.id)).toEqual(['idea'])
    expect(fallbackSections(myqbankConcepts[1]).map(s=>s.id)).toEqual(['idea','choices'])
    const missing = {...myqbankConcepts[1],evaluacion:{...myqbankConcepts[1].evaluacion,opciones:myqbankConcepts[1].evaluacion.opciones!.map(o=>({...o,por_que:''}))}}
    expect(fallbackSections(missing).map(s=>s.id)).toEqual(['idea'])
  })
})
