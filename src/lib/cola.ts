/** Inserta otra aparición del fallo sin mutar la cola y funciona también en el último ítem. */
export function reinsertarTrasFallo<T>(orden: T[], indice: number, distancia: number): T[] {
  if (indice < 0 || indice >= orden.length) return [...orden]
  const copia = [...orden]
  copia.splice(Math.min(copia.length, indice + Math.max(1, distancia)), 0, orden[indice])
  return copia
}
