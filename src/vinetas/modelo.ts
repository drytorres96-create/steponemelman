/**
 * Viñetas de mecanismo, piloto de 1.25.0.
 *
 * Son viñetas de estilo NBME generadas por IA a partir de los conceptos de bioquímica y
 * microbiología, sin revisión clínica. Por eso viven aparte de todo lo demás: no entran
 * en Hoy, no registran intentos y no tocan el dominio. Lo único que se guarda es qué
 * respondió en cada una y cuáles marcó como dudosas, y sólo en este navegador.
 *
 * El enunciado y las opciones van en inglés, como en el examen; la explicación, en
 * español: claves del caso, cadena del mecanismo, por qué no las otras y el patrón.
 */

/** El único conjunto publicado por ahora. */
export const SET_VINETAS = 'mecanismo-v1'

export const DISCIPLINAS_VINETAS = ['Bioquímica', 'Microbiología'] as const
export type DisciplinaVineta = typeof DISCIPLINAS_VINETAS[number]

export interface OpcionVineta { id: string; text: string }

export interface Vineta {
  id: string
  position: number
  /** Siempre `false` en el piloto: nadie ha revisado el contenido clínico. */
  reviewed: boolean
  conceptId: string
  discipline: DisciplinaVineta
  topic: string
  /** El objetivo del concepto del que sale la viñeta. */
  concept: string
  stem: string
  question: string
  options: OpcionVineta[]
  answer: string
  explanation: {
    clues: string[]
    mechanism: string[]
    /** Por qué no cada opción incorrecta, por letra. */
    distractors: Record<string, string>
    pattern: string
  }
}

const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const texto = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const textos = (v: unknown, max = 12): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= max && v.every(x => texto(x, 600))

/**
 * Lee una fila de `ai_vignettes`. Todo o nada: una viñeta a la que le falte una opción, la
 * respuesta o la explicación de un distractor no se enseña, porque una explicación coja
 * en contenido sin revisar es justo lo que puede enseñar algo falso.
 */
export function leerVineta(fila: unknown): Vineta | null {
  if (!esObjeto(fila) || !texto(fila.id, 128) || !Number.isInteger(fila.position) || !esObjeto(fila.payload)) return null
  const p = fila.payload
  if (p.schemaVersion !== 1 || !texto(p.conceptId, 128) || !DISCIPLINAS_VINETAS.includes(p.discipline as DisciplinaVineta)
    || !texto(p.topic, 200) || !texto(p.concept, 600) || !texto(p.stem) || !texto(p.question, 600)
    || !Array.isArray(p.options) || !texto(p.answer, 1) || !esObjeto(p.explanation)) return null
  const options = p.options
  if (options.length !== LETRAS.length) return null
  const opciones: OpcionVineta[] = []
  for (const [i, o] of options.entries()) {
    if (!esObjeto(o) || o.id !== LETRAS[i] || !texto(o.text, 400)) return null
    opciones.push({ id: LETRAS[i], text: o.text })
  }
  if (!opciones.some(o => o.id === p.answer)) return null
  const e = p.explanation
  if (!textos(e.clues) || !textos(e.mechanism) || !texto(e.pattern, 600) || !esObjeto(e.distractors)) return null
  const distractors: Record<string, string> = {}
  for (const o of opciones) {
    if (o.id === p.answer) continue
    const razon = e.distractors[o.id]
    if (!texto(razon, 600)) return null
    distractors[o.id] = razon
  }
  return {
    id: fila.id, position: fila.position as number, reviewed: fila.reviewed === true,
    conceptId: p.conceptId, discipline: p.discipline as DisciplinaVineta, topic: p.topic, concept: p.concept,
    stem: p.stem, question: p.question, options: opciones, answer: p.answer,
    explanation: { clues: e.clues, mechanism: e.mechanism, distractors, pattern: e.pattern },
  }
}

export interface RespuestaVineta { opcion: string; correcta: boolean; ts: number }
export interface ProgresoVinetas {
  respuestas: Record<string, RespuestaVineta>
  /** Las que marcó como dudosas, con la hora en que lo hizo. */
  dudosas: Record<string, number>
}

export const progresoVacio = (): ProgresoVinetas => ({ respuestas: {}, dudosas: {} })
const clave = (cuenta: string) => `step1-vinetas:${cuenta}:${SET_VINETAS}`

/** Nunca falla: un registro ilegible o sin almacenamiento empieza vacío. */
export function leerProgresoVinetas(cuenta: string): ProgresoVinetas {
  try {
    const crudo: unknown = JSON.parse(localStorage.getItem(clave(cuenta)) ?? 'null')
    if (!esObjeto(crudo) || !esObjeto(crudo.respuestas) || !esObjeto(crudo.dudosas)) return progresoVacio()
    const respuestas: Record<string, RespuestaVineta> = {}
    for (const [id, r] of Object.entries(crudo.respuestas)) {
      if (esObjeto(r) && typeof r.opcion === 'string' && typeof r.correcta === 'boolean' && typeof r.ts === 'number') {
        respuestas[id] = { opcion: r.opcion, correcta: r.correcta, ts: r.ts }
      }
    }
    const dudosas: Record<string, number> = {}
    for (const [id, ts] of Object.entries(crudo.dudosas)) if (typeof ts === 'number') dudosas[id] = ts
    return { respuestas, dudosas }
  } catch { return progresoVacio() }
}

export function guardarProgresoVinetas(cuenta: string, progreso: ProgresoVinetas): void {
  try { localStorage.setItem(clave(cuenta), JSON.stringify(progreso)) } catch { /* el piloto sigue en memoria */ }
}

export type FiltroVinetas = DisciplinaVineta | 'todas' | 'falladas' | 'dudosas'

/**
 * Qué viñetas abre cada botón, en el orden del conjunto. Por disciplina (o todas), sólo
 * las pendientes; «falladas», las que falló la última vez que las respondió; «dudosas»,
 * las que marcó, se hayan respondido o no.
 */
export function seleccionar(vinetas: Vineta[], progreso: ProgresoVinetas, filtro: FiltroVinetas): Vineta[] {
  const ordenadas = [...vinetas].sort((a, b) => a.position - b.position)
  if (filtro === 'falladas') return ordenadas.filter(v => progreso.respuestas[v.id]?.correcta === false)
  if (filtro === 'dudosas') return ordenadas.filter(v => progreso.dudosas[v.id] !== undefined)
  return ordenadas.filter(v => (filtro === 'todas' || v.discipline === filtro) && !progreso.respuestas[v.id])
}
