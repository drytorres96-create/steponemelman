import type { Concepto } from '../schema/concept'
import type { ProgresoConcepto } from '../srs/tipos'
import { estaVencido } from '../srs/fsrs'
import { ultimoIntento } from './plan-estudio'

export const TAMANO_PAGINA_CONCEPTOS = 20
export const MAXIMO_SELECCION_CONCEPTOS = 20
export type EstadoBusqueda = 'nuevo' | 'pendiente' | 'por_revisar' | 'al_dia'
export interface FiltrosBusqueda {
  texto: string
  disciplina: string
  sistema: string
  tema: string
  estado: EstadoBusqueda | ''
}
export const FILTROS_BUSQUEDA_INICIALES: FiltrosBusqueda = { texto: '', disciplina: '', sistema: '', tema: '', estado: '' }

/** La búsqueda no distingue mayúsculas, tildes ni separación por signos. */
export function normalizarBusqueda(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

export interface ConceptoIndexado { concepto: Concepto; texto: string; objetivo: string }
export function indexarConceptos(conceptos: Concepto[]): ConceptoIndexado[] {
  return [...new Map(conceptos.map(c => [c.concept_id, c])).values()].map(concepto => ({
    concepto,
    objetivo: normalizarBusqueda(concepto.objetivo),
    texto: normalizarBusqueda([
      concepto.objetivo, concepto.evaluacion.pregunta, concepto.afirmacion,
      ...concepto.sinonimos, concepto.escritura_correctiva.termino ?? '',
      concepto.clasificacion.tema, concepto.clasificacion.subtema,
      concepto.clasificacion.disciplina_primaria, ...concepto.clasificacion.disciplinas_secundarias,
      concepto.clasificacion.sistema_primario, ...concepto.clasificacion.sistemas_secundarios,
    ].join(' ')),
  }))
}

export function estadoDeBusqueda(progreso?: ProgresoConcepto, ahora = Date.now()): EstadoBusqueda {
  if (!progreso?.intentos.length) return 'nuevo'
  if (ultimoIntento(progreso)?.resultado === 'revision') return 'por_revisar'
  return estaVencido(progreso, ahora) ? 'pendiente' : 'al_dia'
}

export function buscarConceptos(indice: ConceptoIndexado[], filtros: FiltrosBusqueda,
  progreso: Record<string, ProgresoConcepto>, ahora = Date.now()): Concepto[] {
  const tokens = [...new Set(normalizarBusqueda(filtros.texto.slice(0, 200)).split(' ').filter(Boolean))]
  const encontrados = indice.filter(({ concepto: c, texto }) => {
    if (filtros.disciplina && ![c.clasificacion.disciplina_primaria, ...c.clasificacion.disciplinas_secundarias].some(d => d === filtros.disciplina)) return false
    if (filtros.sistema && ![c.clasificacion.sistema_primario, ...c.clasificacion.sistemas_secundarios].some(s => s === filtros.sistema)) return false
    if (filtros.tema && normalizarBusqueda(c.clasificacion.tema) !== normalizarBusqueda(filtros.tema)) return false
    if (filtros.estado && estadoDeBusqueda(progreso[c.concept_id], ahora) !== filtros.estado) return false
    return tokens.every(t => texto.includes(t))
  })
  // Los objetivos coincidentes aparecen primero; el orden documental desempata.
  if (tokens.length) encontrados.sort((a, b) => tokens.filter(t => b.objetivo.includes(t)).length - tokens.filter(t => a.objetivo.includes(t)).length)
  return encontrados.map(x => x.concepto)
}

export function paginarConceptos<T>(resultados: T[], pagina: number): { elementos: T[]; pagina: number; paginas: number; inicio: number; fin: number } {
  const paginas = Math.max(1, Math.ceil(resultados.length / TAMANO_PAGINA_CONCEPTOS))
  const actual = Math.max(1, Math.min(paginas, Number.isFinite(pagina) ? Math.floor(pagina) : 1))
  const desplazamiento = (actual - 1) * TAMANO_PAGINA_CONCEPTOS
  const elementos = resultados.slice(desplazamiento, desplazamiento + TAMANO_PAGINA_CONCEPTOS)
  return { elementos, pagina: actual, paginas, inicio: resultados.length ? desplazamiento + 1 : 0, fin: desplazamiento + elementos.length }
}

export function alternarSeleccion(seleccion: string[], id: string): string[] {
  const actual = [...new Set(seleccion)].slice(0, MAXIMO_SELECCION_CONCEPTOS)
  if (actual.includes(id)) return actual.filter(x => x !== id)
  return actual.length < MAXIMO_SELECCION_CONCEPTOS ? [...actual, id] : actual
}

export function agregarSeleccion(seleccion: string[], ids: string[]): string[] {
  return [...new Set([...seleccion, ...ids])].slice(0, MAXIMO_SELECCION_CONCEPTOS)
}
