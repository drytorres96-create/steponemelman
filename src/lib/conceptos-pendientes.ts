import type { Reanudable } from '../store/model'

/**
 * Un resumen guardado sigue disponible en el plan clásico, pero no debe tapar
 * los pasos pendientes al ponerse al día. Sin cola exacta se conserva la
 * continuación heredada: no hay información suficiente para darla por terminada.
 */
export function hayConceptosPendientes(reanudable: Reanudable | null): boolean {
  return !!reanudable && (!reanudable.conceptIds || reanudable.indice < reanudable.conceptIds.length)
}
