import { intentoCorrecto, type ProgresoConcepto } from '../srs/tipos'
import type { NbmeAttempt, NbmeState } from '../nbme/types'
import { isHiddenNbmeAttempt } from '../nbme/model'
import { conAyuda } from '../screens/sesion'
import { DIAS_ERROR_RECIENTE } from './plan-estudio'
import { inicioDelDia } from './dia'

/**
 * Inventario de lo que sigue frágil: concepto por concepto y pregunta por pregunta, qué dicen los
 * intentos guardados. Es una función pura sobre el historial que ya existe: no inventa un criterio
 * de dominio nuevo, reutiliza los de siempre (qué es un acierto, qué es ayuda, que un día de estudio
 * acaba a las 3:00 de Nueva York y que corregirse el mismo día del fallo no demuestra nada).
 *
 * No cuenta deuda. Una ficha sin señales no aparece, y una con señales se recalcula cada vez desde
 * el historial: lo que no se sugiere hoy no se apila para mañana.
 */

export type Senal = 'fallo_reciente' | 'fallo_repetido' | 'acierto_con_ayuda'
/** Cuánto pesa cada señal al ordenar. Un fallo de esta semana manda sobre uno antiguo. */
export const PESO_SENAL: Record<Senal, number> = { fallo_reciente: 3, fallo_repetido: 2, acierto_con_ayuda: 1 }
export const NOMBRE_SENAL: Record<Senal, string> = {
  fallo_reciente: 'Fallada esta semana',
  fallo_repetido: 'Fallada más de una vez',
  acierto_con_ayuda: 'Acertada con ayuda',
}
/** Cuántos días de estudio distintos y limpios hacen falta tras el último fallo para darlo por superado. */
export const DIAS_LIMPIOS_PARA_SUPERAR = 2

const DIA = 86_400_000

/** Lo único que importa de un intento para valorarlo: cuándo fue, si acertó y si hubo ayuda. */
export interface Evento { ts: number; ok: boolean; ayuda: boolean }

export interface FichaInventario {
  tipo: 'concepto' | 'pregunta'
  id: string
  /** Sólo las preguntas NBME: la revisión vigente con la que se abre. */
  revision?: string
  intentos: number
  fallos: number
  ultimoFallo: number | null
  ultimaVez: number
  senales: Senal[]
  /** Suma de pesos de sus señales; sirve para ordenar, no se muestra. */
  puntos: number
}

/** Una respuesta por revisar no acredita acierto ni fallo: se deja fuera, como en todo el planificador. */
export function eventosDeConcepto(p: ProgresoConcepto): Evento[] {
  return p.intentos.filter(i => i.resultado !== 'revision')
    .map(i => ({ ts: i.ts, ok: intentoCorrecto(i), ayuda: conAyuda(i) }))
}

/** Un envío en conflicto se conserva con cautela, igual que en la escalera de cajas: cuenta como fallo. */
export function eventosDePregunta(intentos: NbmeAttempt[]): Evento[] {
  return intentos.map(a => ({ ts: a.submittedAt, ok: a.correct && !a.conflict, ayuda: false }))
}

/**
 * Señales de un historial.
 * - fallo reciente: falló en los últimos 7 días y ningún día posterior lo acertó sin ayuda.
 * - fallo repetido: dos o más fallos y menos de dos días limpios desde el último.
 * - acierto con ayuda: lo último que hizo fue acertar con pistas, la fuente o la explicación delante.
 */
export function senalesDe(eventos: Evento[], ahora: number): Pick<FichaInventario, 'intentos' | 'fallos' | 'ultimoFallo' | 'ultimaVez' | 'senales' | 'puntos'> | null {
  const ev = eventos.filter(e => Number.isFinite(e.ts) && e.ts <= ahora).sort((a, b) => a.ts - b.ts)
  if (!ev.length) return null
  const fallos = ev.filter(e => !e.ok)
  const ultimoFallo = fallos.length ? fallos[fallos.length - 1].ts : null
  const diasLimpios = new Set<number>()
  if (ultimoFallo !== null) {
    const diaDelFallo = inicioDelDia(ultimoFallo)
    for (const e of ev) {
      if (e.ts <= ultimoFallo || !e.ok || e.ayuda) continue
      const dia = inicioDelDia(e.ts)
      if (dia > diaDelFallo) diasLimpios.add(dia)
    }
  }
  const senales: Senal[] = []
  if (ultimoFallo !== null && ultimoFallo >= ahora - DIAS_ERROR_RECIENTE * DIA && diasLimpios.size === 0) senales.push('fallo_reciente')
  if (fallos.length >= 2 && diasLimpios.size < DIAS_LIMPIOS_PARA_SUPERAR) senales.push('fallo_repetido')
  const ultimo = ev[ev.length - 1]
  if (ultimo.ok && ultimo.ayuda) senales.push('acierto_con_ayuda')
  return { intentos: ev.length, fallos: fallos.length, ultimoFallo, ultimaVez: ultimo.ts, senales,
    puntos: senales.reduce((suma, s) => suma + PESO_SENAL[s], 0) }
}

export interface EntradaInventario {
  progreso: Record<string, ProgresoConcepto>
  nbme: NbmeState
  conceptoDisponible: (id: string) => boolean
  /** La revisión con la que hoy se abre una pregunta, o null si el banco no la da por lista. */
  revisionDePregunta: (id: string) => string | null
  ahora: number
}

/** Fichas de todo lo que tiene alguna señal. El orden es el de prioridad: más peso, fallo más cercano. */
export function inventarioFragil(e: EntradaInventario): FichaInventario[] {
  const fichas: FichaInventario[] = []
  for (const p of Object.values(e.progreso)) {
    if (!e.conceptoDisponible(p.concept_id)) continue
    const s = senalesDe(eventosDeConcepto(p), e.ahora)
    if (s?.senales.length) fichas.push({ tipo: 'concepto', id: p.concept_id, ...s })
  }
  const porPregunta = new Map<string, NbmeAttempt[]>()
  for (const a of Object.values(e.nbme.attempts)) {
    if (isHiddenNbmeAttempt(e.nbme, a)) continue
    const lista = porPregunta.get(a.questionId)
    if (lista) lista.push(a)
    else porPregunta.set(a.questionId, [a])
  }
  for (const [id, intentos] of porPregunta) {
    const revision = e.revisionDePregunta(id)
    if (!revision) continue
    const s = senalesDe(eventosDePregunta(intentos), e.ahora)
    if (s?.senales.length) fichas.push({ tipo: 'pregunta', id, revision, ...s })
  }
  return fichas.sort((a, b) => b.puntos - a.puntos || (b.ultimoFallo ?? 0) - (a.ultimoFallo ?? 0)
    || b.ultimaVez - a.ultimaVez || a.id.localeCompare(b.id))
}

export interface EntradaSugerencia extends EntradaInventario {
  /** Lo que ya tiene sitio hoy en las cajas: se recupera allí, no se repite en la sugerencia. */
  enCajasHoy: ReadonlySet<string>
}

/** Techo de la tarjeta: lo decidió Yoel el 17-oct-2026. */
export const MAXIMO_SUGERIDAS = 5

/**
 * Lo que se sugiere hoy: hasta cinco fichas con señales que no están ya en las cajas del día
 * y que no se han tocado hoy. Las cajas que no caben por el techo del día sí entran aquí.
 */
export function sugerirRecuperar(e: EntradaSugerencia, maximo = MAXIMO_SUGERIDAS): FichaInventario[] {
  const desde = inicioDelDia(e.ahora)
  return inventarioFragil(e).filter(f => !e.enCajasHoy.has(`${f.tipo}:${f.id}`) && f.ultimaVez < desde).slice(0, Math.max(0, maximo))
}
