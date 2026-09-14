import type { SesionSemanal } from '../semana/tipos'
import type { PlanCheckpoint } from './tipos'

/**
 * El puente entre el plan y las sesiones preparadas, que es lo que evita marcar
 * dos veces la misma cosa.
 *
 * Las dos bases no comparten identificadores y no deben compartirlos: las
 * etiquetas del plan las escribe Yoel desde el chat, así que meter ahí un
 * identificador cruzado sería meter algo que se rompe a la primera edición. Lo
 * único que ambas conocen de forma fiable es en qué semana y en qué día cae la
 * sesión, así que ése es el criterio; el título sólo desempata cuando el día
 * tiene más de una sesión.
 */

const PREFIJO = /^StepOneMelman\s*·\s*Sesión de la semana\s+\d+\s*\/\s*\d+\s*·\s*(.+)$/u

/** Quita acentos, puntuación y el paréntesis de recuento para poder comparar títulos. */
function palabras(texto: string): string[] {
  return texto
    .replace(/\([^)]*\)\s*$/u, '')
    .normalize('NFD').replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
}

/**
 * El título que declara un checkpoint de sesión preparada, o `null` si el
 * checkpoint no es una de ellas.
 */
export function tituloDeCheckpoint(cp: PlanCheckpoint): string | null {
  return PREFIJO.exec(cp.label)?.[1]?.trim() ?? null
}

/** Cuántas palabras iniciales comparten dos títulos. */
function prefijoComun(a: string, b: string): number {
  const x = palabras(a), y = palabras(b)
  let n = 0
  while (n < x.length && n < y.length && x[n] === y[n]) n++
  return n
}

/**
 * Empareja un checkpoint del plan con una sesión de `weekly_sessions`.
 *
 * `sesiones` tiene que ser el conjunto de la semana del plan: la semana la
 * acota quien llama, y aquí se resuelve el día. Devuelve `null` si el checkpoint
 * no es una sesión preparada, si ese día no tiene ninguna sesión, o si el día
 * tiene varias y el título no basta para decidir. Ante la duda no adivina:
 * abrir la sesión equivocada cuesta más que no abrir ninguna.
 */
export function sesionDeCheckpoint(cp: PlanCheckpoint, sesiones: SesionSemanal[]): SesionSemanal | null {
  const titulo = tituloDeCheckpoint(cp)
  if (titulo === null) return null
  const delDia = sesiones.filter(s => s.dia === cp.dia)
  if (delDia.length <= 1) return delDia[0] ?? null
  const puntuadas = delDia.map(s => ({ s, n: prefijoComun(titulo, s.titulo) }))
  const mejor = Math.max(...puntuadas.map(p => p.n))
  if (mejor === 0) return null
  const ganadoras = puntuadas.filter(p => p.n === mejor)
  return ganadoras.length === 1 ? ganadoras[0].s : null
}

/**
 * Todos los enlaces de una semana, con cada sesión reclamada como mucho una vez.
 * Dos checkpoints del mismo día no pueden abrir la misma sesión: el segundo se
 * quedaría marcando algo que ya hizo el primero.
 */
export function enlazarCheckpoints(
  checkpoints: PlanCheckpoint[], sesiones: SesionSemanal[],
): Map<number, SesionSemanal> {
  const enlaces = new Map<number, SesionSemanal>()
  const libres = [...sesiones]
  for (const cp of [...checkpoints].sort((a, b) => a.idx - b.idx)) {
    const sesion = sesionDeCheckpoint(cp, libres)
    if (!sesion) continue
    enlaces.set(cp.id, sesion)
    libres.splice(libres.indexOf(sesion), 1)
  }
  return enlaces
}

/** Las sesiones de `weekly_sessions` que caen dentro de la semana del plan. */
export function sesionesDeLaSemana(sesiones: SesionSemanal[], inicio: string, fin: string): SesionSemanal[] {
  return sesiones.filter(s => s.semanaInicio >= inicio && s.semanaInicio <= fin)
}
