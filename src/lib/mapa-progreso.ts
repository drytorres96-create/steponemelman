import { DISCIPLINAS, SISTEMAS, type Concepto } from '../schema/concept'
import type { EstadoApp } from '../store/model'
import { dominioVigente } from '../srs/mastery'
import { estaVencido } from '../srs/fsrs'
import { conceptosUnicos, erroresRecientesPendientes } from './plan-estudio'

export type MetricaMapa = 'nuevos' | 'vencidos' | 'errores' | 'dominio'
export const METRICAS_MAPA: Record<MetricaMapa, string> = { nuevos: 'Nuevos', vencidos: 'Repasos vencidos', errores: 'Errores recientes', dominio: 'Dominio vigente' }
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
    } }
  }))
}
