import { describe, expect, it } from 'vitest'
import { ESTADO_INICIAL, combinarEstados, leerEstadoDesconocido, reconstruirProgreso } from '../store/model'
import { discardNbmeSession, emptyNbmeState, mergeNbmeStates, parseNbmeState, reviewNbmeAnswer, setNbmeDraft, startNbmeSession, submitNbmeAnswer } from '../nbme/model'
import type { Intento } from '../srs/tipos'
import type { NbmeQuestion } from '../nbme/types'

// Todos los datos son sintéticos. No llama transporte, RPC, Supabase ni banco real.
const intento: Intento = {
  attempt_id: 'QA-intento-1', session_id: 'QA-estudio', pregunta_id: 'QA-estudio:0:QA-concepto', ts: 1000,
  calificacion: 3, resultado: 'correcta', interaccion: 'recuperacion_libre', recuperacion_activa: true,
  pistas_usadas: 0, ms: 1200, tipo_error: 'ninguno', confianza_declarada: 2,
  fuente_consultada: false, explicacion_previa: false, respuesta_dada: 'alfa', tipo_evidencia: 'recuerdo',
}
const estudioActual = () => ({ ...ESTADO_INICIAL,
  msEstudio: 1200, vistoAlguna: true, fieldUpdatedAt: { criterios: 0, reanudable: 2000 },
  progreso: { 'QA-concepto': reconstruirProgreso('QA-concepto', [intento], ESTADO_INICIAL.criterios) },
  reanudable: { versionFormato: 2 as const, modulo: 'QA-modulo', sesion: 'repaso', indice: 1, ts: 2000,
    sessionId: 'QA-estudio', conceptIds: ['QA-concepto', 'QA-siguiente'], cantidadInicial: 2,
    msVisibles: 3000, presupuestoMinutos: 10 as const,
    paso: { indice: 1, pistas: 0, fuenteConsultada: false, explicacionPrevia: false, confianza: 1 as const, msActivo: 500 } },
  sesiones: [{ id: 'QA-estudio', inicio: 500, fin: null, modulo: 'QA-modulo', ruta: 'repaso', vistos: 1, correctos: 1, ms: 1200 }],
})
const pregunta: NbmeQuestion = {
  id: 'QA-pregunta', revision: 'r1', form: '27', section: 1, item: 1, page: 1,
  systems: [], disciplines: [], topic: 'Ejemplo sintético', objective: null, status: 'ready', reasons: [],
  figureRequired: false, conceptLinks: [], stem: 'Synthetic question',
  options: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }], answer: 'A', explanation: 'Synthetic explanation',
  figures: [], provenance: { sourceFile: 'QA', sourceRecordId: 'QA', notes: [] },
}
function bancoActual() {
  let s = startNbmeSession(emptyNbmeState('QA-bank'), {
    id: 'QA-activa', title: 'QA práctica', refs: [{ id: pregunta.id, revision: pregunta.revision }], budgetMinutes: 10,
  }, 500)
  s = submitNbmeAnswer(s, 'QA-activa', 0, pregunta, 'B', 900, 1000)
  s = reviewNbmeAnswer(s, 'QA-activa', 0, 1200)
  s = setNbmeDraft(s, 'QA-activa', 1, 'A', 1400)
  // Una sesión realmente descartada: la lápida convive con otra sesión activa e intentos.
  s = startNbmeSession(s, { id: 'QA-descartada', title: 'QA antigua', refs: [{ id: pregunta.id, revision: 'r1' }] }, 600)
  s = discardNbmeSession(s, 'QA-descartada', 1600)
  s = { ...s, activeSessionId: 'QA-activa', activeChangedAt: 1700 }
  return s
}

describe('compatibilidad de estados guardados al mezclar descartes', () => {
  it('lee y combina study_state actual con intento, sesión y punto de continuación intactos', () => {
    const raw = estudioActual()
    const leido = leerEstadoDesconocido(JSON.parse(JSON.stringify(raw)))!
    expect(leido).not.toBeNull()
    expect(leerEstadoDesconocido(JSON.parse(JSON.stringify(combinarEstados(leido, leido))))).toEqual(leido)
    expect(leido.progreso['QA-concepto'].intentos).toEqual([intento])
    expect(leido.reanudable).toEqual(raw.reanudable)
  })

  it('lee study_state antiguo sin metadata opcional y conserva el mismo historial', () => {
    const raw = estudioActual() as Record<string, unknown>
    const reanudable = { ...(raw.reanudable as Record<string, unknown>) }
    delete reanudable.versionFormato; delete reanudable.cantidadInicial; delete reanudable.paso
    delete reanudable.msVisibles; delete reanudable.presupuestoMinutos
    delete raw.fieldUpdatedAt
    raw.reanudable = reanudable
    const leido = leerEstadoDesconocido(JSON.parse(JSON.stringify(raw)))!
    expect(leido).not.toBeNull()
    expect(leido.progreso['QA-concepto'].intentos).toEqual([intento])
    expect(leido.reanudable).toEqual(reanudable)
    // La mezcla ya completaba estas marcas para clientes antiguos antes de este lote.
    expect(leerEstadoDesconocido(JSON.parse(JSON.stringify(combinarEstados(leido, leido))))).toEqual({
      ...leido, fieldUpdatedAt: { criterios: 0, reanudable: 2000 },
    })
  })

  it('poda empates determinísticamente sin alterar sesión NBME, letras, borrador ni historial', () => {
    const estudio = leerEstadoDesconocido(JSON.parse(JSON.stringify(estudioActual())))!
    const antesEstudio = structuredClone(estudio)
    const original = bancoActual()
    const a = parseNbmeState(JSON.parse(JSON.stringify(original)))!, b = parseNbmeState(JSON.parse(JSON.stringify(original)))!
    expect(a).not.toBeNull(); expect(b).not.toBeNull()
    for (let n = 0; n < 101; n++) a.discarded[`A${n}`] = 1500
    for (let n = 0; n < 100; n++) b.discarded[`B${n}`] = 1500
    const unido = mergeNbmeStates(a, b)
    expect(unido).toEqual(mergeNbmeStates(b, a))
    expect(parseNbmeState(JSON.parse(JSON.stringify(unido)))).toEqual(unido)
    expect(unido.sessions).toEqual(original.sessions)
    expect(unido.attempts).toEqual(original.attempts)
    expect(unido.activeSessionId).toBe(original.activeSessionId)
    expect(unido.bankVersion).toBe(original.bankVersion)
    expect(unido.discarded['QA-descartada']).toBe(1600)
    expect(estudio).toEqual(antesEstudio)
  })

  it('el NBME anterior a las lápidas carga sin cambiar los intentos o las letras guardadas', () => {
    const raw = JSON.parse(JSON.stringify(bancoActual()))
    delete raw.discarded
    const leido = parseNbmeState(raw)!
    expect(leido).not.toBeNull()
    expect(leido.discarded).toEqual({})
    expect(leido.sessions).toEqual(raw.sessions)
    expect(leido.attempts).toEqual(raw.attempts)
    expect(leido.sessions['QA-activa'].drafts['1'].optionId).toBe('A')
  })
})
