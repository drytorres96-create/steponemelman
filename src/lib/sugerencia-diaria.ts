import { fechaEstudio, fechaISOEstudio } from './calendario-estudio'
import { tipoDeDia } from './dia'
import { MAXIMO_SUGERIDAS, type FichaInventario, type Senal } from './inventario'

/**
 * La sugerencia de recuperar es de las que se piden una sola vez: el techo lo fijó Yoel el
 * 17-oct-2026. Una por día de estudio, hasta cinco ítems, nunca los viernes, y sin acumular:
 * si hoy no la usa, mañana se vuelve a calcular desde su historial, no se arrastra.
 *
 * La lista del día se congela la primera vez que se muestra, para que no cambie bajo los
 * dedos mientras llegan datos; lo ya trabajado hoy se retira al mostrarla, no se repone.
 */

export interface ItemSugerido { tipo: 'concepto' | 'pregunta'; id: string; revision?: string; senales: Senal[] }
export type EstadoSugerencia = 'visible' | 'descartada' | 'usada'
export interface SugerenciaDelDia {
  v: 1
  /** Día de estudio (AAAA-MM-DD, de Nueva York, con el corte de las 3:00). */
  dia: string
  items: ItemSugerido[]
  estado: EstadoSugerencia
  /** Una frase de Claude con el hilo común; si no llegó, la tarjeta es completa sin ella. */
  hilo?: string
  /** Sólo se pide una vez al día, haya salido bien o no. */
  hiloIntentado?: boolean
}

export const diaDeEstudio = (ahora: number): string => fechaISOEstudio(fechaEstudio(ahora))
export const claveItem = (i: Pick<ItemSugerido, 'tipo' | 'id'>): string => `${i.tipo}:${i.id}`

const CLAVE = 'step1-sugerencia-recuperar:v1'
const clave = (usuario: string) => `${CLAVE}:${usuario || 'sin-cuenta'}`

const SENALES: ReadonlySet<string> = new Set<Senal>(['fallo_reciente', 'fallo_repetido', 'acierto_con_ayuda'])

/** Lo guardado se lee con desconfianza: cualquier cosa que no encaje se ignora. */
export function leerSugerencia(usuario: string): SugerenciaDelDia | null {
  try {
    const crudo = localStorage.getItem(clave(usuario))
    if (!crudo) return null
    const v = JSON.parse(crudo) as Partial<SugerenciaDelDia> | null
    if (!v || v.v !== 1 || typeof v.dia !== 'string' || !Array.isArray(v.items)
      || !['visible', 'descartada', 'usada'].includes(v.estado as string)) return null
    const items = v.items.filter((i): i is ItemSugerido => !!i && (i.tipo === 'concepto' || i.tipo === 'pregunta')
      && typeof i.id === 'string' && i.id.length > 0 && i.id.length <= 200
      && (i.revision === undefined || typeof i.revision === 'string')
      && Array.isArray(i.senales) && i.senales.every(s => SENALES.has(s))).slice(0, MAXIMO_SUGERIDAS)
    return { v: 1, dia: v.dia, items, estado: v.estado as EstadoSugerencia,
      ...(typeof v.hilo === 'string' && v.hilo.trim() ? { hilo: v.hilo.slice(0, 240) } : {}),
      ...(v.hiloIntentado === true ? { hiloIntentado: true } : {}) }
  } catch { return null }
}

export function guardarSugerencia(usuario: string, s: SugerenciaDelDia): void {
  try { localStorage.setItem(clave(usuario), JSON.stringify(s)) } catch { /* sin almacenamiento: la tarjeta de hoy se muestra y mañana se recalcula */ }
}

export interface DecisionSugerencia {
  /** Lo que se enseña, ya sin lo que se trabajó hoy; null si hoy no toca tarjeta. */
  mostrar: SugerenciaDelDia | null
  /** Lo que hay que persistir (la lista congelada del día), si cambió. */
  guardar: SugerenciaDelDia | null
}

/**
 * Qué hacer con la sugerencia del día.
 * - Viernes: nada, a propósito. No se congela ni se gasta.
 * - Sin el progreso de la cuenta ya sincronizado (`listo` falso): nada todavía; congelarla ahora
 *   se haría sobre una copia local a medias.
 * - Ya hay una guardada de hoy: se muestra sólo si sigue `visible`. Si la descartó o la usó, no vuelve.
 * - Si no hay guardada de hoy y hay candidatas: se congelan las primeras cinco y se muestran.
 * Al mostrar, sólo sobreviven los ítems que siguen siendo candidatos (no se hicieron hoy ni entraron en cajas).
 */
export function decidirSugerencia(e: { ahora: number; guardada: SugerenciaDelDia | null; candidatas: FichaInventario[]; listo: boolean }): DecisionSugerencia {
  const nada: DecisionSugerencia = { mostrar: null, guardar: null }
  if (tipoDeDia(e.ahora) === 'vacio') return nada
  const hoy = diaDeEstudio(e.ahora)
  const vigentes = new Set(e.candidatas.map(c => claveItem(c)))
  const filtrar = (s: SugerenciaDelDia): SugerenciaDelDia | null => {
    const items = s.items.filter(i => vigentes.has(claveItem(i)))
    return items.length ? { ...s, items } : null
  }
  if (e.guardada?.dia === hoy) return e.guardada.estado === 'visible' ? { mostrar: filtrar(e.guardada), guardar: null } : nada
  if (!e.listo || !e.candidatas.length) return nada
  const nueva: SugerenciaDelDia = { v: 1, dia: hoy, estado: 'visible',
    items: e.candidatas.slice(0, MAXIMO_SUGERIDAS).map(c => ({ tipo: c.tipo, id: c.id, ...(c.revision ? { revision: c.revision } : {}), senales: c.senales })) }
  return { mostrar: nueva, guardar: nueva }
}
