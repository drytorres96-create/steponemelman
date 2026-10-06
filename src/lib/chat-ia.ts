import { solicitarIA } from './peticion-ia'
import type { CoachRespuesta, TurnoChat } from '../server/worker'
import type { PresentacionIA } from './contexto-ia'
export type { CoachRespuesta, TurnoChat }
export type ResultadoChat = { estado: 'ok'; respuesta: CoachRespuesta } | { estado: 'sin_ia'; motivo: string }
export const MAX_HISTORIAL = 8

/** Quita parejas antiguas, nunca recorta a medias una respuesta ni supera 6000 bytes UTF-8. */
export function cuerpoChat(conceptId: string, pregunta: string, historial: TurnoChat[], presentacion?: PresentacionIA) {
  const pares: TurnoChat[] = []
  for (let n = 0; n < historial.length - 1; n++) {
    if (historial[n].rol === 'yo' && historial[n + 1].rol === 'ia') {
      pares.push(historial[n], historial[n + 1]); n++
    }
  }
  const cuerpo = { conceptId, pregunta: pregunta.trim().slice(0, 400), historial: pares.slice(-MAX_HISTORIAL), ...(presentacion ? { presentacion } : {}) }
  while (cuerpo.historial.length && new TextEncoder().encode(JSON.stringify(cuerpo)).byteLength > 6000) cuerpo.historial.splice(0, 2)
  return cuerpo
}

export async function preguntarSobreConcepto(conceptId: string, pregunta: string, historial: TurnoChat[] = [], signal?: AbortSignal, presentacion?: PresentacionIA): Promise<ResultadoChat> {
  if (!pregunta.trim()) return { estado: 'sin_ia', motivo: 'Escribe una pregunta.' }
  const r = await solicitarIA<Partial<CoachRespuesta>>('/api/preguntar', cuerpoChat(conceptId, pregunta, historial, presentacion), 30_000, signal)
  if (r.estado === 'sin_ia') return r
  if (typeof r.data?.respuesta !== 'string' || r.data.respuesta.trim().length < 20) return { estado: 'sin_ia', motivo: 'La respuesta llegó incompleta.' }
  return { estado: 'ok', respuesta: { respuesta: r.data.respuesta, apoyo: r.data.apoyo === 'material' && typeof r.data.evidencia === 'string' ? 'material' : 'conocimiento',
    ...(typeof r.data.patron === 'string' ? { patron: r.data.patron } : {}), ...(typeof r.data.evidencia === 'string' ? { evidencia: r.data.evidencia } : {}) } }
}
