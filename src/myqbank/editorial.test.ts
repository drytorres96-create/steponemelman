import { describe, expect, it } from 'vitest'
import { acceptedExplanation, fallbackSections, sourceIdentity, type EditorialExplanation } from './editorial'
import { availableSections } from './contracts'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
import { webcrypto } from 'node:crypto'

describe('source-matched, independently reviewed explanations', () => {
  it('refuses pending, missing review, changed answers, variants and hashes', async () => {
    Object.defineProperty(globalThis, 'crypto', {value:webcrypto, configurable:true})
    const source = await sourceIdentity(myqbankConcepts[1])
    const approved: EditorialExplanation = {schemaVersion:1,language:'es',version:'qa1',review:'approved',source,
      sections:[{id:'idea',label:'Key idea',heading:'Idea',status:'available',paragraphs:['Texto sintético.']}],
      evidence:[{sectionId:'idea',sourceRef:'synthetic-only',locator:'QA'}],
      independentReview:{author:'Synthetic author',reviewer:'Synthetic independent reviewer',reviewedAt:'2026-10-14T12:00:00Z',sourceHash:source.sourceHash}}
    expect(acceptedExplanation(approved,source)).toEqual(approved)
    expect(acceptedExplanation({...approved,review:'pending'},source)).toBeNull()
    expect(acceptedExplanation({...approved,independentReview:undefined},source)).toBeNull()
    expect(acceptedExplanation({...approved,independentReview:{...approved.independentReview,reviewer:'Synthetic author'}},source)).toBeNull()
    expect(acceptedExplanation(approved,{...source,variantId:'different'})).toBeNull()
    const changed = await sourceIdentity({...myqbankConcepts[1],respuesta_canonica:'changed answer'})
    expect(changed.sourceHash).not.toBe(source.sourceHash)
    expect(acceptedExplanation(approved,changed)).toBeNull()
    expect(acceptedExplanation({...approved,evidence:[]},source)).toBeNull()
  })
  it('fallback does not fabricate mechanisms, distractors, patterns or drills', () => {
    const free = myqbankConcepts[0]
    expect(availableSections(fallbackSections(free)).map(s=>s.id)).toEqual(['idea'])
    expect(fallbackSections(myqbankConcepts[1]).map(s=>s.id)).toEqual(['idea','choices'])
    const missing = {...myqbankConcepts[1],evaluacion:{...myqbankConcepts[1].evaluacion,opciones:myqbankConcepts[1].evaluacion.opciones!.map(o=>({...o,por_que:''}))}}
    expect(fallbackSections(missing).map(s=>s.id)).toEqual(['idea'])
  })
})
