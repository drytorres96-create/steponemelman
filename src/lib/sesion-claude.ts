import { MAX_ETIQUETA, type ItemHilo } from './contexto-sesion'
import { solicitarIA } from './peticion-ia'

/**
 * Transporte de las ayudas de organización del estudio. Sólo manda identificadores y etiquetas
 * cortas; el servidor es quien habla con Claude y quien valida lo que vuelve.
 */

export const LIMITE_HILO_MS = 20_000

export type RespuestaHilo = { estado: 'ok'; hilo: string } | { estado: 'sin_ia'; motivo: string }

/** La etiqueta de un ítem, en una línea y dentro del tope que acepta el servidor. */
export const etiquetaCorta = (texto: string): string => texto.replace(/\s+/g, ' ').trim().slice(0, MAX_ETIQUETA)

export async function pedirHilo(items: ItemHilo[], signal?: AbortSignal): Promise<RespuestaHilo> {
  if (!items.length) return { estado: 'sin_ia', motivo: 'No hay nada que resumir.' }
  const r = await solicitarIA<{ hilo?: unknown }>('/api/ia/sesion', { fase: 'hilo', items: items.slice(0, 5) }, LIMITE_HILO_MS, signal)
  if (r.estado === 'sin_ia') return r
  const hilo = typeof r.data?.hilo === 'string' ? r.data.hilo.replace(/\s+/g, ' ').trim() : ''
  // El navegador tampoco se fía: una frase corta, sin formato.
  if (hilo.length < 12 || hilo.length > 240 || /[*_`#]/.test(hilo)) return { estado: 'sin_ia', motivo: 'Claude no devolvió una frase utilizable.' }
  return { estado: 'ok', hilo }
}
