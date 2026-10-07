import type { NbmeCatalog, NbmeState } from '../nbme/types'
import { EXAMEN_MS } from '../srs/fsrs'
import { INICIO_DIA_HORA, TECHOS } from './dia'
import { desplazarFechaEstudio, diaSemanaEstudio, fechaEstudio, fechaISOEstudio, instanteEstudio, numeroDiaEstudio, partesEstudio } from './calendario-estudio'

/**
 * La meta de 60 días: del viernes 25-sep-2026 al lunes 23-nov-2026. Las cuatro
 * semanas siguientes, hasta el examen, quedan para consolidar.
 *
 * Es la vista a futuro de los techos de Hoy, no un reparto del corpus: repartir lo
 * que queda del material pedía 372 conceptos en una semana en la que los techos dan
 * unos 80, y una meta que el día no puede cumplir sólo sirve para sentirse detrás.
 *
 * Nada de esto se guarda: como el estado del día, sale del historial y de la fecha.
 */

/** Primer día de la ventana en el calendario de Nueva York. */
const INICIO = { anio: 2026, mes: 9, dia: 25 }
export const DIAS_META = 60
/**
 * Conceptos dominados en la ventana. Es la meta calibrada con el estado real del
 * 25-sep (docs/cambios-1.21.0.md): ya descuenta los días que no se cumplen, así que
 * no pide cerrar Hoy todos los días. No se cambia a ojo.
 */
export const META_CONCEPTOS = 510
/**
 * Preguntas NBME respondidas por primera vez en la ventana. Su techo es justo la mitad
 * del de conceptos —5 y 10 frente a 10 y 20—, así que su meta es la mitad: 255.
 */
export const META_PREGUNTAS = 255
/** Supuesto de planificación; la acreditación real exige los criterios guardados, no siete días fijos. */
export const RETRASO_DOMINIO = 7
/** La proyección espera dos semanas: la primera la infla lo que ya venía en camino. */
export const DIAS_PARA_PROYECTAR = 14

/** Mediodía de Nueva York del día `n`; las etiquetas deben formatearse en ZONA_ESTUDIO. */
export function fechaDelDia(n: number): Date {
  return new Date(instanteEstudio(desplazarFechaEstudio(INICIO, n - 1), 12))
}

/** Instante en que empieza el día `n` de la ventana, con el corte de las 3:00. */
export function inicioDelDiaMeta(n: number): number {
  return instanteEstudio(desplazarFechaEstudio(INICIO, n - 1), INICIO_DIA_HORA)
}

/** Qué día de la ventana es `ahora`: 1 el 25-sep, 60 el 23-nov; 0 o menos antes y más de 60 después. */
export function diaDeLaMeta(ahora: number): number {
  return numeroDiaEstudio(fechaEstudio(ahora, INICIO_DIA_HORA)) - numeroDiaEstudio(INICIO) + 1
}

/** Suma de los techos de los `n` primeros días de la ventana: nada el viernes, el doble el fin de semana. */
function techosAcumulados(n: number, campo: 'conceptos' | 'preguntas'): number {
  let suma = 0
  for (let k = 1; k <= Math.min(n, DIAS_META); k++) {
    const dia = diaSemanaEstudio(desplazarFechaEstudio(INICIO, k - 1))
    suma += TECHOS[dia === 5 ? 'vacio' : dia === 0 || dia === 6 ? 'finde' : 'semana'][campo]
  }
  return suma
}

/**
 * Dónde va la línea tras `cerrados` días de la ventana. Avanza con los techos de Hoy
 * y llega a la meta el último día. En conceptos deja una semana como supuesto de
 * planificación; el dominio real depende de los criterios. Una pregunta cuenta al responderla.
 */
export function lineaConceptos(cerrados: number): number {
  return META_CONCEPTOS * techosAcumulados(Math.max(0, Math.min(cerrados, DIAS_META)) - RETRASO_DOMINIO, 'conceptos')
    / techosAcumulados(DIAS_META - RETRASO_DOMINIO, 'conceptos')
}
export function lineaPreguntas(cerrados: number): number {
  return META_PREGUNTAS * techosAcumulados(Math.max(0, Math.min(cerrados, DIAS_META)), 'preguntas') / techosAcumulados(DIAS_META, 'preguntas')
}

export type Rumbo = 'delante' | 'linea' | 'debajo'

/**
 * Cómo va lo hecho respecto a la línea. Un margen de un 10 % —tres como poco— cuenta
 * como ir en la línea: un día flojo o un sábado aún por hacer no es ir detrás.
 */
export function rumboDe(hechos: number, linea: number): { rumbo: Rumbo; distancia: number } {
  const l = Math.round(linea)
  const margen = Math.max(3, Math.round(l * 0.1))
  const distancia = hechos - l
  if (distancia >= margen) return { rumbo: 'delante', distancia }
  if (distancia > -margen) return { rumbo: 'linea', distancia: 0 }
  return { rumbo: 'debajo', distancia: -distancia }
}

export interface SerieMeta {
  /** Hecho dentro de la ventana, hasta ahora. */
  hechos: number
  /** La meta; menor que la de partida sólo si no queda material para cumplirla. */
  meta: number
  /** Dónde va la línea al empezar hoy. */
  linea: number
  rumbo: Rumbo
  distancia: number
  /** Lo que habría el 23-nov siguiendo como la última semana; `null` hasta que haya ritmo que proyectar. */
  proyeccion: number | null
}

/** Cantidades exactas respecto a la marca visible, separadas del rumbo con margen. */
export function distanciasMeta(serie: Pick<SerieMeta, 'hechos' | 'linea' | 'meta'>) {
  const marca = Math.round(serie.linea)
  return { igualarLinea: Math.max(0, marca - serie.hechos), superarLinea: Math.max(0, marca + 1 - serie.hechos),
    completarMeta: Math.max(0, serie.meta - serie.hechos) }
}

function serie(marcasCrudas: number[], publicados: number, metaBase: number, linea: (n: number) => number, cerrados: number, ahora: number,
  primerasAcreditaciones: number[] = marcasCrudas): SerieMeta & { lineaDe: (n: number) => number } {
  const inicio = inicioDelDiaMeta(1)
  const conocida = (m: number) => Number.isFinite(m) && m > 0 && m <= ahora
  const marcas = marcasCrudas.filter(conocida)
  const previas = primerasAcreditaciones.filter(m => conocida(m) && m < inicio).length
  /** Hecho en la ventana antes del instante `fin`. */
  const hasta = (fin: number) => marcas.filter(m => m >= inicio && m < fin).length
  /** Hecho en la ventana tras `n` días cerrados. */
  const tras = (n: number) => hasta(inicioDelDiaMeta(n + 1))
  const disponibles = Math.max(0, publicados - previas)
  const meta = Math.min(metaBase, disponibles)
  const lineaDe = (n: number) => metaBase ? linea(n) * meta / metaBase : 0
  const hechos = hasta(Math.min(inicioDelDiaMeta(DIAS_META + 1), ahora + 1))
  const actual = lineaDe(cerrados)

  let proyeccion: number | null = null
  if (cerrados >= DIAS_PARA_PROYECTAR && cerrados < DIAS_META) {
    const avance = actual - lineaDe(cerrados - 7)
    if (avance > 0) {
      const alEmpezarHoy = tras(cerrados)
      const ritmo = (alEmpezarHoy - tras(cerrados - 7)) / avance
      proyeccion = Math.min(disponibles, Math.round(alEmpezarHoy + ritmo * (meta - actual)))
    }
  }
  return { hechos, meta, linea: Math.round(actual), ...rumboDe(hechos, actual), proyeccion, lineaDe }
}

export interface FilaMeta {
  semana: number
  /** Último día de la semana dentro de la ventana, en fecha local ISO. */
  hasta: string
  /** Dónde va la línea al terminar ese día. */
  conceptos: number
  preguntas: number
  actual: boolean
}

export interface ResumenMeta {
  /** Día de la ventana, como `diaDeLaMeta`. */
  dia: number
  conceptos: SerieMeta
  preguntas: SerieMeta
  filas: FilaMeta[]
  /** Semanas enteras entre el final de la ventana y el examen. */
  semanasConsolidacion: number
}

export interface EntradaMeta {
  ahora: number
  /** Cuándo quedó dominado por primera vez cada concepto publicado que hoy cumple los criterios. */
  dominadosEn: number[]
  /** Primeros hitos históricos validados de todos los IDs publicados, aunque hoy hayan perdido dominio. */
  primerasAcreditaciones?: number[]
  conceptosPublicados: number
  /** Primera respuesta de cada pregunta publicada que se ha respondido alguna vez. */
  primerasRespuestas: number[]
  preguntasPublicadas: number
}

export function resumenMeta(e: EntradaMeta): ResumenMeta {
  const dia = diaDeLaMeta(e.ahora)
  const cerrados = Math.min(Math.max(dia - 1, 0), DIAS_META)
  const { lineaDe: lineaC, ...conceptos } = serie(e.dominadosEn, e.conceptosPublicados, META_CONCEPTOS, lineaConceptos, cerrados, e.ahora, e.primerasAcreditaciones)
  const { lineaDe: lineaP, ...preguntas } = serie(e.primerasRespuestas, e.preguntasPublicadas, META_PREGUNTAS, lineaPreguntas, cerrados, e.ahora)

  // Una fila por semana de lunes a domingo; la última acaba el 23-nov, que es lunes.
  const filas: FilaMeta[] = []
  let desde = 1
  for (let k = 1; k <= DIAS_META; k++) {
    const fecha = desplazarFechaEstudio(INICIO, k - 1)
    if (diaSemanaEstudio(fecha) !== 0 && k !== DIAS_META) continue
    filas.push({
      semana: filas.length + 1, hasta: fechaISOEstudio(fecha),
      conceptos: Math.round(lineaC(k)), preguntas: Math.round(lineaP(k)),
      actual: dia >= desde && dia <= k,
    })
    desde = k + 1
  }

  const fin = desplazarFechaEstudio(INICIO, DIAS_META - 1)
  const semanasConsolidacion = Math.max(0, Math.floor((numeroDiaEstudio(partesEstudio(EXAMEN_MS)) - numeroDiaEstudio(fin)) / 7))
  return { dia, conceptos, preguntas, filas, semanasConsolidacion }
}

/** Primera respuesta de cada pregunta publicada y calificable; las que nunca se respondieron no salen. */
export function primerasRespuestasNbme(state: NbmeState, catalog: NbmeCatalog | null): { marcas: number[]; publicadas: number } {
  const publicadas = new Set((catalog?.questions ?? []).filter(q => q.status === 'ready').map(q => q.id))
  const primera = new Map<string, number>()
  for (const intento of Object.values(state.attempts)) {
    if (!publicadas.has(intento.questionId)) continue
    const previa = primera.get(intento.questionId)
    if (previa === undefined || intento.submittedAt < previa) primera.set(intento.questionId, intento.submittedAt)
  }
  return { marcas: [...primera.values()], publicadas: publicadas.size }
}
