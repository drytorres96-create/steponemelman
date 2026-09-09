import { IndiceZ, ConceptoZ, type Concepto, type Indice, type Modulo } from '../schema/concept'
import { supabase } from '../lib/supabase'
import { leer, escribir } from '../store/db'

/**
 * Carga del corpus. Dos modos, misma interfaz:
 *  - build normal: los datos se sirven desde ./data (carga por módulos, bajo demanda)
 *  - build de un solo archivo: el corpus viaja incrustado en `window.__CORPUS__`
 */
declare global {
  interface Window {
    __CORPUS__?: { index: unknown; modules: Record<string, unknown>; quarantine: unknown; migrations?: unknown }
  }
}

const BASE = './data'
const cacheModulos = new Map<string, Concepto[]>()
const cargasEnCurso = new Map<string, Promise<Concepto[]>>()
let indice: Indice | null = null
let indiceEnCurso: Promise<Indice> | null = null
let cuarentena: any = null
let cuarentenaEnCurso: Promise<{ n: number; conceptos: any[] }> | null = null
let migraciones: Record<string, string> | null = null
let migracionesEnCurso: Promise<Record<string, string>> | null = null

async function traer(ruta: string): Promise<unknown> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Inicia sesión para abrir el material de estudio.')
  const path = ruta.replace(`${BASE}/`, '')
  const clave = `corpus:${session.user.id}:${path}`
  const { data, error } = await supabase.from('corpus_assets').select('payload').eq('path', path).maybeSingle()
  if (!error && data) {
    await escribir(clave, data.payload)
    return data.payload
  }
  if (!navigator.onLine) {
    const local = await leer<unknown>(clave)
    if (local) return local
  }
  throw new Error(error ? 'No se pudo cargar el material. Revisa tu conexión e inténtalo de nuevo.' : 'Este material aún no está disponible para tu cuenta.')
}

export async function cargarIndice(): Promise<Indice> {
  if (indice) return indice
  if (indiceEnCurso) return indiceEnCurso
  indiceEnCurso = (async () => {
    const crudo = window.__CORPUS__ ? window.__CORPUS__.index : await traer(`${BASE}/index.json`)
    const cargado = IndiceZ.parse(crudo)
    cargado.modulos.sort((a, b) => a.orden - b.orden)
    indice = cargado
    return cargado
  })()
  try { return await indiceEnCurso } finally { indiceEnCurso = null }
}

export async function cargarModulo(module_id: string): Promise<Concepto[]> {
  const hit = cacheModulos.get(module_id)
  if (hit) return hit
  const pendiente = cargasEnCurso.get(module_id)
  if (pendiente) return pendiente
  const carga = (async () => {
    const crudo: any = window.__CORPUS__
      ? window.__CORPUS__.modules[module_id]
      : await traer(`${BASE}/modules/${module_id}.json`)
    if (!crudo || typeof crudo !== 'object') throw new Error(`El módulo ${module_id} no está disponible`)
    const conceptos: Concepto[] = []
    const rechazados: string[] = []
    for (const c of crudo.conceptos ?? []) {
      const res = ConceptoZ.safeParse(c)
      if (res.success) conceptos.push(res.data)
      else rechazados.push(c?.concept_id ?? '?')
    }
    if (rechazados.length) console.warn(`[corpus] ${module_id}: ${rechazados.length} conceptos no validan el esquema`, rechazados.slice(0, 5))
    cacheModulos.set(module_id, conceptos)
    return conceptos
  })()
  cargasEnCurso.set(module_id, carga)
  try { return await carga } finally { cargasEnCurso.delete(module_id) }
}

/** Carga los módulos necesarios y devuelve un mapa concept_id → concepto. */
export async function cargarConceptos(ids: string[], modulos: Modulo[]): Promise<Map<string, Concepto>> {
  const necesarios = new Set<string>()
  const setIds = new Set(ids)
  for (const m of modulos) {
    if (m.sesiones.some(s => s.conceptos.some(id => setIds.has(id)))) necesarios.add(m.module_id)
  }
  const mapa = new Map<string, Concepto>()
  const cargados = await Promise.all([...necesarios].map(cargarModulo))
  for (const conceptos of cargados) for (const c of conceptos) if (setIds.has(c.concept_id)) mapa.set(c.concept_id, c)
  return mapa
}

export async function cargarTodo(modulos: Modulo[]): Promise<Concepto[]> {
  return (await Promise.all(modulos.map(m => cargarModulo(m.module_id)))).flat()
}

export async function cargarCuarentena(): Promise<{ n: number; conceptos: any[] }> {
  if (cuarentena) return cuarentena
  if (cuarentenaEnCurso) return cuarentenaEnCurso
  cuarentenaEnCurso = (async () => {
    cuarentena = (window.__CORPUS__ ? window.__CORPUS__.quarantine : await traer(`${BASE}/quarantine.json`)) as any
    return cuarentena
  })()
  try { return await cuarentenaEnCurso } finally { cuarentenaEnCurso = null }
}

/** Mapa versionado old_id → current_id, disponible también en el HTML autónomo. */
export async function cargarMigraciones(): Promise<Record<string, string>> {
  if (migraciones) return migraciones
  if (migracionesEnCurso) return migracionesEnCurso
  migracionesEnCurso = (async () => {
    const crudo = (window.__CORPUS__?.migrations ?? await traer(`${BASE}/concept-id-migrations.json`)) as any
    if (!crudo || crudo.from_corpus_version !== '1.0.0' || crudo.to_corpus_version !== '1.0.1'
        || !crudo.map || typeof crudo.map !== 'object' || Array.isArray(crudo.map))
      throw new Error('El mapa de migración de concept_id no es válido')
    for (const [anterior, actual] of Object.entries(crudo.map))
      if (!anterior || typeof actual !== 'string' || !actual) throw new Error('El mapa de migración contiene IDs inválidos')
    const cargadas = { ...crudo.map } as Record<string, string>
    migraciones = cargadas
    return cargadas
  })()
  try { return await migracionesEnCurso } finally { migracionesEnCurso = null }
}

export function conceptosDeModulo(m: Modulo): string[] {
  return m.sesiones.flatMap(s => s.conceptos)
}
