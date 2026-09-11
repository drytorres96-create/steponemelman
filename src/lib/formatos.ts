import type { Concepto, Interaccion } from '../schema/concept'
import { normalizar } from './normalize'

export const MAX_PALABRAS_RESPUESTA = 6
export const MAX_CARACTERES_RESPUESTA = 65
const ESCRITAS: Interaccion[] = ['recuperacion_libre', 'completar', 'tarjeta', 'escritura_correctiva']
export function esRespuestaBreve(texto: string): boolean {
  const t = texto.trim()
  return !!t && t.length <= MAX_CARACTERES_RESPUESTA && t.split(/\s+/).length <= MAX_PALABRAS_RESPUESTA
}
const hash = (semilla: string) => {
  let h = 2166136261
  for (const x of semilla) h = Math.imul(h ^ x.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Sólo se utilizan opciones redactadas y revisadas en el corpus privado. */
export function tieneOpcionesValidas(c: Concepto): boolean {
  const os = c.evaluacion.opciones
  return !!os && os.length >= 2 && os.filter(o => o.correcta).length === 1
    && new Set(os.map(o => normalizar(o.texto))).size === os.length
}

/** Un hueco literal conserva la afirmación y pide la respuesta canónica completa. */
function fraseConHueco(c: Concepto): string | null {
  const respuesta = c.respuesta_canonica.trim().replace(/[.!?]+$/, '')
  if (!esRespuestaBreve(respuesta) || respuesta.length < 2) return null
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patron = new RegExp(`(?<![\\p{L}\\p{N}])${escapar(respuesta)}(?![\\p{L}\\p{N}])`, 'giu')
  if ([...c.afirmacion.matchAll(patron)].length !== 1) return null
  return c.afirmacion.replace(patron, '______')
}

export interface ContextoFormato { semilla: string; indice: number; ruta?: string; forzarReconocimiento?: boolean; version?: 1 | 2 }

/**
 * La variante depende sólo de la presentación guardada, nunca del progreso mutable.
 * No se acortan mecanismos tomando un sinónimo parcial ni se inventan distractores.
 * Una pregunta larga sin evaluación válida queda como revisión, sin crédito automático.
 */
export function prepararConcepto(original: Concepto, contexto: ContextoFormato): Concepto {
  const c: Concepto = { ...original, evaluacion: { ...original.evaluacion }, interaccion: { ...original.interaccion } }
  if (c.variante_id) return c
  if (c.escritura_correctiva.termino && !esRespuestaBreve(c.escritura_correctiva.termino)) {
    c.escritura_correctiva = { elegible: false, termino: null }
  }
  const nativa = c.interaccion.recomendada
  if (tieneOpcionesValidas(c) && ['opcion_multiple', 'caso_clinico', ...ESCRITAS].includes(nativa)) {
    // Las preguntas clínicas se conservan completas. El examen usa siempre sus opciones.
    // Sólo las sesiones antiguas conservan su presentación V/F; las nuevas usan las opciones editoriales.
    if (contexto.version === 1 && contexto.ruta !== 'examen' && !contexto.forzarReconocimiento && contexto.indice % 3 === 2
        && nativa !== 'caso_clinico' && !c.interaccion.prohibidas.includes('verdadero_falso')) {
      const opciones = c.evaluacion.opciones!
      const h = hash(contexto.semilla)
      const correcta = (h & 1) === 0
      const candidatas = opciones.filter(o => o.correcta === correcta)
      const propuesta = candidatas[Math.floor(h / 2) % candidatas.length]
      c.evaluacion.pregunta = `${c.evaluacion.pregunta}\n\nPropuesta: «${propuesta.texto}»\n¿Esta propuesta responde correctamente a la pregunta?`
      c.evaluacion.opciones = [
        { texto: 'Verdadero', correcta, por_que: correcta ? '' : propuesta.por_que || `La respuesta de referencia es: ${c.respuesta_canonica}` },
        { texto: 'Falso', correcta: !correcta, por_que: correcta ? `La propuesta coincide con la respuesta de referencia: ${c.respuesta_canonica}` : '' },
      ]
      c.interaccion.recomendada = 'verdadero_falso'
    } else c.interaccion.recomendada = nativa === 'caso_clinico' ? 'caso_clinico' : 'opcion_multiple'
    return c
  }
  if (!ESCRITAS.includes(nativa)) return c
  if (!esRespuestaBreve(c.respuesta_canonica)) {
    c.interaccion.recomendada = 'tarjeta'
    return c
  }
  // No aceptamos como respuesta un alias que ya aparece en el enunciado y no
  // designa la canónica (p. ej., el nombre del fármaco cuando se pide su efecto).
  const enunciado = ` ${normalizar(c.evaluacion.pregunta)} `
  const canonica = normalizar(c.respuesta_canonica)
  const admisible = (s: string) => esRespuestaBreve(s) && (normalizar(s) === canonica
    || !enunciado.includes(` ${normalizar(s)} `))
  c.sinonimos = c.sinonimos.filter(admisible)
  c.evaluacion.respuestas_aceptadas = c.evaluacion.respuestas_aceptadas.filter(admisible)
  const hueco = fraseConHueco(c)
  const formatoFijo = c.interaccion.permitidas.length === 1 && c.interaccion.permitidas[0] === 'recuperacion_libre'
  if (hueco && !formatoFijo && contexto.indice % 2 === 1 && contexto.ruta !== 'terminos'
      && !c.interaccion.prohibidas.includes('completar')) {
    c.evaluacion.pregunta = `Completa con una palabra o frase corta:\n\n${hueco}`
    c.interaccion.recomendada = 'completar'
  } else c.interaccion.recomendada = 'recuperacion_libre'
  return c
}

/** Intercala sólo los conceptos ya seleccionados; no cambia filtros ni el tamaño. */
export function alternarFormatos(conceptos: Concepto[], ruta?: string): Concepto[] {
  if (ruta === 'examen' || ruta === 'direccional' || ruta === 'terminos') return conceptos
  const grupos = new Map<string, Concepto[]>()
  const ordenGrupos: string[] = []
  for (const c of conceptos) {
    const tipo = ESCRITAS.includes(c.interaccion.recomendada) ? 'respuesta_breve' : c.interaccion.recomendada
    if (!grupos.has(tipo)) { grupos.set(tipo, []); ordenGrupos.push(tipo) }
    grupos.get(tipo)!.push(c)
  }
  const salida: Concepto[] = []
  let anterior = ''
  while (salida.length < conceptos.length) {
    const disponibles = ordenGrupos.filter(k => grupos.get(k)!.length > 0)
    const distintos = disponibles.filter(k => k !== anterior)
    const candidatas = distintos.length ? distintos : disponibles
    // Prioriza el grupo mayor para no acumular toda la escritura al final.
    const elegida = candidatas.reduce((a, b) => grupos.get(b)!.length > grupos.get(a)!.length ? b : a)
    salida.push(grupos.get(elegida)!.shift()!)
    anterior = elegida
  }
  return salida
}
