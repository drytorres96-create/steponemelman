import type { NbmeAttempt, NbmeCatalog, NbmeState } from './types'

export const FORMAS = ['27', '28', '29'] as const
export type Forma = (typeof FORMAS)[number]

export interface ResumenForma {
  form: Forma
  /** Preguntas publicadas y calificables de esta forma. */
  total: number
  vistas: number
  /** Su último intento quedó correcto. */
  correctas: number
  /** Su último intento quedó incorrecto o en conflicto entre dispositivos. */
  incorrectas: number
  /** Respondidas por primera vez dentro de la ventana. */
  nuevas: number
  /** Acertadas en el primer intento registrado de esa pregunta. */
  primeraVez: number
  /** Falladas dos veces o más: no fue un despiste. */
  reincidentes: number
  /** Cobertura de la forma: vistas sobre el total publicado. */
  porcentaje: number
}

const fallado = (a: NbmeAttempt) => !a.correct || a.conflict === true

/**
 * Progreso por forma NBME. `desde` acota la ventana: con 0 cuenta todo el
 * historial, y con el lunes de esta semana cuenta sólo lo hecho en la semana.
 *
 * «A la primera» es el primer intento registrado de esa pregunta en toda su
 * historia, no el primero de la ventana: repetir en enero una pregunta fallada en
 * diciembre no convierte el acierto en un primer intento limpio.
 */
export function progresoPorForma(state: NbmeState, catalog: NbmeCatalog | null, desde = 0): ResumenForma[] {
  const porPregunta = new Map<string, NbmeAttempt[]>()
  for (const intento of Object.values(state.attempts)) {
    const lista = porPregunta.get(intento.questionId)
    if (lista) lista.push(intento)
    else porPregunta.set(intento.questionId, [intento])
  }
  for (const lista of porPregunta.values()) {
    lista.sort((a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id))
  }
  return FORMAS.map(form => {
    const preguntas = (catalog?.questions ?? []).filter(q => q.form === form && q.status === 'ready')
    let vistas = 0, correctas = 0, incorrectas = 0, nuevas = 0, primeraVez = 0, reincidentes = 0
    for (const pregunta of preguntas) {
      const todos = porPregunta.get(pregunta.id) ?? []
      const ventana = todos.filter(a => a.submittedAt >= desde)
      if (!ventana.length) continue
      vistas++
      const ultimo = ventana[ventana.length - 1]
      if (fallado(ultimo)) incorrectas++
      else correctas++
      const primero = todos[0]
      if (primero.submittedAt >= desde) {
        nuevas++
        if (!fallado(primero)) primeraVez++
      }
      if (ventana.filter(fallado).length >= 2) reincidentes++
    }
    return { form, total: preguntas.length, vistas, correctas, incorrectas, nuevas, primeraVez, reincidentes,
      porcentaje: preguntas.length ? vistas / preguntas.length : 0 }
  })
}
