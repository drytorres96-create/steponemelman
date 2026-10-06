import { solicitarIA } from './peticion-ia'
import type { PresentacionIA } from './contexto-ia'
import type { CoachAnswer } from '../server/worker'

export async function explicarRespuesta(peticion: PresentacionIA, signal?: AbortSignal) {
  const r = await solicitarIA<CoachAnswer>('/api/explicar', peticion, 30_000, signal)
  if (r.estado === 'ok' && !['diferencia', 'explicacion', 'recordar', 'evidencia'].every(k => typeof r.data?.[k as keyof CoachAnswer] === 'string')) {
    return { estado: 'sin_ia' as const, motivo: 'La explicación llegó incompleta.' }
  }
  return r
}
