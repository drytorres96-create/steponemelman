import type { Concepto } from '../schema/concept'
import type { NbmeAttempt, NbmeQuestionMeta, NbmeState } from '../nbme/types'
import { isHiddenNbmeAttempt } from '../nbme/model'
import { evaluarDominio, type CriteriosDominio } from '../srs/mastery'
import type { ProgresoConcepto } from '../srs/tipos'
import { escalonDePregunta } from './cajas'
import { inicioDelDia } from './dia'
import { eventosDeConcepto, eventosDePregunta, senalesDe, type Evento } from './inventario'
import { MAX_ETIQUETA_REVISION, MAX_ITEMS_LECTURA, type ConsultaSesion, type EstadoSesion, type ItemRevision, type RefNbme } from './contexto-sesion'
import type { MaterialNuevo } from './nuevo-hoy'
import type { RespuestaLectura, RespuestaPendientes, RespuestaRevision } from './sesion-claude'

/**
 * Armar una sesión a medida: la plataforma conoce el historial de cada concepto y pregunta, así que
 * ella decide qué es «fallada», «por repasar» o «de las que más trabajo dieron» y filtra. Claude
 * traduce el pedido a esa consulta y, cuando se pide un tema, lee cada candidata por su contenido:
 * las etiquetas del banco no son fiables, así que no deciden qué entra. Lo demás es una función pura
 * sobre datos que la aplicación ya tiene.
 */

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Un fallo vale dos de «trabajo» y un acierto con ayuda vale uno. */
export const TRABAJO_POR_FALLO = 2
export const TRABAJO_POR_AYUDA = 1
/** Desde cuánto trabajo acumulado se dice que algo «dio más trabajo»: por ejemplo, dos fallos o un fallo con dos ayudas. */
export const TRABAJO_MINIMO_MAS_TRABAJO = 4

export interface FichaSesion {
  tipo: 'concepto' | 'pregunta'
  id: string
  /** Sólo las preguntas NBME: la revisión vigente con la que se abre. */
  revision?: string
  sistemas: string[]
  disciplinas: string[]
  /** El tema, para mostrar y para revisar. */
  titulo: string
  /** El objetivo del concepto; vacío en las preguntas. */
  detalle: string
  intentos: number
  ultimaVez: number | null
  estados: ReadonlySet<EstadoSesion>
  trabajo: number
  /** Peso de fragilidad: el mismo del inventario («Para reforzar hoy»). */
  puntos: number
  /** Posición original, para conservar el orden del material cuando nada más desempata. */
  orden: number
}

interface Historial {
  intentos: number
  fallos: number
  ayudas: number
  ultimoFallo: number | null
  ultimaVez: number | null
  primeroLimpio: boolean
  ultimoOk: boolean
  recuperada: boolean
  puntos: number
  fragil: boolean
}

const VACIO: Historial = { intentos: 0, fallos: 0, ayudas: 0, ultimoFallo: null, ultimaVez: null, primeroLimpio: false, ultimoOk: false, recuperada: true, puntos: 0, fragil: false }

/** Resume una lista de intentos con las mismas reglas del inventario: un parcial es fallo, la ayuda no acredita, el día acaba a las 3:00. */
export function resumirHistorial(eventos: Evento[], ahora: number): Historial {
  const base = senalesDe(eventos, ahora)
  if (!base) return VACIO
  const ev = eventos.filter(e => Number.isFinite(e.ts) && e.ts <= ahora).sort((a, b) => a.ts - b.ts)
  const fallos = ev.filter(e => !e.ok)
  const ultimoFallo = fallos.length ? fallos[fallos.length - 1].ts : null
  const diaDelFallo = ultimoFallo === null ? null : inicioDelDia(ultimoFallo)
  const recuperada = diaDelFallo === null || ev.some(e => e.ts > ultimoFallo! && e.ok && !e.ayuda && inicioDelDia(e.ts) > diaDelFallo)
  const ultimo = ev[ev.length - 1]
  return { intentos: ev.length, fallos: fallos.length, ayudas: ev.filter(e => e.ok && e.ayuda).length, ultimoFallo, ultimaVez: ultimo.ts,
    primeroLimpio: ev[0].ok && !ev[0].ayuda, ultimoOk: ultimo.ok, recuperada, puntos: base.puntos, fragil: base.senales.length > 0 }
}

function estadosDe(h: Historial, enCajasHoy: boolean, dominada: boolean): { estados: Set<EstadoSesion>; trabajo: number } {
  const trabajo = h.fallos * TRABAJO_POR_FALLO + h.ayudas * TRABAJO_POR_AYUDA
  const estados = new Set<EstadoSesion>()
  if (h.intentos === 0) estados.add('nuevas')
  if (h.fallos > 0) estados.add('falladas')
  if (h.fallos > 0 && !h.recuperada) estados.add('falladas_sin_recuperar')
  if (h.fragil || (h.intentos > 0 && enCajasHoy)) estados.add('por_repasar')
  if (trabajo >= TRABAJO_MINIMO_MAS_TRABAJO) estados.add('mas_trabajo')
  if (h.intentos > 0 && h.ultimoOk) estados.add('acertadas')
  if (h.intentos > 0 && h.primeroLimpio) estados.add('acertadas_primera')
  if (h.intentos > 0 && dominada) estados.add('dominadas')
  return { estados, trabajo }
}

export interface EntradaFichas {
  conceptos: Pick<Concepto, 'concept_id' | 'clasificacion' | 'objetivo'>[]
  preguntas: NbmeQuestionMeta[]
  progreso: Record<string, ProgresoConcepto>
  nbme: NbmeState
  criterios: CriteriosDominio
  /** `tipo:id` de lo que hoy tiene sitio en las cajas: cuenta como «por repasar». */
  enCajasHoy: ReadonlySet<string>
  conceptoDisponible: (id: string) => boolean
  ahora: number
}

/** Una ficha por cada concepto y pregunta disponibles, con su historial ya interpretado. */
export function fichasDeSesion(e: EntradaFichas): FichaSesion[] {
  const fichas: FichaSesion[] = []
  let orden = 0
  for (const c of e.conceptos) {
    if (!e.conceptoDisponible(c.concept_id)) continue
    const p = e.progreso[c.concept_id]
    const h = p ? resumirHistorial(eventosDeConcepto(p), e.ahora) : VACIO
    const dominada = !!p && h.intentos > 0 && evaluarDominio(p, e.criterios, e.ahora).cumple
    const { estados, trabajo } = estadosDe(h, e.enCajasHoy.has(`concepto:${c.concept_id}`), dominada)
    const cl = c.clasificacion
    fichas.push({ tipo: 'concepto', id: c.concept_id, intentos: h.intentos, ultimaVez: h.ultimaVez, estados, trabajo, puntos: h.puntos, orden: orden++,
      sistemas: [cl.sistema_primario, ...cl.sistemas_secundarios], disciplinas: [cl.disciplina_primaria, ...cl.disciplinas_secundarias],
      titulo: (cl.tema || c.objetivo).replace(/\s+/g, ' ').trim(), detalle: c.objetivo.replace(/\s+/g, ' ').trim() })
  }
  const porPregunta = new Map<string, NbmeAttempt[]>()
  for (const a of Object.values(e.nbme.attempts)) {
    if (isHiddenNbmeAttempt(e.nbme, a)) continue
    const lista = porPregunta.get(a.questionId)
    if (lista) lista.push(a)
    else porPregunta.set(a.questionId, [a])
  }
  for (const q of e.preguntas) {
    if (q.status !== 'ready') continue
    const intentos = porPregunta.get(q.id) ?? []
    const h = intentos.length ? resumirHistorial(eventosDePregunta(intentos), e.ahora) : VACIO
    const dominada = intentos.length > 0 && escalonDePregunta(intentos)?.escalon === 'cerrado'
    const { estados, trabajo } = estadosDe(h, e.enCajasHoy.has(`pregunta:${q.id}`), dominada)
    fichas.push({ tipo: 'pregunta', id: q.id, revision: q.revision, intentos: h.intentos, ultimaVez: h.ultimaVez, estados, trabajo, puntos: h.puntos, orden: orden++,
      sistemas: [...q.systems], disciplinas: [...q.disciplines], titulo: (q.topic || 'Pregunta NBME').replace(/\s+/g, ' ').trim(), detalle: '' })
  }
  return fichas
}

const coincide = (propios: string[], pedidos: readonly string[]) => {
  const buscados = new Set(pedidos.map(sinAcentos))
  return propios.some(p => buscados.has(sinAcentos(p)))
}

/**
 * Lo que cumple la consulta con los filtros cerrados (fuente, sistemas, disciplinas, estados), en el orden
 * en que conviene estudiarlo. Sistemas y disciplinas se combinan con «y»; dentro de cada una basta una.
 * No mira los términos libres: eso lo revisa Claude sobre esta misma lista.
 */
export function filtrarFichas(fichas: FichaSesion[], c: ConsultaSesion): FichaSesion[] {
  const filtradas = fichas.filter(f =>
    (c.fuente === 'mixto' || (c.fuente === 'conceptos' ? f.tipo === 'concepto' : f.tipo === 'pregunta'))
    && (!c.sistemas.length || coincide(f.sistemas, c.sistemas))
    && (!c.disciplinas.length || coincide(f.disciplinas, c.disciplinas))
    && (!c.estados.length || c.estados.some(s => f.estados.has(s))))
  const principal = (f: FichaSesion) => (c.sistemas.length && coincide(f.sistemas.slice(0, 1), c.sistemas) ? 0 : 1)
    + (c.disciplinas.length && coincide(f.disciplinas.slice(0, 1), c.disciplinas) ? 0 : 1)
  const poTrabajo = c.estados.includes('mas_trabajo')
  return filtradas.sort((a, b) => principal(a) - principal(b)
    || (poTrabajo ? b.trabajo - a.trabajo || b.puntos - a.puntos : b.puntos - a.puntos || b.trabajo - a.trabajo)
    || (a.ultimaVez ?? 0) - (b.ultimaVez ?? 0) || a.orden - b.orden)
}

/** Etiqueta corta de una ficha para que Claude juzgue si encaja: tema y objetivo, o tema y sistema. */
export function etiquetaDeRevision(f: FichaSesion): string {
  const base = f.tipo === 'concepto' ? (f.detalle && f.detalle !== f.titulo ? `${f.titulo}: ${f.detalle}` : f.titulo)
    : `${f.titulo}${f.sistemas.length ? ` · ${f.sistemas.join('/')}` : ''}`
  const limpia = base.replace(/\s+/g, ' ').trim()
  return (limpia.length > MAX_ETIQUETA_REVISION ? `${limpia.slice(0, MAX_ETIQUETA_REVISION - 1)}…` : limpia) || 'Sin título'
}

export const aItemRevision = (f: FichaSesion): ItemRevision => ({ tipo: f.tipo, id: f.id, etiqueta: f.tipo === 'pregunta' ? 'Pregunta NBME' : etiquetaDeRevision(f), ...(f.revision ? { revision: f.revision } : {}) })

// ---------------------------------------------------------------------------------------------
// Cuánto cabe en los minutos pedidos
// ---------------------------------------------------------------------------------------------

export interface RitmoSesion { conceptoMin: number; preguntaMin: number }
/** Lo que se supone mientras no hay práctica suficiente: una tarjeta de estudio y una pregunta de examen con su explicación. */
export const RITMO_PREDETERMINADO: RitmoSesion = { conceptoMin: 1.5, preguntaMin: 2.5 }
/** Responder es solo una parte: leer la explicación y volver a mirar suma. */
const FACTOR_EXPLICACION = 1.5
const MINIMO_CONCEPTO_MIN = 0.75
const MINIMO_PREGUNTA_MIN = 1.5

export function ritmoDe(medias: { conceptoMs: number | null; preguntaMs: number | null }): RitmoSesion {
  const a = medias.conceptoMs === null ? RITMO_PREDETERMINADO.conceptoMin : Math.max(MINIMO_CONCEPTO_MIN, medias.conceptoMs * FACTOR_EXPLICACION / 60_000)
  const b = medias.preguntaMs === null ? RITMO_PREDETERMINADO.preguntaMin : Math.max(MINIMO_PREGUNTA_MIN, medias.preguntaMs * FACTOR_EXPLICACION / 60_000)
  return { conceptoMin: a, preguntaMin: b }
}

/** El reproductor mixto no abre más de veinte preguntas NBME como un solo bloque. */
export const MAX_PREGUNTAS_SESION = 20
/** En una sesión mixta entra una pregunta por cada tres conceptos, como en «lo nuevo de hoy». */
export const CONCEPTOS_POR_PREGUNTA = 3
/** Cuánto se tolera pasarse del tiempo pedido antes de dejar de añadir. */
const MARGEN = 1.15

export interface SesionArmada {
  conceptIds: string[]
  preguntas: { id: string; revision: string }[]
  /** Tiempo estimado, redondeado al minuto. */
  minutos: number
  cada: number
}

/**
 * Elige, en el orden recibido, lo que cabe en los minutos pedidos o, si se pidió un número de ítems,
 * hasta ese número. En una sesión mixta alterna tres conceptos y una pregunta; si falta de un tipo,
 * sigue con el otro. Siempre entra al menos un ítem.
 */
export function armarSesion(candidatas: FichaSesion[], c: Pick<ConsultaSesion, 'fuente' | 'minutos' | 'cantidad'>, ritmo: RitmoSesion): SesionArmada {
  const conceptos = c.fuente === 'nbme' ? [] : candidatas.filter(f => f.tipo === 'concepto')
  const preguntas = c.fuente === 'conceptos' ? [] : candidatas.filter(f => f.tipo === 'pregunta' && f.revision)
  const tope = c.minutos * MARGEN
  const porCantidad = c.cantidad !== undefined
  const elegidos = { conceptos: [] as FichaSesion[], preguntas: [] as FichaSesion[] }
  const cuantos = () => elegidos.conceptos.length + elegidos.preguntas.length
  let total = 0, pos = 0
  const proximo = (tipo: 'concepto' | 'pregunta') => tipo === 'concepto' ? conceptos[elegidos.conceptos.length] : elegidos.preguntas.length < MAX_PREGUNTAS_SESION ? preguntas[elegidos.preguntas.length] : undefined
  const coste = (tipo: 'concepto' | 'pregunta') => tipo === 'concepto' ? ritmo.conceptoMin : ritmo.preguntaMin
  while (true) {
    const turno: 'concepto' | 'pregunta' = pos % (CONCEPTOS_POR_PREGUNTA + 1) < CONCEPTOS_POR_PREGUNTA ? 'concepto' : 'pregunta'
    const orden: ('concepto' | 'pregunta')[] = turno === 'concepto' ? ['concepto', 'pregunta'] : ['pregunta', 'concepto']
    // Keep room for an NBME item in a short mixed block when both kinds fit.
    const reservarPregunta = !porCantidad && c.fuente === 'mixto' && elegidos.conceptos.length > 0 && !elegidos.preguntas.length
      && proximo('pregunta') && total + coste('pregunta') <= tope && total + coste('concepto') + coste('pregunta') > tope
    const cabe = (t: 'concepto' | 'pregunta') => porCantidad ? cuantos() < c.cantidad! : cuantos() === 0 || total + coste(t) <= tope
    const elegido = reservarPregunta ? 'pregunta' : orden.find(t => proximo(t) && cabe(t))
    if (!elegido) break
    if (elegido === 'concepto') elegidos.conceptos.push(proximo('concepto')!)
    else elegidos.preguntas.push(proximo('pregunta')!)
    total += coste(elegido)
    pos++
  }
  return {
    conceptIds: elegidos.conceptos.map(f => f.id),
    preguntas: elegidos.preguntas.map(f => ({ id: f.id, revision: f.revision! })),
    minutos: Math.max(1, Math.round(total)),
    cada: CONCEPTOS_POR_PREGUNTA,
  }
}

// ---------------------------------------------------------------------------------------------
// Texto para la persona
// ---------------------------------------------------------------------------------------------

export const ETIQUETA_ESTADO: Record<EstadoSesion, string> = {
  falladas: 'falladas', falladas_sin_recuperar: 'falladas sin recuperar', por_repasar: 'por repasar',
  mas_trabajo: 'las que más trabajo dieron', acertadas: 'acertadas', acertadas_primera: 'acertadas a la primera',
  nuevas: 'nuevas', dominadas: 'dominadas',
}
const ETIQUETA_FUENTE = { conceptos: 'conceptos', nbme: 'preguntas NBME', mixto: 'conceptos y preguntas' } as const

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Lo que la plataforma entendió, para que la persona pueda corregirlo antes de armar nada. */
export function describirConsulta(c: ConsultaSesion): string {
  // Con temas nombrados, los sistemas y disciplinas son sólo pistas: se muestra lo que se pidió.
  const tema = c.terminos.length ? c.terminos.map(t => `«${t}»`) : [...c.sistemas, ...c.disciplinas]
  return [tema.length ? tema.join(' + ') : 'todo el material', c.estados.length ? c.estados.map(s => ETIQUETA_ESTADO[s]).join(' o ') : '',
    ETIQUETA_FUENTE[c.fuente], c.cantidad ? plural(c.cantidad, 'ítem', 'ítems') : `≈ ${c.minutos} min`].filter(Boolean).join(' · ')
}

/** Si el pedido nombra un tema (sistema, disciplina o bloque libre), Claude lee las candidatas. */
export const esTematica = (c: Pick<ConsultaSesion, 'sistemas' | 'disciplinas' | 'terminos'>) => c.sistemas.length + c.disciplinas.length + c.terminos.length > 0


// ---------------------------------------------------------------------------------------------
// De la consulta a la sesión
// ---------------------------------------------------------------------------------------------

export type ResultadoSesion =
  | { estado: 'lista'; material: MaterialNuevo; conceptos: number; preguntas: number; minutos: number
      /** Cuántas leyó Claude y cuántas encajaron; ausente si la consulta no nombraba un tema. */
      revision?: { revisadas: number; encajan: number; deTotal: number }
      /** Cuántos ítems de la sesión cubren cada tema pedido, cuando se pidieron varios. */
      reparto?: { tema: string; n: number }[]
      incompleta?: 'conceptos' | 'preguntas'
      aviso?: string
      /** Preguntas NBME sin una fuente que la IA pueda leer: no se juzgaron. */
      sinRevisar: number
      /** Preguntas NBME que Claude no pudo leer esta vez; se leerán en la próxima sesión. */
      sinLeer?: number }
  | { estado: 'vacio'; motivo: string }
  | { estado: 'sin_ia'; motivo: string }

export interface LecturaBanco {
  pendientes: (refs: RefNbme[], signal?: AbortSignal) => Promise<RespuestaPendientes>
  leer: (refs: RefNbme[], signal?: AbortSignal) => Promise<RespuestaLectura>
}

export interface EntradaResolver {
  consulta: ConsultaSesion
  /** Lo que la persona pidió, con sus palabras y lo que fue eligiendo. */
  pedido: string
  fichas: FichaSesion[]
  ritmo: RitmoSesion
  revisar: (pedido: string, consulta: ConsultaSesion, items: ItemRevision[], signal?: AbortSignal) => Promise<RespuestaRevision>
  /** Lee con Claude las preguntas NBME que aún no tienen ficha. Sin ella, las preguntas sin ficha no se juzgan. */
  lectura?: LecturaBanco
  /** Qué está haciendo ahora, para enseñarlo mientras espera. */
  onProgreso?: (texto: string) => void
  signal?: AbortSignal
  /** Pausa antes de repetir un lote que chocó con el límite de ritmo (las pruebas la acortan). */
  esperaReintentoMs?: number
}

/** Qué decirle cuando no hay nada: qué hay disponible sin el filtro más estricto, sin contar deuda. */
function explicarVacio(fichas: FichaSesion[], c: ConsultaSesion): string {
  const delTema = filtrarFichas(fichas, { ...c, estados: [] })
  const conceptos = delTema.filter(f => f.tipo === 'concepto').length, preguntas = delTema.filter(f => f.tipo === 'pregunta').length
  const tema = [...c.sistemas, ...c.disciplinas].join(' + ')
  if (c.estados.length && delTema.length) {
    return `No encontré ${ETIQUETA_FUENTE[c.fuente]}${tema ? ` de ${tema}` : ''} que estén ${c.estados.map(s => ETIQUETA_ESTADO[s]).join(' o ')}. Sin ese filtro hay ${plural(conceptos, 'concepto', 'conceptos')} y ${plural(preguntas, 'pregunta', 'preguntas')}: puedes pedirme otra combinación.`
  }
  return `No encontré ${ETIQUETA_FUENTE[c.fuente]}${tema ? ` de ${tema}` : ''} con lo que pediste. Prueba con otro tema, otra fuente o sin el filtro de estado.`
}

/** Conceptos que se mandan a leer como mucho en una sesión: acota gasto y espera. Las preguntas NBME se leen todas. */
export const MAX_CONCEPTOS_REVISION = 900
/** Llamadas a Claude a la vez: lo bastante para no eternizar la espera, sin saturar el límite de ritmo. */
export const LECTURAS_EN_PARALELO = 3
export const REVISIONES_EN_PARALELO = 3
/** Candidatas por llamada de selección: Opus con razonamiento alto las lee una a una dentro del plazo del Worker. */
export const LOTE_REVISION = 150
/** Un límite de ritmo o una saturación no se facturan: cada lote se reintenta una vez tras esta espera. */
export const ESPERA_REINTENTO_MS = 20_000
const REINTENTABLES = new Set(['limite', 'sobrecarga'])

/** Una llamada que choca con el límite de ritmo o la saturación de la API se repite una vez, con pausa. */
async function conReintento<R extends { estado: string; codigo?: string }>(hacer: () => Promise<R>, signal?: AbortSignal, esperaMs = ESPERA_REINTENTO_MS): Promise<R> {
  const r = await hacer()
  if (r.estado === 'ok' || !r.codigo || !REINTENTABLES.has(r.codigo) || signal?.aborted) return r
  await new Promise<void>(listo => {
    const t = setTimeout(listo, esperaMs)
    signal?.addEventListener('abort', () => { clearTimeout(t); listo() }, { once: true })
  })
  return signal?.aborted ? r : hacer()
}

/** Las raíces de las palabras de un término («farmacología antimicrobiana» → «farmac», «antimi»). */
const raices = (t: string) => sinAcentos(t).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 5).map(w => w.slice(0, 6))

/** El texto de la ficha nombra el término entero, o todas las raíces de sus palabras. */
function tocaTermino(f: FichaSesion, terminos: readonly string[]): boolean {
  const texto = sinAcentos(`${f.titulo} ${f.detalle}`)
  return terminos.some(t => { const r = raices(t); return texto.includes(sinAcentos(t)) || (r.length > 0 && r.every(x => texto.includes(x))) })
}

/**
 * Los conceptos que merece la pena leer. Las pistas (sistemas, disciplinas, términos) se suman con «o»:
 * basta una para que un concepto entre a lectura, y Claude decide después por su contenido. Sin pistas
 * de clasificación, entran todos, primero los que nombran algún término. Nunca más del tope.
 */
export function conceptosParaLeer(conceptos: FichaSesion[], c: Pick<ConsultaSesion, 'sistemas' | 'disciplinas' | 'terminos'>, maximo = MAX_CONCEPTOS_REVISION): FichaSesion[] {
  const hayPistas = c.sistemas.length + c.disciplinas.length > 0
  const fuerza = (f: FichaSesion) => (c.sistemas.length && coincide(f.sistemas, c.sistemas) ? 1 : 0)
    + (c.disciplinas.length && coincide(f.disciplinas, c.disciplinas) ? 1 : 0) + (c.terminos.length && tocaTermino(f, c.terminos) ? 2 : 0)
  const conFuerza = conceptos.map(f => ({ f, n: fuerza(f) })).filter(x => !hayPistas || x.n > 0)
  const elegidos = new Set(conFuerza.sort((a, b) => b.n - a.n).slice(0, maximo).map(x => x.f.id))
  return conceptos.filter(f => elegidos.has(f.id))
}

/** Ejecuta las tareas con, como mucho, `n` a la vez, en orden. */
async function enParalelo<T, R>(tareas: T[], n: number, hacer: (t: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(tareas.length)
  let siguiente = 0
  await Promise.all(Array.from({ length: Math.min(n, tareas.length) }, async () => {
    while (siguiente < tareas.length) { const k = siguiente++; salida[k] = await hacer(tareas[k]) }
  }))
  return salida
}

const trozos = <T>(lista: T[], tamano: number) => Array.from({ length: Math.ceil(lista.length / tamano) }, (_, n) => lista.slice(n * tamano, (n + 1) * tamano))

/**
 * Lee con Claude las preguntas NBME que aún no tienen ficha. Lo ya leído se recuerda en el servidor,
 * así que sólo la primera vez tarda. Un lote que falla no tumba la sesión: esas preguntas se quedan
 * fuera esta vez y se devuelven aparte, para no confundirlas con las que no tienen fuente. Si fallan
 * todos, se avisa con el motivo.
 */
async function leerBanco(preguntas: FichaSesion[], lectura: LecturaBanco, e: EntradaResolver): Promise<{ sinLeer: ReadonlySet<string> } | { estado: 'sin_ia'; motivo: string }> {
  const refs = preguntas.map(f => ({ id: f.id, revision: f.revision! }))
  e.onProgreso?.('Compruebo qué preguntas NBME ya leyó Claude…')
  const p = await lectura.pendientes(refs, e.signal)
  if (p.estado !== 'ok') return p
  const pedidas = new Set(p.faltan)
  const faltan = refs.filter(r => pedidas.has(r.id))
  if (!faltan.length) return { sinLeer: new Set() }
  const lotes = trozos(faltan, MAX_ITEMS_LECTURA)
  let hechas = 0, fallidas = 0, motivo = ''
  const caidas = new Set<string>()
  const avisar = () => e.onProgreso?.(`Claude lee las preguntas NBME una por una: ${hechas} de ${faltan.length}. Sólo la primera vez tarda; después las recuerda.`)
  avisar()
  await enParalelo(lotes, LECTURAS_EN_PARALELO, async lote => {
    if (e.signal?.aborted) return
    const r = await conReintento(() => lectura.leer(lote, e.signal), e.signal, e.esperaReintentoMs)
    if (r.estado !== 'ok') { fallidas += lote.length; motivo ||= r.motivo; lote.forEach(x => caidas.add(x.id)) }
    else fallidas += r.pendientes
    hechas += lote.length
    avisar()
  })
  if (fallidas === faltan.length) return { estado: 'sin_ia', motivo: motivo || 'Claude no pudo leer las preguntas NBME. Vuelve a intentarlo.' }
  if (!fallidas) return { sinLeer: new Set() }
  // Qué quedó de verdad sin ficha (un lote puede contestar con alguna ficha inválida): se pregunta, sin gastar.
  const despues = await lectura.pendientes(faltan, e.signal)
  return { sinLeer: despues.estado === 'ok' ? new Set(despues.faltan) : caidas }
}

/** Reparte por turnos entre los temas pedidos, conservando dentro de cada tema el orden de estudio. */
export function repartirPorTemas(elegidas: FichaSesion[], tema: ReadonlyMap<string, number>, temas: number): FichaSesion[] {
  if (temas <= 1) return elegidas
  const turnar = (lista: FichaSesion[]) => {
    const colas = Array.from({ length: temas }, (_, n) => lista.filter(f => (tema.get(f.id) ?? 1) === n + 1))
    const salida: FichaSesion[] = []
    for (let k = 0; colas.some(c => k < c.length); k++) for (const c of colas) if (k < c.length) salida.push(c[k])
    return salida
  }
  return [...turnar(elegidas.filter(f => f.tipo === 'concepto')), ...turnar(elegidas.filter(f => f.tipo === 'pregunta'))]
}

export async function resolverSesion(e: EntradaResolver): Promise<ResultadoSesion> {
  const { consulta, pedido } = e
  let candidatas = filtrarFichas(e.fichas, consulta)
  let revision: { revisadas: number; encajan: number; deTotal: number } | undefined
  let sinRevisar = 0, sinLeer = 0
  const tema = new Map<string, number>()
  if (esTematica(consulta)) {
    // Sólo la fuente y el historial filtran; el tema lo decide Claude leyendo cada candidata.
    const pool = filtrarFichas(e.fichas, { ...consulta, sistemas: [], disciplinas: [] })
    let preguntas = pool.filter(f => f.tipo === 'pregunta' && f.revision)
    const conceptos = conceptosParaLeer(pool.filter(f => f.tipo === 'concepto'), consulta)
    if (preguntas.length && e.lectura) {
      const leido = await leerBanco(preguntas, e.lectura, e)
      if (e.signal?.aborted) return { estado: 'sin_ia', motivo: 'Se canceló la búsqueda.' }
      if ('estado' in leido) return leido
      // Lo que no se pudo leer esta vez no se manda a seleccionar: se cuenta aparte.
      sinLeer = preguntas.filter(f => leido.sinLeer.has(f.id)).length
      preguntas = preguntas.filter(f => !leido.sinLeer.has(f.id))
    }
    const aLeer = [...preguntas, ...conceptos]
    if (!aLeer.length) return { estado: 'vacio', motivo: explicarVacio(e.fichas, consulta) }
    const lotes = trozos(aLeer, LOTE_REVISION)
    let hechas = 0, revisadas = 0, error: string | null = null
    const avisar = () => e.onProgreso?.(`Claude revisa las candidatas una por una: ${hechas} de ${aLeer.length}…`)
    avisar()
    const elegidas = new Set<string>()
    await enParalelo(lotes, REVISIONES_EN_PARALELO, async lote => {
      if (error || e.signal?.aborted) return
      const r = await conReintento(() => e.revisar(pedido, consulta, lote.map(aItemRevision), e.signal), e.signal, e.esperaReintentoMs)
      if (r.estado !== 'ok') { error ||= r.motivo; return }
      r.ids.forEach((id, n) => { elegidas.add(id); tema.set(id, r.grupos?.[n] ?? 1) })
      sinRevisar += r.sinRevisar
      revisadas += r.revisadas ?? Math.max(0, lote.length - r.sinRevisar)
      hechas += lote.length
      avisar()
    })
    if (e.signal?.aborted) return { estado: 'sin_ia', motivo: 'Se canceló la búsqueda.' }
    if (error) return { estado: 'sin_ia', motivo: error }
    const posicion = new Map(pool.map((f, n) => [f.id, n]))
    candidatas = repartirPorTemas(aLeer.filter(f => elegidas.has(f.id)).sort((a, b) => posicion.get(a.id)! - posicion.get(b.id)!), tema, consulta.terminos.length)
    revision = { revisadas, encajan: candidatas.length, deTotal: pool.length }
    const temaPedido = consulta.terminos.length ? consulta.terminos.map(t => `«${t}»`).join(', ') : [...consulta.sistemas, ...consulta.disciplinas].join(' + ')
    if (!candidatas.length) return { estado: 'vacio', motivo: `Claude leyó ${plural(revisadas, 'candidata', 'candidatas')} y ninguna trata ${temaPedido}.${sinRevisar ? ` ${plural(sinRevisar, 'pregunta sigue', 'preguntas siguen')} sin una fuente utilizable.` : ''} Puedes pedir otro tema o una sesión más amplia.` }
  }
  if (!candidatas.length) return { estado: 'vacio', motivo: explicarVacio(e.fichas, consulta) }
  const armada = armarSesion(candidatas, consulta, e.ritmo)
  const material: MaterialNuevo = {
    conceptIds: armada.conceptIds, preguntas: armada.preguntas, titulo: consulta.titulo, nbmeSessionId: null, cada: armada.cada,
    subtitulo: pedido.length > 140 ? `${pedido.slice(0, 139)}…` : pedido,
  }
  const total = armada.conceptIds.length + armada.preguntas.length
  const incompleta = consulta.fuente !== 'mixto' ? undefined : !armada.preguntas.length ? 'preguntas' : !armada.conceptIds.length ? 'conceptos' : undefined
  const tipoFaltante = incompleta === 'preguntas' ? 'pregunta' : 'concepto'
  const avisos: string[] = []
  if (incompleta) avisos.push(candidatas.some(f => f.tipo === tipoFaltante)
    ? `Hay ${incompleta} pertinentes, pero no caben junto al otro material ${consulta.cantidad ? 'en los ítems pedidos' : 'en el tiempo pedido'}. Puedes pedir una sesión más larga.`
    : `No encontré ${incompleta} verificables del tema para completar la mezcla. Puedes empezar con lo disponible o pedir otro tema.`)
  if (consulta.cantidad && total < consulta.cantidad) {
    const topeNbme = armada.preguntas.length === MAX_PREGUNTAS_SESION && candidatas.filter(f => f.tipo === 'pregunta').length > MAX_PREGUNTAS_SESION
    avisos.push(topeNbme && !armada.conceptIds.length
      ? `Un bloque NBME admite como mucho ${MAX_PREGUNTAS_SESION} preguntas, así que la sesión lleva ${total}.`
      : `Pediste ${plural(consulta.cantidad, 'ítem', 'ítems')} y encontré ${total} que encajan con lo pedido.`)
  }
  const elegidos = new Set([...armada.conceptIds, ...armada.preguntas.map(q => q.id)])
  const reparto = consulta.terminos.length > 1 && tema.size
    ? consulta.terminos.map((t, n) => ({ tema: t, n: [...elegidos].filter(id => (tema.get(id) ?? 1) === n + 1).length })) : undefined
  return { estado: 'lista', material, conceptos: armada.conceptIds.length, preguntas: armada.preguntas.length, minutos: armada.minutos,
    ...(revision ? { revision } : {}), ...(reparto ? { reparto } : {}), sinRevisar, ...(sinLeer ? { sinLeer } : {}),
    ...(incompleta ? { incompleta } : {}), ...(avisos.length ? { aviso: avisos.join(' ') } : {}) }
}
