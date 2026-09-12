import { type Concepto, type Indice, type Modulo } from '../schema/concept'
import { supabase } from '../lib/supabase'
import { leer, escribir, clavesConPrefijo, borrar } from '../store/db'
import { validarIndicePublicado, validarModuloPublicado } from './integridad'

/**
 * Carga del corpus. Dos modos, misma interfaz:
 *  - build normal: datos privados desde Supabase, con membresía y sesión
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

/**
 * Obtiene un activo del corpus.
 *
 * Cuando se conoce la versión del corpus, la copia local es válida por
 * definición: un activo publicado nunca cambia dentro de la misma versión. Esa
 * copia se sirve sin volver a descargar el módulo, que es la mayor parte del
 * material. El índice, en cambio, se pide siempre: es lo que revela que hay una
 * versión nueva y, con ella, una clave de caché distinta.
 */
async function traer(ruta: string, version?: string): Promise<unknown> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Inicia sesión para abrir el material de estudio.')
  const path = ruta.replace(`${BASE}/`, '')
  const clave = version ? `corpus:${session.user.id}:${version}:${path}` : `corpus:${session.user.id}:${path}`
  if (version) {
    const local = await leer<unknown>(clave).catch(() => null)
    if (local) return local
  }
  const { data, error } = await supabase.from('corpus_assets').select('payload').eq('path', path).maybeSingle()
  if (!error && data) {
    // La caché es opcional: una cuota agotada no impide estudiar el material online.
    try { await escribir(clave, data.payload) } catch { /* Sin copia offline de este activo. */ }
    return data.payload
  }
  // An online denial must not be replaced with an old authorized response.
  if (!navigator.onLine) {
    const local = await leer<unknown>(clave).catch(() => null)
    if (local) return local
  }
  throw new Error(error ? 'No se pudo cargar el material. Revisa tu conexión e inténtalo de nuevo.' : 'Este material aún no está disponible para tu cuenta.')
}

/**
 * Descarta las copias locales de versiones anteriores del corpus. Se ejecuta
 * en segundo plano tras conocer la versión vigente; su fallo no afecta al estudio.
 */
async function limpiarVersionesAnteriores(userId: string, versionVigente: string): Promise<void> {
  const prefijo = `corpus:${userId}:`
  const claves = await clavesConPrefijo(prefijo)
  const actual = /^(\d+)\.(\d+)\.(\d+)$/.exec(versionVigente)?.slice(1).map(Number)
  if (!actual) return
  const obsoletas = claves.filter(clave => {
    // Only old, versioned modules belong to this cleanup. Keep the shared index,
    // migration map, quarantine and newer versions that another tab may need.
    const anterior = /^(\d+)\.(\d+)\.(\d+):modules\/[^/:]+\.json$/.exec(clave.slice(prefijo.length))
    if (!anterior) return false
    const version = anterior.slice(1).map(Number)
    const distinto = version.findIndex((n, i) => n !== actual[i])
    return distinto >= 0 && version[distinto] < actual[distinto]
  })
  if (obsoletas.length) await borrar(obsoletas)
}

export async function cargarIndice(): Promise<Indice> {
  if (indice) return indice
  if (indiceEnCurso) return indiceEnCurso
  indiceEnCurso = (async () => {
    const crudo = window.__CORPUS__ ? window.__CORPUS__.index : await traer(`${BASE}/index.json`)
    const cargado = validarIndicePublicado(crudo)
    cargado.modulos.sort((a, b) => a.orden - b.orden)
    indice = cargado
    // Al conocer la versión vigente se liberan las copias de versiones anteriores.
    if (!window.__CORPUS__) void supabase.auth.getSession()
      .then(({ data }) => data.session && limpiarVersionesAnteriores(data.session.user.id, cargado.corpus_version))
      .catch(() => undefined)
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
    const actual = await cargarIndice()
    const modulo = actual.modulos.find(m => m.module_id === module_id)
    if (!modulo) throw new Error('Este módulo no está disponible en la versión actual del material.')
    const crudo: any = window.__CORPUS__
      ? window.__CORPUS__.modules[module_id]
      : await traer(`${BASE}/modules/${module_id}.json`, actual.corpus_version)
    const conceptos = validarModuloPublicado(crudo, modulo, actual.corpus_version)
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
