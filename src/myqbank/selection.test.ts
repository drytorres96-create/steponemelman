import { expect, it } from 'vitest'
import { bankItems, selectBankItems } from './selection'
import { ESTADO_INICIAL } from '../store/model'
import { emptyNbmeState, startNbmeSession, submitNbmeAnswer } from '../nbme/model'
import { preguntaNbmeReal } from '../../e2e/arnes/nbme-real-fixture'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
import { createBlock, markBlock } from './blocks'
it('union filters and counters produce the exact unique Mixed block; empty systems stay empty', () => {
  const q={...preguntaNbmeReal('QA-NBME'),systems:['Renal','Cardiovascular']}
  const catalog={schemaVersion:1 as const,bankVersion:'qa',total:1,questions:[q]}
  const block=markBlock(createBlock('QA',[{kind:'nbme',id:q.id,revision:q.revision}],'tutor',100),'flags',0,true,200)
  const state={...ESTADO_INICIAL,myqbankBlocks:{QA:block}}
  const items=bankItems(myqbankConcepts,catalog,state,emptyNbmeState())
  const options={material:'mixed' as const,systems:['Renal','Cardiovascular'],pools:['unused','flagged'] as const,form:'all',search:''}
  const selected=selectBankItems(items,{...options,pools:[...options.pools]},state)
  expect(selected).toHaveLength(11)
  expect(new Set(selected.map(i=>i.kind+':'+i.id)).size).toBe(selected.length)
  expect(selectBankItems(items,{...options,systems:[],pools:['unused']},state)).toEqual([])
  expect(selectBankItems(items,{...options,pools:['flagged']},state).map(i=>i.id)).toEqual([q.id])
})
it('open Test answers appear as used without becoming Incorrect pool items', () => {
  const q={...preguntaNbmeReal('QA-NBME'),systems:['Renal']}
  const state=submitNbmeAnswer(startNbmeSession(emptyNbmeState(),{id:'QA',title:'QA',refs:[q],mode:'test'},100),'QA',0,q,'A',1000,200)
  const items=bankItems([],{schemaVersion:1,bankVersion:'qa',total:1,questions:[q]},ESTADO_INICIAL,state)
  expect(items[0]).toMatchObject({seen:true,firstCorrect:null,pools:[]})
})
