import { z } from 'zod'
import { DISCIPLINAS, SISTEMAS } from '../schema/concept'

/**
 * Lo que el navegador puede decirle a las ayudas de sesión de Claude (`/api/ia/sesion`).
 * Sólo viajan identificadores, etiquetas cortas del propio ítem y lo que la persona escribe;
 * nunca texto de preguntas NBME ni enunciados del corpus.
 *
 * Fases:
 * - `hilo`: una frase con el hilo común de las sugeridas del día.
 * - `entender`: interpreta lo que la persona pide y, si falta algo que cambia la sesión, hace una pregunta con opciones.
 * - `lecturas`: qué preguntas NBME aún no tienen ficha de lectura (no llama a Claude).
 * - `leer`: Claude lee preguntas NBME una por una con el material que autoriza el servidor y guarda su ficha.
 * - `revisar`: Claude lee las fichas de las candidatas y deja las que encajan con lo pedido, con el tema que cubren.
 */

export const SENALES_INVENTARIO = ['fallo_reciente', 'fallo_repetido', 'acierto_con_ayuda'] as const

export const MAX_ETIQUETA = 160

/** Qué fuente de ejercicios se pide. */
export const FUENTES_SESION = ['conceptos', 'nbme', 'mixto'] as const
export type FuenteSesion = (typeof FUENTES_SESION)[number]

/**
 * Estados de un concepto o pregunta según su historial. Los calcula la plataforma, no la IA:
 * - falladas: alguna vez falladas.
 * - falladas_sin_recuperar: falladas y sin un acierto limpio en un día de estudio posterior al último fallo.
 * - por_repasar: frágiles (fallo reciente, fallo repetido o acierto con ayuda) o con el repaso ya vencido.
 * - mas_trabajo: las que más fallos y ayuda acumulan.
 * - acertadas: la última vez se acertaron.
 * - acertadas_primera: se acertaron al primer intento y sin ayuda.
 * - nuevas: nunca vistas.
 * - dominadas: con el dominio demostrado (conceptos) o con la escalera de cajas cerrada (preguntas).
 */
export const ESTADOS_SESION = ['falladas', 'falladas_sin_recuperar', 'por_repasar', 'mas_trabajo', 'acertadas', 'acertadas_primera', 'nuevas', 'dominadas'] as const
export type EstadoSesion = (typeof ESTADOS_SESION)[number]

export const MINUTOS_SESION = [5, 10, 20, 30] as const
export type MinutosSesion = (typeof MINUTOS_SESION)[number]
export const MINUTOS_PREDETERMINADOS: MinutosSesion = 10

export const MAX_PEDIDO = 300
export const MAX_ETIQUETA_REVISION = 160
/** Candidatas por llamada de selección: las fichas son cortas y Opus las lee una a una. */
export const MAX_ITEMS_REVISION = 300
/** Preguntas NBME que Claude lee en una sola llamada: el material de cada una es largo. */
export const MAX_ITEMS_LECTURA = 20
/** Cuántas referencias admite la consulta de fichas pendientes: el banco entero cabe. */
export const MAX_REFS_LECTURAS = 800
/** Tope de ítems que se pueden pedir por número en una sesión. */
export const MAX_CANTIDAD_SESION = 60
/** Cuántas preguntas de seguimiento hace Claude como mucho antes de armar la consulta. */
export const MAX_PREGUNTAS_SEGUIMIENTO = 2
export const MAX_TURNOS_SESION = 7
export const MAX_TEXTO_PREGUNTA = 140
export const MAX_OPCIONES = 4
export const MAX_TEXTO_OPCION = 32

const IdZ = z.string().min(1).max(120).regex(/^[\w.:-]+$/)
const RevisionZ = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/)
/** Una pregunta NBME fijada por revisión: lo único que viaja para leerla. */
const RefNbmeZ = z.object({ id: z.string().regex(/^NBME(?:27|28|29)-P\d{4}$/), revision: RevisionZ }).strict()
export type RefNbme = z.infer<typeof RefNbmeZ>

const ItemHiloZ = z.object({
  tipo: z.enum(['concepto', 'pregunta']),
  id: IdZ,
  etiqueta: z.string().max(MAX_ETIQUETA),
  senales: z.array(z.enum(SENALES_INVENTARIO)).min(1).max(3),
}).strict()
export type ItemHilo = z.infer<typeof ItemHiloZ>

const ItemRevisionZ = z.object({
  tipo: z.enum(['concepto', 'pregunta']),
  id: IdZ,
  /** Optional for older clients; new clients pin the NBME revision selected from the catalog. */
  revision: RevisionZ.optional(),
  etiqueta: z.string().min(1).max(MAX_ETIQUETA_REVISION),
}).strict()
export type ItemRevision = z.infer<typeof ItemRevisionZ>

export const TurnoSesionZ = z.object({ rol: z.enum(['yo', 'ia']), texto: z.string().min(1).max(MAX_PEDIDO) }).strict()
export type TurnoSesion = z.infer<typeof TurnoSesionZ>

/** Un término libre: una palabra o frase corta, sin símbolos raros. */
export const TerminoZ = z.string().trim().min(2).max(40).regex(/^[\p{L}\p{N}][\p{L}\p{N} .,'’()/-]*$/u)

/** Lo que se pidió, ya en el vocabulario cerrado de la plataforma. Es lo único que viaja entre fases. */
export const ConsultaSesionZ = z.object({
  fuente: z.enum(FUENTES_SESION),
  sistemas: z.array(z.enum(SISTEMAS)).max(5),
  disciplinas: z.array(z.enum(DISCIPLINAS)).max(5),
  /** Temas concretos que no caben en un sistema o una disciplina; acotan la selección. */
  terminos: z.array(TerminoZ).max(5),
  estados: z.array(z.enum(ESTADOS_SESION)).max(4),
  minutos: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30)]),
  /** Si la persona pidió un número de ítems, manda sobre los minutos. */
  cantidad: z.number().int().min(1).max(MAX_CANTIDAD_SESION).optional(),
  titulo: z.string().trim().min(3).max(60),
}).strict()
export type ConsultaSesion = z.infer<typeof ConsultaSesionZ>

export const PeticionSesionZ = z.discriminatedUnion('fase', [
  /** Una frase con el hilo común de las cinco sugeridas del día. */
  z.object({ fase: z.literal('hilo'), items: z.array(ItemHiloZ).min(1).max(5) }).strict(),
  /** Interpretar el pedido (y, si hace falta, preguntar una cosa más). */
  z.object({
    fase: z.literal('entender'),
    mensajes: z.array(TurnoSesionZ).min(1).max(MAX_TURNOS_SESION),
    preguntasHechas: z.number().int().min(0).max(MAX_PREGUNTAS_SEGUIMIENTO),
  }).strict(),
  /** Qué preguntas de la lista aún no tienen ficha de lectura. No gasta. */
  z.object({ fase: z.literal('lecturas'), items: z.array(RefNbmeZ).min(1).max(MAX_REFS_LECTURAS) }).strict(),
  /** Leer con Claude, una por una, las preguntas que aún no tienen ficha. */
  z.object({ fase: z.literal('leer'), items: z.array(RefNbmeZ).min(1).max(MAX_ITEMS_LECTURA) }).strict(),
  /** Revisar ítem por ítem las candidatas que dejan la fuente y el historial. */
  z.object({
    fase: z.literal('revisar'),
    pedido: z.string().trim().min(1).max(MAX_PEDIDO),
    consulta: ConsultaSesionZ,
    items: z.array(ItemRevisionZ).min(1).max(MAX_ITEMS_REVISION),
  }).strict(),
]).superRefine((p, ctx) => {
  // Zod ejecuta esta comprobación aunque otra regla ya haya fallado (por ejemplo, una lista vacía): no se asume que hay datos.
  if (p.fase === 'entender' && p.mensajes.length > 0 && p.mensajes[p.mensajes.length - 1].rol !== 'yo') {
    ctx.addIssue({ code: 'custom', message: 'El último turno debe ser de la persona.', path: ['mensajes'] })
  }
  if ((p.fase === 'revisar' || p.fase === 'leer' || p.fase === 'lecturas') && new Set(p.items.map(i => i.id)).size !== p.items.length) {
    ctx.addIssue({ code: 'custom', message: 'Hay identificadores repetidos.', path: ['items'] })
  }
})
export type PeticionSesion = z.infer<typeof PeticionSesionZ>

// ---------------------------------------------------------------------------------------------
// Lo que contesta el modelo en `entender`. Se valida con el mismo rigor que lo que manda el navegador.
// ---------------------------------------------------------------------------------------------

export type SalidaEntender =
  | { tipo: 'pregunta'; texto: string; opciones: string[] }
  | { tipo: 'consulta'; consulta: ConsultaSesion }

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** El valor canónico de una lista cerrada, tolerando mayúsculas y tildes; null si no es de la lista. */
export function canonico<T extends string>(valor: unknown, lista: readonly T[]): T | null {
  if (typeof valor !== 'string') return null
  const buscado = sinAcentos(valor)
  return lista.find(x => sinAcentos(x) === buscado) ?? null
}

/** Una lista cerrada o nada: un valor desconocido invalida todo, para no ampliar la búsqueda en silencio. */
function listaCerrada<T extends string>(valor: unknown, lista: readonly T[], maximo: number): T[] | null {
  if (valor === undefined || valor === null) return []
  if (!Array.isArray(valor) || valor.length > maximo + 2) return null
  const salida: T[] = []
  for (const v of valor) {
    const c = canonico(v, lista)
    if (c === null) return null
    if (!salida.includes(c)) salida.push(c)
  }
  return salida.length <= maximo ? salida : null
}

/** Un número de ítems razonable; por encima del tope se queda en el tope, y lo que no es un número invalida la consulta. */
function cantidadPedida(valor: unknown): number | undefined | null {
  if (valor === undefined || valor === null) return undefined
  const n = typeof valor === 'string' && /\d/.test(valor) ? Number(valor.replace(/[^\d]/g, '')) : valor
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return null
  return Math.min(MAX_CANTIDAD_SESION, Math.round(n))
}

const MINUTOS_NUMERICOS: readonly number[] = MINUTOS_SESION
function minutosCercanos(valor: unknown): MinutosSesion | null {
  if (valor === undefined || valor === null) return MINUTOS_PREDETERMINADOS
  const n = typeof valor === 'string' ? Number(valor.replace(/[^\d.]/g, '')) : valor
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 120) return null
  return MINUTOS_NUMERICOS.reduce((mejor, m) => Math.abs(m - n) < Math.abs(mejor - n) ? m : mejor, MINUTOS_NUMERICOS[0]) as MinutosSesion
}

const limpiar = (t: unknown, maximo: number): string | null => {
  if (typeof t !== 'string') return null
  const limpio = t.replace(/\s+/g, ' ').trim().normalize('NFC')
  return limpio.length > 0 && limpio.length <= maximo && !/[`*_#<>{}[\]\\]/.test(limpio) ? limpio : null
}

/** Compone un título cuando el modelo no lo escribió o no cabe. */
function tituloDe(c: Pick<ConsultaSesion, 'sistemas' | 'disciplinas' | 'terminos' | 'estados'>): string {
  const tema = [...c.sistemas, ...c.disciplinas, ...c.terminos][0] ?? 'Sesión a tu medida'
  return tema.slice(0, 60)
}

export function normalizarConsulta(crudo: unknown): ConsultaSesion | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null
  const o = crudo as Record<string, unknown>
  const fuente = o.fuente === undefined ? 'mixto' : canonico(o.fuente, FUENTES_SESION)
  const sistemas = listaCerrada(o.sistemas, SISTEMAS, 5)
  const disciplinas = listaCerrada(o.disciplinas, DISCIPLINAS, 5)
  const estados = listaCerrada(o.estados, ESTADOS_SESION, 4)
  const minutos = minutosCercanos(o.minutos)
  const cantidad = cantidadPedida(o.cantidad)
  if (!fuente || !sistemas || !disciplinas || !estados || !minutos || cantidad === null) return null
  const terminos: string[] = []
  if (o.terminos !== undefined && o.terminos !== null) {
    if (!Array.isArray(o.terminos) || o.terminos.length > 5) return null
    for (const t of o.terminos) {
      const limpio = typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().normalize('NFC') : ''
      if (!TerminoZ.safeParse(limpio).success) return null
      if (!terminos.some(x => sinAcentos(x) === sinAcentos(limpio))) terminos.push(limpio)
    }
  }
  const base = { fuente, sistemas, disciplinas, terminos, estados, minutos, ...(cantidad ? { cantidad } : {}) }
  const titulo = limpiar(o.titulo, 60) ?? tituloDe(base)
  const leida = ConsultaSesionZ.safeParse({ ...base, titulo: titulo.length >= 3 ? titulo : tituloDe(base) })
  return leida.success ? leida.data : null
}

/**
 * Valida la salida de `entender`. `maxPreguntas` es cuántas preguntas de seguimiento quedan:
 * con 0, una pregunta no es admisible y la salida se descarta.
 */
export function validarEntender(crudo: unknown, maxPreguntas: number): SalidaEntender | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null
  const o = crudo as Record<string, unknown>
  if (o.tipo === 'consulta') {
    const consulta = normalizarConsulta(o.consulta)
    return consulta ? { tipo: 'consulta', consulta } : null
  }
  if (o.tipo === 'pregunta') {
    if (maxPreguntas <= 0) return null
    const texto = limpiar(o.texto, MAX_TEXTO_PREGUNTA)
    if (!texto || !Array.isArray(o.opciones)) return null
    const opciones: string[] = []
    for (const op of o.opciones) {
      const limpia = limpiar(op, MAX_TEXTO_OPCION)
      if (!limpia) return null
      if (!opciones.some(x => sinAcentos(x) === sinAcentos(limpia))) opciones.push(limpia)
    }
    if (opciones.length < 2 || opciones.length > MAX_OPCIONES) return null
    return { tipo: 'pregunta', texto, opciones }
  }
  return null
}
