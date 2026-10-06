import type { CoachConfusion, OrigenParecido, Parecido } from '../server/worker'

export type { CoachConfusion, OrigenParecido, Parecido }

/** Cómo se nombra en pantalla de dónde salió el texto al que se parece la respuesta. */
export const ORIGEN_PARECIDO: Record<OrigenParecido, string> = {
  correcta: 'es la respuesta de referencia',
  sinonimo: 'es un sinónimo aceptado de la respuesta',
  distractor: 'es un distractor cercano que declara el material',
  confusion: 'es una confusión conocida de este concepto',
  opcion: 'es una opción incorrecta de esta pregunta',
  relacionado: 'es un concepto vecino',
}

import { solicitarIA } from './peticion-ia'

export async function conQueSeConfundio(conceptId: string, answer: string, signal?: AbortSignal): Promise<CoachConfusion | null> {
  if (!answer.trim()) return null
  const r = await solicitarIA<Partial<CoachConfusion>>('/api/confusion', { conceptId, answer: answer.slice(0, 300) }, 15_000, signal)
  if (r.estado === 'sin_ia') return null
  return r.data?.mejor || Array.isArray(r.data?.candidatos) ? { mejor: r.data.mejor ?? null, candidatos: r.data.candidatos ?? [] } : null
}
