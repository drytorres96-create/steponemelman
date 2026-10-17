import { z } from 'zod'
import { evaluarTexto, normalizar } from './normalize'

/**
 * Recuperación activa dentro del chat: ejercicios cortos, en español, que escribe Claude a
 * partir de la pregunta que acabas de responder.
 *
 * Los ejercicios NO se califican como intento ni tocan dominio, cajas ni repetición
 * espaciada: consolidan, no miden. Este módulo es el contrato común —el servidor valida con
 * él lo que devuelve el modelo y el cliente corrige con él lo que contestas— y no depende de
 * React ni del Worker.
 */

export const TIPOS_EJERCICIO = ['verdadero_falso', 'opcion_unica', 'seleccion_multiple', 'completar', 'ordenar', 'emparejar'] as const
export type TipoEjercicio = typeof TIPOS_EJERCICIO[number]

export const ETIQUETA_TIPO: Record<TipoEjercicio, string> = {
  verdadero_falso: 'Verdadero o falso',
  opcion_unica: 'Elige la respuesta correcta',
  seleccion_multiple: 'Selección múltiple',
  completar: 'Completa con la palabra clave',
  ordenar: 'Ordena los pasos',
  emparejar: 'Empareja',
}

export const MARCA_HUECO = '____'

/** `pista` orienta sin revelar la respuesta; si Claude no la escribe, el cliente deriva una del propio ejercicio. */
export type Ejercicio =
  | { tipo: 'verdadero_falso'; enunciado: string; verdadero: boolean; explicacion: string; pista?: string }
  | { tipo: 'opcion_unica'; enunciado: string; opciones: string[]; correcta: string; explicacion: string; pista?: string }
  | { tipo: 'seleccion_multiple'; enunciado: string; opciones: string[]; correctas: string[]; explicacion: string; pista?: string }
  | { tipo: 'completar'; enunciado: string; respuesta: string; aceptadas: string[]; explicacion: string; pista?: string }
  | { tipo: 'ordenar'; enunciado: string; pasos: string[]; explicacion: string; pista?: string }
  | { tipo: 'emparejar'; enunciado: string; pares: { izquierda: string; derecha: string }[]; explicacion: string; pista?: string }

const texto = (min: number, max: number) => z.string().transform(s => s.trim().normalize('NFC')).pipe(z.string().min(min).max(max))
const enunciado = texto(12, 420)
const explicacion = texto(12, 520)
// La pista es un adorno: si viene mal, se descarta la pista, no el ejercicio.
const pista = z.unknown().optional()
const opcion = texto(1, 170)

const EjercicioBrutoZ = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('verdadero_falso'), enunciado, verdadero: z.boolean(), explicacion, pista }),
  z.object({ tipo: z.literal('opcion_unica'), enunciado, opciones: z.array(opcion).min(3).max(6), correcta: opcion, explicacion, pista }),
  z.object({ tipo: z.literal('seleccion_multiple'), enunciado, opciones: z.array(opcion).min(4).max(7),
    correctas: z.array(opcion).min(2).max(5), explicacion, pista }),
  z.object({ tipo: z.literal('completar'), enunciado, respuesta: texto(1, 60), aceptadas: z.array(texto(1, 60)).max(8).default([]), explicacion, pista }),
  z.object({ tipo: z.literal('ordenar'), enunciado, pasos: z.array(opcion).min(3).max(6), explicacion, pista }),
  z.object({ tipo: z.literal('emparejar'), enunciado,
    pares: z.array(z.object({ izquierda: texto(1, 120), derecha: texto(1, 170) })).min(3).max(5), explicacion, pista }),
])

const clave = (s: string) => normalizar(s)
const todasDistintas = (lista: string[]) => new Set(lista.map(clave)).size === lista.length

/**
 * Valida un ejercicio y lo deja en su forma canónica, o devuelve null. No se corrige a
 * medias: un ejercicio con la clave mal puesta enseña lo contrario de lo que debe, así que
 * ante la duda se descarta y se queda con los que sí son coherentes.
 */
export function validarEjercicio(bruto: unknown): Ejercicio | null {
  const e = validarBase(bruto)
  if (!e) return null
  const { pista: bruta, ...resto } = e
  const limpia = limpiarPista(bruta, e as unknown as Ejercicio)
  return (limpia ? { ...resto, pista: limpia } : resto) as Ejercicio
}

/** Una pista útil orienta; si contiene la respuesta, o no es texto razonable, no se muestra. */
function limpiarPista(bruta: unknown, e: Ejercicio): string | undefined {
  if (typeof bruta !== 'string') return undefined
  const p = bruta.trim().normalize('NFC')
  if (p.length < 5 || p.length > 200) return undefined
  const secretos = e.tipo === 'completar' ? [e.respuesta, ...e.aceptadas]
    : e.tipo === 'opcion_unica' ? [e.correcta] : e.tipo === 'seleccion_multiple' ? e.correctas : []
  return secretos.some(x => clave(x).length > 3 && clave(p).includes(clave(x))) ? undefined : p
}

type EjercicioSinPista = Ejercicio extends infer E ? E extends Ejercicio ? Omit<E, 'pista'> & { pista?: unknown } : never : never

function validarBase(bruto: unknown): EjercicioSinPista | null {
  const leido = EjercicioBrutoZ.safeParse(bruto)
  if (!leido.success) return null
  const e = leido.data
  switch (e.tipo) {
    case 'verdadero_falso':
      return e
    case 'opcion_unica': {
      if (!todasDistintas(e.opciones)) return null
      const correcta = e.opciones.find(o => clave(o) === clave(e.correcta))
      return correcta ? { ...e, correcta } : null
    }
    case 'seleccion_multiple': {
      if (!todasDistintas(e.opciones) || !todasDistintas(e.correctas)) return null
      const correctas = e.correctas.map(c => e.opciones.find(o => clave(o) === clave(c)))
      if (correctas.some(c => c === undefined)) return null
      // Al menos una incorrecta, o la «selección» es marcarlo todo.
      if (correctas.length >= e.opciones.length) return null
      return { ...e, correctas: correctas as string[] }
    }
    case 'completar': {
      const huecos = e.enunciado.match(/_{3,}/g) ?? []
      if (huecos.length !== 1) return null
      if (e.respuesta.split(/\s+/).length > 5) return null
      const enunciadoNormal = e.enunciado.replace(/_{3,}/, MARCA_HUECO)
      // La palabra clave no puede estar ya escrita en el propio enunciado.
      if (clave(enunciadoNormal).includes(clave(e.respuesta)) && clave(e.respuesta).length > 3) return null
      // Variantes distintas de verdad: «PFK» y «pfk» son la misma para la corrección.
      const vistas = new Set([clave(e.respuesta)])
      const aceptadas = e.aceptadas.filter(a => {
        const k = clave(a)
        if (!k || vistas.has(k)) return false
        vistas.add(k)
        return true
      })
      return { ...e, enunciado: enunciadoNormal, aceptadas }
    }
    case 'ordenar':
      return todasDistintas(e.pasos) ? e : null
    case 'emparejar':
      return todasDistintas(e.pares.map(p => p.izquierda)) && todasDistintas(e.pares.map(p => p.derecha)) ? e : null
  }
}

export const MIN_EJERCICIOS = 3
export const MAX_EJERCICIOS = 8

/** Conserva los ejercicios válidos y distintos; null si no quedan los suficientes para una ronda. */
export function validarEjercicios(bruto: unknown): Ejercicio[] | null {
  const lista = (bruto as { ejercicios?: unknown } | null)?.ejercicios
  if (!Array.isArray(lista)) return null
  const vistos = new Set<string>()
  const validos: Ejercicio[] = []
  for (const item of lista.slice(0, MAX_EJERCICIOS + 4)) {
    const e = validarEjercicio(item)
    if (!e) continue
    const id = clave(e.enunciado)
    if (vistos.has(id)) continue
    vistos.add(id); validos.push(e)
  }
  return validos.length >= MIN_EJERCICIOS ? validos.slice(0, MAX_EJERCICIOS) : null
}

/** Texto del JSON que devuelve el modelo, aunque venga con cercas de código o prosa alrededor. */
export function extraerJSON(salida: string): unknown | null {
  const sinCercas = salida.replace(/```(?:json)?/gi, '')
  const inicio = sinCercas.indexOf('{')
  const fin = sinCercas.lastIndexOf('}')
  if (inicio < 0 || fin <= inicio) return null
  try { return JSON.parse(sinCercas.slice(inicio, fin + 1)) } catch { return null }
}

/** Mezcla estable: la misma semilla da el mismo orden, así un re-render no baraja las opciones. */
export function barajar<T>(lista: readonly T[], semilla: string): T[] {
  let h = 2166136261
  for (const c of semilla) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  const azar = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000 }
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/** Lo que contesta la persona: una forma por tipo, siempre serializable. */
export type Respuesta =
  | { tipo: 'verdadero_falso'; valor: boolean }
  | { tipo: 'opcion_unica'; valor: string }
  | { tipo: 'seleccion_multiple'; valor: string[] }
  | { tipo: 'completar'; valor: string }
  | { tipo: 'ordenar'; valor: string[] }
  | { tipo: 'emparejar'; valor: Record<string, string> }

export type ResultadoEjercicio = { correcta: boolean; aviso?: string }

/** Corrige sin red: la clave viaja con el ejercicio. */
export function corregir(e: Ejercicio, r: Respuesta): ResultadoEjercicio {
  if (e.tipo !== r.tipo) return { correcta: false }
  switch (e.tipo) {
    case 'verdadero_falso':
      return { correcta: r.tipo === 'verdadero_falso' && r.valor === e.verdadero }
    case 'opcion_unica':
      return { correcta: r.tipo === 'opcion_unica' && clave(r.valor) === clave(e.correcta) }
    case 'seleccion_multiple': {
      if (r.tipo !== 'seleccion_multiple') return { correcta: false }
      const elegidas = new Set(r.valor.map(clave))
      const esperadas = new Set(e.correctas.map(clave))
      return { correcta: elegidas.size === esperadas.size && [...esperadas].every(x => elegidas.has(x)) }
    }
    case 'completar': {
      if (r.tipo !== 'completar') return { correcta: false }
      const veredicto = evaluarTexto(r.valor, e.respuesta, e.aceptadas)
      if (veredicto === 'correcta') return { correcta: true }
      if (veredicto === 'ortografia') return { correcta: true, aviso: `Cuenta, pero se escribe «${e.respuesta}».` }
      return { correcta: false }
    }
    case 'ordenar':
      return { correcta: r.tipo === 'ordenar' && r.valor.length === e.pasos.length && r.valor.every((p, i) => clave(p) === clave(e.pasos[i])) }
    case 'emparejar': {
      if (r.tipo !== 'emparejar') return { correcta: false }
      return { correcta: e.pares.every(p => clave(r.valor[p.izquierda] ?? '') === clave(p.derecha)) }
    }
  }
}

/** La respuesta correcta en una línea, para enseñarla tras fallar. */
export function respuestaEsperada(e: Ejercicio): string {
  switch (e.tipo) {
    case 'verdadero_falso': return e.verdadero ? 'Verdadero' : 'Falso'
    case 'opcion_unica': return e.correcta
    case 'seleccion_multiple': return e.correctas.join(' · ')
    case 'completar': return e.respuesta
    case 'ordenar': return e.pasos.map((p, i) => `${i + 1}. ${p}`).join('  →  ')
    case 'emparejar': return e.pares.map(p => `${p.izquierda} ↔ ${p.derecha}`).join(' · ')
  }
}
