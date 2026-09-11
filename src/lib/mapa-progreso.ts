import { DISCIPLINAS, SISTEMAS, type Concepto } from '../schema/concept'
import type { EstadoApp } from '../store/model'
import { dominioVigente } from '../srs/mastery'
import { estaVencido } from '../srs/fsrs'
import { conceptosUnicos, erroresRecientesPendientes } from './plan-estudio'
import { aplicacionComprobada } from './variantes'

export type MetricaMapa = 'nuevos' | 'vencidos' | 'errores' | 'dominio' | 'aplicacion'
export const METRICAS_MAPA: Record<MetricaMapa, string> = { nuevos: 'Nuevos', vencidos: 'Repasos vencidos', errores: 'Errores recientes', dominio: 'Dominio vigente', aplicacion: 'Aplicación comprobada' }
export interface CeldaMapa { id: string; sistema: string; disciplina: string; conceptos: Concepto[]; grupos: Record<MetricaMapa, Concepto[]> }
export function construirMapa(conceptos: Concepto[], estado: EstadoApp, ahora = Date.now()): CeldaMapa[] {
  const base = conceptosUnicos(conceptos)
  const errores = new Set(erroresRecientesPendientes(base, estado.progreso, ahora).map(c => c.concept_id))
  return SISTEMAS.flatMap(sistema => DISCIPLINAS.map(disciplina => {
    const cs = base.filter(c => [c.clasificacion.sistema_primario, ...(c.clasificacion.sistemas_secundarios ?? [])].includes(sistema)
      && [c.clasificacion.disciplina_primaria, ...(c.clasificacion.disciplinas_secundarias ?? [])].includes(disciplina))
    return { id: `${sistema}:${disciplina}`, sistema, disciplina, conceptos: cs, grupos: {
      nuevos: cs.filter(c => !estado.progreso[c.concept_id]?.intentos.length),
      vencidos: cs.filter(c => estado.progreso[c.concept_id]?.intentos.length && estaVencido(estado.progreso[c.concept_id], ahora)),
      errores: cs.filter(c => errores.has(c.concept_id)),
      dominio: cs.filter(c => estado.progreso[c.concept_id] && dominioVigente(estado.progreso[c.concept_id], estado.criterios, ahora)),
      aplicacion: cs.filter(c => aplicacionComprobada(c, estado.progreso[c.concept_id])),
    } }
  }))
}
export function prioridadesSemana(celdas: CeldaMapa[], limite = 10) {
  const usados = new Set<string>()
  const resultado: { celda: CeldaMapa; conceptos: Concepto[]; motivo: string }[] = []
  const orden = [...celdas].sort((a, b) => b.grupos.errores.length - a.grupos.errores.length || b.grupos.vencidos.length - a.grupos.vencidos.length || b.grupos.nuevos.length - a.grupos.nuevos.length || a.id.localeCompare(b.id))
  for (const celda of orden) {
    const errores = celda.grupos.errores.filter(c => !usados.has(c.concept_id))
    const vencidos = celda.grupos.vencidos.filter(c => !usados.has(c.concept_id))
    const nuevos = celda.grupos.nuevos.filter(c => !usados.has(c.concept_id))
    const conceptos = conceptosUnicos([...errores, ...vencidos, ...nuevos]).slice(0, limite)
    if (!conceptos.length) continue
    const seleccion = new Set(conceptos.map(c => c.concept_id))
    const nErrores = errores.filter(c => seleccion.has(c.concept_id)).length
    const nVencidos = vencidos.filter(c => seleccion.has(c.concept_id)).length
    const motivo = nErrores || nVencidos ? `${nErrores} errores recientes y ${nVencidos} repasos vencidos en esta selección; un concepto puede pertenecer a ambos grupos.` : `Explorar ${conceptos.length} conceptos nuevos del material disponible.`
    resultado.push({ celda, conceptos, motivo }); conceptos.forEach(c => usados.add(c.concept_id))
    if (resultado.length === 3) break
  }
  return resultado
}
