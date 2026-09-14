import { supabase } from './supabase'
import type { CoachRespuesta, TurnoChat } from '../server/worker'

export type { CoachRespuesta, TurnoChat }

export type ResultadoChat =
  | { estado: 'ok'; respuesta: CoachRespuesta }
  | { estado: 'sin_ia'; motivo: string }

const LIMITE_MS = 30_000
/** Lo que se manda de vuelta como contexto. Más historia encarece y no responde mejor. */
export const MAX_HISTORIAL = 8

/**
 * Pregunta una duda concreta sobre un concepto. Nunca lanza: si no se puede, devuelve el
 * motivo y el chat lo enseña como un mensaje más, sin romper la pantalla de estudio.
 */
export async function preguntarSobreConcepto(
  conceptId: string, pregunta: string, historial: TurnoChat[] = [], signal?: AbortSignal,
): Promise<ResultadoChat> {
  if (!pregunta.trim()) return { estado: 'sin_ia', motivo: 'Escribe una pregunta.' }
  let limite: AbortSignal | null = null
  try {
    limite = AbortSignal.timeout(LIMITE_MS)
    const señales = signal ? AbortSignal.any([signal, limite]) : limite
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { estado: 'sin_ia', motivo: 'Sin sesión iniciada.' }
    const response = await fetch('/api/preguntar', {
      method: 'POST', signal: señales,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ conceptId, pregunta: pregunta.trim().slice(0, 400), historial: historial.slice(-MAX_HISTORIAL) }),
    })
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return { estado: 'sin_ia', motivo: 'El chat no está disponible en este entorno.' }
    }
    const data = await response.json() as Partial<CoachRespuesta> & { error?: string; detalle?: string }
    if (!response.ok) return { estado: 'sin_ia', motivo: (data.error || 'No se pudo responder.') + (data.detalle ? ` (${data.detalle})` : '') }
    if (!data.respuesta) return { estado: 'sin_ia', motivo: 'La respuesta llegó vacía.' }
    return { estado: 'ok', respuesta: { respuesta: data.respuesta, apoyo: data.apoyo === 'material' ? 'material' : 'conocimiento', patron: data.patron } }
  } catch (causa) {
    if (signal?.aborted) return { estado: 'sin_ia', motivo: 'Cancelado.' }
    if (limite?.aborted) return { estado: 'sin_ia', motivo: 'La IA tardó demasiado.' }
    return { estado: 'sin_ia', motivo: causa instanceof Error && causa.name === 'TypeError' ? 'Sin conexión.' : 'No se pudo responder.' }
  }
}
