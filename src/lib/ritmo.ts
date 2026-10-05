import type { ProgresoConcepto } from '../srs/tipos'
import type { NbmeAttempt } from '../nbme/types'

const MIN_MUESTRA = 5
function medianaValida(ms: number[], maximo: number): number | null {
  const datos = ms.filter(x => Number.isFinite(x) && x >= 5_000 && x <= maximo).sort((a, b) => a - b)
  if (datos.length < MIN_MUESTRA) return null
  const medio = Math.floor(datos.length / 2)
  return datos.length % 2 ? datos[medio] : (datos[medio - 1] + datos[medio]) / 2
}

/** Aproximación de lectura/respuesta; no es un límite ni un contador de tiempo. */
export function estimarBloque(progreso: Record<string, ProgresoConcepto>, preguntas: NbmeAttempt[], cantidad: { conceptos: number; preguntas: number }): string | null {
  const conceptos = cantidad.conceptos ? medianaValida(Object.values(progreso).flatMap(p => p.intentos)
    .filter(i => i.resultado && i.resultado !== 'revision').map(i => i.ms), 600_000) : 0
  const nbme = cantidad.preguntas ? medianaValida(preguntas.map(i => i.durationMs), 900_000) : 0
  if (conceptos === null || nbme === null || cantidad.conceptos + cantidad.preguntas === 0) return null
  const minutos = (conceptos * cantidad.conceptos + nbme * cantidad.preguntas) / 60_000
  const minimo = Math.max(1, Math.floor(minutos * 0.8)), maximo = Math.max(minimo + 1, Math.ceil(minutos * 1.3))
  return `≈ ${minimo}–${maximo} min para responder, según tu práctica; las explicaciones pueden añadir tiempo.`
}
