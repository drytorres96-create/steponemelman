import { describe, expect, it } from 'vitest'
import {
  estadoDelDia, finDelDia, inicioDelDia, limitesSemana, materialNuevo, referenciaDelDia, temaDeLaSemana, tipoDeDia,
  DIA_VACIO, TECHOS, type EntradaDia,
} from '../lib/dia'
import type { NbmeAttempt } from '../nbme/types'
import type { SesionSemanal } from '../semana/tipos'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import { reconstruirProgreso } from '../store/model'

/**
 * El día como techo: se cuenta desde el historial, no desde un marcador guardado.
 * Jueves 24 de septiembre de 2026, a media mañana: un día entre semana.
 */
const AHORA = new Date(2026, 8, 24, 10, 0).getTime()
const HOY = (h: number, m = 0) => new Date(2026, 8, 24, h, m).getTime()
const AYER = (h: number) => new Date(2026, 8, 23, h).getTime()
/** Viernes 25, sábado 26 y domingo 27 de la misma semana. */
const DIA = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime()

const intento = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: `a-${ts}-${Math.random()}`, session_id: 's-hoy', ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const progresoDe = (id: string, intentos: Intento[]): ProgresoConcepto => reconstruirProgreso(id, intentos, CRITERIOS_POR_DEFECTO)
const pregunta = (questionId: string, submittedAt: number, correct = true): NbmeAttempt => ({
  id: `n-${questionId}-${submittedAt}:0`, sessionId: `n-${questionId}-${submittedAt}`, position: 0, questionId,
  revision: 'r1', optionId: 'A', correct, submittedAt, reviewedAt: submittedAt, durationMs: 1000,
})

const conceptos = (n: number) => Array.from({ length: n }, (_, i) => `C${i + 1}`)
const preguntas = (n: number) => Array.from({ length: n }, (_, i) => `Q${i + 1}`)

/** Conceptos vistos hoy por primera vez, uno por minuto desde las nueve. */
const vistosHoy = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, progresoDe(id, [intento(HOY(9, i))])]))
const respondidasHoy = (ids: string[]) => ids.map((id, i) => pregunta(id, HOY(9, 30 + i)))

const entrada = (extra: Partial<EntradaDia>): EntradaDia => ({
  progreso: {}, intentosPreguntas: [], conceptosSemana: conceptos(12), preguntasSemana: preguntas(7),
  cajas: { hechos: 0, techo: 0 }, ahora: AHORA, ...extra,
})

describe('techo del día', () => {
  it('los techos están calibrados por tipo de día y el viernes va vacío', () => {
    expect(TECHOS).toEqual({
      semana: { conceptos: 10, preguntas: 5, cajas: 40 },
      finde: { conceptos: 20, preguntas: 10, cajas: 70 },
      vacio: { conceptos: 0, preguntas: 0, cajas: 0 },
    })
    expect(DIA_VACIO).toBe(5)
    // Lunes 21 a domingo 27, a media mañana.
    expect([21, 22, 23, 24, 25, 26, 27].map(d => tipoDeDia(DIA(d, 10))))
      .toEqual(['semana', 'semana', 'semana', 'semana', 'vacio', 'finde', 'finde'])
    // El corte de las 3:00 manda: el sábado a las 2 AM todavía es viernes, y el lunes a las 2, domingo.
    expect(tipoDeDia(DIA(26, 2))).toBe('vacio')
    expect(tipoDeDia(DIA(25, 2))).toBe('semana')
    expect(tipoDeDia(DIA(28, 2))).toBe('finde')
    expect(tipoDeDia(DIA(28, 3))).toBe('semana')
  })

  it('entre semana el día se cierra exactamente a 10 conceptos nuevos y 5 preguntas', () => {

    const casi = estadoDelDia(entrada({ progreso: vistosHoy(conceptos(9)), intentosPreguntas: respondidasHoy(preguntas(5)) }))
    expect(casi.nuevo).toEqual({ conceptos: 9, preguntas: 5, techoConceptos: 10, techoPreguntas: 5, cerrada: false })
    expect(casi.completo).toBe(false)

    const faltaUnaPregunta = estadoDelDia(entrada({ progreso: vistosHoy(conceptos(10)), intentosPreguntas: respondidasHoy(preguntas(4)) }))
    expect(faltaUnaPregunta.nuevo.cerrada).toBe(false)

    const dia = entrada({ progreso: vistosHoy(conceptos(10)), intentosPreguntas: respondidasHoy(preguntas(5)) })
    const hecho = estadoDelDia(dia)
    expect(hecho.nuevo).toEqual({ conceptos: 10, preguntas: 5, techoConceptos: 10, techoPreguntas: 5, cerrada: true })
    expect(hecho.completo).toBe(true)
    // Cerrada la vía, deja de ofrecer material aunque la semana tenga más.
    expect(materialNuevo(dia)).toEqual({ conceptos: [], preguntas: [] })
  })

  it('en sábado y domingo el día se cierra exactamente a 20 conceptos nuevos y 10 preguntas', () => {
    for (const d of [26, 27]) {
      const ahora = DIA(d, 10)
      const vistos = (n: number) => Object.fromEntries(conceptos(n).map((id, i) => [id, progresoDe(id, [intento(DIA(d, 9, i))])]))
      const respondidas = (n: number) => preguntas(n).map((id, i) => pregunta(id, DIA(d, 9, 30 + i)))
      const semana = { conceptosSemana: conceptos(25), preguntasSemana: preguntas(12), ahora }

      const casi = estadoDelDia(entrada({ ...semana, progreso: vistos(19), intentosPreguntas: respondidas(10) }))
      expect(casi.tipo).toBe('finde')
      expect(casi.nuevo).toEqual({ conceptos: 19, preguntas: 10, techoConceptos: 20, techoPreguntas: 10, cerrada: false })
      expect(estadoDelDia(entrada({ ...semana, progreso: vistos(20), intentosPreguntas: respondidas(9) })).nuevo.cerrada).toBe(false)

      const dia = entrada({ ...semana, progreso: vistos(20), intentosPreguntas: respondidas(10) })
      expect(estadoDelDia(dia)).toMatchObject({
        nuevo: { conceptos: 20, preguntas: 10, techoConceptos: 20, techoPreguntas: 10, cerrada: true }, completo: true,
      })
      expect(materialNuevo(dia)).toEqual({ conceptos: [], preguntas: [] })
      // Sin nada hecho, lo que ofrece es el techo entero del fin de semana, en orden.
      expect(materialNuevo(entrada(semana))).toEqual({ conceptos: conceptos(20), preguntas: preguntas(10) })
    }
  })

  it('el viernes sale cerrado desde que amanece, con los techos en cero', () => {
    for (const ahora of [DIA(25, 3), DIA(25, 10), DIA(26, 2, 59)]) {
      // Hay material de sobra en la semana y vencen cajas: nada de eso abre el viernes.
      const dia = entrada({ ahora, conceptosSemana: conceptos(12), preguntasSemana: preguntas(7) })
      expect(estadoDelDia(dia)).toEqual({
        tipo: 'vacio',
        nuevo: { conceptos: 0, preguntas: 0, techoConceptos: 0, techoPreguntas: 0, cerrada: true },
        cajas: { hechos: 0, techo: 0, cerrada: true },
        completo: true,
      })
      expect(materialNuevo(dia)).toEqual({ conceptos: [], preguntas: [] })
    }
    // Lo que se estudie un viernes desde el menú no reabre nada ni lo convierte en deuda.
    const extra = entrada({ ahora: DIA(25, 12), progreso: Object.fromEntries(conceptos(3).map((id, i) => [id, progresoDe(id, [intento(DIA(25, 11, i))])])) })
    expect(estadoDelDia(extra)).toMatchObject({ tipo: 'vacio', nuevo: { techoConceptos: 0, cerrada: true }, completo: true })
    // A las 2:59 del viernes todavía es jueves: un día entre semana normal.
    expect(estadoDelDia(entrada({ ahora: DIA(25, 2, 59) }))).toMatchObject({ tipo: 'semana', nuevo: { techoConceptos: 10, cerrada: false } })
  })

  it('lo que queda de la vía nueva sale en el orden de la semana y se completa sin duplicar', () => {
    const dia = entrada({ progreso: vistosHoy(['C1', 'C2', 'C3']), intentosPreguntas: respondidasHoy(['Q1']) })
    expect(materialNuevo(dia)).toEqual({
      conceptos: ['C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
      preguntas: ['Q2', 'Q3', 'Q4', 'Q5'],
    })
  })

  it('un intento por revisar no cuenta como visto', () => {
    const dia = entrada({ progreso: { C1: progresoDe('C1', [intento(HOY(9), { resultado: 'revision', tipo_error: 'error_por_revisar', calificacion: 1 })]) } })
    const estado = estadoDelDia(dia)
    expect(estado.nuevo.conceptos).toBe(0)
    // Sigue siendo nuevo: vuelve a ofrecerse.
    expect(materialNuevo(dia).conceptos[0]).toBe('C1')
  })

  it('un concepto con intentos previos no cuenta como nuevo', () => {
    const progreso = {
      C1: progresoDe('C1', [intento(AYER(20)), intento(HOY(9))]),
      // Lo que ayer quedó por revisar no acreditó nada: hoy sí es su primera vez.
      C2: progresoDe('C2', [intento(AYER(20), { resultado: 'revision', tipo_error: 'error_por_revisar', calificacion: 1 }), intento(HOY(9, 5))]),
    }
    const dia = entrada({ progreso, intentosPreguntas: [pregunta('Q1', AYER(21)), pregunta('Q1', HOY(9, 10))] })
    const estado = estadoDelDia(dia)
    expect(estado.nuevo.conceptos).toBe(1)
    expect(estado.nuevo.preguntas).toBe(0)
    const siguiente = materialNuevo(dia)
    expect(siguiente.conceptos).not.toContain('C1')
    expect(siguiente.preguntas).not.toContain('Q1')
  })

  it('con solo 6 conceptos nuevos disponibles el techo baja a 6 y el día cierra', () => {
    const semana = { conceptosSemana: conceptos(6), preguntasSemana: [] }
    const inicio = estadoDelDia(entrada(semana))
    expect(inicio.nuevo).toMatchObject({ techoConceptos: 6, techoPreguntas: 0, cerrada: false })
    expect(materialNuevo(entrada(semana)).conceptos).toHaveLength(6)

    const fin = estadoDelDia(entrada({ ...semana, progreso: vistosHoy(conceptos(6)) }))
    expect(fin.nuevo).toEqual({ conceptos: 6, preguntas: 0, techoConceptos: 6, techoPreguntas: 0, cerrada: true })
    expect(fin.completo).toBe(true)
  })

  it('un día sin material ni cajas también es un día completo', () => {
    const vacio = estadoDelDia(entrada({ conceptosSemana: [], preguntasSemana: [] }))
    expect(vacio).toEqual({
      tipo: 'semana',
      nuevo: { conceptos: 0, preguntas: 0, techoConceptos: 0, techoPreguntas: 0, cerrada: true },
      cajas: { hechos: 0, techo: 0, cerrada: true },
      completo: true,
    })
  })

  it('las cajas abiertas impiden cerrar el día aunque lo nuevo esté hecho', () => {
    const dia = entrada({ progreso: vistosHoy(conceptos(10)), intentosPreguntas: respondidasHoy(preguntas(5)), cajas: { hechos: 3, techo: 4 } })
    expect(estadoDelDia(dia)).toMatchObject({ cajas: { hechos: 3, techo: 4, cerrada: false }, completo: false })
    expect(estadoDelDia({ ...dia, cajas: { hechos: 4, techo: 4 } }).completo).toBe(true)
  })
})

describe('el corte de las 3:00', () => {
  it('un intento a las 2 AM cae en el día anterior', () => {
    const progreso = {
      madrugada: progresoDe('madrugada', [intento(HOY(2))]),
      temprano: progresoDe('temprano', [intento(HOY(3))]),
    }
    const dia = entrada({ progreso, conceptosSemana: ['madrugada', 'temprano'], preguntasSemana: [] })
    expect(estadoDelDia(dia).nuevo.conceptos).toBe(1)
    // A las 2:30 todavía es el día anterior, y el intento de las dos es de ese día.
    expect(estadoDelDia({ ...dia, ahora: HOY(2, 30) }).nuevo.conceptos).toBe(1)
    expect(estadoDelDia({ ...dia, ahora: HOY(2, 30), progreso: { madrugada: progreso.madrugada } }).nuevo.conceptos).toBe(1)
    expect(estadoDelDia({ ...dia, progreso: { madrugada: progreso.madrugada } }).nuevo.conceptos).toBe(0)
  })

  it('el día de estudio va de 3:00 a 3:00 con aritmética de calendario', () => {
    expect(inicioDelDia(HOY(10))).toBe(HOY(3))
    expect(inicioDelDia(HOY(2, 59))).toBe(AYER(3))
    expect(inicioDelDia(HOY(3))).toBe(HOY(3))
    expect(finDelDia(HOY(10))).toBe(new Date(2026, 8, 25, 3).getTime())
  })
})

describe('lo que fija el día y el tema de la semana', () => {
  it('el día queda fijado en su primera respuesta; hasta entonces sigue al reloj', () => {
    expect(referenciaDelDia({}, [], AHORA)).toBe(AHORA)
    const progreso = { C1: progresoDe('C1', [intento(AYER(22)), intento(HOY(8)), intento(HOY(9))]) }
    expect(referenciaDelDia(progreso, [], AHORA)).toBe(HOY(8))
    expect(referenciaDelDia(progreso, [pregunta('Q1', HOY(7, 15))], AHORA)).toBe(HOY(7, 15))
    // Lo que quedó por revisar no fija nada.
    const revision = { C2: progresoDe('C2', [intento(HOY(6), { resultado: 'revision', tipo_error: 'error_por_revisar', calificacion: 1 })]) }
    expect(referenciaDelDia(revision, [], AHORA)).toBe(AHORA)
  })

  it('la semana va de lunes a domingo según el día de estudio', () => {
    expect(limitesSemana(AHORA)).toEqual({ inicio: '2026-09-21', fin: '2026-09-27' })
    // El lunes a las 2 AM todavía es el domingo anterior.
    expect(limitesSemana(new Date(2026, 8, 28, 2).getTime())).toEqual({ inicio: '2026-09-21', fin: '2026-09-27' })
    expect(limitesSemana(new Date(2026, 8, 28, 4).getTime())).toEqual({ inicio: '2026-09-28', fin: '2026-10-04' })
  })

  it('el tema de la semana reúne los guiones de sus sesiones sin duplicados y en orden', () => {
    const sesion = (id: string, semanaInicio: string, dia: number, guion: SesionSemanal['guion']): SesionSemanal => ({
      id, semana: 'S3', semanaInicio, dia, orden: 1, titulo: id, subtitulo: null, guion,
      presupuestoMin: 30, estado: 'pendiente', cursor: 0, nbmeSessionId: null, completadaEn: null,
    })
    const tema = temaDeLaSemana([
      sesion('martes', '2026-09-21', 2, [{ kind: 'concepto', id: 'C3' }, { kind: 'concepto', id: 'C1' }, { kind: 'pregunta', id: 'Q2', revision: 'r' }]),
      sesion('lunes', '2026-09-21', 1, [{ kind: 'concepto', id: 'C1' }, { kind: 'concepto', id: 'C2' }, { kind: 'pregunta', id: 'Q1', revision: 'r' }]),
      sesion('otra-semana', '2026-09-14', 1, [{ kind: 'concepto', id: 'X' }]),
    ], '2026-09-21', '2026-09-27')
    expect(tema.sesiones.map(s => s.id)).toEqual(['lunes', 'martes'])
    expect(tema.conceptIds).toEqual(['C1', 'C2', 'C3'])
    expect(tema.preguntaIds).toEqual(['Q1', 'Q2'])
  })
})
