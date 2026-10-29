import { expect, it } from 'vitest'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
import { versionPregunta } from '../screens/sesion'
import { ESTADO_INICIAL, combinarEstados, leerEstadoDesconocido, reconstruirProgreso } from '../store/model'
import type { Intento } from '../srs/tipos'
import { recheckAcceptedAnswer } from './grading'
import { createBlock } from './blocks'
import { EVALUADOR_VERSION, evaluarTexto } from '../lib/normalize'
const concept = {...myqbankConcepts[0], respuesta_canonica:'first or initial', sinonimos:['first'], evaluacion:{...myqbankConcepts[0].evaluacion,respuestas_aceptadas:['initial']}}
const attempt: Intento = {attempt_id:'qa:mq:0',pregunta_id:'qa:mq:0',session_id:'qa',ts:100,ms:2000,
 pregunta_version:versionPregunta(concept),evaluador_version:'2.4.0',respuesta_dada:'INITIAL',resultado:'parcial',
 calificacion:2,tipo_error:'recuerdo_incompleto',recuperacion_activa:true,interaccion:'recuperacion_libre',pistas_usadas:0,
 explicacion_previa:true,fuente_consultada:false,calificado_por_ia:true,motivo_calificacion_ia:'Synthetic: partial answer.',confianza_declarada:null}
it('explicit recheck preserves identity, text, timing, assistance and original AI reason across reload and merge',()=>{
 const corrected=recheckAcceptedAnswer(concept,attempt,300)!
 expect(corrected).toEqual({...attempt,resultado:'correcta',calificacion:3,tipo_error:'correcta_con_pistas',correccion_manual:true,evaluador_version:'2.6.1',calificacion_actualizada_en:300})
 const state=(a:Intento)=>({...ESTADO_INICIAL,progreso:{[concept.concept_id]:reconstruirProgreso(concept.concept_id,[a],ESTADO_INICIAL.criterios)}})
 const original=state(attempt), updated=state(corrected)
 expect(combinarEstados(original,updated)).toEqual(combinarEstados(updated,original))
 const reloaded=leerEstadoDesconocido(combinarEstados(original,updated))!
 expect(reloaded.progreso[concept.concept_id].intentos).toEqual([corrected])
 expect(original.progreso[concept.concept_id].intentos).toEqual([attempt])
 expect(recheckAcceptedAnswer(concept,corrected,400)).toBeNull()
})
it('rejects changed presentations, variants, conflicts, manual grades and unrecognized answers',()=>{
 for(const extra of [{pregunta_version:'other'},{variante_id:'other'},{respuestas_en_conflicto:['initial','other']},
 {correccion_manual:true},{calificado_por_ia:false},{respuesta_dada:'unrelated'},{respuesta_dada:''}]){
  expect(recheckAcceptedAnswer(concept,{...attempt,...extra},300)).toBeNull()
 }
 expect(recheckAcceptedAnswer(concept,{...attempt,respuesta_dada:'first',explicacion_previa:false},300)?.tipo_error).toBe('ninguno')
})
it('new reason is optional, bounded and does not invent metadata in legacy progress',()=>{
 const state=(a:Intento)=>({...ESTADO_INICIAL,progreso:{QA:reconstruirProgreso('QA',[a],ESTADO_INICIAL.criterios)}})
 const {motivo_calificacion_ia,...legacy}=attempt
 expect(leerEstadoDesconocido(state(legacy))?.progreso.QA.intentos[0].motivo_calificacion_ia).toBeUndefined()
 expect(leerEstadoDesconocido(state({...attempt,motivo_calificacion_ia:'x'.repeat(201)}))?.progreso.QA.intentos??[]).toHaveLength(0)
})

it('keeps saved questions and evaluator 2.5.0 attempts when editorial answers change',()=>{
 const before={...concept,respuesta_canonica:'original label',sinonimos:[],
  evaluacion:{...concept.evaluacion,pregunta:'Synthetic: name the original label.',respuestas_aceptadas:['original label']}}
 const after={...before,respuesta_canonica:'replacement label',
  evaluacion:{...before.evaluacion,pregunta:'Synthetic: name the replacement label.',respuestas_aceptadas:['replacement label']}}
 const oldAttempt:Intento={...attempt,evaluador_version:'2.5.0',pregunta_version:versionPregunta(before),respuesta_dada:'original label'}
 const block=createBlock('qa-editorial-snapshot',[{kind:'concept',id:before.concept_id,revision:versionPregunta(before),concept:before}],'tutor',100)
 const saved={...ESTADO_INICIAL,myqbankBlocks:{[block.id]:block},
  progreso:{[before.concept_id]:reconstruirProgreso(before.concept_id,[oldAttempt],ESTADO_INICIAL.criterios)}}
 const original=structuredClone(saved)
 const restored=leerEstadoDesconocido(JSON.parse(JSON.stringify(combinarEstados(saved,ESTADO_INICIAL))))!
 expect(restored.myqbankBlocks?.[block.id].entries).toEqual(block.entries)
 expect(restored.progreso[before.concept_id].intentos).toEqual([oldAttempt])
 expect(versionPregunta(after)).not.toBe(versionPregunta(before))
 expect(recheckAcceptedAnswer(after,oldAttempt,400)).toBeNull()
 expect(evaluarTexto('replacement label',after.respuesta_canonica,after.evaluacion.respuestas_aceptadas)).toBe('correcta')
 // An explicit recheck may use the saved source and stamps only that requested correction.
 const rechecked=recheckAcceptedAnswer(before,oldAttempt,400)!
 expect(rechecked).toMatchObject({evaluador_version:EVALUADOR_VERSION,resultado:'correcta',pregunta_version:versionPregunta(before)})
 expect(saved).toEqual(original)
})
