import type { CoachExamen } from '../server/worker'

export type { CoachExamen }

/** Como el resto de la ayuda: si no se puede, se dice por qué y el concepto sigue entero. */
export type ResultadoExamen =
  | { estado: 'ok'; examen: CoachExamen; cacheado: boolean }
  | { estado: 'sin_ia'; motivo: string }

import { solicitarIA } from './peticion-ia'

export async function comoCaeEnElExamen(conceptId: string, signal?: AbortSignal): Promise<ResultadoExamen> {
  const r = await solicitarIA<Partial<CoachExamen> & { cached?: boolean }>('/api/aplicar', { conceptId }, 35_000, signal)
  if (r.estado === 'sin_ia') return r
  const data = r.data
  if (!data?.vineta || !data.patron || !Array.isArray(data.trampas) || data.trampas.length < 2) return { estado: 'sin_ia', motivo: 'La viñeta llegó incompleta y no se muestra.' }
  return { estado: 'ok', cacheado: data.cached === true,
    examen: { vineta: data.vineta, dato_clave: data.dato_clave ?? '', trampas: data.trampas, patron: data.patron, utilidad: data.utilidad ?? '' } }
}
