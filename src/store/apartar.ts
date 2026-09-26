import { borrar, escribir } from './db'

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
