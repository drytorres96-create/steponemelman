import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import type { CoachCuota } from '../server/worker'

export type { CoachCuota }

/**
 * Lo que queda hoy del regalo diario de Workers AI, en un solo sitio.
 *
 * Antes cada pantalla que quería enseñarlo lo pedía por su cuenta y solo se enteraba
 * después de usar la IA. Aquí el estado es uno: se carga al entrar, se refresca cuando algo
 * gasta, y quien lo pinta se entera solo. Consultarlo no gasta cuota —el Worker responde
 * con lo contabilizado, sin llamar a ningún modelo—, así que preguntarlo de más es barato.
 */
let valor: CoachCuota | null = null
let pendiente: Promise<void> | null = null
let ultima = 0
const oyentes = new Set<() => void>()

/** Dos usos seguidos no merecen dos consultas: la segunda vería lo mismo. */
const ESPERA_MS = 900

function avisar() { for (const fn of oyentes) fn() }

async function consultar(): Promise<CoachCuota | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const response = await fetch('/api/ia/estado', { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
    const data = await response.json() as Partial<CoachCuota>
    if (typeof data.restantes !== 'number' || typeof data.presupuesto !== 'number' || data.presupuesto <= 0) return null
    return { presupuesto: data.presupuesto, gastadas: data.gastadas ?? 0, restantes: Math.max(0, data.restantes),
      llamadas: data.llamadas ?? 0, activa: data.activa === true }
  } catch { return null }
}

/**
 * Relee la cuota. Nunca lanza y nunca deja un valor a medias: si la consulta falla, se
 * conserva el último dato bueno en vez de vaciar el indicador.
 */
export function refrescarCuota(forzar = false): Promise<void> {
  if (pendiente) return pendiente
  if (!forzar && valor && Date.now() - ultima < ESPERA_MS) return Promise.resolve()
  pendiente = consultar().then(nueva => {
    ultima = Date.now()
    if (nueva) { valor = nueva; avisar() }
  }).finally(() => { pendiente = null })
  return pendiente
}

/** Lo llaman los clientes de IA al terminar: puede haber gastado, así que hay que releer. */
export function notificarUsoIA() {
  setTimeout(() => void refrescarCuota(true), ESPERA_MS)
}

export const leerCuota = () => valor

/** Solo para las pruebas: devuelve el módulo a su estado inicial. */
export function olvidarCuota() { valor = null; ultima = 0; pendiente = null }

function suscribir(fn: () => void) {
  oyentes.add(fn)
  // La primera pantalla que lo pinta dispara la carga; las demás se enganchan al mismo dato.
  void refrescarCuota()
  return () => { oyentes.delete(fn) }
}

export function useCuotaIA(): CoachCuota | null {
  return useSyncExternalStore(suscribir, leerCuota, leerCuota)
}

/** Porcentaje que queda, redondeado y acotado, listo para pintar. */
export function porcentajeRestante(c: CoachCuota): number {
  return Math.max(0, Math.min(100, Math.round(c.restantes / c.presupuesto * 100)))
}
