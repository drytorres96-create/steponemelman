import type { NbmeAttempt } from '../nbme/types'
import { aciertosVigentes, evaluarDominio, evidenciaIndependiente, type CriteriosDominio } from '../srs/mastery'
import { intentoCorrecto, type ProgresoConcepto } from '../srs/tipos'
import { reconstruirProgreso } from '../store/model'
import { TECHO_CAJAS, inicioDelDia } from './dia'
import { ultimoIntentoResuelto } from './plan-estudio'

/**
 * La escalera de cajas: lo ya visto sube de caja hasta cerrarse, y se ve que se acaba.
 *
 * No es un planificador paralelo. La caja se deriva de la evidencia que ya existe
 * —los aciertos vigentes independientes— y el vencimiento sigue siendo el que
 * propone el planificador; la caja sólo pone un techo, igual que `techoHorizonte`
 * comprime lo que caería después del examen. Un concepto sale de la escalera
 * cuando cumple los criterios de dominio, no por llegar al último escalón.
 *
 * Lo que vence se reparte con un techo duro por día. Lo que no cabe espera al día
 * siguiente en silencio: ninguna función de este módulo devuelve cuánto quedó
 * fuera, porque una cuenta de deuda es justo lo que deja de servir tras una
 * semana sin estudiar.
 */

export type Caja = 1 | 2 | 3
export type Escalon = Caja | 'cerrado'
/** Techo de cada caja: lo más tarde que puede volver un ítem que está en ella. */
export const HORAS_CAJA: Record<Caja, number> = { 1: 24, 2: 48, 3: 72 }
const DIAS_CAJA: Record<Caja, number> = { 1: 1, 2: 2, 3: 3 }
/** Entra hoy lo que vence en menos de seis horas desde que se fija el día. */
export const VENTANA_PENDIENTE_HORAS = 6
/** Un fallo dentro de la sesión vuelve cuatro pasos más adelante... */
export const DISTANCIA_REINSERCION = 4
/** ...como mucho tres veces. Después se deja para otro día. */
export const MAX_REINSERCIONES = 3

const HORA = 3_600_000

/**
 * Escalón de un concepto: `null` si nunca se resolvió, `cerrado` si cumple los
 * criterios de dominio y, si no, la caja que marcan sus aciertos vigentes
 * independientes (0 → 1, 1 → 2, 2 o más → 3). Un fallo como último resultado lo
 * devuelve a la caja 1 aunque el descuento le deje algún acierto vigente.
 */
export function cajaDeConcepto(p: ProgresoConcepto, criterios: CriteriosDominio, ahora: number): Escalon | null {
  const ultimo = ultimoIntentoResuelto(p)
  if (!ultimo) return null
  if (evaluarDominio(p, criterios, ahora).cumple) return 'cerrado'
  if (!intentoCorrecto(ultimo)) return 1
  const vigentes = aciertosVigentes(p).filter(evidenciaIndependiente).length
  return vigentes >= 2 ? 3 : vigentes === 1 ? 2 : 1
}

/**
 * Techo de una caja contado en días de estudio: la caja 1 vuelve al empezar el día
 * siguiente, la 2 dos días después y la 3 tres. Contar horas exactas haría que lo
 * estudiado a las ocho de la tarde no entrara al día siguiente si ese día se
 * empieza temprano, y la caja 1 se estiraría a dos días. Nunca pasa de 24, 48 o
 * 72 horas: el cambio de hora no la alarga.
 */
export function techoCaja(ultimo: number, caja: Caja): number {
  const dia = new Date(inicioDelDia(ultimo))
  dia.setDate(dia.getDate() + DIAS_CAJA[caja])
  return Math.min(dia.getTime(), ultimo + HORAS_CAJA[caja] * HORA)
}

/** Vence a lo que proponga el planificador, pero nunca más tarde que el techo de su caja. */
export function vencimientoConcepto(p: ProgresoConcepto, caja: Caja): number {
  const techo = techoCaja(p.ultimo ?? 0, caja)
  return p.proxima === null ? techo : Math.min(p.proxima, techo)
}

/**
 * Las preguntas NBME entran en la escalera al fallarse. Cada acierto posterior
 * sube una caja, uno por día de estudio y nunca el mismo día del fallo: la
 * corrección tras ver la explicación no es evidencia de haberla aprendido. Tras
 * la caja 3 la pregunta queda cerrada; un fallo nuevo la devuelve a la caja 1.
 */
export function escalonDePregunta(intentos: NbmeAttempt[]): { escalon: Escalon; ultimo: number } | null {
  const orden = [...intentos].sort((a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id))
  let fallada = false, subidas = 0, diaEvento = -Infinity
  for (const intento of orden) {
    const dia = inicioDelDia(intento.submittedAt)
    if (!intento.correct || intento.conflict) { fallada = true; subidas = 0; diaEvento = dia; continue }
    if (fallada && dia > diaEvento) { subidas++; diaEvento = dia }
  }
  if (!fallada) return null
  return { escalon: subidas >= 3 ? 'cerrado' : (subidas + 1) as Caja, ultimo: orden[orden.length - 1].submittedAt }
}

/** Una pregunta no tiene planificador propio: vuelve cuando lo marca su caja. */
export function vencimientoPregunta(ultimo: number, caja: Caja): number {
  return techoCaja(ultimo, caja)
}

export interface ItemCaja {
  tipo: 'concepto' | 'pregunta'
  id: string
  /** Caja con la que empezó el día. */
  caja: Caja
  vence: number
  /** Ya tiene un intento resuelto hoy. */
  hecho: boolean
}

export interface EntradaCajas {
  progreso: Record<string, ProgresoConcepto>
  criterios: CriteriosDominio
  intentosPreguntas: NbmeAttempt[]
  conceptoDisponible: (id: string) => boolean
  preguntaDisponible: (id: string) => boolean
  /** Instante en que se fija el día: su primer intento, o ahora si todavía no hay ninguno. */
  referencia: number
  ahora: number
}

export interface CajasDelDia {
  /** Lo que toca hoy, como mucho TECHO_CAJAS, en el orden en que se estudia. */
  items: ItemCaja[]
  hechos: number
  techo: number
  cerrada: boolean
}

/** El estado con el que el concepto empezó el día: lo de hoy no cambia lo que tocaba hoy. */
function progresoAntesDe(p: ProgresoConcepto, desde: number, criterios: CriteriosDominio): ProgresoConcepto {
  if (!p.intentos.some(i => i.ts >= desde)) return p
  return reconstruirProgreso(p.concept_id, p.intentos.filter(i => i.ts < desde), criterios)
}

/**
 * Las cajas de hoy. Entra lo que vio días anteriores y no está cerrado, cuando
 * vence antes de seis horas desde que se fija el día; se ordena por lo que venció
 * antes y se corta en TECHO_CAJAS. Todo se calcula con el estado con que cada
 * ítem empezó el día, así que estudiar no mueve el techo: sólo marca hechos.
 */
export function cajasDelDia(e: EntradaCajas): CajasDelDia {
  const desde = inicioDelDia(e.ahora)
  const limite = e.referencia + VENTANA_PENDIENTE_HORAS * HORA
  const candidatos: ItemCaja[] = []

  for (const p of Object.values(e.progreso)) {
    if (!e.conceptoDisponible(p.concept_id)) continue
    const antes = progresoAntesDe(p, desde, e.criterios)
    const escalon = cajaDeConcepto(antes, e.criterios, desde)
    if (escalon === null || escalon === 'cerrado') continue
    const vence = vencimientoConcepto(antes, escalon)
    if (vence >= limite) continue
    candidatos.push({ tipo: 'concepto', id: p.concept_id, caja: escalon, vence,
      hecho: p.intentos.some(i => i.resultado !== 'revision' && i.ts >= desde) })
  }

  const porPregunta = new Map<string, NbmeAttempt[]>()
  for (const intento of e.intentosPreguntas) {
    const lista = porPregunta.get(intento.questionId)
    if (lista) lista.push(intento)
    else porPregunta.set(intento.questionId, [intento])
  }
  for (const [id, intentos] of porPregunta) {
    if (!e.preguntaDisponible(id)) continue
    const antes = escalonDePregunta(intentos.filter(a => a.submittedAt < desde))
    if (!antes || antes.escalon === 'cerrado') continue
    const vence = vencimientoPregunta(antes.ultimo, antes.escalon)
    if (vence >= limite) continue
    candidatos.push({ tipo: 'pregunta', id, caja: antes.escalon, vence, hecho: intentos.some(a => a.submittedAt >= desde) })
  }

  candidatos.sort((a, b) => a.vence - b.vence || a.caja - b.caja
    || (a.tipo === b.tipo ? 0 : a.tipo === 'concepto' ? -1 : 1) || a.id.localeCompare(b.id))
  const items = candidatos.slice(0, TECHO_CAJAS)
  const hechos = items.filter(i => i.hecho).length
  return { items, hechos, techo: items.length, cerrada: hechos >= items.length }
}

/**
 * Un fallo dentro de la sesión vuelve a la caja 1 y se reinserta cuatro pasos más
 * adelante —al final si no quedan cuatro—, como mucho tres veces por ítem. La cola
 * original no se toca.
 */
export function reinsertarFallo<T extends { vez: number }>(cola: T[], indice: number): T[] {
  const paso = cola[indice]
  if (!paso || paso.vez >= MAX_REINSERCIONES) return [...cola]
  const copia = [...cola]
  copia.splice(Math.min(copia.length, indice + DISTANCIA_REINSERCION), 0, { ...paso, vez: paso.vez + 1 })
  return copia
}
