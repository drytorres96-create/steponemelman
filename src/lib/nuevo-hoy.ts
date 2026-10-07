import { deriveNbmeSession, isNbmeSessionArchived } from '../nbme/model'
import type { NbmeQuestionMeta, NbmeQuestionRef, NbmeState } from '../nbme/types'
import type { Modulo } from '../schema/concept'
import { inicioDelDia, materialNuevo, type EntradaDia } from './dia'
import { fechaEstudio } from './calendario-estudio'
export interface MaterialNuevo { conceptIds: string[]; preguntas: NbmeQuestionRef[]; titulo: string; nbmeSessionId: string | null }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/**
 * La semana decide la prioridad, pero su ausencia no reduce el día a lo ya hecho.
 * Los otros IDs publicados completan las plazas; `materialNuevo` descarta después
 * cualquier concepto ya resuelto, sin convertir consolidación en material nuevo.
 */
export function completarEntradaDeHoy(entrada: EntradaDia, modulos: Modulo[],
  listas: Map<string, NbmeQuestionMeta>): EntradaDia {
  const conceptos = [...modulos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .flatMap(m => m.sesiones.flatMap(s => s.conceptos))
  const preguntas = [...listas.values()].filter(q => q.status === 'ready').map(q => q.id)
  return { ...entrada, conceptosDisponibles: [...new Set(conceptos)], preguntasDisponibles: [...new Set(preguntas)] }
}
export function tituloDeHoy(tipo: 'Cajas' | 'Nuevo', ahora: number): string {
  const f = fechaEstudio(ahora)
  return `${tipo} de hoy · ${f.dia} ${MESES[f.mes - 1]}`
}
export function prepararNuevoDeHoy(entrada: EntradaDia, listas: Map<string, NbmeQuestionMeta>, state: NbmeState): MaterialNuevo {
  const material = materialNuevo(entrada)
  const preguntas = material.preguntas.map(id => listas.get(id)).filter((q): q is NbmeQuestionMeta => !!q && q.status === 'ready')
    .map(q => ({ id: q.id, revision: q.revision }))
  const titulo = tituloDeHoy('Nuevo', entrada.ahora)
  let nbmeSessionId: string | null = null
  if (preguntas.length) for (const s of Object.values(state.sessions)) {
    if (isNbmeSessionArchived(state, s.id)) continue
    if (s.title !== titulo || s.startedAt < inicioDelDia(entrada.ahora)) continue
    const vista = deriveNbmeSession(state, s.id)
    if (vista?.phase !== 'question' || vista.current?.round !== 0) continue
    const libres = s.initial.filter((_, posicion) => !state.attempts[`${s.id}:${posicion}`])
    if (libres.length === preguntas.length && libres.every((r, k) => r.id === preguntas[k].id && r.revision === preguntas[k].revision)) { nbmeSessionId = s.id; break }
  }
  return { conceptIds: material.conceptos, preguntas, titulo, nbmeSessionId }
}
