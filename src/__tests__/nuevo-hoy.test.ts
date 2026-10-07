import { describe, expect, it } from 'vitest'
import { estadoDelDia, materialNuevo, type EntradaDia } from '../lib/dia'
import { completarEntradaDeHoy, prepararNuevoDeHoy } from '../lib/nuevo-hoy'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import { reconstruirProgreso } from '../store/model'
import type { Modulo } from '../schema/concept'
import type { Intento } from '../srs/tipos'
import type { NbmeAttempt, NbmeQuestionMeta, NbmeState } from '../nbme/types'

const AHORA = Date.parse('2026-10-07T12:00:00-04:00')
const ids = (prefijo: string, n: number) => Array.from({ length: n }, (_, i) => `${prefijo}${i + 1}`)
const entrada = (extra: Partial<EntradaDia> = {}): EntradaDia => ({
  progreso: {}, intentosPreguntas: [], conceptosSemana: [], preguntasSemana: [],
  cajas: { hechos: 0, techo: 0 }, ahora: AHORA, ...extra,
})
const modulo = (id: string, conceptos: string[], orden = 1): Modulo => ({
  module_id: id, orden, nombre: id, proposito: '', prerrequisitos: [], disciplinas: [], sistemas: [], temas: [],
  n_conceptos: conceptos.length, minutos_estimados: 0, cobertura_documental: [],
  sesiones: [{ session_id: `${id}-sesion`, titulo: '', objetivo: '', conceptos }],
})
const meta = (id: string, extra: Partial<NbmeQuestionMeta> = {}): NbmeQuestionMeta => ({
  id, revision: 'r-actual', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [],
  topic: 'Tema sintético', objective: null, status: 'ready', reasons: [], figureRequired: false, conceptLinks: [], ...extra,
})
const catalogo = (preguntas: string[]) => new Map(preguntas.map(id => [id, meta(id)]))
const intento = (id: string, ts: number, resultado: Intento['resultado'] = 'incorrecta'): Intento => ({
  attempt_id: `a-${id}-${ts}`, session_id: 'sesion-sintetica', ts, calificacion: 1, resultado,
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false, ms: 1000,
  tipo_error: resultado === 'revision' ? 'error_por_revisar' : 'desconocimiento', confianza_declarada: null,
})
const progreso = (id: string, ts: number, resultado?: Intento['resultado']) =>
  reconstruirProgreso(id, [intento(id, ts, resultado)], CRITERIOS_POR_DEFECTO)
const respuesta = (id: string, ts: number): NbmeAttempt => ({
  id: `nbme-${id}:0`, sessionId: `nbme-${id}`, position: 0, questionId: id, revision: 'r-antigua',
  optionId: 'A', correct: false, submittedAt: ts, reviewedAt: ts, durationMs: 1000,
})

describe('Nuevo de Hoy con corpus publicado', () => {
  it('con guiones vacíos y 1/1 hechos conserva 10/5 de capacidad y ofrece los 9/4 restantes', () => {
    const base = entrada({ progreso: { C1: progreso('C1', AHORA - 1000) }, intentosPreguntas: [respuesta('Q1', AHORA - 1000)] })
    const antes = JSON.stringify(base)
    // Reproduce el cierre prematuro: sin guion, el techo antiguo era sólo lo ya hecho.
    expect(estadoDelDia(base).nuevo).toMatchObject({ techoConceptos: 1, techoPreguntas: 1, cerrada: true })
    const completa = completarEntradaDeHoy(base, [modulo('M', ids('C', 12))], catalogo(ids('Q', 7)))
    expect(estadoDelDia(completa).nuevo).toEqual({ conceptos: 1, preguntas: 1, techoConceptos: 10, techoPreguntas: 5, cerrada: false })
    expect(materialNuevo(completa)).toEqual({ conceptos: ids('C', 10).slice(1), preguntas: ids('Q', 5).slice(1) })
    expect(JSON.stringify(base)).toBe(antes)
  })

  it('prioriza guiones válidos, rellena en orden editorial y no gasta plazas en duplicados ni IDs ausentes', () => {
    const modulos = [modulo('ultimo', ['C4', 'C3'], 2), modulo('primero', ['C1', 'C2', 'C1'], 1)]
    const listas = catalogo(['Q1', 'Q2', 'Q3'])
    listas.set('QB', meta('QB', { status: 'blocked' }))
    const base = entrada({ conceptosSemana: ['ausente', 'C3', 'C3'], preguntasSemana: ['QB', 'Q3', 'Q3', 'ausente'] })
    const antes = JSON.stringify(modulos)
    const completa = completarEntradaDeHoy(base, modulos, listas)
    expect(materialNuevo(completa)).toEqual({ conceptos: ['C3', 'C1', 'C2', 'C4'], preguntas: ['Q3', 'Q1', 'Q2'] })
    expect(JSON.stringify(modulos)).toBe(antes)
    expect(materialNuevo(completarEntradaDeHoy(base, modulos, listas))).toEqual(materialNuevo(completa))
  })

  it('rellena una semana agotada sin volver a llamar nuevo al concepto fallado y aún sin dominio', () => {
    const base = entrada({ conceptosSemana: ['C1'], preguntasSemana: ['Q1'],
      progreso: { C1: progreso('C1', AHORA - 86_400_000) }, intentosPreguntas: [respuesta('Q1', AHORA - 86_400_000)] })
    expect(base.progreso.C1.dominado_en).toBeNull()
    const completa = completarEntradaDeHoy(base, [modulo('M', ['C1', 'C2'])], catalogo(['Q1', 'Q2']))
    expect(materialNuevo(completa)).toEqual({ conceptos: ['C2'], preguntas: ['Q2'] })
    expect(estadoDelDia(completa).nuevo).toMatchObject({ conceptos: 0, preguntas: 0, techoConceptos: 1, techoPreguntas: 1 })
    expect(completa.progreso).toBe(base.progreso)
  })

  it('una respuesta por revisar sigue disponible y el progreso retirado del corpus permanece sin consumir plazas', () => {
    const base = entrada({ progreso: { C1: progreso('C1', AHORA - 1000, 'revision'), retirado: progreso('retirado', AHORA - 1000) },
      intentosPreguntas: [respuesta('retirada', AHORA - 1000)], conceptosSemana: ['retirado'], preguntasSemana: ['retirada'] })
    const completa = completarEntradaDeHoy(base, [modulo('M', ['C1', 'C2'])], catalogo(['Q1']))
    expect(estadoDelDia(completa).nuevo).toMatchObject({ conceptos: 0, preguntas: 0, techoConceptos: 2, techoPreguntas: 1 })
    expect(materialNuevo(completa)).toEqual({ conceptos: ['C1', 'C2'], preguntas: ['Q1'] })
    expect(completa.progreso.retirado).toBe(base.progreso.retirado)
  })

  it('sin catálogo ofrece únicamente los conceptos publicados y no inventa preguntas del guion', () => {
    const completa = completarEntradaDeHoy(entrada({ preguntasSemana: ['Q1'] }), [modulo('M', ['C1'])], new Map())
    expect(estadoDelDia(completa).nuevo).toMatchObject({ techoConceptos: 1, techoPreguntas: 0 })
    expect(materialNuevo(completa)).toEqual({ conceptos: ['C1'], preguntas: [] })
  })

  it.each([
    ['2026-10-09T12:00:00-04:00', 0, 0],
    ['2026-10-10T12:00:00-04:00', 20, 10],
    ['2026-10-11T12:00:00-04:00', 20, 10],
  ])('el relleno respeta el descanso o techo de fin de semana: %s', (fecha, c, q) => {
    const completa = completarEntradaDeHoy(entrada({ ahora: Date.parse(fecha) }), [modulo('M', ids('C', 30))], catalogo(ids('Q', 15)))
    expect(materialNuevo(completa).conceptos).toHaveLength(c)
    expect(materialNuevo(completa).preguntas).toHaveLength(q)
    expect(estadoDelDia(completa).completo).toBe(c === 0 && q === 0)
  })

  it('una respuesta de una revisión antigua excluye el mismo ID de nuevo; los pendientes llevan la revisión actual', () => {
    const listas = catalogo(['Q1', 'Q2'])
    const completa = completarEntradaDeHoy(entrada({ intentosPreguntas: [respuesta('Q1', AHORA - 86_400_000)] }), [], listas)
    const state = { sessions: {}, attempts: {}, discarded: {} } as NbmeState
    expect(prepararNuevoDeHoy(completa, listas, state).preguntas).toEqual([{ id: 'Q2', revision: 'r-actual' }])
  })

  it('no acredita evidencia futura como trabajo de hoy ni vuelve a ofrecer un ID ya registrado', () => {
    const completa = completarEntradaDeHoy(entrada({ progreso: { C1: progreso('C1', AHORA + 1000) },
      intentosPreguntas: [respuesta('Q1', AHORA + 1000)] }), [modulo('M', ['C1', 'C2'])], catalogo(['Q1', 'Q2']))
    expect(estadoDelDia(completa).nuevo).toMatchObject({ conceptos: 0, preguntas: 0 })
    expect(materialNuevo(completa)).toEqual({ conceptos: ['C2'], preguntas: ['Q2'] })
  })
})
