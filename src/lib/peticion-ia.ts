import { supabase } from './supabase'

export type RespuestaIA<T> = { estado: 'ok'; data: T } | { estado: 'sin_ia'; motivo: string }

/** Un transporte acotado para todas las ayudas de IA: sin reintentos ni proveedor alternativo. */
/** Tope de bytes de una petición normal; las rutas que revisan listas piden más y lo dicen. */
export const LIMITE_BYTES_IA = 6000

export async function solicitarIA<T>(ruta: string, cuerpo: unknown, limiteMs: number, signal?: AbortSignal, limiteBytes = LIMITE_BYTES_IA): Promise<RespuestaIA<T>> {
  const control = new AbortController()
  let agotado = false
  const cancelar = () => control.abort()
  signal?.addEventListener('abort', cancelar, { once: true })
  if (signal?.aborted) control.abort()
  const timer = setTimeout(() => { agotado = true; control.abort() }, limiteMs)
  let rechazar: (() => void) | undefined
  const cancelada = new Promise<never>((_, reject) => {
    rechazar = () => reject(new Error('cancelada'))
    control.signal.addEventListener('abort', rechazar, { once: true })
  })
  try {
    if (control.signal.aborted) return { estado: 'sin_ia', motivo: 'Cancelado.' }
    const body = JSON.stringify(cuerpo)
    if (new TextEncoder().encode(body).byteLength > limiteBytes) return { estado: 'sin_ia', motivo: 'La consulta es demasiado larga. Acorta tu pregunta.' }
    const { data: { session } } = await Promise.race([supabase.auth.getSession(), cancelada])
    if (!session) return { estado: 'sin_ia', motivo: 'Sin sesión iniciada.' }
    if (control.signal.aborted) return { estado: 'sin_ia', motivo: 'Cancelado.' }
    const response = await fetch(ruta, { method: 'POST', signal: control.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body })
    if (!response.headers.get('content-type')?.includes('application/json')) return { estado: 'sin_ia', motivo: 'La ayuda de IA no está disponible en este entorno.' }
    const data = await response.json()
    if (!response.ok) {
      const espera = Number(response.headers.get('Retry-After'))
      const motivo = typeof data?.error === 'string' ? data.error : 'No se pudo obtener la ayuda.'
      return { estado: 'sin_ia', motivo: motivo + (espera > 0 && espera <= 60 ? ` Puedes volver a intentarlo en ${Math.ceil(espera)} s.` : '') }
    }
    return { estado: 'ok', data: data as T }
  } catch {
    return { estado: 'sin_ia', motivo: signal?.aborted ? 'Cancelado.' : agotado ? 'La IA tardó demasiado. Puedes seguir estudiando.' : 'No se pudo conectar con la ayuda de IA.' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancelar)
    if (rechazar) control.signal.removeEventListener('abort', rechazar)
  }
}
