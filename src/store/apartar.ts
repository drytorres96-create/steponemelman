import { borrar, escribir } from './db'
import { crearUUID } from './model'

export const AVISO_COPIA_SIN_VERSION = 'Se conservó por separado una copia local cuyo historial podría ser anterior a un reinicio. No se añadió a tu progreso actual.'

/** Preserve an unversioned copy without removing either active storage slot. */
export async function conservarCopiaSinVersion(clave: string, copia: unknown): Promise<boolean> {
  const archivo = `apartada:${clave}:${Date.now()}:${crearUUID()}`
  const registro = { copia, motivo: 'sin-version', apartadaEn: new Date().toISOString() }
  try {
    await escribir(archivo, registro, { estricto: true })
    return true
  } catch {
    // IndexedDB writes may still be failing, just as when only the reset backup
    // survived. Use a separate fallback key, never the live backup slot.
    try { localStorage.setItem(`step1-progreso:${archivo}`, JSON.stringify(registro)); return true }
    catch { return false }
  }
}

/**
 * Aparta una copia local ilegible sin perderla: queda en IndexedDB, con su fecha, por si
 * guardaba cambios que no llegaron a subir. Después se retiran la copia principal y el
 * respaldo rápido, para que el siguiente arranque no vuelva a tropezar con ellos.
 *
 * Devuelve `false` si no pudo apartarse; entonces la copia se queda donde estaba.
 */
export async function apartarCopia(clave: string, claveRespaldo: string, copia: Record<string, unknown>): Promise<boolean> {
  try {
    await escribir(`apartada:${clave}:${Date.now()}`, { ...copia, apartadaEn: new Date().toISOString() }, { estricto: true })
  } catch { return false }
  await borrar([clave])
  try { localStorage.removeItem(claveRespaldo) } catch { /* la próxima copia lo sustituye */ }
  return true
}
