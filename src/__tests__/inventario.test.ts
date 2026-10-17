import { describe, expect, it } from 'vitest'
import { inventarioFragil, MAXIMO_SUGERIDAS, senalesDe, sugerirRecuperar, type Evento } from '../lib/inventario'
import { emptyNbmeState } from '../nbme/model'
import type { NbmeAttempt, NbmeState } from '../nbme/types'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import { reconstruirProgreso } from '../store/model'

/** Sábado 17 de octubre de 2026 a las 10:00 en Nueva York. El día de estudio empieza a las 3:00. */
const F = (d: number, h: number, m = 0) => Date.parse(`2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`)
const AHORA = F(17, 10)

let serie = 0
const acierto = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: `a-${++serie}`, session_id: `s-${serie}`, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const fallo = (ts: number) => acierto(ts, { resultado: 'incorrecta', tipo_error: 'desconocimiento', calificacion: 1 })
const conAyuda = (ts: number) => acierto(ts, { pistas_usadas: 1, tipo_error: 'correcta_con_pistas' })
const concepto = (id: string, intentos: Intento[]): ProgresoConcepto => reconstruirProgreso(id, intentos, CRITERIOS_POR_DEFECTO)

const intentoNbme = (questionId: string, submittedAt: number, correct: boolean, extra: Partial<NbmeAttempt> = {}): NbmeAttempt => ({
  id: `n-${++serie}:0`, sessionId: `n-${serie}`, position: 0, questionId, revision: 'r1', optionId: correct ? 'A' : 'B',
  correct, submittedAt, reviewedAt: submittedAt, durationMs: 1000, ...extra,
})
const estadoNbme = (...intentos: NbmeAttempt[]): NbmeState => ({ ...emptyNbmeState('b'), attempts: Object.fromEntries(intentos.map(a => [a.id, a])) })

const ev = (ts: number, ok: boolean, ayuda = false): Evento => ({ ts, ok, ayuda })
const senales = (eventos: Evento[], ahora = AHORA) => senalesDe(eventos, ahora)?.senales ?? []

describe('señales de un historial', () => {
  it('un fallo de esta semana sin un acierto limpio después es «fallo reciente»', () => {
    expect(senales([ev(F(15, 9), false)])).toEqual(['fallo_reciente'])
  })
  it('corregirse el mismo día del fallo no lo supera: la explicación acababa de verse', () => {
    expect(senales([ev(F(15, 9), false), ev(F(15, 11), true)])).toEqual(['fallo_reciente'])
  })
  it('un acierto sin ayuda otro día de estudio supera el fallo reciente', () => {
    expect(senales([ev(F(14, 9), false), ev(F(16, 9), true)])).toEqual([])
  })
  it('un acierto con ayuda otro día no supera el fallo, y además es «acierto con ayuda»', () => {
    expect(senales([ev(F(14, 9), false), ev(F(16, 9), true, true)])).toEqual(['fallo_reciente', 'acierto_con_ayuda'])
  })
  it('un fallo antiguo ya no es reciente, pero dos fallos sin dos días limpios siguen siendo «fallo repetido»', () => {
    expect(senales([ev(F(1, 9), false), ev(F(3, 9), false)])).toEqual(['fallo_repetido'])
  })
  it('con dos días limpios después del último fallo, el fallo repetido se da por superado', () => {
    expect(senales([ev(F(1, 9), false), ev(F(3, 9), false), ev(F(5, 9), true), ev(F(8, 9), true)])).toEqual([])
    expect(senales([ev(F(1, 9), false), ev(F(3, 9), false), ev(F(5, 9), true)])).toEqual(['fallo_repetido'])
  })
  it('lo último acertado con ayuda marca «acierto con ayuda» aunque nunca haya fallado', () => {
    expect(senales([ev(F(10, 9), true), ev(F(12, 9), true, true)])).toEqual(['acierto_con_ayuda'])
    expect(senales([ev(F(12, 9), true, true), ev(F(14, 9), true)])).toEqual([])
  })
  it('lo limpio nunca aparece, y lo que todavía no ha pasado no cuenta', () => {
    expect(senalesDe([ev(F(15, 9), true)], AHORA)?.senales).toEqual([])
    expect(senalesDe([ev(F(18, 9), false)], AHORA)).toBeNull()
    expect(senalesDe([], AHORA)).toBeNull()
  })
  it('la semana la marca el día de estudio, no la hora: a las 2 AM todavía es el día anterior', () => {
    // Un fallo a las 2:30 AM del 17 pertenece al día de estudio del 16; acertar a las 4 AM del 17 ya es otro día.
    expect(senales([ev(F(17, 2, 30), false), ev(F(17, 4), true)], F(17, 10))).toEqual([])
    expect(senales([ev(F(17, 3, 30), false), ev(F(17, 4), true)], F(17, 10))).toEqual(['fallo_reciente'])
  })
  it('pesa más lo reciente que lo repetido y lo repetido que lo acertado con ayuda', () => {
    const r = senalesDe([ev(F(10, 9), false), ev(F(15, 9), false)], AHORA)!
    expect(r.senales).toEqual(['fallo_reciente', 'fallo_repetido'])
    expect(r.puntos).toBe(5)
    expect(senalesDe([ev(F(15, 9), true, true)], AHORA)!.puntos).toBe(1)
  })
})

describe('inventario de conceptos y preguntas', () => {
  const entrada = (progreso: Record<string, ProgresoConcepto>, nbme: NbmeState = emptyNbmeState('b'), extra = {}) => ({
    progreso, nbme, conceptoDisponible: () => true, revisionDePregunta: () => 'r1' as string | null, ahora: AHORA, ...extra,
  })

  it('usa las reglas de acierto del planificador: un parcial es un fallo y una respuesta por revisar no cuenta', () => {
    const parcial = acierto(F(15, 9), { resultado: 'parcial', calificacion: 2 })
    const porRevisar = acierto(F(15, 9), { resultado: 'revision', calificacion: 3 })
    const inv = inventarioFragil(entrada({ P: concepto('P', [parcial]), R: concepto('R', [porRevisar]) }))
    expect(inv.map(f => f.id)).toEqual(['P'])
  })
  it('reconoce la ayuda por pistas, fuente consultada o explicación previa', () => {
    const inv = inventarioFragil(entrada({
      A: concepto('A', [conAyuda(F(15, 9))]),
      B: concepto('B', [acierto(F(15, 9), { fuente_consultada: true })]),
      C: concepto('C', [acierto(F(15, 9), { explicacion_previa: true })]),
      D: concepto('D', [acierto(F(15, 9))]),
    }))
    expect(inv.map(f => f.id).sort()).toEqual(['A', 'B', 'C'])
    expect(inv.every(f => f.senales.includes('acierto_con_ayuda'))).toBe(true)
  })
  it('junta preguntas NBME con conceptos y no incluye lo que el banco o el corpus no dan por disponible', () => {
    const nbme = estadoNbme(intentoNbme('NBME28-P0001', F(15, 9), false), intentoNbme('NBME28-P0002', F(15, 9), false), intentoNbme('NBME28-P0003', F(15, 9), true))
    const inv = inventarioFragil(entrada({ C1: concepto('C1', [fallo(F(14, 9))]), C2: concepto('C2', [fallo(F(14, 9))]) }, nbme, {
      conceptoDisponible: (id: string) => id !== 'C2',
      revisionDePregunta: (id: string) => id === 'NBME28-P0002' ? null : 'r7',
    }))
    expect(inv.map(f => `${f.tipo}:${f.id}`).sort()).toEqual(['concepto:C1', 'pregunta:NBME28-P0001'])
    expect(inv.find(f => f.tipo === 'pregunta')?.revision).toBe('r7')
  })
  it('un envío NBME en conflicto cuenta como fallo y un examen sin terminar no se mira', () => {
    const conflicto = intentoNbme('NBME28-P0001', F(15, 9), true, { conflict: true })
    const oculto = intentoNbme('NBME28-P0002', F(15, 9), false, { sessionId: 'examen' })
    const nbme = { ...estadoNbme(conflicto, oculto), sessions: { examen: { id: 'examen', mode: 'test' } } } as unknown as NbmeState
    expect(inventarioFragil(entrada({}, nbme)).map(f => f.id)).toEqual(['NBME28-P0001'])
  })
  it('ordena por peso, luego por el fallo más cercano', () => {
    const inv = inventarioFragil(entrada({
      ayuda: concepto('ayuda', [conAyuda(F(16, 9))]),
      reciente: concepto('reciente', [fallo(F(14, 9))]),
      reciente2: concepto('reciente2', [fallo(F(16, 9))]),
      doble: concepto('doble', [fallo(F(10, 9)), fallo(F(15, 9))]),
    }))
    expect(inv.map(f => f.id)).toEqual(['doble', 'reciente2', 'reciente', 'ayuda'])
  })
})

describe('qué se sugiere hoy', () => {
  const muchos = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, k) => {
    const id = `C${String(k).padStart(2, '0')}`
    return [id, concepto(id, [fallo(F(11 + (k % 5), 9))])]
  }))
  const base = (progreso: Record<string, ProgresoConcepto>, enCajasHoy = new Set<string>(), nbme = emptyNbmeState('b')) => ({
    progreso, nbme, conceptoDisponible: () => true, revisionDePregunta: () => 'r1', ahora: AHORA, enCajasHoy,
  })

  it('nunca más de cinco, por muchas señales que haya', () => {
    expect(MAXIMO_SUGERIDAS).toBe(5)
    expect(sugerirRecuperar(base(muchos(40)))).toHaveLength(5)
  })
  it('lo que ya está en las cajas de hoy no se repite: se recupera allí', () => {
    const p = muchos(8)
    const todas = sugerirRecuperar(base(p), 100).map(f => f.id)
    const sin = sugerirRecuperar(base(p, new Set([`concepto:${todas[0]}`, `concepto:${todas[1]}`])), 100).map(f => f.id)
    expect(sin).not.toContain(todas[0])
    expect(sin).not.toContain(todas[1])
    expect(sin).toHaveLength(6)
  })
  it('lo que se acaba de fallar hoy no se sugiere: ya se está trabajando', () => {
    const p = { ...muchos(3), HOY: concepto('HOY', [fallo(F(17, 8))]) }
    expect(sugerirRecuperar(base(p), 100).map(f => f.id)).not.toContain('HOY')
  })
  it('lo que las cajas dejaron fuera por el techo del día sí entra aquí', () => {
    const p = muchos(3)
    expect(sugerirRecuperar(base(p, new Set()), 100)).toHaveLength(3)
  })
  it('un historial limpio no sugiere nada y no inventa deuda', () => {
    expect(sugerirRecuperar(base({ X: concepto('X', [acierto(F(10, 9)), acierto(F(12, 9))]) }))).toEqual([])
  })
})
