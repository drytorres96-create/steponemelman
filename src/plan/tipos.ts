/**
 * El plan de la semana vive en otra base de Supabase — la de planificación — con
 * usuarios de auth distintos. El navegador nunca la abre: el Worker hace de proxy.
 * Aquí sólo está la forma de lo que viaja entre los dos, sin red y sin React.
 */

export const KINDS_CHECKPOINT = ['qbank', 'leccion', 'tarjetas', 'podcast', 'assessment', 'lectura', 'descanso'] as const
export type KindCheckpoint = (typeof KINDS_CHECKPOINT)[number]

export interface PlanCheckpoint {
  id: number
  idx: number
  /** 1..6, lunes..sábado. El domingo no entra en la semana de estudio. */
  dia: number
  kind: KindCheckpoint
  label: string
  done: boolean
  doneAt: string | null
}

export interface PlanSemana {
  eventoId: string
  /** «S2 · 14–19 sep · Reproductivo (1/2) + banco de Psiquiatría» */
  titulo: string
  /** ISO date del lunes. */
  inicio: string
  /** ISO date del sábado. */
  fin: string
  nota: string | null
  checkpoints: PlanCheckpoint[]
}

/**
 * Minutos estimados por tipo de checkpoint. Alimenta el cronómetro.
 * `null` significa sin cronómetro: el audio se escucha fuera de la app y el
 * descanso no se cronometra porque no es una tarea.
 */
export const MINUTOS_POR_KIND: Record<KindCheckpoint, number | null> = {
  qbank: 30, leccion: 30, tarjetas: 20, assessment: 20,
  lectura: 15, podcast: null, descanso: null,
}

export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const

/** Un descanso no se marca ni cuenta: no es trabajo pendiente. */
export const esTarea = (cp: PlanCheckpoint) => cp.kind !== 'descanso'
