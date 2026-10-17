/**
 * A narrow consistency guard, not a medical validator. It only recognizes direct
 * classifications of the same named subject across the two primary NBME fields.
 * On a conflict, callers must exclude the entire primary source from recovery;
 * neither field is treated as the medically authoritative version.
 */
const CLASIFICACION_DIRECTA = /^([a-z][a-z0-9'-]*(?:\s+[a-z][a-z0-9'-]*){0,4})\s+is\s+(?:a|an)\s+(?:(?:short-acting|long-acting|potent)\s+)?(non(?:-|\s+)?depolarizing|depolarizing)\s+(?:neuromuscular\s+(?:blocker|blocking\s+agent)|skeletal\s+muscle\s+relaxant|muscle\s+relaxant)\b/

// Matching a pronoun or an unresolved reference in both fields would not establish
// that the classifications refer to the same agent.
const REFERENCIAS_AMBIGUAS = new Set([
  'it', 'this', 'that', 'he', 'she', 'they', 'the drug', 'the agent',
  'this drug', 'this agent', 'that drug', 'that agent',
])

function clasificaciones(texto: string): Map<string, Set<'depolarizing' | 'nondepolarizing'>> {
  const resultado = new Map<string, Set<'depolarizing' | 'nondepolarizing'>>()
  const normalizado = texto.normalize('NFKC').toLowerCase().replace(/[\u2010-\u2015\u2212]/g, '-')
  for (const frase of normalizado.split(/(?<=[.!?])\s+|\n+/)) {
    const encontrada = CLASIFICACION_DIRECTA.exec(frase.trim())
    if (!encontrada) continue
    const sujeto = encontrada[1].replace(/\s+/g, ' ')
    if (REFERENCIAS_AMBIGUAS.has(sujeto)) continue
    const tipo = encontrada[2].startsWith('non') ? 'nondepolarizing' : 'depolarizing'
    const tipos = resultado.get(sujeto) ?? new Set<'depolarizing' | 'nondepolarizing'>()
    tipos.add(tipo)
    resultado.set(sujeto, tipos)
  }
  return resultado
}

export function tieneClasificacionContradictoria(explanation: string, objective?: string | null): boolean {
  if (!objective) return false
  const explicacion = clasificaciones(explanation)
  const objetivo = clasificaciones(objective)
  for (const [sujeto, tipos] of explicacion) {
    const otros = objetivo.get(sujeto)
    if (otros && ((tipos.has('depolarizing') && otros.has('nondepolarizing'))
      || (tipos.has('nondepolarizing') && otros.has('depolarizing')))) return true
  }
  return false
}
