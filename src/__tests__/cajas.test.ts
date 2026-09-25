import { describe, expect, it } from 'vitest'
import {
  cajaDeConcepto, cajasDelDia, escalonDePregunta, reinsertarFallo, vencimientoConcepto,
  DISTANCIA_REINSERCION, HORAS_CAJA, MAX_REINSERCIONES, VENTANA_PENDIENTE_HORAS, type EntradaCajas,
} from '../lib/cajas'
import { estadoDelDia, TECHO_CAJAS } from '../lib/dia'
import type { NbmeAttempt } from '../nbme/types'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import { reconstruirProgreso } from '../store/model'

const HORA = 3_600_000
const DIA = 24 * HORA
/** Viernes 25 de septiembre de 2026. */
const F = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m).getTime()
const AHORA = F(25, 10)

let serie = 0
const acierto = (ts: number, sesion: string, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: `a-${++serie}`, session_id: sesion, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const fallo = (ts: number, sesion: string) =>
  acierto(ts, sesion, { resultado: 'incorrecta', tipo_error: 'desconocimiento', calificacion: 1 })
const progreso = (id: string, intentos: Intento[]): ProgresoConcepto => reconstruirProgreso(id, intentos, CRITERIOS_POR_DEFECTO)
const caja = (intentos: Intento[], ahora = AHORA) => cajaDeConcepto(progreso('C', intentos), CRITERIOS_POR_DEFECTO, ahora)

const nbme = (questionId: string, submittedAt: number, correct: boolean): NbmeAttempt => ({
  id: `s-${++serie}:0`, sessionId: `s-${serie}`, position: 0, questionId, revision: 'r1', optionId: correct ? 'A' : 'B',
  correct, submittedAt, reviewedAt: submittedAt, durationMs: 1000,
})

const entrada = (extra: Partial<EntradaCajas>): EntradaCajas => ({
  progreso: {}, criterios: CRITERIOS_POR_DEFECTO, intentosPreguntas: [],
  conceptoDisponible: () => true, preguntaDisponible: () => true, referencia: AHORA, ahora: AHORA, ...extra,
})

/** Recorre el resultado buscando cualquier número igual a `n` o una lista de esa longitud. */
function contiene(valor: unknown, n: number): boolean {
  if (typeof valor === 'number') return valor === n
  if (Array.isArray(valor)) return valor.length === n || valor.some(v => contiene(v, n))
  if (valor && typeof valor === 'object') return Object.values(valor).some(v => contiene(v, n))
  return false
}

describe('escalera de cajas', () => {
  it('la caja sale de los aciertos vigentes independientes: 0, 1 y 2 → cajas 1, 2 y 3', () => {
    expect(caja([fallo(F(20, 9), 's1')])).toBe(1)
    expect(caja([acierto(F(20, 9), 's1')])).toBe(2)
    expect(caja([acierto(F(20, 9), 's1'), acierto(F(21, 9), 's2')])).toBe(3)
    // Un acierto con pista no es independiente: no sube de caja.
    expect(caja([acierto(F(20, 9), 's1', { pistas_usadas: 1, tipo_error: 'correcta_con_pistas' })])).toBe(1)
    // Nunca resuelto: no está en la escalera.
    expect(caja([acierto(F(20, 9), 's1', { resultado: 'revision', tipo_error: 'error_por_revisar', calificacion: 1 })])).toBeNull()
  })

  it('un fallo devuelve el ítem a la caja 1 aunque le quede algún acierto vigente', () => {
    const intentos = [acierto(F(18, 9), 's1'), acierto(F(19, 9), 's2'), acierto(F(19, 10), 's3'), acierto(F(19, 11), 's4'), fallo(F(20, 9), 's5')]
    expect(caja(intentos)).toBe(1)
  })

  it('un concepto que cumple dominio sale de la escalera y no vuelve a aparecer', () => {
    const intentos = [acierto(F(15, 9), 's1'), acierto(F(17, 10), 's2'), acierto(F(20, 11), 's3')]
    const p = progreso('dominado', intentos)
    expect(cajaDeConcepto(p, CRITERIOS_POR_DEFECTO, AHORA)).toBe('cerrado')
    // Ni hoy, ni cuando el planificador ya lo da por vencido semanas después: vuelve al FSRS normal.
    expect(p.proxima!).toBeLessThan(AHORA + 60 * DIA)
    for (const ahora of [AHORA, AHORA + 3 * DIA, AHORA + 60 * DIA]) {
      const hoy = cajasDelDia(entrada({ progreso: { dominado: p }, referencia: ahora, ahora }))
      expect(hoy.items).toEqual([])
    }
  })

  it('vence a lo que diga el planificador pero nunca más tarde que el techo de su caja', () => {
    // Un acierto el miércoles: caja 2. El planificador propone unos tres días; la caja lo
    // trae al empezar el día de estudio dos días después, el viernes a las 3:00.
    const bien = progreso('bien', [acierto(F(23, 10), 's1')])
    expect(bien.proxima! - bien.ultimo!).toBeGreaterThan(48 * HORA)
    expect(vencimientoConcepto(bien, 2)).toBe(F(25, 3))
    // Un fallo: caja 1. El planificador lo quiere antes de 24 h y manda él.
    const mal = progreso('mal', [fallo(F(23, 10), 's1')])
    expect(mal.proxima! - mal.ultimo!).toBeLessThan(24 * HORA)
    expect(vencimientoConcepto(mal, 1)).toBe(mal.proxima)
    // Sea cual sea la caja, nunca más tarde que su techo.
    for (const c of [1, 2, 3] as const) {
      expect(vencimientoConcepto(bien, c)).toBeLessThanOrEqual(bien.ultimo! + HORAS_CAJA[c] * HORA)
    }
    expect(HORAS_CAJA).toEqual({ 1: 24, 2: 48, 3: 72 })
  })

  it('solo entra lo que vence en menos de 6 h', () => {
    // Acierto el miércoles a las 10: caja 2, vence el viernes a las 3:00.
    const p = { C: progreso('C', [acierto(F(23, 10), 's1')]) }
    expect(VENTANA_PENDIENTE_HORAS).toBe(6)
    // El jueves por la noche: a las 21:00 le faltan seis horas justas y no entra; un minuto después, sí.
    const nueve = F(24, 21), nueveYUno = F(24, 21, 1)
    expect(cajasDelDia(entrada({ progreso: p, referencia: nueve, ahora: nueve })).items).toEqual([])
    expect(cajasDelDia(entrada({ progreso: p, referencia: nueveYUno, ahora: nueveYUno })).items.map(i => i.id)).toEqual(['C'])
  })

  it('lo estudiado por la tarde vuelve al día siguiente aunque ese día se empiece temprano', () => {
    // Fallo a las 20:00 del jueves. El viernes se empieza a las 8:00: la caja 1 ya venció a las 3:00.
    const conceptoTarde = { T: progreso('T', [fallo(F(24, 20), 'jueves')]) }
    const preguntaTarde = [nbme('Q', F(24, 20), false)]
    const manana = F(25, 8)
    const hoy = cajasDelDia(entrada({ progreso: conceptoTarde, intentosPreguntas: preguntaTarde, referencia: manana, ahora: manana }))
    expect(hoy.items.map(i => i.id)).toEqual(['T', 'Q'])
    expect(hoy.items[1].vence).toBe(F(25, 3))
  })

  it('con 40 vencidos entran 12 y ninguna función devuelve la cifra 40 al exterior', () => {
    const progresoCuarenta = Object.fromEntries(Array.from({ length: 40 }, (_, i) => {
      const id = `C${String(i + 1).padStart(2, '0')}`
      // Cuanto mayor el número, más reciente el fallo: los primeros vencieron antes.
      return [id, progreso(id, [fallo(F(20, 8) + i * 60_000, `s${i}`)])]
    }))
    const hoy = cajasDelDia(entrada({ progreso: progresoCuarenta }))
    expect(TECHO_CAJAS).toBe(12)
    expect(hoy.items).toHaveLength(12)
    expect(hoy.techo).toBe(12)
    expect(hoy.hechos).toBe(0)
    expect(hoy.items.map(i => i.id)).toEqual(Array.from({ length: 12 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`))
    expect(contiene(hoy, 40)).toBe(false)
    const dia = estadoDelDia({ progreso: progresoCuarenta, intentosPreguntas: [], conceptosSemana: [], preguntasSemana: [], cajas: hoy, ahora: AHORA })
    expect(dia.cajas).toEqual({ hechos: 0, techo: 12, cerrada: false })
    expect(contiene(dia, 40)).toBe(false)
  })

  it('un fallo reinserta 4 pasos después, tres veces como máximo', () => {
    expect([DISTANCIA_REINSERCION, MAX_REINSERCIONES]).toEqual([4, 3])
    const cola = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(id => ({ id, vez: 0 }))
    const una = reinsertarFallo(cola, 0)
    expect(una.map(p => p.id)).toEqual(['A', 'B', 'C', 'D', 'A', 'E', 'F', 'G', 'H'])
    expect(una[4].vez).toBe(1)
    expect(cola).toHaveLength(8)

    // Fallar siempre A: vuelve tres veces, cada una cuatro pasos después o al final, y a la cuarta se deja.
    let actual = cola, indice = 0, vueltas = 0
    for (;;) {
      const siguiente = reinsertarFallo(actual, indice)
      if (siguiente.length === actual.length) break
      const destino = Math.min(actual.length, indice + DISTANCIA_REINSERCION)
      expect(siguiente[destino]).toEqual({ id: 'A', vez: vueltas + 1 })
      vueltas++
      indice = destino
      actual = siguiente
    }
    expect(vueltas).toBe(3)
    expect(actual.filter(p => p.id === 'A').map(p => p.vez)).toEqual([0, 1, 2, 3])
    // Al final de la cola no hay cuatro pasos: vuelve al final.
    expect(reinsertarFallo([{ id: 'X', vez: 0 }], 0).map(p => p.id)).toEqual(['X', 'X'])
  })
})

describe('las cajas de hoy', () => {
  it('lo visto hoy por primera vez no entra en las cajas de hoy aunque venza pronto', () => {
    const p = { nuevo: progreso('nuevo', [fallo(F(25, 4), 'hoy')]) }
    expect(cajasDelDia(entrada({ progreso: p })).items).toEqual([])
  })

  it('estudiar marca hechos sin mover el techo y el día fijado no crece con la tarde', () => {
    const p: Record<string, ProgresoConcepto> = {
      A: progreso('A', [fallo(F(22, 9), 'lunes')]),
      B: progreso('B', [fallo(F(22, 10), 'lunes')]),
      // Caja 3, pero el planificador lo quiere hoy a las 18:00: fuera de la ventana de la mañana.
      Tarde: { ...progreso('Tarde', [acierto(F(22, 9), 'lunes'), acierto(F(24, 9), 'jueves')]), proxima: F(25, 18) },
    }
    const manana = cajasDelDia(entrada({ progreso: p }))
    expect(manana.items.map(i => i.id)).toEqual(['A', 'B'])
    expect(manana).toMatchObject({ hechos: 0, techo: 2, cerrada: false })

    // A las 10:30 se hace A. A las 20:00 se hace B: el día quedó fijado en la primera respuesta.
    p.A = progreso('A', [...p.A.intentos, acierto(F(25, 10, 30), 'hoy')])
    p.B = progreso('B', [...p.B.intentos, fallo(F(25, 20), 'hoy')])
    const noche = cajasDelDia(entrada({ progreso: p, referencia: F(25, 10, 30), ahora: F(25, 20, 30) }))
    expect(noche.items.map(i => i.id)).toEqual(['A', 'B'])
    expect(noche).toMatchObject({ hechos: 2, techo: 2, cerrada: true })
    // La caja que se muestra es la de la mañana, aunque B haya vuelto a fallar.
    expect(noche.items.map(i => i.caja)).toEqual([1, 1])
  })

  it('lo que no está disponible en el corpus o en el banco no entra', () => {
    const p = { retirado: progreso('retirado', [fallo(F(22, 9), 's')]) }
    expect(cajasDelDia(entrada({ progreso: p, conceptoDisponible: id => id !== 'retirado' })).items).toEqual([])
    const intentos = [nbme('Q1', F(22, 9), false)]
    expect(cajasDelDia(entrada({ intentosPreguntas: intentos, preguntaDisponible: () => false })).items).toEqual([])
    expect(cajasDelDia(entrada({ intentosPreguntas: intentos })).items.map(i => [i.tipo, i.id, i.caja])).toEqual([['pregunta', 'Q1', 1]])
  })
})

describe('preguntas NBME en la escalera', () => {
  it('entran al fallarse y suben una caja por día de estudio, nunca el mismo día del fallo', () => {
    expect(escalonDePregunta([nbme('Q', F(20, 9), true)])).toBeNull()
    expect(escalonDePregunta([nbme('Q', F(20, 9), false)])?.escalon).toBe(1)
    // La corrección tras ver la respuesta, el mismo día, no cuenta.
    expect(escalonDePregunta([nbme('Q', F(20, 9), false), nbme('Q', F(20, 9, 5), true)])?.escalon).toBe(1)
    expect(escalonDePregunta([nbme('Q', F(20, 9), false), nbme('Q', F(21, 9), true)])?.escalon).toBe(2)
    // Dos aciertos el mismo día suben una sola caja.
    expect(escalonDePregunta([nbme('Q', F(20, 9), false), nbme('Q', F(21, 9), true), nbme('Q', F(21, 20), true)])?.escalon).toBe(2)
    const cerrada = [nbme('Q', F(15, 9), false), nbme('Q', F(16, 9), true), nbme('Q', F(18, 9), true), nbme('Q', F(21, 9), true)]
    expect(escalonDePregunta(cerrada)?.escalon).toBe('cerrado')
    // Un fallo nuevo la devuelve a la caja 1.
    expect(escalonDePregunta([...cerrada, nbme('Q', F(23, 9), false)])?.escalon).toBe(1)
  })

  it('vence cuando lo marca su caja y comparte la cola con los conceptos', () => {
    const intentos = [nbme('Q1', F(24, 9), false)]
    const hoy = cajasDelDia(entrada({ intentosPreguntas: intentos, progreso: { C: progreso('C', [fallo(F(22, 9), 's')]) } }))
    expect(hoy.items.map(i => i.id)).toEqual(['C', 'Q1'])
    expect(hoy.items[1].vence).toBe(F(25, 3))
  })
})
