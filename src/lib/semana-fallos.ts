import { intentoCorrecto, type Intento, type ProgresoConcepto, type TipoError } from '../srs/tipos'

/**
 * Qué conceptos se le atragantaron esta semana, ordenados por lo que costaron.
 *
 * Esto es lo único que sale del navegador cuando se pide una lectura de la semana:
 * identificadores del corpus y tres cifras. Ni respuestas escritas, ni texto libre, ni
 * nada que el Worker no pueda volver a resolver contra el material publicado.
 */
export interface FalloSemanal {
  id: string
  fallos: number
  aciertos: number
  error: TipoError
}

/** Un intento cuenta como fallo cuando el veredicto fue objetivamente malo. */
const fallado = (t: Intento) => t.resultado !== 'revision' && !intentoCorrecto(t)

/**
 * El tipo de error que más se repitió; en empate, el del fallo más reciente, que es el que
 * describe cómo está el concepto ahora y no cómo estaba el lunes.
 */
export function errorDominante(fallos: Intento[]): TipoError {
  const cuenta = new Map<TipoError, number>()
  for (const t of fallos) cuenta.set(t.tipo_error, (cuenta.get(t.tipo_error) ?? 0) + 1)
  let mejor: TipoError = fallos[fallos.length - 1]?.tipo_error ?? 'desconocimiento'
  let alto = 0
  for (const t of [...fallos].reverse()) {
    const n = cuenta.get(t.tipo_error) ?? 0
    if (n > alto) { alto = n; mejor = t.tipo_error }
  }
  return mejor
}

export const MAXIMO_FALLOS = 18

/**
 * Se ordena por fallos y, a igualdad, por menos aciertos: dos fallos sin ningún acierto
 * pesan más que dos fallos en un concepto que por lo demás sale bien.
 */
export function fallosDeSemana(
  progresos: ProgresoConcepto[],
  desde: number,
  publicados?: Set<string>,
  maximo = MAXIMO_FALLOS,
): FalloSemanal[] {
  const lista: FalloSemanal[] = []
  for (const p of progresos) {
    if (publicados && !publicados.has(p.concept_id)) continue
    const semana = p.intentos.filter(t => t.ts >= desde)
    const fallos = semana.filter(fallado)
    if (!fallos.length) continue
    lista.push({
      id: p.concept_id,
      fallos: fallos.length,
      aciertos: semana.filter(t => intentoCorrecto(t)).length,
      error: errorDominante(fallos),
    })
  }
  return lista
    .sort((a, b) => b.fallos - a.fallos || a.aciertos - b.aciertos || a.id.localeCompare(b.id))
    .slice(0, maximo)
}
