import type { Concepto } from '../schema/concept'
import { estaVencido, prioridad } from '../srs/fsrs'
import { intentoCorrecto, type Intento, type ProgresoConcepto } from '../srs/tipos'

export const LIMITES_PLAN = [5, 10, 20] as const
export const DIAS_ERROR_RECIENTE = 7
const SEMANA = DIAS_ERROR_RECIENTE * 86_400_000

type Progreso = Record<string, ProgresoConcepto>

/** La sincronización puede traer intentos en otro orden: manda su fecha, no su posición. */
export function ultimoIntento(p?: ProgresoConcepto): Intento | undefined {
  return p?.intentos.reduce<Intento | undefined>((ultimo, intento) =>
    !ultimo || intento.ts >= ultimo.ts ? intento : ultimo, undefined)
}

/** Una respuesta pendiente de revisión no acredita un acierto ni un fallo nuevo. */
export function ultimoIntentoResuelto(p?: ProgresoConcepto): Intento | undefined {
  return p?.intentos.reduce<Intento | undefined>((ultimo, intento) =>
    intento.resultado !== 'revision' && (!ultimo || intento.ts >= ultimo.ts) ? intento : ultimo, undefined)
}

export function limiteValido(limite: number): number {
  return Number.isFinite(limite) ? Math.max(0, Math.floor(limite)) : 0
}

export function conceptosUnicos(conceptos: Concepto[]): Concepto[] {
  return [...new Map(conceptos.map(c => [c.concept_id, c])).values()]
}

/** Orden editorial inicial; no presupone un grafo de prerrequisitos ni bloquea otros temas. */
export function ordenarFundamentos(conceptos: Concepto[]): Concepto[] {
  const nivel = (c: Concepto): number => {
    switch (c.clasificacion.tipo_conocimiento) {
      case 'Definición': case 'Terminología': case 'Relación estructura-función': return 0
      case 'Mecanismo': case 'Relación causa-efecto': case 'Secuencia': return 1
      case 'Comparación': case 'Asociación': case 'Dato cuantitativo': return 2
      default: return 3
    }
  }
  return [...conceptos].sort((a, b) => nivel(a) - nivel(b)
    || a.clasificacion.dificultad - b.clasificacion.dificultad)
}

export function conceptosVencidos(conceptos: Concepto[], progreso: Progreso, ahora = Date.now()): Concepto[] {
  return conceptosUnicos(conceptos).filter(c => progreso[c.concept_id]?.intentos.length
    && estaVencido(progreso[c.concept_id], ahora))
    .sort((a, b) => prioridad(progreso[b.concept_id], ahora) - prioridad(progreso[a.concept_id], ahora))
}

/** Un fallo histórico deja de ser motivo de prioridad cuando el último intento es correcto. */
export function erroresRecientesPendientes(conceptos: Concepto[], progreso: Progreso, ahora = Date.now()): Concepto[] {
  return conceptosUnicos(conceptos).filter(c => {
    const i = ultimoIntentoResuelto(progreso[c.concept_id])
    return i && !intentoCorrecto(i) && i.ts <= ahora && i.ts >= ahora - SEMANA
  }).sort((a, b) => {
    const ai = ultimoIntentoResuelto(progreso[a.concept_id])!, bi = ultimoIntentoResuelto(progreso[b.concept_id])!
    return Number(bi.tipo_error === 'incorrecta_exceso_confianza') - Number(ai.tipo_error === 'incorrecta_exceso_confianza')
      || bi.ts - ai.ts
  })
}

export interface PlanDiario {
  conceptos: Concepto[]
  limite: number
  vencidos: number
  errores: number
  nuevos: number
  hayRepasoAcumulado: boolean
  /** true cuando el tope de repaso dejó fuera vencidos para reservar plazas a material nuevo. */
  repasoLimitado: boolean
  explicacion: string
}

/**
 * Proporción máxima del plan que puede ocupar el repaso cuando hay material nuevo disponible.
 * Un plan que un lunes amanece siendo 100 % atraso no se abre, y lo que falla hoy vuelve a vencer
 * mañana, así que sin tope la cola crece sola y expulsa todo lo nuevo. El tope no borra nada: los
 * vencidos que no entran hoy siguen ahí y recuperan las plazas que el material nuevo no llene.
 */
export const TOPE_REPASO = 0.7

/**
 * Selección global y determinista, compartida por la vista previa y el reproductor.
 * Cada revisión ocupa una plaza: al acumularse repaso disminuyen los conceptos nuevos.
 * Si todo lo visto está al día y no quedan nuevos, la sesión puede quedar vacía.
 */
export function construirPlanDiario(conceptos: Concepto[], progreso: Progreso, limite: number, ahora = Date.now()): PlanDiario {
  const maximo = limiteValido(limite)
  const base = conceptosUnicos(conceptos)
  const vencidos = conceptosVencidos(base, progreso, ahora)
  const idsVencidos = new Set(vencidos.map(c => c.concept_id))
  const errores = erroresRecientesPendientes(base, progreso, ahora).filter(c => !idsVencidos.has(c.concept_id))
  const nuevos = ordenarFundamentos(base.filter(c => !progreso[c.concept_id]?.intentos.length))
  const repaso = [...vencidos, ...errores]
  const plazasRepaso = nuevos.length
    ? Math.min(repaso.length, Math.max(1, Math.round(maximo * TOPE_REPASO)))
    : maximo
  const elegidos = [...repaso.slice(0, plazasRepaso), ...nuevos].slice(0, maximo)
  // Si no hay suficientes conceptos nuevos, el repaso recupera las plazas libres.
  const libres = maximo - elegidos.length
  const lista = libres > 0 ? [...elegidos, ...repaso.slice(plazasRepaso, plazasRepaso + libres)] : elegidos
  // Cierto sólo cuando el TOPE dejó vencidos fuera, no cuando simplemente no caben en el límite.
  const repasoLimitado = nuevos.length > 0 && repaso.length > plazasRepaso
  const idsErrores = new Set(errores.map(c => c.concept_id))
  const nVencidos = lista.filter(c => idsVencidos.has(c.concept_id)).length
  const nErrores = lista.filter(c => idsErrores.has(c.concept_id)).length
  const nNuevos = lista.length - nVencidos - nErrores
  const hayRepasoAcumulado = maximo > 0 && vencidos.length >= Math.ceil(maximo / 2)
  return {
    conceptos: lista, limite: maximo, vencidos: nVencidos, errores: nErrores, nuevos: nNuevos,
    hayRepasoAcumulado, repasoLimitado,
    explicacion: !lista.length ? 'Ahora no hay repasos pendientes ni conceptos nuevos para esta selección.'
      : `Hasta ${maximo} conceptos: primero repasos vencidos, después errores del último intento en los últimos ${DIAS_ERROR_RECIENTE} días y, si quedan plazas, conceptos nuevos. ${repasoLimitado ? `El repaso ocupa como máximo ${Math.round(TOPE_REPASO * 100)} % del plan para que siempre entre material nuevo; el resto espera su turno. ` : ''}Los nuevos empiezan por fundamentos; puedes elegir otra ruta.`,
  }
}
