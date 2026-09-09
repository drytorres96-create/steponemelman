import { nuevoProgreso, programar } from '../srs/fsrs'
import { CRITERIOS_POR_DEFECTO, calcularEstado, evaluarDominio, type CriteriosDominio } from '../srs/mastery'
import { intentoCorrecto, NOMBRE_ERROR, NOMBRE_ESTADO, type Intento, type ProgresoConcepto } from '../srs/tipos'

export const CORPUS_VERSION = '1.0.1' as const

export interface RegistroSesion {
  id: string
  inicio: number
  fin: number | null
  modulo: string
  ruta: string
  vistos: number
  correctos: number
  ms: number
}

export interface Reanudable {
  modulo: string
  sesion: string
  indice: number
  ts: number
  /** Orden exacto, incluidas las reinserciones, para no reconstruir una cola aleatoria. */
  conceptIds?: string[]
  titulo?: string
  subtitulo?: string
  sessionId?: string
}

export interface EstadoApp {
  version: 1
  corpus_version: typeof CORPUS_VERSION
  progreso: Record<string, ProgresoConcepto>
  sesiones: RegistroSesion[]
  criterios: CriteriosDominio
  reanudable: Reanudable | null
  msEstudio: number
  vistoAlguna: boolean
  /** Marcas de modificación; reanudable también conserva una marca al borrarse. */
  fieldUpdatedAt?: { criterios: number; reanudable: number }
}

export const ESTADO_INICIAL: EstadoApp = {
  version: 1,
  corpus_version: CORPUS_VERSION,
  progreso: {},
  sesiones: [],
  criterios: CRITERIOS_POR_DEFECTO,
  reanudable: null,
  msEstudio: 0,
  vistoAlguna: false,
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const numero = (v: unknown, minimo = 0): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= minimo && v <= Number.MAX_SAFE_INTEGER
const entero = (v: unknown, minimo = 0): v is number => numero(v, minimo) && Number.isInteger(v)
const texto = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 10_000
const idSeguro = (v: unknown): v is string => texto(v) && v.length <= 512
  && !['__proto__', 'constructor', 'prototype'].includes(v)
const fechaONull = (v: unknown): v is number | null => v === null || numero(v)

const ESTADOS = new Set(Object.keys(NOMBRE_ESTADO))
const ERRORES = new Set(Object.keys(NOMBRE_ERROR))
const RESULTADOS = new Set(['correcta', 'parcial', 'incorrecta', 'ortografia'])

function leerIntento(v: unknown): Intento | null {
  if (!esObjeto(v) || !numero(v.ts) || !entero(v.calificacion, 1) || v.calificacion > 4
      || !texto(v.interaccion) || typeof v.recuperacion_activa !== 'boolean'
      || !entero(v.pistas_usadas) || !numero(v.ms) || !ERRORES.has(String(v.tipo_error))
      || !(v.confianza_declarada === null || [1, 2, 3].includes(v.confianza_declarada as number))) return null
  if (v.attempt_id !== undefined && !idSeguro(v.attempt_id)) return null
  if (v.session_id !== undefined && v.session_id !== null && !idSeguro(v.session_id)) return null
  if (v.resultado !== undefined && !RESULTADOS.has(String(v.resultado))) return null
  return {
    ...(v.attempt_id !== undefined ? { attempt_id: v.attempt_id as string } : {}),
    ...(v.session_id !== undefined ? { session_id: v.session_id as string | null } : {}),
    ts: v.ts,
    calificacion: v.calificacion as 1 | 2 | 3 | 4,
    ...(v.resultado !== undefined ? { resultado: v.resultado as Intento['resultado'] } : {}),
    interaccion: v.interaccion,
    recuperacion_activa: v.recuperacion_activa,
    pistas_usadas: v.pistas_usadas,
    ms: v.ms,
    tipo_error: v.tipo_error as Intento['tipo_error'],
    confianza_declarada: v.confianza_declarada as Intento['confianza_declarada'],
  }
}

function leerProgreso(id: string, v: unknown): ProgresoConcepto | null {
  if (!esObjeto(v) || v.concept_id !== id || !ESTADOS.has(String(v.estado))
      || !numero(v.dificultad, 1) || v.dificultad > 10 || !numero(v.estabilidad)
      || !fechaONull(v.ultimo) || !fechaONull(v.proxima) || !fechaONull(v.dominado_en)
      || !Array.isArray(v.intentos) || v.intentos.length > 100_000 || !entero(v.aciertos) || !entero(v.fallos)) return null
  const intentos = v.intentos.map(leerIntento)
  if (intentos.some(i => i === null)) return null
  const validos = intentos as Intento[]
  const aciertos = validos.filter(intentoCorrecto).length
  if (v.aciertos !== aciertos || v.fallos !== validos.length - aciertos) return null
  if (validos.some((i, n) => n > 0 && i.ts < validos[n - 1].ts)) return null
  if (v.ultimo !== (validos.at(-1)?.ts ?? null)) return null
  return {
    concept_id: id,
    estado: v.estado as ProgresoConcepto['estado'],
    dificultad: v.dificultad,
    estabilidad: v.estabilidad,
    ultimo: v.ultimo,
    proxima: v.proxima,
    intentos: intentos as Intento[],
    aciertos: v.aciertos,
    fallos: v.fallos,
    dominado_en: v.dominado_en,
  }
}

function leerSesion(v: unknown): RegistroSesion | null {
  if (!esObjeto(v) || !idSeguro(v.id) || !numero(v.inicio) || !fechaONull(v.fin)
      || !texto(v.modulo) || !texto(v.ruta) || !entero(v.vistos)
      || !entero(v.correctos) || v.correctos > v.vistos || !numero(v.ms)
      || (v.fin !== null && v.fin < v.inicio)) return null
  return { id: v.id, inicio: v.inicio, fin: v.fin, modulo: v.modulo, ruta: v.ruta,
    vistos: v.vistos, correctos: v.correctos, ms: v.ms }
}

function leerCriterios(v: unknown): CriteriosDominio | null {
  if (!esObjeto(v) || !entero(v.recuperaciones, 1) || !entero(v.sesiones, 1)
      || !numero(v.separacionHoras) || typeof v.exigirSinPistas !== 'boolean'
      || typeof v.exigirRecuperacionActiva !== 'boolean' || !numero(v.ventanaConfusionDias)) return null
  return { recuperaciones: v.recuperaciones, sesiones: v.sesiones, separacionHoras: v.separacionHoras,
    exigirSinPistas: v.exigirSinPistas, exigirRecuperacionActiva: v.exigirRecuperacionActiva,
    ventanaConfusionDias: v.ventanaConfusionDias }
}

function leerReanudable(v: unknown): Reanudable | null | false {
  if (v === null || v === undefined) return null
  if (!esObjeto(v) || !texto(v.modulo) || !texto(v.sesion) || !entero(v.indice) || !numero(v.ts)) return false
  if (v.conceptIds !== undefined && (!Array.isArray(v.conceptIds) || !v.conceptIds.length
    || v.conceptIds.length > 100_000 || !v.conceptIds.every(idSeguro) || v.indice >= v.conceptIds.length)) return false
  if (v.titulo !== undefined && typeof v.titulo !== 'string') return false
  if (v.subtitulo !== undefined && typeof v.subtitulo !== 'string') return false
  if (v.sessionId !== undefined && !idSeguro(v.sessionId)) return false
  return {
    modulo: v.modulo,
    sesion: v.sesion,
    indice: v.indice,
    ts: v.ts,
    ...(v.conceptIds !== undefined ? { conceptIds: [...v.conceptIds] as string[] } : {}),
    ...(v.titulo !== undefined ? { titulo: v.titulo } : {}),
    ...(v.subtitulo !== undefined ? { subtitulo: v.subtitulo } : {}),
    ...(v.sessionId !== undefined ? { sessionId: v.sessionId } : {}),
  }
}

/** Lee tanto 1.0.0 como 1.0.1, pero nunca deja entrar estructuras parciales corruptas. */
export function leerEstadoDesconocido(v: unknown): EstadoApp | null {
  if (!esObjeto(v) || v.version !== 1 || !esObjeto(v.progreso)) return null
  if (v.corpus_version !== undefined && v.corpus_version !== '1.0.0' && v.corpus_version !== CORPUS_VERSION) return null

  const progreso: Record<string, ProgresoConcepto> = {}
  for (const [id, crudo] of Object.entries(v.progreso)) {
    if (!idSeguro(id)) return null
    const p = leerProgreso(id, crudo)
    if (!p) return null
    progreso[id] = p
  }

  const sesionesCrudas = v.sesiones === undefined ? [] : v.sesiones
  if (!Array.isArray(sesionesCrudas) || sesionesCrudas.length > 100_000) return null
  const sesiones = sesionesCrudas.map(leerSesion)
  if (sesiones.some(s => s === null)) return null

  const criterios = v.criterios === undefined ? CRITERIOS_POR_DEFECTO : leerCriterios(v.criterios)
  const reanudable = leerReanudable(v.reanudable)
  if (!criterios || reanudable === false) return null
  if (v.msEstudio !== undefined && !numero(v.msEstudio)) return null
  if (v.vistoAlguna !== undefined && typeof v.vistoAlguna !== 'boolean') return null
  if (v.fieldUpdatedAt !== undefined && (!esObjeto(v.fieldUpdatedAt)
    || !numero(v.fieldUpdatedAt.criterios) || !numero(v.fieldUpdatedAt.reanudable))) return null

  return {
    version: 1,
    corpus_version: CORPUS_VERSION,
    progreso,
    sesiones: sesiones as RegistroSesion[],
    criterios,
    reanudable,
    msEstudio: (v.msEstudio as number | undefined) ?? 0,
    vistoAlguna: (v.vistoAlguna as boolean | undefined) ?? Object.keys(progreso).length > 0,
    ...(esObjeto(v.fieldUpdatedAt) ? { fieldUpdatedAt: {
      criterios: v.fieldUpdatedAt.criterios as number, reanudable: v.fieldUpdatedAt.reanudable as number,
    } } : {}),
  }
}

/** Orden canónico independiente del dispositivo y del orden de claves JSON. */
export function serializarEstable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(serializarEstable).join(',')}]`
  if (esObjeto(v)) return `{${Object.keys(v).filter(k => v[k] !== undefined).sort()
    .map(k => `${JSON.stringify(k)}:${serializarEstable(v[k])}`).join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

function claveIntento(i: Intento): string {
  return i.attempt_id
    ? `id:${i.attempt_id}`
    : `legacy:${serializarEstable(i)}`
}

function unirProgreso(a: ProgresoConcepto, b: ProgresoConcepto, criterios: CriteriosDominio): ProgresoConcepto {
  const porId = new Map<string, Intento>()
  for (const i of [...a.intentos, ...b.intentos]) {
    const key = claveIntento(i)
    const anterior = porId.get(key)
    // Si un archivo contiene dos versiones de un UUID, ambos dispositivos eligen la misma.
    if (!anterior || serializarEstable(i) > serializarEstable(anterior)) porId.set(key, i)
  }
  const intentos = [...porId.values()].sort((x, y) => x.ts - y.ts
    || compararTexto(claveIntento(x), claveIntento(y)))
  let unido = nuevoProgreso(a.concept_id)
  for (const intento of intentos) {
    unido = programar(unido, intento, intento.ts)
    if (unido.dominado_en === null && evaluarDominio(unido, criterios, intento.ts).cumple) {
      unido = { ...unido, dominado_en: intento.ts }
    }
  }
  return { ...unido, estado: calcularEstado(unido, criterios, unido.ultimo ?? 0) }
}

const compararTexto = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

function marca(e: EstadoApp, campo: 'criterios' | 'reanudable'): number {
  return e.fieldUpdatedAt?.[campo] ?? (campo === 'reanudable' ? e.reanudable?.ts ?? 0 : 0)
}

function elegirCampo<K extends 'criterios' | 'reanudable'>(a: EstadoApp, b: EstadoApp, campo: K): EstadoApp[K] {
  const diferencia = marca(a, campo) - marca(b, campo)
  if (diferencia) return diferencia > 0 ? a[campo] : b[campo]
  // En empate exacto el borrado de la cola gana; no reaparece una sesión finalizada.
  if (campo === 'reanudable' && (a[campo] === null || b[campo] === null)) return null as EstadoApp[K]
  return serializarEstable(a[campo]) >= serializarEstable(b[campo]) ? a[campo] : b[campo]
}

/** Unión conmutativa: los intentos y sesiones se identifican, nunca se suman dos veces. */
export function combinarEstados(a: EstadoApp, b: EstadoApp): EstadoApp {
  const criterios = elegirCampo(a, b, 'criterios')
  const progreso: EstadoApp['progreso'] = {}
  const ids = [...new Set([...Object.keys(a.progreso), ...Object.keys(b.progreso)])].sort()
  for (const id of ids) progreso[id] = unirProgreso(a.progreso[id] ?? nuevoProgreso(id), b.progreso[id] ?? nuevoProgreso(id), criterios)
  const porSesion = new Map<string, RegistroSesion>()
  for (const s of [...a.sesiones, ...b.sesiones]) {
    const anterior = porSesion.get(s.id)
    if (!anterior) { porSesion.set(s.id, s); continue }
    const principal = serializarEstable(s) >= serializarEstable(anterior) ? s : anterior
    porSesion.set(s.id, { ...principal, inicio: Math.min(s.inicio, anterior.inicio),
      fin: s.fin === null && anterior.fin === null ? null : Math.max(s.fin ?? 0, anterior.fin ?? 0),
      vistos: Math.max(s.vistos, anterior.vistos), correctos: Math.max(s.correctos, anterior.correctos),
      ms: Math.max(s.ms, anterior.ms) })
  }
  const msIntentos = Object.values(progreso).reduce((total, p) => total + p.intentos.reduce((n, i) => n + i.ms, 0), 0)
  return { version: 1, corpus_version: CORPUS_VERSION, progreso,
    sesiones: [...porSesion.values()].sort((x, y) => x.inicio - y.inicio || compararTexto(x.id, y.id)),
    criterios, reanudable: elegirCampo(a, b, 'reanudable'),
    fieldUpdatedAt: { criterios: Math.max(marca(a, 'criterios'), marca(b, 'criterios')),
      reanudable: Math.max(marca(a, 'reanudable'), marca(b, 'reanudable')) },
    msEstudio: Math.max(a.msEstudio, b.msEstudio, msIntentos), vistoAlguna: a.vistoAlguna || b.vistoAlguna || ids.length > 0 }
}

/** Migra las claves y referencias de cola; si dos IDs convergen, fusiona su historial sin duplicar intentos. */
export function migrarConceptIds(estado: EstadoApp, mapa: Record<string, string>): EstadoApp {
  const progreso: Record<string, ProgresoConcepto> = {}
  for (const [idAnterior, p] of Object.entries(estado.progreso)) {
    const candidato = Object.hasOwn(mapa, idAnterior) ? mapa[idAnterior] : idAnterior
    const id = idSeguro(candidato) ? candidato : idAnterior
    const movido = { ...p, concept_id: id }
    progreso[id] = progreso[id] ? unirProgreso(progreso[id], movido, estado.criterios) : movido
  }
  const reanudable = estado.reanudable?.conceptIds
    ? { ...estado.reanudable, conceptIds: estado.reanudable.conceptIds.map(id => mapa[id] ?? id) }
    : estado.reanudable
  return { ...estado, corpus_version: CORPUS_VERSION, progreso, reanudable }
}

/** UUID v4 también en navegadores que todavía no exponen crypto.randomUUID(). */
export function crearUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
