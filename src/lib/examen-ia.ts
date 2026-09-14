import { supabase } from './supabase'
import type { CoachExamen } from '../server/worker'

export type { CoachExamen }

/** Como el resto de la ayuda: si no se puede, se dice por qué y el concepto sigue entero. */
export type ResultadoExamen =
  | { estado: 'ok'; examen: CoachExamen; cacheado: boolean }
  | { estado: 'sin_ia'; motivo: string }

const LIMITE_MS = 35_000

/**
 * Pide cómo caería un concepto en el examen. Nunca lanza.
 *
 * Lo que devuelve es contenido generado, no material verificado: quien lo pinta debe
 * decirlo, y nada de esto se registra como intento ni mueve el dominio.
 */
export async function comoCaeEnElExamen(conceptId: string, signal?: AbortSignal): Promise<ResultadoExamen> {
  let limite: AbortSignal | null = null
  try {
    limite = AbortSignal.timeout(LIMITE_MS)
    const señales = signal ? AbortSignal.any([signal, limite]) : limite
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { estado: 'sin_ia', motivo: 'Sin sesión iniciada.' }
    const response = await fetch('/api/aplicar', {
      method: 'POST', signal: señales,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ conceptId }),
    })
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return { estado: 'sin_ia', motivo: 'Esta función no está disponible en este entorno.' }
    }
    const data = await response.json() as Partial<CoachExamen> & { error?: string; cached?: boolean }
    if (!response.ok) return { estado: 'sin_ia', motivo: data.error || 'No se pudo preparar la viñeta.' }
    if (!data.vineta || !data.patron || !Array.isArray(data.trampas) || !data.trampas.length) {
      return { estado: 'sin_ia', motivo: 'La viñeta llegó incompleta y no se muestra.' }
    }
    return { estado: 'ok', cacheado: data.cached === true,
      examen: { vineta: data.vineta, dato_clave: data.dato_clave ?? '', trampas: data.trampas, patron: data.patron, utilidad: data.utilidad ?? '' } }
  } catch (causa) {
    if (signal?.aborted) return { estado: 'sin_ia', motivo: 'Cancelado.' }
    if (limite?.aborted) return { estado: 'sin_ia', motivo: 'La IA tardó demasiado.' }
    return { estado: 'sin_ia', motivo: causa instanceof Error && causa.name === 'TypeError' ? 'Sin conexión.' : 'No se pudo preparar la viñeta.' }
  }
}
