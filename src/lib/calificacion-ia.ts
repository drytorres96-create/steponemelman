import type { CoachVeredicto } from '../server/worker'
import type { VersionFormato } from './formatos'

/** Lo que devuelve el intento de corrección: un veredicto, o por qué no lo hubo. */
export type ResultadoCalificacion =
  | { estado: 'ok'; veredicto: CoachVeredicto['veredicto']; motivo: string }
  | { estado: 'sin_ia'; motivo: string }

import { solicitarIA } from './peticion-ia'

export interface PeticionCalificacion {
  conceptId: string; answer: string; questionId: string; version: string; formatVersion: VersionFormato
  variantId?: string; index: number; route: string; retry: boolean
}

/** Conserva el veredicto existente; sin IA, quien llama usa el corrector propio. */
export async function calificarConIA(peticion: PeticionCalificacion, signal?: AbortSignal): Promise<ResultadoCalificacion> {
  const r = await solicitarIA<Partial<CoachVeredicto>>('/api/calificar', { ...peticion, answer: peticion.answer.slice(0, 500) }, 15_000, signal)
  if (r.estado === 'sin_ia') return r
  const data = r.data
  if (!data || !['correcta', 'parcial', 'incorrecta'].includes(data.veredicto ?? '') || (data.motivo != null && typeof data.motivo !== 'string')) {
    return { estado: 'sin_ia', motivo: 'La IA no devolvió un veredicto utilizable.' }
  }
  return { estado: 'ok', veredicto: data.veredicto as CoachVeredicto['veredicto'], motivo: data.motivo?.trim() || '' }
}
