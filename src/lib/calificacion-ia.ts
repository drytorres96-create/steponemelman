import type { CoachVeredicto } from '../server/worker'
import type { VersionFormato } from './formatos'

/** Lo que devuelve el intento de corrección: un veredicto, o por qué no lo hubo. */
export type ResultadoCalificacion =
  | { estado: 'ok'; veredicto: CoachVeredicto['veredicto']; motivo: string; origen?: 'respuesta_aceptada' }
  | { estado: 'sin_ia'; motivo: string }

import { solicitarIA } from './peticion-ia'

export interface PeticionCalificacion {
  conceptId: string; answer: string; questionId: string; version: string; formatVersion: VersionFormato
  variantId?: string; index: number; route: string; retry: boolean
}

/** Plazo del navegador para toda la operación; el Worker debe terminar su llamada a Claude con margen antes. */
export const PLAZO_CALIFICACION_MS = 15_000

/** Conserva el veredicto existente; sin IA, quien llama usa el corrector propio. */
export async function calificarConIA(peticion: PeticionCalificacion, signal?: AbortSignal): Promise<ResultadoCalificacion> {
  const r = await solicitarIA<Partial<CoachVeredicto> & { origen?: unknown }>('/api/calificar', { ...peticion, answer: peticion.answer.slice(0, 500) }, PLAZO_CALIFICACION_MS, signal)
  if (r.estado === 'sin_ia') return r
  const data = r.data
  if (!data || !['correcta', 'parcial', 'incorrecta'].includes(data.veredicto ?? '') || (data.motivo != null && typeof data.motivo !== 'string')) {
    return { estado: 'sin_ia', motivo: 'La IA no devolvió un veredicto utilizable.' }
  }
  return { estado: 'ok', veredicto: data.veredicto as CoachVeredicto['veredicto'], motivo: data.motivo?.trim() || '',
    ...(data.origen === 'respuesta_aceptada' ? { origen: 'respuesta_aceptada' as const } : {}) }
}
