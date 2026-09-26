import { clavesConPrefijo, leer } from '../store/db'

export const nombreRespaldo = (fecha = new Date()) => `progreso-step1-${fecha.toISOString().slice(0, 10)}.json`

type Copia = { state?: unknown; savedAt?: unknown }

const esCopia = (valor: unknown): valor is Copia => !!valor && typeof valor === 'object' && !Array.isArray(valor)
const guardadaEn = (copia: Copia) => typeof copia.savedAt === 'number' ? copia.savedAt : -1
/** De dos copias de lo mismo, la más reciente; una ilegible nunca gana a una legible. */
const masReciente = (a: unknown, b: unknown): Copia | null => {
  const [x, y] = [esCopia(a) ? a : null, esCopia(b) ? b : null]
  if (!x || !y) return x ?? y
  return guardadaEn(y) > guardadaEn(x) ? y : x
}

function respaldosRapidos(): Record<string, unknown> {
  const copias: Record<string, unknown> = {}
  try {
    for (const clave of Object.keys(localStorage)) {
      if (!clave.startsWith('step1-respaldo:') && !clave.startsWith('step1-backup:')) continue
      const crudo = localStorage.getItem(clave)
      try { copias[clave] = JSON.parse(crudo ?? 'null') } catch { copias[clave] = crudo }
    }
  } catch { /* sin acceso al almacenamiento del navegador */ }
  return copias
}

/**
 * El respaldo que se puede descargar aunque la aplicación haya fallado: lee las copias de
 * este navegador sin pasar por los proveedores, que pueden ser lo que falló. Arriba va el
 * progreso de conceptos, en el mismo formato que «Exportar progreso», para que «Importar
 * progreso» lo lea; el de las preguntas NBME va en `nbme`. Si no hay ninguna copia legible,
 * se entregan tal cual para no perder nada.
 */
export async function respaldoDeEmergencia(): Promise<string> {
  const rapidos = respaldosRapidos()
  const principales: Record<string, unknown> = {}
  for (const prefijo of ['cuenta:', 'nbme-state:']) {
    for (const clave of await clavesConPrefijo(prefijo)) {
      try { principales[clave] = await leer<unknown>(clave) } catch { /* se queda con el respaldo rápido */ }
    }
  }
  const elegir = (principal: string, rapido: string) => {
    const claves = Object.keys(principales).filter(k => k.startsWith(principal))
    const deRapidos = Object.keys(rapidos).filter(k => k.startsWith(rapido))
    let mejor: Copia | null = null
    for (const k of claves) mejor = masReciente(mejor, principales[k])
    for (const k of deRapidos) mejor = masReciente(mejor, rapidos[k])
    return mejor?.state && typeof mejor.state === 'object' ? mejor.state as Record<string, unknown> : null
  }
  const estudio = elegir('cuenta:', 'step1-respaldo:cuenta:')
  const nbme = elegir('nbme-state:', 'step1-backup:nbme-state:')
  const exportado = new Date().toISOString()
  if (!estudio && !nbme) return JSON.stringify({ copias: { ...principales, ...rapidos }, exportado }, null, 1)
  return JSON.stringify({ ...estudio, ...(nbme ? { nbme } : {}), exportado }, null, 1)
}
