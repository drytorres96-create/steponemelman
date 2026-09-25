import type { SesionSemanal } from '../semana/tipos'
import type { PlanCheckpoint } from './tipos'

/**
 * Lo que el plan y las sesiones preparadas comparten. Las dos bases no comparten
 * identificadores y no deben compartirlos: las etiquetas del plan las escribe Yoel
 * desde el chat. Lo único que ambas conocen de forma fiable es en qué semana cae
 * una sesión y cómo se llama su checkpoint.
 */

const PREFIJO = /^StepOneMelman\s*·\s*Sesión de la semana\s+\d+\s*\/\s*\d+\s*·\s*(.+)$/u

/**
 * El título que declara un checkpoint de sesión preparada, o `null` si el
 * checkpoint no es una de ellas.
 */
export function tituloDeCheckpoint(cp: PlanCheckpoint): string | null {
  return PREFIJO.exec(cp.label)?.[1]?.trim() ?? null
}

/** Las sesiones de `weekly_sessions` que caen dentro de la semana del plan. */
export function sesionesDeLaSemana(sesiones: SesionSemanal[], inicio: string, fin: string): SesionSemanal[] {
  return sesiones.filter(s => s.semanaInicio >= inicio && s.semanaInicio <= fin)
}
