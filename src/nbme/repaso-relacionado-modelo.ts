import { leerReanudable, type Reanudable } from '../store/model'

export interface OrigenRepasoNbme {
  sessionId: string; attemptId: string; questionId: string; revision: string; position: number
}
export interface RepasoRelacionadoGuardado {
  version: 1; ownerId: string; origen: OrigenRepasoNbme; ids: string[]
  continuacion: Reanudable | null; terminado: boolean
}
export const claveRepasoRelacionado = (ownerId: string, origen: OrigenRepasoNbme) =>
  `melman:repaso-nbme:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(origen.attemptId)}:${encodeURIComponent(origen.revision)}`

/** El repaso tiene su propia continuación; nunca reemplaza una cola general pendiente. */
export function leerRepasoRelacionado(ownerId: string, origen: OrigenRepasoNbme): RepasoRelacionadoGuardado | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(claveRepasoRelacionado(ownerId, origen)) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const v = raw as Record<string, unknown>
    if (v.version !== 1 || v.ownerId !== ownerId || !v.origen || typeof v.origen !== 'object'
      || !Array.isArray(v.ids) || !v.ids.length || v.ids.length > 12
      || !v.ids.every(id => typeof id === 'string' && id.length > 0) || new Set(v.ids).size !== v.ids.length
      || typeof v.terminado !== 'boolean') return null
    const o = v.origen as Record<string, unknown>
    if (Object.entries(origen).some(([k, value]) => o[k] !== value)) return null
    const continuacion = leerReanudable(v.continuacion)
    if (continuacion === false || (!v.terminado && (!continuacion || !continuacion.sessionId
      || continuacion.sesion !== 'repaso' || continuacion.indice > v.ids.length
      || continuacion.conceptIds?.join('|') !== v.ids.join('|')))) return null
    return { version: 1, ownerId, origen, ids: v.ids as string[], continuacion, terminado: v.terminado }
  } catch { return null }
}
export function guardarRepasoRelacionado(v: RepasoRelacionadoGuardado): boolean {
  try { localStorage.setItem(claveRepasoRelacionado(v.ownerId, v.origen), JSON.stringify(v)); return true }
  catch { return false }
}
