import { MAX_HISTORIAL, MAX_MENSAJE, MAX_TURNO, type OrigenChat, type PeticionChat, type TurnoChat } from './contexto-chat'
import { validarEjercicios, type Ejercicio } from './practica-activa'
import { solicitarIA } from './peticion-ia'

/**
 * Transporte del chat de la pregunta y de su recuperación activa. Solo identifica la pregunta
 * (identificadores, no material médico) y manda lo que la persona escribe: el servidor lee el
 * material de su propia fuente y es quien habla con Claude.
 */

export const LIMITE_CHAT_MS = 60_000
export const LIMITE_PRACTICA_MS = 90_000
/** El servidor rechaza cuerpos de más de 6000 bytes; se deja un margen. */
const TECHO_BYTES = 5600

export type FuenteChat = { title: string; page: number }
export type RespuestaChat =
  | { estado: 'ok'; texto: string; fuente?: FuenteChat }
  | { estado: 'sin_ia'; motivo: string }
export type RespuestaPractica =
  | { estado: 'ok'; ejercicios: Ejercicio[]; fuente?: FuenteChat }
  | { estado: 'sin_ia'; motivo: string }

const bytes = (valor: unknown) => new TextEncoder().encode(JSON.stringify(valor)).byteLength

function leerFuente(valor: unknown): FuenteChat | undefined {
  const f = valor as { title?: unknown; page?: unknown } | null
  return f && typeof f.title === 'string' && f.title.trim() && typeof f.page === 'number' && Number.isFinite(f.page)
    ? { title: f.title.slice(0, 160), page: f.page } : undefined
}

/**
 * Historial que cabe en la petición: parejas completas (yo → ia), las más recientes primero y
 * cada turno recortado. Las respuestas de Claude son largas; lo que importa para seguir el hilo
 * es el principio de cada una.
 */
export function ajustarHistorial(historial: TurnoChat[], sinHistorial: PeticionChat): TurnoChat[] {
  const parejas: TurnoChat[][] = []
  for (let n = 0; n < historial.length - 1; n++) {
    if (historial[n].rol === 'yo' && historial[n + 1].rol === 'ia') {
      parejas.push([
        { rol: 'yo', texto: historial[n].texto.slice(0, MAX_TURNO) },
        { rol: 'ia', texto: historial[n + 1].texto.slice(0, MAX_TURNO) },
      ]); n++
    }
  }
  let elegidas = parejas.slice(-(MAX_HISTORIAL / 2))
  const cabe = (h: TurnoChat[]) => bytes({ ...sinHistorial, historial: h }) <= TECHO_BYTES
  while (elegidas.length && !cabe(elegidas.flat())) {
    // Antes de perder una pareja entera, se acorta la respuesta más antigua.
    const [yo, ia] = elegidas[0]
    if (ia.texto.length > 500) elegidas[0] = [yo, { rol: 'ia', texto: ia.texto.slice(0, Math.max(500, Math.floor(ia.texto.length / 2))) }]
    else elegidas = elegidas.slice(1)
  }
  return elegidas.flat()
}

function cuerpo(origen: OrigenChat, accion: PeticionChat['accion'], extra: { mensaje?: string; historial?: TurnoChat[]; evitar?: string[] }): PeticionChat {
  const base = { accion, ...(extra.mensaje !== undefined ? { mensaje: extra.mensaje.trim().slice(0, MAX_MENSAJE) } : {}),
    historial: [] as TurnoChat[], evitar: (extra.evitar ?? []).slice(-12).map(e => e.slice(0, 100)) }
  const sin: PeticionChat = origen.tipo === 'concepto'
    ? { tipo: 'concepto', presentacion: origen.presentacion, resultado: origen.resultado, ...base }
    : { tipo: 'nbme', questionId: origen.questionId, revision: origen.revision, optionId: origen.optionId, ...base }
  return { ...sin, historial: ajustarHistorial(extra.historial ?? [], sin) }
}

export async function preguntarAlTutor(origen: OrigenChat, mensaje: string, historial: TurnoChat[], signal?: AbortSignal): Promise<RespuestaChat> {
  if (!mensaje.trim()) return { estado: 'sin_ia', motivo: 'Escribe tu pregunta.' }
  const r = await solicitarIA<{ respuesta?: unknown; source?: unknown }>('/api/ia/chat', cuerpo(origen, 'mensaje', { mensaje, historial }), LIMITE_CHAT_MS, signal)
  if (r.estado === 'sin_ia') return r
  const texto = typeof r.data?.respuesta === 'string' ? r.data.respuesta.trim() : ''
  if (texto.length < 20) return { estado: 'sin_ia', motivo: 'Claude no devolvió una respuesta utilizable.' }
  return { estado: 'ok', texto, fuente: leerFuente(r.data.source) }
}

export async function pedirPractica(origen: OrigenChat, evitar: string[], signal?: AbortSignal): Promise<RespuestaPractica> {
  const r = await solicitarIA<{ ejercicios?: unknown; source?: unknown }>('/api/ia/chat', cuerpo(origen, 'practica', { evitar }), LIMITE_PRACTICA_MS, signal)
  if (r.estado === 'sin_ia') return r
  // El servidor ya validó, pero el navegador no confía en lo que recibe: mismo contrato, misma comprobación.
  const ejercicios = validarEjercicios({ ejercicios: r.data?.ejercicios })
  if (!ejercicios) return { estado: 'sin_ia', motivo: 'Claude no devolvió ejercicios utilizables. Puedes volver a intentarlo.' }
  return { estado: 'ok', ejercicios, fuente: leerFuente(r.data.source) }
}
