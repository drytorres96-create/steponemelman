import type { Concepto } from '../schema/concept'
import type { Intento } from '../srs/tipos'
import { evaluarTexto, EVALUADOR_VERSION } from '../lib/normalize'
import { versionPregunta } from '../screens/sesion'

/** User-requested correction against the exact saved presentation, never a bulk regrade. */
export function recheckAcceptedAnswer(concept: Concepto, attempt: Intento, now: number): Intento | null {
  if (!attempt.calificado_por_ia || attempt.correccion_manual || attempt.respuestas_en_conflicto?.length
    || !['incorrecta', 'parcial', 'revision'].includes(attempt.resultado ?? '')
    || attempt.pregunta_version !== versionPregunta(concept)
    || (attempt.variante_id ?? '') !== (concept.variante_id ?? '')
    || evaluarTexto(attempt.respuesta_dada ?? '', concept.respuesta_canonica,
      [...concept.sinonimos, ...concept.evaluacion.respuestas_aceptadas]) !== 'correcta') return null
  const assisted = attempt.explicacion_previa || attempt.fuente_consultada || attempt.pistas_usadas > 0
  return { ...attempt, resultado: 'correcta', calificacion: 3,
    tipo_error: assisted ? 'correcta_con_pistas' : 'ninguno', correccion_manual: true,
    evaluador_version: EVALUADOR_VERSION,
    calificacion_actualizada_en: Math.max(now, (attempt.calificacion_actualizada_en ?? attempt.ts) + 1) }
}
