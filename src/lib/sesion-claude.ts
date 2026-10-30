import {
  ConsultaSesionZ, MAX_ETIQUETA, MAX_ITEMS_LECTURA, MAX_ITEMS_REVISION, MAX_PEDIDO, MAX_REFS_LECTURAS, validarEntender,
  type ConsultaSesion, type ItemHilo, type ItemRevision, type RefNbme, type SalidaEntender, type TurnoSesion,
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

/**
 * Armar una sesión usa Opus 5.5 (decisión de Yoel del 21-oct-2026): piensa más y tarda más.
 * Cada espera deja margen sobre el plazo del Worker para esa misma llamada.
 */
export const LIMITE_ENTENDER_MS = 120_000
export const LIMITE_LEER_MS = 200_000
export const LIMITE_REVISAR_MS = 200_000
/** El Worker acepta más cuerpo en esta ruta que en las demás: trescientas fichas caben. */
export const LIMITE_BYTES_REVISAR = 160_000
/** Consultar qué fichas faltan no llama a Claude: es rápido. */
export const LIMITE_LECTURAS_MS = 30_000

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

export type RespuestaPendientes = { estado: 'ok'; faltan: string[] } | { estado: 'sin_ia'; motivo: string }

/** Qué preguntas NBME de la lista aún no tienen ficha de lectura. No gasta: sólo mira lo guardado. */
export async function pedirLecturasPendientes(refs: RefNbme[], signal?: AbortSignal): Promise<RespuestaPendientes> {
  const faltan: string[] = []
  for (let n = 0; n < refs.length; n += MAX_REFS_LECTURAS) {
    const lote = refs.slice(n, n + MAX_REFS_LECTURAS)
    const r = await solicitarIA<{ faltan?: unknown }>('/api/ia/sesion', { fase: 'lecturas', items: lote }, LIMITE_LECTURAS_MS, signal, LIMITE_BYTES_REVISAR)
    if (r.estado === 'sin_ia') return r
    if (!Array.isArray(r.data?.faltan)) return { estado: 'sin_ia', motivo: 'No pude comprobar qué preguntas ya leyó Claude. Vuelve a intentarlo.' }
    const enviados = new Set(lote.map(x => x.id))
    faltan.push(...r.data.faltan.filter((id): id is string => typeof id === 'string' && enviados.has(id)))
  }
  return { estado: 'ok', faltan: [...new Set(faltan)] }
}

export type RespuestaLectura = { estado: 'ok'; leidas: number; sinFuente: number; pendientes: number } | { estado: 'sin_ia'; motivo: string; codigo?: string }

/** Pide a Claude que lea, una por una, estas preguntas NBME y guarde su ficha. Sólo viajan ids y revisiones. */
export async function pedirLectura(refs: RefNbme[], signal?: AbortSignal): Promise<RespuestaLectura> {
  if (!refs.length) return { estado: 'ok', leidas: 0, sinFuente: 0, pendientes: 0 }
  const enviados = refs.slice(0, MAX_ITEMS_LECTURA)
  const r = await solicitarIA<{ leidas?: unknown; sinFuente?: unknown; pendientes?: unknown }>('/api/ia/sesion', { fase: 'leer', items: enviados }, LIMITE_LEER_MS, signal)
  if (r.estado === 'sin_ia') return r
  const n = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= enviados.length ? v : null
  const leidas = n(r.data?.leidas), sinFuente = n(r.data?.sinFuente), pendientes = n(r.data?.pendientes)
  if (leidas === null || sinFuente === null || pendientes === null || leidas + sinFuente + pendientes !== enviados.length)
    return { estado: 'sin_ia', motivo: 'Claude no devolvió una lectura que pueda usar. Vuelve a intentarlo.' }
  return { estado: 'ok', leidas, sinFuente, pendientes }
}

export type RespuestaRevision = { estado: 'ok'; ids: string[]; grupos?: number[]; sinRevisar: number; revisadas?: number; conFuenteRevisada?: number } | { estado: 'sin_ia'; motivo: string; codigo?: string }

/**
 * Pide a Claude que lea las candidatas y deje las que tratan lo pedido, con el tema que cubre cada una.
 * De los conceptos viajan id y etiqueta; de las preguntas NBME, id y revisión (su ficha la pone el servidor).
 */
export async function pedirRevision(pedido: string, consulta: ConsultaSesion, items: ItemRevision[], signal?: AbortSignal): Promise<RespuestaRevision> {
  if (!items.length) return { estado: 'ok', ids: [], sinRevisar: 0 }
  const enviados = items.slice(0, MAX_ITEMS_REVISION)
  const r = await solicitarIA<{ ids?: unknown; grupos?: unknown; sinRevisar?: unknown; revisadas?: unknown; conFuenteRevisada?: unknown }>('/api/ia/sesion',
    { fase: 'revisar', pedido: pedido.slice(0, MAX_PEDIDO), consulta: ConsultaSesionZ.parse(consulta), items: enviados },
    LIMITE_REVISAR_MS, signal, LIMITE_BYTES_REVISAR)
  if (r.estado === 'sin_ia') return r
  const crudos = r.data?.ids
  if (!Array.isArray(crudos)) return { estado: 'sin_ia', motivo: 'Claude no devolvió una respuesta que pueda usar. Vuelve a intentarlo.' }
  const permitidos = new Set(enviados.map(i => i.id))
  const temas = Math.max(1, consulta.terminos.length)
  const gruposCrudos = Array.isArray(r.data.grupos) ? r.data.grupos : []
  const ids: string[] = [], grupos: number[] = []
  crudos.forEach((id, n) => {
    if (typeof id !== 'string' || !permitidos.has(id) || ids.includes(id)) return
    const g = Number(gruposCrudos[n])
    ids.push(id)
    grupos.push(Number.isInteger(g) && g >= 1 && g <= temas ? g : 1)
  })
  const sinRevisar = typeof r.data.sinRevisar === 'number' && Number.isInteger(r.data.sinRevisar) && r.data.sinRevisar >= 0 ? r.data.sinRevisar : 0
  const count = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= enviados.length ? value : undefined
  return { estado: 'ok', ids, grupos, sinRevisar: Math.min(sinRevisar, enviados.length),
    revisadas: count(r.data.revisadas), conFuenteRevisada: count(r.data.conFuenteRevisada) }
}
