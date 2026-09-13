import type { Paso } from './tipos'

/**
 * Cuándo una sesión de la semana está hecha de verdad.
 *
 * Recorrer el guion hasta el final no prueba que se estudiara: se puede pasar de
 * largo. Lo que cuenta es la evidencia registrada — un intento por cada concepto y
 * una respuesta enviada por cada pregunta — así que la sesión se marca completada
 * sola en cuanto esa evidencia cubre el guion, aunque el cursor no haya llegado al
 * final, y no se marca si llegó al final sin ella.
 *
 * El umbral no es del 100 %: un concepto retirado del corpus o una pregunta que no
 * carga dejarían la sesión colgada para siempre. Con 85 % de los pasos respondidos
 * la sesión se da por hecha; en un guion de veinte pasos eso son diecisiete.
 *
 * Acertar no entra en el criterio a propósito. Completar una sesión es haber hecho
 * el trabajo; que el concepto quede dominado lo deciden los criterios de dominio y
 * el planificador, en repasos posteriores.
 */
export const UMBRAL_COMPLETADA = 0.85

export interface CoberturaSesion {
  pasos: number
  conceptos: { total: number; hechos: number }
  preguntas: { total: number; hechas: number }
  hechos: number
  fraccion: number
  cumple: boolean
  /** Primer paso del guion todavía sin evidencia; -1 cuando no queda ninguno. */
  primeroPendiente: number
}

const hecho = (paso: Paso, conceptos: Set<string>, preguntas: Set<string>) =>
  paso.kind === 'concepto' ? conceptos.has(paso.id) : preguntas.has(paso.id)

export function coberturaSesion(
  guion: Paso[],
  conceptosConEvidencia: Iterable<string>,
  preguntasRespondidas: Iterable<string>,
  umbral = UMBRAL_COMPLETADA,
): CoberturaSesion {
  const conceptos = new Set(conceptosConEvidencia)
  const preguntas = new Set(preguntasRespondidas)
  let conceptosTotal = 0, conceptosHechos = 0, preguntasTotal = 0, preguntasHechas = 0
  let primeroPendiente = -1
  for (let i = 0; i < guion.length; i++) {
    const paso = guion[i]
    const listo = hecho(paso, conceptos, preguntas)
    if (paso.kind === 'concepto') { conceptosTotal++; if (listo) conceptosHechos++ }
    else { preguntasTotal++; if (listo) preguntasHechas++ }
    if (!listo && primeroPendiente < 0) primeroPendiente = i
  }
  const pasos = guion.length
  const hechos = conceptosHechos + preguntasHechas
  const fraccion = pasos ? hechos / pasos : 0
  return {
    pasos,
    conceptos: { total: conceptosTotal, hechos: conceptosHechos },
    preguntas: { total: preguntasTotal, hechas: preguntasHechas },
    hechos, fraccion,
    cumple: pasos > 0 && fraccion >= umbral,
    primeroPendiente,
  }
}
