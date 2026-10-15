import { describe, expect, it } from 'vitest'
import { activateNbmeSession, updateNbmeSession, completeNbmeSession, deriveNbmeSession, emptyNbmeState, markNbmePosition, mergeNbmeStates, navigateNbmeSession, parseNbmeState, questionProgress, setNbmeDraft, startNbmeSession, submitNbmeAnswer } from '../nbme/model'
import type { NbmeQuestion } from '../nbme/types'
import { blockTime, timeBlock, createBlock, draftBlock, markBlock, mergeBlock, parseBlocks, patchBlock } from './blocks'
import { ESTADO_INICIAL, combinarEstados, leerEstadoDesconocido, reconstruirProgreso } from '../store/model'
import type { Intento } from '../srs/tipos'
import { anchorAnnotation, mergeAnnotation, type Annotation } from './annotations'
const question: NbmeQuestion = { id: 'QA-1', revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems: ['Renal'], disciplines: ['Fisiología'], topic: 'Synthetic only', objective: null, status: 'ready', reasons: [], figureRequired: false, conceptLinks: [], stem: 'Synthetic question', options: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }], answer: 'A', explanation: 'Synthetic explanation', figures: [], provenance: { sourceFile: 'synthetic', sourceRecordId: 'QA-1', notes: [] } }
const start = () => startNbmeSession(emptyNbmeState(), { id: 'QA-block', title: 'Test', refs: [question, { ...question, id: 'QA-2' }], mode: 'test' }, 100)
describe('My Q Bank persistence with legacy histories', () => {
  it('new local actions survive a previously synced device with a later wall clock', () => {
    const old = { ...emptyNbmeState(), activeChangedAt: 10000 }
    const fresh = startNbmeSession(old, { id: 'QA', title: 'QA', refs: [question], mode: 'tutor' }, 100)
    expect(mergeNbmeStates(fresh, old).activeSessionId).toBe('QA')
    const paused = updateNbmeSession(fresh, 'QA', { paused: true }, 20000)
    const resumed = activateNbmeSession(paused, 'QA', 200)
    expect(mergeNbmeStates(resumed, paused).sessions.QA.paused).toBe(false)
    const first = setNbmeDraft(resumed, 'QA', 0, 'A', 30000)
    const second = setNbmeDraft(first, 'QA', 0, 'B', 300)
    expect(mergeNbmeStates(first, second).sessions.QA.drafts[0].optionId).toBe('B')
  })
  it('time survives independent view segments and repeated device merges', () => {
    const base=createBlock('QA',[{kind:'nbme',id:'QA-1',revision:'r1'}],'tutor',100)
    const a=timeBlock(base,0,'view-A',12000),b=timeBlock(base,0,'view-B',3000)
    const merged=mergeBlock(a,b)
    expect(blockTime(merged,0)).toBe(15000)
    expect(blockTime(mergeBlock(merged,a),0)).toBe(15000)
  })
  it('concurrent concept answers retain both texts and remain ungraded after merging', () => {
    const a:Intento={attempt_id:'QA:mq:0',pregunta_id:'QA:mq:0',session_id:'QA',ts:100,calificacion:3,resultado:'correcta',respuesta_dada:'alpha',interaccion:'opcion_multiple',recuperacion_activa:false,pistas_usadas:0,ms:1000,tipo_error:'ninguno',confianza_declarada:null}
    const b:Intento={...a,ts:200,calificacion:1,resultado:'incorrecta',respuesta_dada:'beta'}
    const merged=reconstruirProgreso('QA-concept',[a,b],ESTADO_INICIAL.criterios)
    expect(merged).toEqual(reconstruirProgreso('QA-concept',[b,a],ESTADO_INICIAL.criterios))
    expect(merged.intentos).toHaveLength(1)
    expect(merged.intentos[0]).toMatchObject({ts:100,resultado:'revision',respuestas_en_conflicto:['alpha','beta']})
    expect(merged.proxima).toBeNull()
    expect(leerEstadoDesconocido({...ESTADO_INICIAL,progreso:{'QA-concept':merged}})?.progreso['QA-concept'].intentos[0].respuestas_en_conflicto).toEqual(['alpha','beta'])
  })
  it('retains 80 exact references and rejects larger blocks', () => {
    const refs = Array.from({ length: 80 }, (_, i) => ({ id: `QA-${i}`, revision: 'r1' }))
    const state = startNbmeSession(emptyNbmeState(), { id: 'QA', title: 'QA', refs, mode: 'test' }, 100)
    expect(parseNbmeState(state)).toEqual(state)
    expect(() => startNbmeSession(emptyNbmeState(), { id: 'QA', title: 'QA', refs: [...refs, { id: 'QA-81', revision: 'r1' }] })).toThrow()
  })
  it('keeps drafts, skips and flag removal across opposite-order device merges', () => {
    const base = start()
    const a = markNbmePosition(setNbmeDraft(base, 'QA-block', 0, 'B', 200), 'QA-block', 0, 'flags', true, 201)
    const b = markNbmePosition(navigateNbmeSession(base, 'QA-block', 1, 300), 'QA-block', 0, 'flags', false, 302)
    const merged = mergeNbmeStates(a, b)
    expect(merged).toEqual(mergeNbmeStates(b, a))
    expect(merged.sessions['QA-block']).toMatchObject({ cursor: 1, drafts: { 0: { optionId: 'B' } }, flags: { 0: { value: false } } })
    expect(parseNbmeState(merged)).toEqual(merged)
  })
  it('saves once, exposes no Test result in progress, and keeps unanswered items ungraded', () => {
    const base = start()
    const sent = submitNbmeAnswer(base, 'QA-block', 0, question, 'B', 2000, 300)
    expect(submitNbmeAnswer(sent, 'QA-block', 0, question, 'A', 2000, 400)).toBe(sent)
    expect(questionProgress(sent, question.id)).toMatchObject({ seen: true, firstCorrect: null, latestCorrect: null, pendingError: false })
    expect(deriveNbmeSession(sent, 'QA-block')!.queue).toHaveLength(2)
    const closed = completeNbmeSession(sent, 'QA-block', 500)
    expect(questionProgress(closed, question.id)).toMatchObject({ firstCorrect: false, pendingError: true })
    expect(Object.keys(closed.attempts)).toHaveLength(1)
    expect(mergeNbmeStates(closed, base).sessions['QA-block'].completedAt).toBe(500)
    const navigated = navigateNbmeSession(closed, 'QA-block', 1, 600)
    expect(setNbmeDraft(navigated, 'QA-block', 1, 'A', 700)).toEqual(navigated)
  })
  it('blocks cannot change mode or exact presentation and merge per-position drafts', () => {
    const block = createBlock('QA', [{ kind: 'nbme', id: 'QA-1', revision: 'r1' }, { kind: 'nbme', id: 'QA-2', revision: 'r1' }], 'test', 100)
    const a = draftBlock(block, 0, { text: 'one' }, 200)
    const b = draftBlock(patchBlock(block, { cursor: 1 }, 201), 1, { text: 'two' }, 202)
    const merged = mergeBlock(a, b)
    expect(merged).toEqual(mergeBlock(b, a))
    expect(merged.drafts[0].value.text).toBe('one'); expect(merged.drafts[1].value.text).toBe('two')
    expect(() => mergeBlock(block, { ...block, mode: 'tutor' })).toThrow()
    expect(parseBlocks({ QA: merged })).toEqual({ QA: merged })
    const state = { ...ESTADO_INICIAL, myqbankBlocks: { QA: markBlock(merged, 'flags', 1, false, 205) } }
    expect(leerEstadoDesconocido(state)?.myqbankBlocks).toEqual(state.myqbankBlocks)
    expect(combinarEstados(state, ESTADO_INICIAL).myqbankBlocks).toEqual(state.myqbankBlocks)
  })
})
describe('durable highlight anchors', () => {
  const a: Annotation = { material: 'concept', sourceId: 'QA', sourceRevision: 'r1', variantId: '', editorialVersion: '', kind: 'highlight', region: 'stem', quote: 'beta', prefix: 'alpha ', suffix: ' gamma', start: 6, end: 10, changedAt: 100, deleted: false }
  it('reattaches a unique literal with context and refuses changed or ambiguous evidence', () => {
    expect(anchorAnnotation('alpha beta gamma', a)).toEqual({ start: 6, end: 10 })
    expect(anchorAnnotation('intro alpha beta gamma', a)).toEqual({ start: 12, end: 16 })
    expect(anchorAnnotation('alpha delta gamma', a)).toBeNull()
    expect(anchorAnnotation('beta beta', { ...a, start: 99, prefix: '', suffix: '' })).toBeNull()
  })
  it('a deletion cannot be resurrected by an old offline device', () => {
    const deleted = { ...a, deleted: true, changedAt: 200 }
    expect(mergeAnnotation(a, deleted)).toEqual(deleted)
    expect(mergeAnnotation(deleted, { ...a, changedAt: 300 })).toEqual(deleted)
  })
})

// Mode changes preserve assistance per concept, without reclassifying unanswered items.
it('does not infer previous explanations merely from a mode change', async () => {
  const { createBlock, modeChangeEvidence, mergeBlock } = await import('./blocks')
  const { myqbankConcepts } = await import('../../e2e/arnes/myqbank-fixture')
  const entries = myqbankConcepts.slice(0,2).map(concept => ({kind:'concept' as const,id:concept.concept_id,revision:'qa',concept}))
  const tutor = createBlock('mode-source',entries,'tutor',100)
  expect(modeChangeEvidence(tutor,[]).assistedConceptIds).toEqual([])
  expect(modeChangeEvidence(tutor,[entries[0].id]).assistedConceptIds).toEqual([entries[0].id])
  const test = createBlock('mode-test',entries,'test',100)
  expect(modeChangeEvidence(test,[entries[0].id]).assistedConceptIds).toEqual([])
  expect(modeChangeEvidence({...test,completedAt:200},[entries[0].id]).assistedConceptIds).toEqual([entries[0].id])
  const changed = {...test,...modeChangeEvidence(tutor,[entries[0].id])}
  expect(mergeBlock(changed,test).assistedConceptIds).toEqual([entries[0].id])
  expect(modeChangeEvidence(changed,[]).assistedConceptIds).toEqual([entries[0].id])
  const closed = markBlock({...test,completedAt:200},'reviewed',0,true,201)
  const navigated = patchBlock(closed,{cursor:1,paused:true},202)
  expect(modeChangeEvidence(navigated,entries.map(e=>e.id)).assistedConceptIds).toEqual(entries.map(e=>e.id).sort())
  const a = {...test,assistedConceptIds:[entries[0].id]}, b = {...test,assistedConceptIds:[entries[1].id]}
  expect(mergeBlock(a,b)).toEqual(mergeBlock(b,a))
  expect(parseBlocks({[test.id]:mergeBlock(a,b)})).not.toBeNull()
})
