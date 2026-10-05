import { describe, expect, it } from 'vitest'
import { cajasDelDia } from '../lib/cajas'
import { EVALUADOR_VERSION } from '../lib/normalize'
import { deriveNbmeSession, discardNbmeSession, emptyNbmeState, parseNbmeState, reviewNbmeAnswer, setNbmeDraft, startNbmeSession, submitNbmeAnswer } from '../nbme/model'
import type { NbmeQuestion } from '../nbme/types'
import { CRITERIOS_POR_DEFECTO, evaluarDominio, tipoEvidenciaDeIntento } from '../srs/mastery'
import type { Intento } from '../srs/tipos'
import { ESTADO_INICIAL, leerEstadoDesconocido, reconstruirProgreso, type EstadoApp } from '../store/model'

// Fixtures sintéticos con las formas públicas actuales; no leen banco ni transporte.
const F = (d: number, h = 10) => new Date(2026, 8, d, h).getTime()
const AHORA = F(24)
const acierto = (id: string, ts: number, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: id, session_id: `sesion-${id}`, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, ms: 1500, tipo_error: 'ninguno', confianza_declarada: 2,
  fuente_consultada: false, explicacion_previa: false, respuesta_dada: 'alfa',
  evaluador_version: '2.2.0', ...extra,
})
function studyFixture(): EstadoApp {
  const discriminaciones = [14, 16, 19].map((d, n) => acierto(`D-${n}`, F(d), {
    interaccion: 'secuencia', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  }))
  const recuerdo = [1, 3, 6].map((d, n) => acierto(`M-${n}`, F(d)))
  return { ...ESTADO_INICIAL,
    criterios: { ...CRITERIOS_POR_DEFECTO }, vistoAlguna: true, msEstudio: 10_500,
    fieldUpdatedAt: { criterios: F(19), reanudable: F(24) },
    progreso: {
      D: { ...reconstruirProgreso('D', discriminaciones, CRITERIOS_POR_DEFECTO), estado: 'dominado', dominado_en: F(19) },
      M: reconstruirProgreso('M', [...recuerdo, acierto('M-revision', F(20), {
        resultado: 'revision', tipo_error: 'error_por_revisar', explicacion_previa: true,
      })], CRITERIOS_POR_DEFECTO),
    },
    sesiones: [{ id: 'QA-reanudable', inicio: F(24, 9), fin: null, modulo: 'QA', ruta: 'repaso', vistos: 2, correctos: 1, ms: 3000 }],
    reanudable: {
      versionFormato: 2, modulo: 'QA', sesion: 'repaso', sessionId: 'QA-reanudable',
      indice: 4, ts: F(24), conceptIds: ['D', 'M', 'D', 'M', 'D'], cantidadInicial: 2,
      msVisibles: 8000, presupuestoMinutos: 10,
      paso: { indice: 4, pistas: 1, fuenteConsultada: true, explicacionPrevia: true, confianza: 1, msActivo: 500 },
    },
  }
}
const pregunta: NbmeQuestion = {
  id: 'QA-NBME', revision: 'r1', form: '27', section: 1, item: 1, page: 1,
  systems: [], disciplines: [], topic: 'Sintético', objective: null, status: 'ready', reasons: [],
  figureRequired: false, conceptLinks: [], stem: 'Synthetic question',
  options: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }], answer: 'A',
  explanation: 'Synthetic explanation', figures: [], provenance: { sourceFile: 'QA', sourceRecordId: 'QA', notes: [] },
}
function nbmeFixture() {
  let s = startNbmeSession(emptyNbmeState('QA-bank'), {
    id: 'QA-activa', title: 'QA práctica', refs: [{ id: pregunta.id, revision: 'r1' }], budgetMinutes: 10,
  }, F(21, 9))
  s = submitNbmeAnswer(s, 'QA-activa', 0, pregunta, 'B', 2000, F(21))
  s = reviewNbmeAnswer(s, 'QA-activa', 0, F(21, 11))
  s = setNbmeDraft(s, 'QA-activa', 1, 'A', F(24, 9))
  s = startNbmeSession(s, { id: 'QA-descartada', title: 'Antigua', refs: [{ id: pregunta.id, revision: 'r1' }] }, F(22))
  s = discardNbmeSession(s, 'QA-descartada', F(23))
  return { ...s, activeSessionId: 'QA-activa', activeChangedAt: F(24) }
}

describe('compatibilidad de evidencia y mantenimiento con estados guardados', () => {
  it.each([1, 2, 3] as const)('lee study_state con formato %s y reevalúa flags antiguos sin reescribir historia o continuación', versionFormato => {
    const raw = JSON.parse(JSON.stringify(studyFixture()))
    raw.reanudable.versionFormato = versionFormato
    const original = structuredClone(raw)
    const estado = leerEstadoDesconocido(raw)!
    expect(estado).not.toBeNull()
    expect(evaluarDominio(estado.progreso.D, estado.criterios, AHORA).cumple).toBe(false)
    expect(tipoEvidenciaDeIntento(estado.progreso.D.intentos[0])).toBe('discriminacion')
    expect(evaluarDominio(estado.progreso.M, estado.criterios, AHORA).cumple).toBe(true)
    const cajas = cajasDelDia({ progreso: estado.progreso, criterios: estado.criterios,
      intentosPreguntas: [], conceptoDisponible: () => true, preguntaDisponible: () => true,
      referencia: AHORA, ahora: AHORA })
    expect(cajas.items.find(i => i.id === 'M')).toMatchObject({ mantenimiento: true, vence: estado.progreso.M.proxima })
    expect(estado.progreso.D.intentos).toEqual(original.progreso.D.intentos)
    expect(estado.progreso.M.intentos).toEqual(original.progreso.M.intentos)
    expect(estado.progreso.D.dominado_en).toBe(original.progreso.D.dominado_en)
    expect(estado.reanudable).toEqual(original.reanudable)
    expect(estado.sesiones).toEqual(original.sesiones)
    expect(raw).toEqual(original)
    expect(EVALUADOR_VERSION).toBe('2.3.0')
    expect(estado.progreso.D.intentos[0].evaluador_version).toBe('2.2.0')
  })

  it('lee study_state anterior sin metadatos nuevos sin inventar independencia ni defaults en los intentos', () => {
    const raw = JSON.parse(JSON.stringify(studyFixture()))
    for (const p of Object.values(raw.progreso) as { intentos: Record<string, unknown>[] }[]) {
      for (const i of p.intentos) {
        delete i.tipo_evidencia; delete i.fuente_consultada; delete i.explicacion_previa; delete i.evaluador_version
      }
    }
    delete raw.reanudable.versionFormato; delete raw.reanudable.cantidadInicial; delete raw.reanudable.paso
    delete raw.reanudable.presupuestoMinutos; delete raw.reanudable.msVisibles; delete raw.fieldUpdatedAt
    const estado = leerEstadoDesconocido(raw)!
    expect(estado).not.toBeNull()
    expect(estado.progreso.M.aciertos).toBe(3)
    expect(evaluarDominio(estado.progreso.M, estado.criterios, AHORA).cumple).toBe(false)
    expect(estado.progreso.M.intentos).toEqual(raw.progreso.M.intentos)
    expect(estado.reanudable).toEqual(raw.reanudable)
  })

  it.each([false, true])('retomar conceptos conserva nbme_state con historial, borrador y descartes (antiguo=%s)', antiguo => {
    const raw = JSON.parse(JSON.stringify(nbmeFixture()))
    if (antiguo) delete raw.discarded
    const nbme = parseNbmeState(raw)!
    expect(nbme).not.toBeNull()
    const original = structuredClone(nbme)
    const cola = deriveNbmeSession(nbme, 'QA-activa')
    const estudio = leerEstadoDesconocido(JSON.parse(JSON.stringify(studyFixture())))!
    cajasDelDia({ progreso: estudio.progreso, criterios: estudio.criterios,
      intentosPreguntas: Object.values(nbme.attempts), conceptoDisponible: () => true, preguntaDisponible: () => true,
      referencia: AHORA, ahora: AHORA })
    expect(nbme).toEqual(original)
    expect(parseNbmeState(JSON.parse(JSON.stringify(nbme)))).toEqual(original)
    expect(deriveNbmeSession(nbme, 'QA-activa')).toEqual(cola)
    expect(nbme.sessions['QA-activa'].drafts['1'].optionId).toBe('A')
    expect(nbme.attempts['QA-activa:0'].optionId).toBe('B')
    expect(nbme.activeSessionId).toBe('QA-activa')
    expect(nbme.bankVersion).toBe('QA-bank')
    expect(nbme.discarded).toEqual(antiguo ? {} : { 'QA-descartada': F(23) })
  })
})
