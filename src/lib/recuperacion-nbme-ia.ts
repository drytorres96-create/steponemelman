import { solicitarIA } from './peticion-ia'
import { esContenidoRecuperacion, esOrigenRecuperacion, type ContenidoRecuperacion, type OrigenRecuperacion } from '../nbme/recuperacion-modelo'

export type PeticionRecuperacionNbme = OrigenRecuperacion & { razonamiento?: string }

/** Generación manual, un solo intento y el mismo presupuesto gratuito que las otras ayudas. */
export async function generarRecuperacionNbme(peticion: PeticionRecuperacionNbme, signal?: AbortSignal) {
  if (!esOrigenRecuperacion(peticion) || (peticion.razonamiento !== undefined
    && (typeof peticion.razonamiento !== 'string' || peticion.razonamiento.length > 500))) {
    return { estado: 'sin_ia' as const, motivo: 'No se pudo identificar este intento. Conservas la pregunta original.' }
  }
  // La identidad del intento se usa para guardar; el servidor sólo recibe contexto verificable de la pregunta.
  const { qid, revision, optionId, razonamiento } = peticion
  const r = await solicitarIA<ContenidoRecuperacion>('/api/ia/recuperacion-nbme',
    { questionId: qid, revision, optionId, ...(razonamiento?.trim() ? { razonamiento: razonamiento.trim() } : {}) }, 25_000, signal)
  if (r.estado === 'ok' && !esContenidoRecuperacion(r.data)) {
    return { estado: 'sin_ia' as const, motivo: 'Los ejercicios llegaron incompletos. Puedes repasar el material y continuar.' }
  }
  return r
}
