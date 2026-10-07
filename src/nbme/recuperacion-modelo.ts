/** Práctica de recuperación aislada: nunca califica el corpus ni reescribe intentos NBME. */
export type TipoEjercicioRecuperacion = 'completar' | 'verdadero_falso' | 'seleccion' | 'discriminar'
export interface EjercicioRecuperacion {
  id: string
  tipo: TipoEjercicioRecuperacion
  pregunta: string
  respuesta: string
  alternativas?: string[]
  explicacion: string
  evidencia: string
  conceptoId?: string
  source?: { title: string; page: number; conceptId?: string }
}
export interface ContenidoRecuperacion {
  objetivo: string
  ejercicios: EjercicioRecuperacion[]
  source?: { title: string; page: number }
  cached?: boolean
}
export interface OrigenRecuperacion { qid: string; revision: string; optionId: string; attemptId?: string }
export interface RespuestaRecuperacion { ejercicioId: string; respuesta: string; correcta: boolean }
export interface RecuperacionGuardada {
  version: 1
  evaluadorVersion: 1
  ownerId: string
  origen: OrigenRecuperacion
  contenido: ContenidoRecuperacion
  cursor: number
  respuestas: RespuestaRecuperacion[]
  borrador: string
  cerrada: boolean
  actualizadaEn: number
}

const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const texto = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max
const identificador = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(v)
const normalizar = (v: string) => v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
const tipos = new Set<TipoEjercicioRecuperacion>(['completar', 'verdadero_falso', 'seleccion', 'discriminar'])

export function esOrigenRecuperacion(v: unknown): v is OrigenRecuperacion {
  return objeto(v) && identificador(v.qid) && identificador(v.revision)
    && typeof v.optionId === 'string' && /^[A-Z]{1,2}$/.test(v.optionId)
    && (v.attemptId === undefined || identificador(v.attemptId))
}

/** La respuesta de red y la copia local atraviesan la misma validación estricta. */
export function esContenidoRecuperacion(v: unknown): v is ContenidoRecuperacion {
  if (!objeto(v) || !texto(v.objetivo, 350) || !Array.isArray(v.ejercicios)
    || v.ejercicios.length < 3 || v.ejercicios.length > 6
    || (v.source !== undefined && (!objeto(v.source) || !texto(v.source.title, 300) || !Number.isInteger(v.source.page) || (v.source.page as number) < 1))
    || (v.cached !== undefined && typeof v.cached !== 'boolean')) return false
  const vistos = new Set<string>()
  const valido = v.ejercicios.every(e => {
    if (!objeto(e) || !identificador(e.id) || vistos.has(e.id) || !tipos.has(e.tipo as TipoEjercicioRecuperacion)
      || !texto(e.pregunta, 500) || !texto(e.respuesta, 120) || !texto(e.explicacion, 900) || !texto(e.evidencia, 2000)
      || (e.conceptoId !== undefined && !identificador(e.conceptoId))
      || (e.source !== undefined && (!objeto(e.source) || !texto(e.source.title, 300)
        || !Number.isInteger(e.source.page) || (e.source.page as number) < 1
        || (e.source.conceptId !== undefined && !identificador(e.source.conceptId))))) return false
    vistos.add(e.id)
    if (e.tipo === 'completar') return e.respuesta.trim().split(/\s+/).length <= 6 && e.respuesta.length <= 65 && e.alternativas === undefined
    if (e.tipo === 'verdadero_falso') return ['Verdadero', 'Falso'].includes(e.respuesta) && e.alternativas === undefined
    if (!Array.isArray(e.alternativas) || e.alternativas.length < (e.tipo === 'seleccion' ? 3 : 2) || e.alternativas.length > 8
      || !e.alternativas.every(a => texto(a, 180))) return false
    const alternativas = e.alternativas as string[]
    return new Set(alternativas.map(normalizar)).size === alternativas.length && alternativas.includes(e.respuesta)
  })
  return valido && new Set(v.ejercicios.map(e => e.tipo)).size >= 2
}

export function evaluarRecuperacion(ejercicio: EjercicioRecuperacion, respuesta: string): boolean {
  return normalizar(respuesta) === normalizar(ejercicio.respuesta)
}

export function claveRecuperacion(ownerId: string, origen: OrigenRecuperacion): string | null {
  if (!identificador(ownerId) || !esOrigenRecuperacion(origen)) return null
  return `step1-recuperacion-nbme:v1:${[ownerId, origen.qid, origen.revision, origen.optionId, origen.attemptId ?? 'sin-intento'].map(encodeURIComponent).join(':')}`
}

const mismoOrigen = (a: OrigenRecuperacion, b: OrigenRecuperacion) => a.qid === b.qid && a.revision === b.revision
  && a.optionId === b.optionId && a.attemptId === b.attemptId

export function esRecuperacionGuardada(v: unknown, ownerId: string, origen: OrigenRecuperacion): v is RecuperacionGuardada {
  if (!objeto(v) || v.version !== 1 || v.evaluadorVersion !== 1 || v.ownerId !== ownerId
    || !esOrigenRecuperacion(v.origen) || !mismoOrigen(v.origen, origen) || !esContenidoRecuperacion(v.contenido)
    || !Number.isInteger(v.cursor) || (v.cursor as number) < 0 || (v.cursor as number) > v.contenido.ejercicios.length
    || typeof v.borrador !== 'string' || v.borrador.length > 180 || !Array.isArray(v.respuestas)
    || typeof v.cerrada !== 'boolean' || typeof v.actualizadaEn !== 'number' || !Number.isFinite(v.actualizadaEn)
    || v.actualizadaEn < 0 || v.respuestas.length > v.contenido.ejercicios.length) return false
  const cursor = v.cursor as number
  if (v.cerrada !== (cursor === v.contenido.ejercicios.length)
    || (v.respuestas.length !== cursor && v.respuestas.length !== cursor + 1)
    || (v.cerrada && (v.respuestas.length !== cursor || v.borrador !== ''))) return false
  const actual = v.contenido.ejercicios[cursor]
  if (actual && actual.tipo !== 'completar' && v.borrador !== '' && !(actual.tipo === 'verdadero_falso'
    ? ['Verdadero', 'Falso'].includes(v.borrador) : actual.alternativas?.includes(v.borrador))) return false
  if (v.respuestas.length > cursor && (!objeto(v.respuestas[cursor]) || v.respuestas[cursor].respuesta !== v.borrador)) return false
  const contenido = v.contenido
  return v.respuestas.every((r, i) => {
    const ejercicio = contenido.ejercicios[i]
    return objeto(r) && r.ejercicioId === ejercicio.id && texto(r.respuesta, 180) && typeof r.correcta === 'boolean'
      && r.correcta === evaluarRecuperacion(ejercicio, r.respuesta)
      && (ejercicio.tipo === 'completar' || (ejercicio.tipo === 'verdadero_falso'
        ? ['Verdadero', 'Falso'].includes(r.respuesta) : ejercicio.alternativas?.includes(r.respuesta)))
  })
}

export function crearRecuperacion(ownerId: string, origen: OrigenRecuperacion, contenido: ContenidoRecuperacion, ahora = Date.now()): RecuperacionGuardada {
  const sesion: RecuperacionGuardada = { version: 1, evaluadorVersion: 1, ownerId, origen: { ...origen }, contenido,
    cursor: 0, respuestas: [], borrador: '', cerrada: false, actualizadaEn: ahora }
  if (!claveRecuperacion(ownerId, origen) || !esRecuperacionGuardada(sesion, ownerId, origen)) throw new Error('Recuperación no válida.')
  return sesion
}

export function responderRecuperacion(sesion: RecuperacionGuardada, respuesta: string, ahora = Date.now()): RecuperacionGuardada {
  if (sesion.cerrada || sesion.respuestas.length > sesion.cursor || !texto(respuesta, 180)) return sesion
  const ejercicio = sesion.contenido.ejercicios[sesion.cursor]
  if (ejercicio.tipo !== 'completar' && !(ejercicio.tipo === 'verdadero_falso'
    ? ['Verdadero', 'Falso'].includes(respuesta) : ejercicio.alternativas?.includes(respuesta))) return sesion
  return { ...sesion, borrador: respuesta, actualizadaEn: ahora,
    respuestas: [...sesion.respuestas, { ejercicioId: ejercicio.id, respuesta, correcta: evaluarRecuperacion(ejercicio, respuesta) }] }
}

export function avanzarRecuperacion(sesion: RecuperacionGuardada, ahora = Date.now()): RecuperacionGuardada {
  if (sesion.cerrada || sesion.respuestas.length <= sesion.cursor) return sesion
  const cursor = sesion.cursor + 1
  return { ...sesion, cursor, borrador: '', cerrada: cursor === sesion.contenido.ejercicios.length, actualizadaEn: ahora }
}

export type LecturaRecuperacion = { estado: 'ok'; sesion: RecuperacionGuardada } | { estado: 'vacio' | 'invalido' | 'sin_almacenamiento' }
type AlmacenRecuperacion = Pick<Storage, 'getItem' | 'setItem'>
export function leerRecuperacion(ownerId: string, origen: OrigenRecuperacion, almacen?: AlmacenRecuperacion): LecturaRecuperacion {
  const clave = claveRecuperacion(ownerId, origen)
  if (!clave) return { estado: 'invalido' }
  try {
    const raw = (almacen ?? localStorage).getItem(clave)
    if (raw === null) return { estado: 'vacio' }
    if (raw.length > 80_000) return { estado: 'invalido' }
    let v: unknown
    try { v = JSON.parse(raw) } catch { return { estado: 'invalido' } }
    return esRecuperacionGuardada(v, ownerId, origen) ? { estado: 'ok', sesion: v } : { estado: 'invalido' }
  } catch { return { estado: 'sin_almacenamiento' } }
}

export function guardarRecuperacion(sesion: RecuperacionGuardada, almacen?: AlmacenRecuperacion): boolean {
  const clave = claveRecuperacion(sesion.ownerId, sesion.origen)
  if (!clave || !esRecuperacionGuardada(sesion, sesion.ownerId, sesion.origen)) return false
  try {
    const destino = almacen ?? localStorage
    const lectura = leerRecuperacion(sesion.ownerId, sesion.origen, destino)
    if (lectura.estado === 'sin_almacenamiento') return false
    if (lectura.estado === 'ok' && mismaPractica(lectura.sesion.contenido, sesion.contenido)) {
      const previa = lectura.sesion
      // Una pestaña antigua puede seguir abierta después de avanzar/cerrar en otra.
      // Conserva el avance y cada respuesta comprobada; no promete guardar su copia obsoleta.
      if (previa.cursor > sesion.cursor || previa.respuestas.length > sesion.respuestas.length
        || (previa.cerrada && !sesion.cerrada) || previa.respuestas.some((r, i) => {
          const nueva = sesion.respuestas[i]
          return !nueva || r.ejercicioId !== nueva.ejercicioId || r.respuesta !== nueva.respuesta || r.correcta !== nueva.correcta
        })) return false
    }
    destino.setItem(clave, JSON.stringify(sesion)); return true
  } catch { return false }
}

/** cached y el orden de propiedades del JSON no convierten una práctica en otra. */
function mismaPractica(a: ContenidoRecuperacion, b: ContenidoRecuperacion): boolean {
  const firma = (c: ContenidoRecuperacion) => JSON.stringify([c.objetivo, c.ejercicios.map(e => [
    e.id, e.tipo, e.pregunta, e.respuesta, e.alternativas ?? null, e.explicacion, e.evidencia,
    e.source ? [e.source.title, e.source.page, e.source.conceptId ?? null] : null,
  ])])
  return firma(a) === firma(b)
}
