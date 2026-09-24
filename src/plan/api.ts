import { esTarea, KINDS_CHECKPOINT, type KindCheckpoint, type PlanCheckpoint, type PlanSemana } from './tipos'

/**
 * Las dos rutas del plan, contra el proxy del Worker. No toca `lib/supabase`: el
 * navegador no abre una segunda sesión de auth para la base de planificación, así
 * que aquí sólo entra el token que ya tiene la sesión del material.
 *
 * `cargarPlanSemana` nunca lanza. Si el plan no está configurado, no responde o
 * no hay semana, devuelve `null` y la pantalla cae a las sesiones preparadas.
 * Yoel abre esto a las cinco de la mañana: una pantalla en blanco le cuesta el día.
 *
 * `marcarCheckpoint` sí distingue el fallo, porque marcar es una escritura y
 * quien llama tiene que poder deshacer la marca optimista que ya pintó.
 */

const LIMITE_MS = 12_000

/** `2026-09-14` en hora local: en UTC el día cambiaría a las ocho de la tarde en Florida. */
function fechaLocal(f = new Date()): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

function leerCheckpoint(valor: unknown): PlanCheckpoint | null {
  if (!valor || typeof valor !== 'object') return null
  const v = valor as Record<string, unknown>
  const dia = Number(v.dia)
  if (!Number.isInteger(Number(v.id)) || !Number.isInteger(dia) || dia < 1 || dia > 6) return null
  if (!KINDS_CHECKPOINT.includes(v.kind as KindCheckpoint) || typeof v.label !== 'string') return null
  return {
    id: Number(v.id), idx: Number(v.idx) || 0, dia, kind: v.kind as KindCheckpoint,
    label: v.label, done: v.done === true, doneAt: typeof v.doneAt === 'string' ? v.doneAt : null,
  }
}

export function leerPlanSemana(valor: unknown): PlanSemana | null {
  if (!valor || typeof valor !== 'object') return null
  const v = valor as Record<string, unknown>
  if (typeof v.eventoId !== 'string' || typeof v.titulo !== 'string'
    || typeof v.inicio !== 'string' || typeof v.fin !== 'string' || !Array.isArray(v.checkpoints)) return null
  const checkpoints = v.checkpoints.map(leerCheckpoint).filter((c): c is PlanCheckpoint => c !== null)
  // Una semana sin checkpoints legibles no es plan: vale más degradar que pintar un día vacío.
  if (!checkpoints.length) return null
  return {
    eventoId: v.eventoId, titulo: v.titulo, inicio: v.inicio, fin: v.fin,
    nota: typeof v.nota === 'string' ? v.nota : null,
    checkpoints: [...checkpoints].sort((a, b) => a.idx - b.idx),
  }
}

async function pedir(ruta: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(ruta, {
    ...init, cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(LIMITE_MS),
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
}

/**
 * La semana del plan que contiene `dia` —hoy, por defecto—, o `null` si el plan
 * no está disponible. La ruta elige la semana por fecha, así que retroceder
 * semanas es pedirle la misma ruta con otro día.
 */
export async function cargarPlanSemana(token: string, dia = fechaLocal()): Promise<PlanSemana | null> {
  if (!token) return null
  try {
    const respuesta = await pedir(`/api/plan/semana?hoy=${dia}`, token)
    if (!respuesta.ok) return null
    return leerPlanSemana(await respuesta.json())
  } catch { return null }
}

export class PlanEscrituraError extends Error {
  constructor(mensaje: string) { super(mensaje); this.name = 'PlanEscrituraError' }
}

/**
 * Marca o desmarca un checkpoint y devuelve lo que quedó guardado, releído de la
 * base. Nunca devuelve lo que se envió: si la escritura no cuajó, quien llama
 * tiene que poder volver atrás en pantalla.
 */
export async function marcarCheckpoint(id: number, done: boolean, token: string): Promise<PlanCheckpoint> {
  let respuesta: Response
  try {
    respuesta = await pedir(`/api/plan/checkpoint/${id}`, token, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }),
    })
  } catch {
    throw new PlanEscrituraError('No se pudo guardar la marca. Revisa la conexión y vuelve a intentarlo.')
  }
  if (!respuesta.ok) {
    throw new PlanEscrituraError(respuesta.status === 404
      ? 'Ese punto ya no está en tu plan. Recarga para ver la semana al día.'
      : 'No se pudo guardar la marca en tu plan. Se deja como estaba.')
  }
  const guardado = leerCheckpoint(await respuesta.json().catch(() => null))
  if (!guardado) throw new PlanEscrituraError('El plan respondió algo que no se pudo leer. Se deja como estaba.')
  return guardado
}

export interface AdherenciaSemana {
  eventoId: string
  titulo: string
  inicio: string
  hechas: number
  tareas: number
}

/** El descanso no cuenta: no es trabajo que se pueda dejar sin hacer. */
export function adherenciaDe(plan: PlanSemana): AdherenciaSemana {
  const tareas = plan.checkpoints.filter(esTarea)
  return {
    eventoId: plan.eventoId, titulo: plan.titulo, inicio: plan.inicio,
    hechas: tareas.filter(cp => cp.done).length, tareas: tareas.length,
  }
}

/**
 * La semana en curso y las cuatro anteriores, cada una leída de la misma ruta con
 * su fecha. Devuelve lo que haya podido leer, de la más antigua a la más reciente:
 * una semana que no responde no puede dejar la banda entera sin dibujar.
 */
export async function cargarAdherencia(token: string, semanas = 5): Promise<AdherenciaSemana[]> {
  if (!token) return []
  const dias = Array.from({ length: semanas }, (_, n) => {
    const f = new Date()
    f.setDate(f.getDate() - n * 7)
    return fechaLocal(f)
  })
  const planes = await Promise.all(dias.map(dia => cargarPlanSemana(token, dia)))
  const porEvento = new Map<string, AdherenciaSemana>()
  for (const plan of planes) if (plan) porEvento.set(plan.eventoId, adherenciaDe(plan))
  return [...porEvento.values()].sort((a, b) => a.inicio.localeCompare(b.inicio))
}

/** Estado del plan para etiquetar la evidencia, con la misma autorización. */
export async function cargarTopics(token: string): Promise<import('../lib/retencion-observada').TopicEstado[] | null> {
  if (!token) return null
  try {
    const r = await pedir('/api/plan/topics', token)
    if (!r.ok) return null
    const rows: unknown = await r.json()
    if (!Array.isArray(rows)) return null
    return rows.filter((t): t is import('../lib/retencion-observada').TopicEstado => !!t && typeof t.id === 'number' && typeof t.name === 'string' && [0, 1, 2].includes(t.status))
  } catch { return null }
}
