import { supabase } from '../lib/supabase'
import { escribir, leer } from '../store/db'
import { leerVineta, SET_VINETAS, type Vineta } from './modelo'

export interface CargaVinetas {
  vinetas: Vineta[]
  /** Filas que no pasaron la validación y no se enseñan. */
  descartadas: number
  /** true si vienen de la copia de este dispositivo porque la red falló. */
  desdeCopia: boolean
}

function interpretar(filas: unknown[], desdeCopia: boolean): CargaVinetas {
  const vinetas = filas.map(leerVineta).filter((v): v is Vineta => v !== null)
  return { vinetas, descartadas: filas.length - vinetas.length, desdeCopia }
}

/**
 * El conjunto vive en Supabase (`ai_vignettes`), como el resto del material privado: no
 * viaja en el código. Se guarda una copia en este dispositivo para poder practicar sin
 * conexión, pero una respuesta del servidor siempre manda sobre la copia.
 */
export async function cargarVinetas(): Promise<CargaVinetas> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Inicia sesión para abrir las viñetas.')
  const copia = `vinetas:${session.user.id}:${SET_VINETAS}`
  const { data, error } = await supabase.from('ai_vignettes').select('id, position, payload, reviewed')
    .eq('set_id', SET_VINETAS).order('position', { ascending: true })
  if (!error && Array.isArray(data)) {
    try { await escribir(copia, data) } catch { /* sin copia offline */ }
    return interpretar(data, false)
  }
  const local = await leer<unknown>(copia).catch(() => null)
  if (Array.isArray(local)) return interpretar(local, true)
  throw new Error('No se pudieron cargar las viñetas. Revisa la conexión y vuelve a intentarlo.')
}
