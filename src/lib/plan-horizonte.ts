import { fechaISO, lunesDe } from './tiempo'

/**
 * Visión a futuro: cómo quedaría el material si se repartiera en un horizonte de
 * semanas.
 *
 * El reparto no es plano. Las últimas semanas antes del examen valen más para
 * consolidar que para absorber material nuevo, así que el horizonte carga por
 * delante: la semana 1 recibe el peso mayor y la última el menor, con pesos
 * `n, n-1, … 1`. Y se recalcula entero cada vez desde lo que queda de verdad —
 * si se avanza más de lo previsto los objetivos siguientes bajan solos, y si se
 * pierde una semana suben.
 */
export const SEMANAS_HORIZONTE = 10

/**
 * Reparte `restantes` entre `semanas` con pesos decrecientes. Devuelve enteros que
 * suman exactamente `restantes`: el sobrante del redondeo va a las semanas con la
 * parte decimal mayor y, en empate, a la más temprana.
 */
export function repartirHorizonte(restantes: number, semanas: number): number[] {
  const n = Math.max(1, Math.floor(semanas))
  const total = Math.max(0, Math.floor(restantes))
  const pesos = Array.from({ length: n }, (_, i) => n - i)
  const suma = pesos.reduce((a, b) => a + b, 0)
  const exacto = pesos.map(p => total * p / suma)
  const reparto = exacto.map(Math.floor)
  let resto = total - reparto.reduce((a, b) => a + b, 0)
  const orden = exacto.map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of orden) {
    if (resto <= 0) break
    reparto[i]++
    resto--
  }
  return reparto
}

export interface FilaHorizonte {
  indice: number
  /** Lunes de esa semana, en fecha local ISO. */
  inicio: string
  conceptos: number
  preguntas: number
  acumuladoConceptos: number
  acumuladoPreguntas: number
}

export interface PlanHorizonte {
  semanas: FilaHorizonte[]
  totalConceptos: number
  totalPreguntas: number
  baseConceptos: number
  basePreguntas: number
  restanConceptos: number
  restanPreguntas: number
  /** Objetivo de la semana en curso, para comparar con lo que ya lleva hecho. */
  objetivoConceptos: number
  objetivoPreguntas: number
}

export function construirPlanHorizonte(input: {
  totalConceptos: number
  dominados: number
  totalPreguntas: number
  respondidas: number
  semanas?: number
  desde?: Date | number
}): PlanHorizonte {
  const semanas = Math.max(1, Math.floor(input.semanas ?? SEMANAS_HORIZONTE))
  const baseConceptos = Math.min(Math.max(0, input.dominados), Math.max(0, input.totalConceptos))
  const basePreguntas = Math.min(Math.max(0, input.respondidas), Math.max(0, input.totalPreguntas))
  const restanConceptos = Math.max(0, input.totalConceptos - baseConceptos)
  const restanPreguntas = Math.max(0, input.totalPreguntas - basePreguntas)
  const porConceptos = repartirHorizonte(restanConceptos, semanas)
  const porPreguntas = repartirHorizonte(restanPreguntas, semanas)
  const lunes = lunesDe(input.desde ?? Date.now())
  let acumuladoConceptos = baseConceptos, acumuladoPreguntas = basePreguntas
  const filas: FilaHorizonte[] = porConceptos.map((conceptos, i) => {
    acumuladoConceptos += conceptos
    acumuladoPreguntas += porPreguntas[i]
    const inicio = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i * 7)
    return { indice: i + 1, inicio: fechaISO(inicio), conceptos, preguntas: porPreguntas[i],
      acumuladoConceptos, acumuladoPreguntas }
  })
  return {
    semanas: filas, totalConceptos: input.totalConceptos, totalPreguntas: input.totalPreguntas,
    baseConceptos, basePreguntas, restanConceptos, restanPreguntas,
    objetivoConceptos: filas[0]?.conceptos ?? 0, objetivoPreguntas: filas[0]?.preguntas ?? 0,
  }
}
