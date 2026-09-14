import { supabase } from './supabase'
import { notificarUsoIA } from './cuota-ia'
import type { CoachAnalisis, CoachPatron } from '../server/worker'
import type { FalloSemanal } from './semana-fallos'

export type { CoachPatron as Patron }

/** Igual que el corrector: si la IA no puede, se dice por qué y la pantalla sigue viva. */
export type ResultadoAnalisis =
  | { estado: 'ok'; patrones: CoachPatron[]; enfoque: string; cacheado: boolean }
  | { estado: 'sin_ia'; motivo: string }

/** Por encima del corte del Worker, para que un cuelgue de red no deje la tarjeta girando. */
const LIMITE_MS = 30_000
export const MINIMO_CONCEPTOS = 2

/**
 * Pide una lectura de la semana. Nunca lanza: sin sesión, sin conexión, sin cuota o sin
 * material suficiente devuelve `sin_ia` con el motivo, y el resto del progreso —que se
 * calcula entero en local— sigue en pantalla igual que antes.
 */
export async function analizarSemana(fallos: FalloSemanal[], signal?: AbortSignal): Promise<ResultadoAnalisis> {
  if (fallos.length < MINIMO_CONCEPTOS) return { estado: 'sin_ia', motivo: 'Hacen falta al menos dos conceptos fallados esta semana.' }
  let limite: AbortSignal | null = null
  try {
    limite = AbortSignal.timeout(LIMITE_MS)
    const señales = signal ? AbortSignal.any([signal, limite]) : limite
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { estado: 'sin_ia', motivo: 'Sin sesión iniciada.' }
    const response = await fetch('/api/analizar', {
      method: 'POST', signal: señales,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ conceptos: fallos }),
    })
    // Haya ido bien o mal, la llamada puede haber gastado: el medidor tiene que enterarse.
    notificarUsoIA()
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return { estado: 'sin_ia', motivo: 'La lectura con IA no está disponible en este entorno.' }
    }
    const data = await response.json() as Partial<CoachAnalisis> & { error?: string; cached?: boolean; detalle?: string }
    // El detalle dice qué falló exactamente; sin él, cualquier fallo se ve igual desde fuera.
    if (!response.ok) return { estado: 'sin_ia', motivo: (data.error || 'No se pudo leer la semana.') + (data.detalle ? ` (${data.detalle})` : '') }
    if (!Array.isArray(data.patrones) || !data.patrones.length || typeof data.enfoque !== 'string') {
      return { estado: 'sin_ia', motivo: 'La IA no devolvió una lectura utilizable.' }
    }
    return { estado: 'ok', patrones: data.patrones, enfoque: data.enfoque, cacheado: data.cached === true }
  } catch (causa) {
    if (signal?.aborted) return { estado: 'sin_ia', motivo: 'Lectura cancelada.' }
    if (limite?.aborted) return { estado: 'sin_ia', motivo: 'La IA tardó demasiado.' }
    return { estado: 'sin_ia', motivo: causa instanceof Error && causa.name === 'TypeError' ? 'Sin conexión con el analizador.' : 'No se pudo leer la semana.' }
  }
}
