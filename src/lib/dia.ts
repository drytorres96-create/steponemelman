import type { NbmeAttempt } from '../nbme/types'
import { sesionesDeLaSemana } from '../plan/enlace'
import { separarGuion } from '../semana/guion'
import type { SesionSemanal } from '../semana/tipos'
import type { ProgresoConcepto } from '../srs/tipos'
import { fechaISO, lunesDe } from './tiempo'

/**
 * El día de estudio como techo. Lo que toca hoy es una cantidad finita y visible,
 * y cuando se acaba, se acaba: el sitio lo dice y deja de ofrecer material.
 *
 * Nada de esto se guarda. El cierre del día es una función pura del historial de
 * intentos —`study_state` y `nbme_state`— y de la fecha, así que sobrevive a
 * cambiar de dispositivo sin sincronizar nada nuevo y no puede desfasarse del
 * progreso real. Los techos, si algún día se editan, irán a Ajustes.
 */

export const TECHO_CONCEPTOS_NUEVOS = 10
export const TECHO_PREGUNTAS = 5
export const TECHO_CAJAS = 12
/** El día empieza a las 3:00 locales: una sesión a las 2 AM cuenta como la del día anterior. */
export const INICIO_DIA_HORA = 3

/** Instante local en que empezó el día de estudio que contiene `ahora`. */
export function inicioDelDia(ahora: number): number {
  const f = new Date(ahora)
  const inicio = new Date(f.getFullYear(), f.getMonth(), f.getDate(), INICIO_DIA_HORA)
  if (inicio.getTime() > ahora) inicio.setDate(inicio.getDate() - 1)
  return inicio.getTime()
}

/** Instante local en que empieza el día de estudio siguiente. Aritmética de calendario, no 24 h fijas. */
export function finDelDia(ahora: number): number {
  const inicio = new Date(inicioDelDia(ahora))
  inicio.setDate(inicio.getDate() + 1)
  return inicio.getTime()
}

/** Primer intento resuelto de un concepto. Una respuesta por revisar no acredita haberlo visto. */
export function primerIntentoResuelto(p?: ProgresoConcepto): number | null {
  let primero: number | null = null
  for (const intento of p?.intentos ?? []) {
    if (intento.resultado === 'revision') continue
    if (primero === null || intento.ts < primero) primero = intento.ts
  }
  return primero
}

/**
 * Instante en que queda fijado lo que toca hoy: el primer intento resuelto del día,
 * de concepto o de pregunta. Hasta que se empieza, la portada sigue al reloj; en
 * cuanto hay una respuesta, el techo del día ya no crece aunque avance la tarde.
 */
export function referenciaDelDia(progreso: Record<string, ProgresoConcepto>, intentosPreguntas: NbmeAttempt[], ahora: number): number {
  const desde = inicioDelDia(ahora)
  let primero = ahora
  for (const p of Object.values(progreso)) {
    for (const intento of p.intentos) {
      if (intento.resultado !== 'revision' && intento.ts >= desde && intento.ts < primero) primero = intento.ts
    }
  }
  for (const intento of intentosPreguntas) {
    if (intento.submittedAt >= desde && intento.submittedAt < primero) primero = intento.submittedAt
  }
  return primero
}

/** Lunes y domingo, en fechas locales, de la semana que contiene el día de estudio de `ahora`. */
export function limitesSemana(ahora: number): { inicio: string; fin: string } {
  const lunes = lunesDe(inicioDelDia(ahora))
  const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6)
  return { inicio: fechaISO(lunes), fin: fechaISO(domingo) }
}

export interface TemaSemana {
  sesiones: SesionSemanal[]
  /** Conceptos de los guiones, sin duplicados y en el orden en que la semana los presenta. */
  conceptIds: string[]
  /** Preguntas de los guiones, sin duplicados y en orden. */
  preguntaIds: string[]
}

/** El tema de la semana es lo que traen los guiones de sus sesiones; ni más ni menos. */
export function temaDeLaSemana(sesiones: SesionSemanal[], inicio: string, fin: string): TemaSemana {
  const propias = sesionesDeLaSemana(sesiones, inicio, fin)
    .sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio) || a.dia - b.dia || a.orden - b.orden)
  const conceptIds = new Set<string>(), preguntaIds = new Set<string>()
  for (const sesion of propias) {
    const { conceptIds: conceptos, preguntas } = separarGuion(sesion.guion)
    conceptos.forEach(id => conceptIds.add(id))
    preguntas.forEach(q => preguntaIds.add(q.id))
  }
  return { sesiones: propias, conceptIds: [...conceptIds], preguntaIds: [...preguntaIds] }
}

export interface EntradaDia {
  progreso: Record<string, ProgresoConcepto>
  intentosPreguntas: NbmeAttempt[]
  /** Conceptos del tema de la semana que se pueden estudiar ahora, en su orden. */
  conceptosSemana: string[]
  /** Preguntas del tema de la semana que el banco da por listas, en su orden. */
  preguntasSemana: string[]
  /** Lo que ya decidió la escalera de cajas para hoy. */
  cajas: { hechos: number; techo: number }
  ahora: number
}

export interface EstadoDia {
  nuevo: { conceptos: number; preguntas: number; techoConceptos: number; techoPreguntas: number; cerrada: boolean }
  cajas: { hechos: number; techo: number; cerrada: boolean }
  completo: boolean
}

interface CuentaNuevo {
  conceptos: number
  preguntas: number
  techoConceptos: number
  techoPreguntas: number
  siguientesConceptos: string[]
  siguientesPreguntas: string[]
}

/**
 * «Nuevo» es un concepto sin ningún intento resuelto antes de hoy; «visto» es un
 * intento resuelto hoy, acierto o fallo, venga de donde venga. El techo baja a lo
 * que la semana tiene disponible: la vía nunca se queda abierta pidiendo algo que
 * no existe.
 */
function contarNuevo(e: EntradaDia): CuentaNuevo {
  const desde = inicioDelDia(e.ahora), hasta = finDelDia(e.ahora)
  const deHoy = (t: number | null) => t !== null && t >= desde && t < hasta

  let conceptos = 0
  for (const p of Object.values(e.progreso)) if (deHoy(primerIntentoResuelto(p))) conceptos++
  const conceptosLibres = e.conceptosSemana.filter(id => primerIntentoResuelto(e.progreso[id]) === null)

  const primeraRespuesta = new Map<string, number>()
  for (const intento of e.intentosPreguntas) {
    const previa = primeraRespuesta.get(intento.questionId)
    if (previa === undefined || intento.submittedAt < previa) primeraRespuesta.set(intento.questionId, intento.submittedAt)
  }
  let preguntas = 0
  for (const t of primeraRespuesta.values()) if (deHoy(t)) preguntas++
  const preguntasLibres = e.preguntasSemana.filter(id => !primeraRespuesta.has(id))

  const techoConceptos = Math.min(TECHO_CONCEPTOS_NUEVOS, conceptos + conceptosLibres.length)
  const techoPreguntas = Math.min(TECHO_PREGUNTAS, preguntas + preguntasLibres.length)
  return {
    conceptos, preguntas, techoConceptos, techoPreguntas,
    siguientesConceptos: conceptosLibres.slice(0, Math.max(0, techoConceptos - conceptos)),
    siguientesPreguntas: preguntasLibres.slice(0, Math.max(0, techoPreguntas - preguntas)),
  }
}

export function estadoDelDia(e: EntradaDia): EstadoDia {
  const n = contarNuevo(e)
  const nuevo = {
    conceptos: n.conceptos, preguntas: n.preguntas, techoConceptos: n.techoConceptos, techoPreguntas: n.techoPreguntas,
    cerrada: n.conceptos >= n.techoConceptos && n.preguntas >= n.techoPreguntas,
  }
  const cajas = { hechos: e.cajas.hechos, techo: e.cajas.techo, cerrada: e.cajas.hechos >= e.cajas.techo }
  return { nuevo, cajas, completo: nuevo.cerrada && cajas.cerrada }
}

/** Lo que falta de la vía nueva hoy, en el orden en que la semana lo presenta. */
export function materialNuevo(e: EntradaDia): { conceptos: string[]; preguntas: string[] } {
  const n = contarNuevo(e)
  return { conceptos: n.siguientesConceptos, preguntas: n.siguientesPreguntas }
}
