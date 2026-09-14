import { supabase } from './supabase'
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

const LIMITE_MS = 15_000

/**
 * Con qué se parece lo que se escribió. Nunca lanza y nunca afirma de más: si nada pasa
 * del umbral de parecido devuelve `mejor: null`, y quien llama no enseña nada.
 *
 * No genera texto: el modelo solo mide distancias entre la respuesta y textos que ya
 * estaban en el concepto, así que no hay nada que pueda inventarse.
 */
export async function conQueSeConfundio(conceptId: string, answer: string, signal?: AbortSignal): Promise<CoachConfusion | null> {
  if (!answer.trim()) return null
  let limite: AbortSignal | null = null
  try {
    limite = AbortSignal.timeout(LIMITE_MS)
    const señales = signal ? AbortSignal.any([signal, limite]) : limite
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const response = await fetch('/api/confusion', {
      method: 'POST', signal: señales,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ conceptId, answer: answer.slice(0, 300) }),
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
    const data = await response.json() as Partial<CoachConfusion>
    return data.mejor || Array.isArray(data.candidatos)
      ? { mejor: data.mejor ?? null, candidatos: data.candidatos ?? [] } : null
  } catch { return null }
}
