import type { Paso } from './tipos'

/**
 * El guion mixto es el contrato entre quien planifica la semana y quien la
 * recorre. Aquí sólo vive la aritmética de ese recorrido: separar las dos colas,
 * situar un paso dentro de la suya y decidir cuál toca. Sin red, sin React y sin
 * estado, para que el orquestador no tenga que recalcular nada mientras estudia.
 */

/** Separa el guion en sus dos colas manteniendo el orden original. */
export function separarGuion(guion: Paso[]): {
  conceptIds: string[]
  preguntas: { id: string; revision: string }[]
} {
  const conceptIds: string[] = []
  const preguntas: { id: string; revision: string }[] = []
  for (const paso of guion) {
    if (paso.kind === 'concepto') conceptIds.push(paso.id)
    else preguntas.push({ id: paso.id, revision: paso.revision })
  }
  return { conceptIds, preguntas }
}

/**
 * Índice dentro de su propia cola para el paso `n` del guion.
 * Devuelve -1 cuando `n` cae fuera del guion.
 */
export function posicionEnCola(guion: Paso[], n: number): number {
  if (!Number.isInteger(n) || n < 0 || n >= guion.length) return -1
  const kind = guion[n].kind
  let posicion = 0
  for (let i = 0; i < n; i++) if (guion[i].kind === kind) posicion++
  return posicion
}

/** Primer paso no consumido a partir del cursor guardado. */
export function pasoActual(guion: Paso[], cursor: number): Paso | null {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= guion.length) return null
  return guion[cursor]
}

/**
 * Construye un guion mixto: una pregunta cada `cada` conceptos, sobrantes al final.
 * Determinista: mismas entradas, mismo guion.
 */
export function construirGuion(
  conceptIds: string[],
  preguntas: { id: string; revision: string }[],
  cada = 3,
): Paso[] {
  const paso = Math.max(1, Math.floor(cada))
  const guion: Paso[] = []
  const completos = Math.floor(conceptIds.length / paso)
  const conPregunta = Math.min(completos, preguntas.length)
  let usadas = 0
  for (let bloque = 0; bloque < completos; bloque++) {
    for (let i = 0; i < paso; i++) guion.push({ kind: 'concepto', id: conceptIds[bloque * paso + i] })
    if (bloque < conPregunta) guion.push({ kind: 'pregunta', ...preguntas[usadas++] })
  }
  for (let i = completos * paso; i < conceptIds.length; i++) guion.push({ kind: 'concepto', id: conceptIds[i] })
  for (; usadas < preguntas.length; usadas++) guion.push({ kind: 'pregunta', ...preguntas[usadas] })
  return guion
}

/**
 * Tramo de conceptos consecutivos al que pertenece el paso `n`: el reproductor
 * de conceptos recibe sólo esos y devuelve el control en cuanto se agotan.
 */
export function tramoDeConceptos(guion: Paso[], n: number): { ids: string[]; desde: number; inicio: number } {
  if (posicionEnCola(guion, n) < 0 || guion[n].kind !== 'concepto') return { ids: [], desde: 0, inicio: n }
  let inicio = n
  while (inicio > 0 && guion[inicio - 1].kind === 'concepto') inicio--
  const ids: string[] = []
  for (let i = inicio; i < guion.length && guion[i].kind === 'concepto'; i++) ids.push((guion[i] as { id: string }).id)
  return { ids, desde: n - inicio, inicio }
}
