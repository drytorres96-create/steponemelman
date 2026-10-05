/** La pregunta cierra el bloque de conceptos que la precede; conserva el guion original. */
export function bloqueDelGuion(guion: { kind: 'concepto' | 'pregunta' }[], posicion: number) {
  if (!guion.length) return { numero: 0, total: 0, paso: 0, pasos: 0, inicio: 0, fin: 0 }
  const limites: { inicio: number; fin: number }[] = []
  let inicio = 0
  guion.forEach((p, i) => {
    if (p.kind === 'pregunta' || i === guion.length - 1) { limites.push({ inicio, fin: i + 1 }); inicio = i + 1 }
  })
  const actual = Math.max(0, Math.min(posicion, Math.max(0, guion.length - 1)))
  const n = Math.max(0, limites.findIndex(b => actual >= b.inicio && actual < b.fin))
  const b = limites[n] ?? { inicio: 0, fin: 0 }
  return { numero: n + 1, total: limites.length, paso: actual - b.inicio + 1, pasos: b.fin - b.inicio,
    inicio: b.inicio, fin: b.fin }
}
