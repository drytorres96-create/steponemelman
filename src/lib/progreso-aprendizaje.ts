import { dominioVigente, evaluarDominio, CRITERIOS_POR_DEFECTO, type CriteriosDominio } from '../srs/mastery'
import { estaVencido } from '../srs/fsrs'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import { intentoObservable, respuestaCorrectaObservada, tipoEvidenciaObservada, type TipoEvidenciaObservada } from './retencion-observada'

const DIA = 86_400_000
export type EstadoAprendizaje = 'sin_actividad' | 'en_aprendizaje' | 'mantenimiento_al_dia' | 'mantenimiento_pendiente' | 'mantenimiento_por_comprobar'
export const ETIQUETAS_APRENDIZAJE: Record<EstadoAprendizaje, string> = {
  sin_actividad: 'Sin actividad', en_aprendizaje: 'En aprendizaje',
  mantenimiento_al_dia: 'Dominio demostrado · mantenimiento al día',
  mantenimiento_pendiente: 'Dominio demostrado · mantenimiento pendiente',
  mantenimiento_por_comprobar: 'Dominio demostrado · mantenimiento por comprobar',
}
export interface ProgresoAprendizaje {
  actividad: boolean
  dominioDemostrado: boolean
  mantenimientoAlDia: boolean
  mantenimientoPendiente: boolean
  mantenimientoPorComprobar: boolean
  estado: EstadoAprendizaje
}

/** Un contrato compartido de presentación; no reescribe el estado histórico ni selecciona material. */
export function resumenProgresoAprendizaje(ids: Iterable<string>, progreso: Record<string, ProgresoConcepto>,
  criterios: CriteriosDominio, ahora = Date.now()) {
  const porConcepto = new Map<string, ProgresoAprendizaje>()
  const dominadosEn: number[] = []
  let actividad = 0, dominioDemostrado = 0, mantenimientoAlDia = 0, mantenimientoPendiente = 0, mantenimientoPorComprobar = 0
  for (const id of new Set(ids)) {
    const p = progreso[id]
    const activo = !!p?.intentos.length
    const demostrado = !!p && evaluarDominio(p, criterios, ahora).cumple
    const alDia = demostrado && dominioVigente(p!, criterios, ahora)
    const pendiente = demostrado && estaVencido(p!, ahora)
    const porComprobar = demostrado && !alDia && !pendiente
    const estado: EstadoAprendizaje = !activo ? 'sin_actividad' : !demostrado ? 'en_aprendizaje'
      : pendiente ? 'mantenimiento_pendiente' : alDia ? 'mantenimiento_al_dia' : 'mantenimiento_por_comprobar'
    porConcepto.set(id, { actividad: activo, dominioDemostrado: demostrado, mantenimientoAlDia: alDia,
      mantenimientoPendiente: pendiente, mantenimientoPorComprobar: porComprobar, estado })
    if (activo) actividad++
    if (demostrado) { dominioDemostrado++; dominadosEn.push(p!.dominado_en ?? 0) }
    if (alDia) mantenimientoAlDia++
    if (pendiente) mantenimientoPendiente++
    if (porComprobar) mantenimientoPorComprobar++
  }
  return { total: porConcepto.size, actividad, sinActividad: porConcepto.size - actividad,
    enAprendizaje: actividad - dominioDemostrado, dominioDemostrado, mantenimientoAlDia, mantenimientoPendiente, mantenimientoPorComprobar,
    porConcepto, dominadosEn }
}

/** Un hito requiere un acierto verificable después de ≥24 h desde la exposición inmediatamente anterior. */
export function hitoSemanalAprendizaje(progresos: ProgresoConcepto[], desde: number, hasta = Date.now(),
  criterios: CriteriosDominio = CRITERIOS_POR_DEFECTO) {
  const porTipo: Record<TipoEvidenciaObservada, number> = { recuerdo: 0, discriminacion: 0, aplicacion: 0 }
  const conceptos = new Set<string>()
  const nuevosDominios = new Set<string>()
  const mantenimientoConfirmado = new Set<string>()
  let primerTs: number | null = null, ultimoTs: number | null = null
  for (const p of progresos) {
    const intentos = [...p.intentos].filter(i => i.ts <= hasta).sort((a, b) => a.ts - b.ts)
    for (let n = 1; n < intentos.length; n++) {
      const actual = intentos[n], previo = intentos[n - 1]
      if (actual.ts < desde || !intentoObservable(actual) || !intentoObservable(previo)
        || !respuestaCorrectaObservada(actual) || actual.pregunta_version !== previo.pregunta_version
        || actual.ts - previo.ts < DIA) continue
      if (!conceptos.has(p.concept_id)) { conceptos.add(p.concept_id); porTipo[tipoEvidenciaObservada(actual)]++ }
      primerTs = Math.min(primerTs ?? actual.ts, actual.ts)
      ultimoTs = Math.max(ultimoTs ?? actual.ts, actual.ts)
    }
    if (conceptos.has(p.concept_id) && evaluarDominio(p, criterios, hasta).cumple && p.dominado_en !== null
      && Number.isFinite(p.dominado_en) && p.dominado_en > 0 && p.dominado_en <= hasta
      // Una fecha heredada no acredita dominio bajo criterios nuevos por sí sola.
      && evaluarDominio({ ...p, intentos: intentos.filter(i => i.ts <= p.dominado_en!) }, criterios, p.dominado_en).cumple) {
      if (p.dominado_en >= desde) nuevosDominios.add(p.concept_id)
      else mantenimientoConfirmado.add(p.concept_id)
    }
  }
  return { conceptos: conceptos.size, porTipo, nuevosDominios: nuevosDominios.size,
    mantenimientoConfirmado: mantenimientoConfirmado.size, primerTs, ultimoTs }
}

/** Feedback retrospectivo: compara el mismo instrumento, sin ayuda, con un fallo de otro día y ≥24 h atrás. */
export function antesTeCostaba(p: ProgresoConcepto, actual: Intento): boolean {
  if (!intentoObservable(actual) || !respuestaCorrectaObservada(actual)) return false
  return p.intentos.some(previo => previo !== actual && intentoObservable(previo)
    && !respuestaCorrectaObservada(previo) && previo.pregunta_version === actual.pregunta_version
    && actual.ts - previo.ts >= DIA
    && new Date(previo.ts).toDateString() !== new Date(actual.ts).toDateString())
}
