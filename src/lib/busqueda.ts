import type { Concepto } from '../schema/concept'
import type { ProgresoConcepto } from '../srs/tipos'
import { estaVencido } from '../srs/fsrs'
import { conceptosUnicos, construirPlanDiario, ultimoIntento } from './plan-estudio'
import type { RutaId } from './rutas'

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
export interface OpcionesSesionPersonalizada { titulo?: string; subtitulo?: string; ruta?: RutaId; modulo?: string }

export const NOMBRES_ESTADOS_BUSQUEDA: Record<EstadoBusqueda, string> = {
  nuevo: 'Nuevo', pendiente: 'Repaso pendiente', por_revisar: 'Respuesta por revisar', al_dia: 'Al día',
}

export function descripcionFiltros(filtros: FiltrosBusqueda): string {
  return [filtros.disciplina, filtros.sistema, filtros.tema, filtros.texto.trim() && `«${filtros.texto.trim()}»`,
    filtros.estado && NOMBRES_ESTADOS_BUSQUEDA[filtros.estado]].filter(Boolean).join(' · ')
}

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

/** La práctica elegida por el estudiante incluye también conceptos vistos que aún no vencen. */
export function construirSesionPersonalizada(conceptos: Concepto[], progreso: Record<string, ProgresoConcepto>,
  limite = MAXIMO_SELECCION_CONCEPTOS, ahora = Date.now()): Concepto[] {
  const maximo = Number.isFinite(limite) ? Math.min(MAXIMO_SELECCION_CONCEPTOS, Math.max(0, Math.floor(limite))) : 0
  const base = conceptosUnicos(conceptos)
  const prioritarios = construirPlanDiario(base, progreso, maximo, ahora).conceptos
  const elegidos = new Set(prioritarios.map(c => c.concept_id))
  const restantes = base.filter(c => !elegidos.has(c.concept_id)).sort((a, b) =>
    (ultimoIntento(progreso[a.concept_id])?.ts ?? 0) - (ultimoIntento(progreso[b.concept_id])?.ts ?? 0))
  return [...prioritarios, ...restantes].slice(0, maximo)
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
