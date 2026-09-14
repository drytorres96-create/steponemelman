import config from '../../project.config.json'
import { registrar } from './registro'
import { KINDS_CHECKPOINT, type KindCheckpoint, type PlanCheckpoint, type PlanSemana } from '../plan/tipos'

/**
 * Proxy a la base de planificación.
 *
 * El plan de estudio vive en otro proyecto de Supabase, con usuarios de auth
 * distintos de los del material. Abrir un segundo cliente en el navegador
 * obligaría a una segunda sesión y a duplicar la gestión de tokens, así que el
 * Worker habla con esa base usando una `service_role` guardada como secreto. Esa
 * clave no aparece nunca en el bundle del cliente; si falta, la ruta responde 503
 * y la pantalla cae al comportamiento anterior en vez de quedarse en blanco.
 *
 * Quien llama sigue teniendo que ser una cuenta verificada con acceso al
 * material: la service key da acceso total a la base del plan, así que la ruta
 * no puede quedar abierta aunque el plan sea de una sola persona.
 */

export interface PlanEnv {
  PLAN_SUPABASE_URL?: string
  PLAN_SUPABASE_SERVICE_KEY?: string
  PLAN_USER_ID?: string
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Authorization',
} })

const SIN_CONFIGURAR = 'plan no configurado'
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const ID_CHECKPOINT = /^[1-9]\d{0,17}$/
const CAMPOS = 'id,idx,dia,kind,label,done,done_at'
/** El plan se relee como mucho una vez por minuto; un PATCH lo invalida de inmediato. */
const CACHE_MS = 60_000
const CACHE_MAX = 8
const cache = new Map<string, { at: number; cuerpo: string }>()

/** Fecha local de quien pregunta. En UTC el día cambiaría a las 8 de la tarde en Florida. */
function hoyDe(url: URL): string {
  const pedida = url.searchParams.get('hoy') ?? ''
  return FECHA.test(pedida) ? pedida : new Date().toISOString().slice(0, 10)
}

function leerCheckpoint(fila: unknown): PlanCheckpoint | null {
  if (!fila || typeof fila !== 'object') return null
  const f = fila as Record<string, unknown>
  const dia = Number(f.dia)
  if (!Number.isInteger(Number(f.id)) || !Number.isInteger(dia) || dia < 1 || dia > 6) return null
  if (!KINDS_CHECKPOINT.includes(f.kind as KindCheckpoint) || typeof f.label !== 'string') return null
  return {
    id: Number(f.id),
    idx: Number.isFinite(Number(f.idx)) ? Number(f.idx) : 0,
    dia,
    kind: f.kind as KindCheckpoint,
    label: f.label,
    done: f.done === true,
    doneAt: typeof f.done_at === 'string' ? f.done_at : null,
  }
}

/** Comprueba la sesión contra la base del material, no contra la del plan. */
async function cuentaAutorizada(authorization: string): Promise<Response | null> {
  const headers = { apikey: config.supabasePublishableKey, Authorization: authorization }
  const get = (path: string) => fetch(`${config.supabaseUrl}${path}`, { headers, signal: AbortSignal.timeout(10000) })
  const auth = await get('/auth/v1/user')
  if (!auth.ok) return json({ error: 'Tu sesión necesita verificarse otra vez.' }, 401)
  const user = await auth.json() as { id?: string; is_anonymous?: boolean; email_confirmed_at?: string }
  if (!user.id || user.is_anonymous || !user.email_confirmed_at) return json({ error: 'Se necesita una cuenta verificada.' }, 403)
  const member = await get(`/rest/v1/app_members?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`)
  if (!member.ok || !(await member.json() as unknown[]).length) return json({ error: 'Tu cuenta no tiene acceso al plan.' }, 403)
  return null
}

export async function handlePlan(request: Request, env: PlanEnv): Promise<Response> {
  const url = new URL(request.url)
  const semana = url.pathname === '/api/plan/semana'
  const checkpointId = /^\/api\/plan\/checkpoint\/(.+)$/.exec(url.pathname)?.[1]
  if (!semana && !checkpointId) return json({ error: 'No encontrado.' }, 404)
  if (request.method !== (semana ? 'GET' : 'PATCH')) return json({ error: 'Método no permitido.' }, 405)
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Origen no permitido.' }, 403)
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [^\s]{20,8192}$/.test(authorization)) return json({ error: 'Inicia sesión para ver tu plan.' }, 401)

  const { PLAN_SUPABASE_URL: base, PLAN_SUPABASE_SERVICE_KEY: clave, PLAN_USER_ID: usuario } = env
  // Sin secretos no hay plan, pero tampoco hay error que resolver: la app degrada.
  if (!base || !clave || !usuario) return json({ error: SIN_CONFIGURAR }, 503)

  let deseado: boolean | null = null
  if (checkpointId) {
    if (!ID_CHECKPOINT.test(checkpointId)) return json({ error: 'Checkpoint no válido.' }, 400)
    if (Number(request.headers.get('content-length') ?? 0) > 200) return json({ error: 'Solicitud demasiado larga.' }, 413)
    try {
      const cuerpo = await request.json() as { done?: unknown }
      if (typeof cuerpo?.done !== 'boolean') return json({ error: 'Indica si el checkpoint queda hecho.' }, 400)
      deseado = cuerpo.done
    } catch { return json({ error: 'Solicitud no válida.' }, 400) }
  }

  const negado = await cuentaAutorizada(authorization)
  if (negado) return negado

  const plan = (path: string, init: RequestInit = {}) => fetch(`${base}/rest/v1/${path}`, {
    ...init, signal: AbortSignal.timeout(10000),
    headers: { ...init.headers, apikey: clave, Authorization: `Bearer ${clave}` },
  })
  const suyo = `user_id=eq.${encodeURIComponent(usuario)}`

  try {
    if (checkpointId) {
      const marcado = deseado
        ? `{"done":true,"done_at":"${new Date().toISOString()}"}`
        : '{"done":false,"done_at":null}'
      const escrito = await plan(`week_checkpoints?id=eq.${checkpointId}&${suyo}`, {
        method: 'PATCH', body: marcado,
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      })
      if (!escrito.ok) {
        registrar('plan/marcar', `la base del plan respondió ${escrito.status}`, { checkpoint: checkpointId })
        return json({ error: 'No se pudo guardar la marca en tu plan.' }, 503)
      }
      // El sitio es la fuente de verdad: se devuelve lo releído, nunca lo enviado.
      const releido = await plan(`week_checkpoints?select=${CAMPOS}&id=eq.${checkpointId}&${suyo}`)
      if (!releido.ok) return json({ error: 'No se pudo releer el checkpoint.' }, 503)
      const fila = leerCheckpoint((await releido.json() as unknown[])[0])
      // Una fila de otro usuario no se escribe ni se lee: el filtro la deja fuera de las dos.
      if (!fila) return json({ error: 'Ese checkpoint no está en tu plan.' }, 404)
      cache.clear()
      return json(fila)
    }

    const hoy = hoyDe(url)
    const guardada = cache.get(hoy)
    if (guardada && Date.now() - guardada.at < CACHE_MS) {
      return new Response(guardada.cuerpo, { headers: {
        'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff', 'Vary': 'Authorization',
      } })
    }
    // La semana que contiene hoy; si hoy no cae en ninguna, la siguiente que empiece.
    const consulta = new URLSearchParams({
      select: 'id,title,starts_on,ends_on,note',
      user_id: `eq.${usuario}`,
      ends_on: 'not.is.null',
      or: `(and(starts_on.lte.${hoy},ends_on.gte.${hoy}),starts_on.gt.${hoy})`,
      order: 'starts_on.asc',
      limit: '8',
    })
    const eventos = await plan(`events?${consulta}`)
    if (!eventos.ok) {
      registrar('plan/semana', `la base del plan respondió ${eventos.status}`)
      return json({ error: 'No se pudo leer tu plan ahora mismo.' }, 503)
    }
    const filas = await eventos.json() as { id: string; title: string; starts_on: string; ends_on: string; note: string | null }[]
    if (!Array.isArray(filas) || !filas.length) return json({ error: 'Sin semana en el plan.' }, 404)

    const ids = filas.map(f => `"${f.id}"`).join(',')
    const marcas = await plan(`week_checkpoints?select=event_id,${CAMPOS}&${suyo}&event_id=in.(${ids})&order=idx.asc`)
    if (!marcas.ok) {
      registrar('plan/checkpoints', `la base del plan respondió ${marcas.status}`)
      return json({ error: 'No se pudo leer tu plan ahora mismo.' }, 503)
    }
    const porEvento = new Map<string, PlanCheckpoint[]>()
    for (const cruda of await marcas.json() as { event_id?: unknown }[]) {
      const cp = leerCheckpoint(cruda)
      if (!cp || typeof cruda.event_id !== 'string') {
        registrar('plan/checkpoint-invalido', 'una fila del plan no tiene la forma esperada')
        continue
      }
      porEvento.set(cruda.event_id, [...(porEvento.get(cruda.event_id) ?? []), cp])
    }
    // Una semana sin checkpoints no es plan: en el rango también caen vacaciones y exámenes.
    const evento = filas.find(f => porEvento.get(f.id)?.length)
    if (!evento) return json({ error: 'Sin semana en el plan.' }, 404)

    const cuerpo: PlanSemana = {
      eventoId: evento.id, titulo: evento.title, inicio: evento.starts_on, fin: evento.ends_on,
      nota: evento.note ?? null, checkpoints: porEvento.get(evento.id)!,
    }
    // La adherencia pide cinco semanas seguidas: el caché guarda unas pocas, no una sola.
    if (cache.size >= CACHE_MAX) cache.delete([...cache.keys()][0])
    cache.set(hoy, { at: Date.now(), cuerpo: JSON.stringify(cuerpo) })
    return json(cuerpo)
  } catch (causa) {
    registrar('plan', causa)
    return json({ error: 'Algo falló al leer tu plan. Tus sesiones siguen disponibles.' }, 503)
  }
}

/** Sólo para las pruebas: el caché vive en el módulo y sobreviviría entre casos. */
export function olvidarCachePlan() { cache.clear() }
