import { expect, it } from 'vitest'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
import { blockOpportunity, createBlock, learnConcept, mergeBlock, modeChangeEvidence, parseBlocks } from './blocks'
import { awaitingRecall, recentLearning } from './learning'
import { bankItems } from './selection'
import { ESTADO_INICIAL, combinarEstados, leerEstadoDesconocido, reconstruirProgreso } from '../store/model'
import { emptyNbmeState } from '../nbme/model'
import { evaluarDominio } from '../srs/mastery'
import type { Intento } from '../srs/tipos'
const concept = myqbankConcepts[0]
const entries = [{kind:'concept' as const,id:concept.concept_id,revision:'qa',concept}]
const base = createBlock('learning-block',entries,'tutor',100)
const learned = learnConcept(base,0,true,200)
const state = {...ESTADO_INICIAL,myqbankBlocks:{[base.id]:learned}}
const answer:Intento={attempt_id:blockOpportunity(base.id,0),pregunta_id:blockOpportunity(base.id,0),session_id:base.id,ts:300,calificacion:3,resultado:'correcta',respuesta_dada:'alpha',interaccion:'recuperacion_libre',recuperacion_activa:true,pistas_usadas:0,fuente_consultada:false,explicacion_previa:false,ms:1000,tipo_error:'ninguno',confianza_declarada:null}
it('teaching is seen and queued for recall without recording a correct or incorrect attempt',()=>{
 expect(leerEstadoDesconocido(state)?.myqbankBlocks).toEqual(state.myqbankBlocks)
 expect(state.progreso).toEqual({})
 expect(bankItems([concept],null,state,emptyNbmeState())[0]).toMatchObject({seen:true,pools:['learning']})
 expect(awaitingRecall(state,concept.concept_id,200)).toBe(true)
 expect(recentLearning(state,concept.concept_id,300)).toBe(true)
 expect(recentLearning(state,concept.concept_id,200+state.criterios.separacionHoras*3_600_000)).toBe(false)
})
it('recall closes teaching, retains exposure and merges older devices without reopening it',()=>{
 const recall=learnConcept(learned,0,false,300)
 expect(mergeBlock(recall,base)).toEqual(mergeBlock(base,recall))
 expect(mergeBlock(recall,learned).learning?.[0]).toEqual({open:false,viewedAt:200,changedAt:300})
 expect(modeChangeEvidence(recall,[]).assistedConceptIds).toEqual([concept.concept_id])
 expect(parseBlocks({[base.id]:recall})).not.toBeNull()
 const reopened=learnConcept(recall,0,true,400)
 expect(mergeBlock(reopened,recall).learning?.[0].viewedAt).toBe(400)
})
it('does not teach during Test, after closure, or on an NBME item',()=>{
 expect(learnConcept({...base,mode:'test'},0,true,200).learning).toBeUndefined()
 expect(learnConcept({...base,completedAt:150},0,true,200).learning).toBeUndefined()
 expect(learnConcept(createBlock('nbme',[{kind:'nbme',id:'QA',revision:'1'}],'tutor',100),0,true,200).learning).toBeUndefined()
 expect(parseBlocks({[base.id]:{...learned,mode:'test'}})).toBeNull()
 expect(parseBlocks({[base.id]:{...learned,learning:{1:{open:true,viewedAt:200,changedAt:200}}}})).toBeNull()
})
it('concurrent help and answer preserve the answer but cannot become independent mastery',()=>{
 const answered={...ESTADO_INICIAL,myqbankBlocks:{[base.id]:base},progreso:{[concept.concept_id]:reconstruirProgreso(concept.concept_id,[answer],state.criterios)}}
 const combined=combinarEstados(state,answered)
 expect(combined).toEqual(combinarEstados(answered,state))
 expect(combined.progreso[concept.concept_id].intentos).toHaveLength(1)
 expect(combined.progreso[concept.concept_id].intentos[0]).toMatchObject({respuesta_dada:'alpha',resultado:'correcta',explicacion_previa:true})
 expect(evaluarDominio(combined.progreso[concept.concept_id],state.criterios,500).cumple).toBe(false)
 expect(awaitingRecall(combined,concept.concept_id,200)).toBe(true)
 expect(leerEstadoDesconocido(combined)).not.toBeNull()
})
it('only a later independent correct answer clears Learning, with Test results hidden until closure',()=>{
 const assisted={...answer,explicacion_previa:true}
 const progress=(attempts:Intento[])=>({...state,progreso:{[concept.concept_id]:reconstruirProgreso(concept.concept_id,attempts,state.criterios)}})
 expect(awaitingRecall(progress([assisted]),concept.concept_id,200)).toBe(true)
 expect(awaitingRecall(progress([answer]),concept.concept_id,200)).toBe(true)
 const independent={...answer,attempt_id:'later:mq:0',pregunta_id:'later:mq:0',session_id:'later',ts:201+state.criterios.separacionHoras*3_600_000}
 const later={...progress([assisted,independent]),myqbankBlocks:{...state.myqbankBlocks,later:createBlock('later',entries,'test',80_000_000)}}
 expect(awaitingRecall(later,concept.concept_id,200)).toBe(true)
 later.myqbankBlocks.later={...later.myqbankBlocks.later,completedAt:independent.ts+1}
 expect(awaitingRecall(later,concept.concept_id,200)).toBe(false)
 expect(bankItems([concept],null,later,emptyNbmeState())[0].pools).not.toContain('learning')
 expect(awaitingRecall(progress([{...independent,resultado:'incorrecta'}]),concept.concept_id,200)).toBe(true)
})
