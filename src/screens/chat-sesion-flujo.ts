import { cargarTodo } from '../data/corpus'
import type { NbmeQuestionMeta, NbmeState } from '../nbme/types'
import type { Concepto, Modulo } from '../schema/concept'
import type { CriteriosDominio } from '../srs/mastery'
import type { ProgresoConcepto } from '../srs/tipos'
import { fichasDeSesion, resolverSesion, ritmoDe, type ResultadoSesion } from '../lib/constructor-sesion'
import type { ConsultaSesion } from '../lib/contexto-sesion'
import { mediasDeRitmo } from '../lib/ritmo'
import { pedirLectura, pedirLecturasPendientes, pedirRevision } from '../lib/sesion-claude'

/** Lo que la pantalla ya sabe de la persona: con esto, y sólo con esto, la plataforma arma la sesión. */
export interface DatosSesion {
  /** False while the NBME catalog is unavailable; do not present an empty bank as a result. */
  bancoDisponible?: boolean
  progreso: Record<string, ProgresoConcepto>
  criterios: CriteriosDominio
  nbme: NbmeState
  listas: Map<string, NbmeQuestionMeta>
  publicados: ReadonlySet<string>
  modulos: Modulo[]
  /** `tipo:id` de lo que hoy sigue pendiente en las cajas: cuenta como «por repasar». */
  enCajasHoy: ReadonlySet<string>
}

export type ResultadoFlujo = ResultadoSesion | { estado: 'error'; motivo: string }

/**
 * De la consulta ya entendida a una sesión lista: carga el material si hace falta, interpreta el
 * historial, filtra y, cuando se pidió un tema, deja que Claude lea el banco y cada candidata.
 */
export async function armarDesdeConsulta(consulta: ConsultaSesion, pedido: string, d: DatosSesion, signal?: AbortSignal, ahora = Date.now(),
  onProgreso?: (texto: string) => void): Promise<ResultadoFlujo> {
  if (consulta.fuente !== 'conceptos' && d.bancoDisponible === false) return { estado: 'error', motivo: 'El banco de preguntas aún no está disponible. Puedes pedir una sesión de conceptos o volver a intentar cuando cargue.' }
  let conceptos: Concepto[] = []
  if (consulta.fuente !== 'nbme') {
    try { conceptos = (await cargarTodo(d.modulos)).filter(c => d.publicados.has(c.concept_id)) }
    catch { return { estado: 'error', motivo: 'No pude cargar el material de estudio. Vuelve a intentarlo.' } }
  }
  if (signal?.aborted) return { estado: 'error', motivo: 'Se canceló la petición.' }
  const fichas = fichasDeSesion({
    conceptos, preguntas: [...d.listas.values()], progreso: d.progreso, nbme: d.nbme, criterios: d.criterios,
    enCajasHoy: d.enCajasHoy, conceptoDisponible: id => d.publicados.has(id), ahora,
  })
  const ritmo = ritmoDe(mediasDeRitmo(d.progreso, Object.values(d.nbme.attempts)))
  return resolverSesion({ consulta, pedido, fichas, ritmo, revisar: pedirRevision, signal, onProgreso,
    lectura: { pendientes: pedirLecturasPendientes, leer: pedirLectura } })
}
