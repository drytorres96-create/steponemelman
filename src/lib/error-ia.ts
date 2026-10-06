import { solicitarIA } from './peticion-ia'
import type { PeticionErrorIA } from './contexto-ia'
import type { CorreccionError } from '../server/correccion-error'
export type { PeticionErrorIA, CorreccionError }
export async function analizarError(peticion: PeticionErrorIA, signal?: AbortSignal) {
  const r = await solicitarIA<CorreccionError>('/api/ia/error', peticion, 25_000, signal)
  if (r.estado === 'ok' && !['observado', 'confusion', 'clave', 'evitar', 'evidencia'].every(k => typeof r.data?.[k as keyof CorreccionError] === 'string' && r.data[k as keyof CorreccionError].trim())) {
    return { estado: 'sin_ia' as const, motivo: 'La corrección llegó incompleta. Conserva la explicación del material.' }
  }
  return r
}
