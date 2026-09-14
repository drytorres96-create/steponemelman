import { supabase } from './supabase'
import { notificarUsoIA } from './cuota-ia'
import type { CoachVeredicto } from '../server/worker'

/** Lo que devuelve el intento de corrección: un veredicto, o por qué no lo hubo. */
export type ResultadoCalificacion =
  | { estado: 'ok'; veredicto: CoachVeredicto['veredicto']; motivo: string }
  | { estado: 'sin_ia'; motivo: string }

const LIMITE_MS = 15000

export interface PeticionCalificacion {
  conceptId: string
  answer: string
  questionId: string
  version: string
  formatVersion: 1 | 2
  variantId?: string
  index: number
  route: string
  retry: boolean
}

/**
 * Pide a la IA que decida si una respuesta breve es correcta. Nunca lanza: cuando no puede
 * responder —sin sesión, sin conexión, cuota agotada, tiempo agotado— devuelve `sin_ia` y
 * quien llama se queda con el corrector propio. Esperar a la IA no puede bloquear el estudio.
 */
export async function calificarConIA(peticion: PeticionCalificacion, signal?: AbortSignal): Promise<ResultadoCalificacion> {
  // Tope propio, por encima del que aplica el Worker: nada deja la pantalla esperando para siempre.
  // Se construye dentro del try porque AbortSignal.any no existe en navegadores antiguos, y un
  // fallo aquí no puede escapar: quien llama espera una promesa que siempre resuelve.
  let limite: AbortSignal | null = null
  try {
    limite = AbortSignal.timeout(LIMITE_MS)
    const señales = signal ? AbortSignal.any([signal, limite]) : limite
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { estado: 'sin_ia', motivo: 'Sin sesión iniciada.' }
    const response = await fetch('/api/calificar', {
      method: 'POST', signal: señales,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        conceptId: peticion.conceptId, answer: peticion.answer.slice(0, 500), questionId: peticion.questionId,
        version: peticion.version, formatVersion: peticion.formatVersion, variantId: peticion.variantId,
        index: peticion.index, route: peticion.route, retry: peticion.retry,
      }),
    })
    // Haya ido bien o mal, la llamada puede haber gastado: el medidor tiene que enterarse.
    notificarUsoIA()
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return { estado: 'sin_ia', motivo: 'La corrección con IA no está disponible en este entorno.' }
    }
    const data = await response.json() as Partial<CoachVeredicto> & { error?: string }
    if (!response.ok) return { estado: 'sin_ia', motivo: data.error || 'No se pudo corregir con IA.' }
    if (data.veredicto !== 'correcta' && data.veredicto !== 'parcial' && data.veredicto !== 'incorrecta') {
      return { estado: 'sin_ia', motivo: 'La IA no devolvió un veredicto utilizable.' }
    }
    return { estado: 'ok', veredicto: data.veredicto, motivo: data.motivo?.trim() || '' }
  } catch (causa) {
    if (signal?.aborted) return { estado: 'sin_ia', motivo: 'Corrección cancelada.' }
    if (limite?.aborted) return { estado: 'sin_ia', motivo: 'La IA tardó demasiado.' }
    return { estado: 'sin_ia', motivo: causa instanceof Error && causa.name === 'TypeError' ? 'Sin conexión con el corrector.' : 'No se pudo corregir con IA.' }
  }
}
