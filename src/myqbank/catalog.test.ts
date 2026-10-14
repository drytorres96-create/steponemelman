import { describe, expect, it } from 'vitest'
import { buildConceptCatalog, validateConceptCatalog } from './catalog'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
import type { Indice } from '../schema/concept'
import { bankItems, selectBankItems } from './selection'
import { ESTADO_INICIAL } from '../store/model'
import { emptyNbmeState } from '../nbme/model'

const index = {corpus_version:'1.2.3',modulos:[{sesiones:[{conceptos:myqbankConcepts.map(c=>c.concept_id)}]}]} as Indice
describe('private, versioned selection metadata', () => {
  it('keeps filters and scheduling identical without transferring questions or explanations', () => {
    const catalog=buildConceptCatalog(index,myqbankConcepts)
    const text=JSON.stringify(catalog)
    expect(text).not.toContain('respuesta_canonica')
    expect(text).not.toContain('evaluacion')
    expect(text).not.toContain('explicacion')
    const metadata=validateConceptCatalog(catalog,index)
    const options={material:'concepts' as const,systems:['Renal','Cardiovascular'],pools:['unused' as const],form:'all',search:''}
    const select=(cs:typeof metadata)=>selectBankItems(bankItems(cs,null,ESTADO_INICIAL,emptyNbmeState()),options,ESTADO_INICIAL,100).map(i=>i.id)
    expect(select(metadata)).toEqual(select(myqbankConcepts))
  })
  it('rejects mixed versions, missing or duplicate IDs and quarantined items', () => {
    const catalog=buildConceptCatalog(index,myqbankConcepts)
    expect(()=>validateConceptCatalog({...catalog,corpusVersion:'1.2.2'},index)).toThrow()
    expect(()=>validateConceptCatalog({...catalog,items:catalog.items.slice(1)},index)).toThrow()
    expect(()=>validateConceptCatalog({...catalog,items:catalog.items.map(()=>catalog.items[0])},index)).toThrow()
    expect(()=>validateConceptCatalog({...catalog,items:catalog.items.map((x,i)=>i?x:{...x,calidad:{estado:'cuarentena'}})},index)).toThrow()
  })
})
