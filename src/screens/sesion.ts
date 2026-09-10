import type { Concepto } from '../schema/concept'
import { DIA, nuevoProgreso, programar } from '../srs/fsrs'
import { evidenciaIndependiente } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'

/** Identifica una presentación concreta, también si un concepto se repite en una cola antigua. */
export function identificarPregunta(sesion: string, indice: number, concepto: string): string {
  return `${sesion}:${indice}:${concepto}`
}

/** Huella de la pregunta evaluada; no duplica el texto de los PDFs en el historial. */
export function versionPregunta(c: Concepto): string {
  const texto = JSON.stringify([c.interaccion.recomendada, c.evaluacion, c.respuesta_canonica, c.sinonimos])
  let hash = 2166136261
  for (const caracter of texto) hash = Math.imul(hash ^ caracter.charCodeAt(0), 16777619)
  return `q1-${(hash >>> 0).toString(16)}`
}

export function buscarIntentoPaso(p: ProgresoConcepto, sesion: string, pregunta: string): Intento | undefined {
  return p.intentos.find(t => t.session_id === sesion && t.pregunta_id === pregunta)
}

export function conAyuda(t: Intento): boolean {
  return t.pistas_usadas > 0 || t.fuente_consultada === true || t.explicacion_previa === true
}

export function resumirIntentos(intentos: Intento[]) {
  const unicos = [...new Map(intentos.map((t, i) => [t.session_id && t.pregunta_id
    ? `${t.session_id}:${t.pregunta_id}` : t.attempt_id ?? `legacy:${i}`, t])).values()]
  return {
    vistos: unicos.length,
    correctos: unicos.filter(t => t.resultado === 'correcta' || t.resultado === 'ortografia').length,
    independientes: unicos.filter(evidenciaIndependiente).length,
    ayudas: unicos.filter(conAyuda).length,
    porRevisar: unicos.filter(t => t.resultado === 'revision').length,
    fallos: unicos.filter(t => t.resultado === 'incorrecta' || t.resultado === 'parcial').length,
    ms: unicos.reduce((s, t) => s + t.ms, 0),
  }
}

/** La previsualización usa exactamente el planificador y sustituye el intento provisional. */
export function diasParaCalificacion(p: ProgresoConcepto, t: Intento, calificacion: 1 | 2 | 3 | 4): number | null {
  let antes = nuevoProgreso(p.concept_id)
  const previos = p.intentos.filter(x => !(t.attempt_id && x.attempt_id === t.attempt_id)
    && !(t.session_id && t.pregunta_id && x.session_id === t.session_id && x.pregunta_id === t.pregunta_id))
    .filter(x => x.ts <= t.ts).sort((a, b) => a.ts - b.ts || (a.attempt_id ?? '').localeCompare(b.attempt_id ?? ''))
  for (const previo of previos) antes = programar(antes, previo, previo.ts)
  const despues = programar(antes, { ...t, calificacion }, t.ts)
  return despues.proxima == null ? null : Math.max(0, (despues.proxima - t.ts) / DIA)
}

/** Cronómetro acumulativo: enseñanza, retroalimentación, fuente y pestañas ocultas no suman. */
export class RelojActividad {
  private acumulado = 0
  private inicio: number | null = null
  constructor(private readonly ahora: () => number = () => performance.now()) {}
  reiniciar(ms = 0) { this.acumulado = Math.max(0, ms); this.inicio = null }
  activar(activo: boolean) {
    if (activo && this.inicio === null) this.inicio = this.ahora()
    else if (!activo && this.inicio !== null) {
      this.acumulado += Math.max(0, this.ahora() - this.inicio)
      this.inicio = null
    }
  }
  leer() { return Math.round(this.acumulado + (this.inicio === null ? 0 : Math.max(0, this.ahora() - this.inicio))) }
}
