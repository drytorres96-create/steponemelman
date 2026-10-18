import {
  ConsultaSesionZ, MAX_ETIQUETA, MAX_ITEMS_REVISION, MAX_PEDIDO, validarEntender,
  type ConsultaSesion, type ItemHilo, type ItemRevision, type SalidaEntender, type TurnoSesion,
} from './contexto-sesion'
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

/** Interpretar el pedido es rápido; revisar una lista larga tarda más. */
export const LIMITE_ENTENDER_MS = 30_000
export const LIMITE_REVISAR_MS = 55_000
/** El Worker acepta más cuerpo en esta ruta que en las demás: ciento cincuenta etiquetas caben. */
export const LIMITE_BYTES_REVISAR = 24_000

export type RespuestaEntender = ({ estado: 'ok' } & SalidaEntender) | { estado: 'sin_ia'; motivo: string }

/**
 * Le dice a Claude lo que la persona pidió (y lo que fue eligiendo) y recibe la consulta ya
 * traducida al vocabulario de la plataforma, o una pregunta de seguimiento con sus opciones.
 * El navegador vuelve a validar lo que llega: lo del servidor tampoco se da por bueno.
 */
export async function pedirEntender(mensajes: TurnoSesion[], preguntasHechas: number, signal?: AbortSignal,
  restantes = Math.max(0, 2 - preguntasHechas)): Promise<RespuestaEntender> {
  if (!mensajes.length) return { estado: 'sin_ia', motivo: 'No hay nada que interpretar.' }
  const r = await solicitarIA<unknown>('/api/ia/sesion', { fase: 'entender', mensajes: mensajes.slice(-7), preguntasHechas }, LIMITE_ENTENDER_MS, signal)
  if (r.estado === 'sin_ia') return r
  const entendido = validarEntender(r.data, restantes)
  return entendido ? { estado: 'ok', ...entendido } : { estado: 'sin_ia', motivo: 'Claude no devolvió una respuesta que pueda usar. Vuelve a intentarlo.' }
}

export type RespuestaRevision = { estado: 'ok'; ids: string[]; sinRevisar: number; revisadas?: number; conFuenteRevisada?: number } | { estado: 'sin_ia'; motivo: string }

/** Pide a Claude que deje, de una lista ya filtrada, lo que encaja con lo pedido. Sólo viajan ids y etiquetas. */
export async function pedirRevision(pedido: string, consulta: ConsultaSesion, items: ItemRevision[], signal?: AbortSignal): Promise<RespuestaRevision> {
  if (!items.length) return { estado: 'ok', ids: [], sinRevisar: 0 }
  const enviados = items.slice(0, MAX_ITEMS_REVISION)
  const r = await solicitarIA<{ ids?: unknown; sinRevisar?: unknown; revisadas?: unknown; conFuenteRevisada?: unknown }>('/api/ia/sesion',
    { fase: 'revisar', pedido: pedido.slice(0, MAX_PEDIDO), consulta: ConsultaSesionZ.parse(consulta), items: enviados },
    LIMITE_REVISAR_MS, signal, LIMITE_BYTES_REVISAR)
  if (r.estado === 'sin_ia') return r
  const ids = r.data?.ids
  if (!Array.isArray(ids)) return { estado: 'sin_ia', motivo: 'Claude no devolvió una respuesta que pueda usar. Vuelve a intentarlo.' }
  const permitidos = new Set(enviados.map(i => i.id))
  const sinRevisar = typeof r.data.sinRevisar === 'number' && Number.isInteger(r.data.sinRevisar) && r.data.sinRevisar >= 0 ? r.data.sinRevisar : 0
  const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= enviados.length ? value : undefined
  return { estado: 'ok', ids: [...new Set(ids.filter((id): id is string => typeof id === 'string' && permitidos.has(id)))], sinRevisar: Math.min(sinRevisar, enviados.length),
    revisadas: count(r.data.revisadas), conFuenteRevisada: count(r.data.conFuenteRevisada) }
}
