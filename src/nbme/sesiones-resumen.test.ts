import { describe, expect, it } from 'vitest'
import { archiveNbmeSession, activateNbmeSession, emptyNbmeState, isNbmeSessionArchived, mergeNbmeStates,
  parseNbmeState, reviewNbmeAnswer, startNbmeSession, submitNbmeAnswer, summarizeNbmeState } from './model'
import { resumenSesionNbme, sesionesVisiblesNbme } from './sesiones-resumen'
import type { NbmeQuestion } from './types'

const question = (id: string): NbmeQuestion => ({ id, revision: 'r1', form: '27', section: 1, item: 1, page: 1,
  systems: [], disciplines: [], topic: 'Synthetic', objective: null, status: 'ready', reasons: [], figureRequired: false,
  conceptLinks: [], stem: 'Synthetic question only.', options: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }],
  answer: 'A', explanation: 'Synthetic explanation.', figures: [], provenance: { sourceFile: 'test', sourceRecordId: id, notes: [] } })
const questions = [question('Q1'), question('Q2'), question('Q3')]
const start = () => startNbmeSession(emptyNbmeState(), { id: 'S1', title: 'QA session', refs: questions }, 100)

describe('retirar sesiones conservando el progreso NBME', () => {
  it('conserva respuestas y métricas, se guarda y no vuelve desde otro dispositivo', () => {
    let state = start()
    state = reviewNbmeAnswer(submitNbmeAnswer(state, 'S1', 0, questions[0], 'A', 10, 200), 'S1', 0, 201)
    state = submitNbmeAnswer(state, 'S1', 1, questions[1], 'B', 20, 300)
    const before = summarizeNbmeState(state)
    const archived = archiveNbmeSession(state, 'S1', 400)
    expect(archived.sessions).toEqual(state.sessions)
    expect(archived.attempts).toEqual(state.attempts)
    expect(summarizeNbmeState(archived)).toEqual(before)
    expect(archived.activeSessionId).toBeNull()
    expect(sesionesVisiblesNbme(archived)).toEqual([])
    expect(parseNbmeState(JSON.parse(JSON.stringify(archived)))).toEqual(archived)
    for (const merged of [mergeNbmeStates(state, archived), mergeNbmeStates(archived, state)]) {
      expect(isNbmeSessionArchived(merged, 'S1')).toBe(true)
      expect(merged.activeSessionId).toBeNull()
      expect(merged.attempts).toEqual(state.attempts)
    }
    expect(() => activateNbmeSession(archived, 'S1')).toThrow('no disponible')
    expect(() => submitNbmeAnswer(archived, 'S1', 2, questions[2], 'A', 20, 500)).toThrow('no disponible')
  })

  it('lee el estado anterior sin el campo y valida el nuevo campo opcional', () => {
    const old = start()
    expect(parseNbmeState(JSON.parse(JSON.stringify(old)))).toEqual(old)
    expect(parseNbmeState({ ...old, archivedSessions: { S1: 100 } })?.activeSessionId).toBeNull()
    expect(parseNbmeState({ ...old, archivedSessions: { S1: -1 } })).toBeNull()
    expect(parseNbmeState({ ...old, archivedSessions: ['S1'] })).toBeNull()
    expect(parseNbmeState({ ...old, archivedSessions: { constructor: 100 } })).toBeNull()
    expect(archiveNbmeSession(old, 'missing')).toBe(old)
    const archived = archiveNbmeSession(old, 'S1', 200)
    expect(archiveNbmeSession(archived, 'S1', 300)).toBe(archived)
  })

  it('mantiene el archivo y admite una respuesta offline sin cambiar la primera respuesta', () => {
    const base = start()
    const archived = archiveNbmeSession(base, 'S1', 500)
    const offline = submitNbmeAnswer(base, 'S1', 0, questions[0], 'B', 10, 600)
    const merged = mergeNbmeStates(archived, offline)
    expect(merged.archivedSessions).toEqual({ S1: 500 })
    expect(merged.attempts['S1:0']).toEqual(offline.attempts['S1:0'])
    expect(sesionesVisiblesNbme(merged)).toEqual([])
    expect(parseNbmeState(JSON.parse(JSON.stringify(merged)))).toEqual(merged)
  })

  it('separa aciertos, errores y preguntas sin responder de la primera vuelta', () => {
    let state = start()
    state = reviewNbmeAnswer(submitNbmeAnswer(state, 'S1', 0, questions[0], 'A', 10, 200), 'S1', 0, 201)
    state = reviewNbmeAnswer(submitNbmeAnswer(state, 'S1', 1, questions[1], 'B', 10, 300), 'S1', 1, 301)
    expect(resumenSesionNbme(state, state.sessions.S1)).toMatchObject({ correct: 1, wrong: 1, unanswered: 1, status: 'A medias' })
    state = reviewNbmeAnswer(submitNbmeAnswer(state, 'S1', 2, questions[2], 'A', 10, 400), 'S1', 2, 401)
    expect(resumenSesionNbme(state, state.sessions.S1)).toMatchObject({ correct: 2, wrong: 1, unanswered: 0, status: 'Primera vuelta completada' })
    state = reviewNbmeAnswer(submitNbmeAnswer(state, 'S1', 4, questions[1], 'A', 10, 500), 'S1', 4, 501)
    expect(resumenSesionNbme(state, state.sessions.S1)).toMatchObject({ correct: 2, wrong: 1, unanswered: 0, status: 'Completada' })
  })

  it('no mezcla bloques internos de Cajas con las sesiones de la biblioteca', () => {
    const state = startNbmeSession(start(), { id: 'C1', title: 'Cajas', refs: [questions[0]] }, 200)
    expect(sesionesVisiblesNbme(state).map(item => item.id)).toEqual(['S1'])
  })
})
