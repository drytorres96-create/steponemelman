import type { Concepto } from '../schema/concept'
import type { NbmeAttempt, NbmeQuestionMeta, NbmeState } from '../nbme/types'
import { isHiddenNbmeAttempt } from '../nbme/model'
import { evaluarDominio, type CriteriosDominio } from '../srs/mastery'
import type { ProgresoConcepto } from '../srs/tipos'
import { escalonDePregunta } from './cajas'
import { inicioDelDia } from './dia'
import { eventosDeConcepto, eventosDePregunta, senalesDe, type Evento } from './inventario'
import { MAX_ETIQUETA_REVISION, MAX_ITEMS_REVISION, type ConsultaSesion, type EstadoSesion, type ItemRevision } from './contexto-sesion'
import type { MaterialNuevo } from './nuevo-hoy'
import type { RespuestaRevision } from './sesion-claude'

/**
 * Armar una sesión a medida: la plataforma conoce el historial de cada concepto y pregunta, así que
 * ella decide qué es «fallada», «por repasar» o «de las que más trabajo dieron» y filtra. Claude sólo
 * traduce el pedido a esa consulta y, cuando la persona pide un tema libre, revisa la lista corta ya
 * filtrada. Todo lo de aquí es una función pura sobre datos que la aplicación ya tiene.
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

/**
 * La ventana que se revisa con Claude: como mucho 150 fichas. Si hay más, primero entran las que
 * ya mencionan algún término pedido (sin tildes ni mayúsculas) y después el resto en su orden.
 */
export function ventanaDeRevision(candidatas: FichaSesion[], terminos: readonly string[], maximo = MAX_ITEMS_REVISION): FichaSesion[] {
  if (candidatas.length <= maximo) return candidatas
  const buscados = terminos.map(sinAcentos).filter(Boolean)
  const toca = (f: FichaSesion) => { const t = sinAcentos(`${f.titulo} ${f.detalle}`); return buscados.some(b => t.includes(b)) }
  return [...candidatas.filter(toca), ...candidatas.filter(f => !toca(f))].slice(0, maximo)
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
 * Elige, en el orden recibido, lo que cabe en los minutos pedidos. En una sesión mixta alterna tres
 * conceptos y una pregunta; si falta de un tipo, sigue con el otro. Siempre entra al menos un ítem.
 */
export function armarSesion(candidatas: FichaSesion[], c: Pick<ConsultaSesion, 'fuente' | 'minutos'>, ritmo: RitmoSesion): SesionArmada {
  const conceptos = c.fuente === 'nbme' ? [] : candidatas.filter(f => f.tipo === 'concepto')
  const preguntas = c.fuente === 'conceptos' ? [] : candidatas.filter(f => f.tipo === 'pregunta' && f.revision)
  const tope = c.minutos * MARGEN
  const elegidos = { conceptos: [] as FichaSesion[], preguntas: [] as FichaSesion[] }
  let total = 0, pos = 0
  const proximo = (tipo: 'concepto' | 'pregunta') => tipo === 'concepto' ? conceptos[elegidos.conceptos.length] : elegidos.preguntas.length < MAX_PREGUNTAS_SESION ? preguntas[elegidos.preguntas.length] : undefined
  const coste = (tipo: 'concepto' | 'pregunta') => tipo === 'concepto' ? ritmo.conceptoMin : ritmo.preguntaMin
  while (true) {
    const turno: 'concepto' | 'pregunta' = pos % (CONCEPTOS_POR_PREGUNTA + 1) < CONCEPTOS_POR_PREGUNTA ? 'concepto' : 'pregunta'
    const orden: ('concepto' | 'pregunta')[] = turno === 'concepto' ? ['concepto', 'pregunta'] : ['pregunta', 'concepto']
    // Keep room for an NBME item in a short mixed block when both kinds fit.
    const reservarPregunta = c.fuente === 'mixto' && elegidos.conceptos.length > 0 && !elegidos.preguntas.length
      && proximo('pregunta') && total + coste('pregunta') <= tope && total + coste('concepto') + coste('pregunta') > tope
    const elegido = reservarPregunta ? 'pregunta' : orden.find(t => proximo(t) && (elegidos.conceptos.length + elegidos.preguntas.length === 0 || total + coste(t) <= tope))
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

/** Lo que la plataforma entendió, para que la persona pueda corregirlo antes de armar nada. */
export function describirConsulta(c: ConsultaSesion): string {
  const tema = [...c.sistemas, ...c.disciplinas, ...c.terminos.map(t => `«${t}»`)]
  return [tema.length ? tema.join(' + ') : 'todo el material', c.estados.length ? c.estados.map(s => ETIQUETA_ESTADO[s]).join(' o ') : '',
    ETIQUETA_FUENTE[c.fuente], `≈ ${c.minutos} min`].filter(Boolean).join(' · ')
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

// ---------------------------------------------------------------------------------------------
// De la consulta a la sesión
// ---------------------------------------------------------------------------------------------

export type ResultadoSesion =
  | { estado: 'lista'; material: MaterialNuevo; conceptos: number; preguntas: number; minutos: number
      /** Cuántas se revisaron con Claude y cuántas encajaron; ausente si la consulta no pedía un tema libre. */
      revision?: { revisadas: number; encajan: number; deTotal: number; ampliada?: boolean }
      incompleta?: 'conceptos' | 'preguntas'
      aviso?: string
      /** Preguntas NBME en revisión de fuente que no se pudieron juzgar con la IA. */
      sinRevisar: number }
  | { estado: 'vacio'; motivo: string }
  | { estado: 'sin_ia'; motivo: string }

export interface EntradaResolver {
  consulta: ConsultaSesion
  /** Lo que la persona pidió, con sus palabras y lo que fue eligiendo. */
  pedido: string
  fichas: FichaSesion[]
  ritmo: RitmoSesion
  revisar: (pedido: string, consulta: ConsultaSesion, items: ItemRevision[], signal?: AbortSignal) => Promise<RespuestaRevision>
  signal?: AbortSignal
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

/** Bound the work and spending; each round keeps the existing 150-item API limit. */
export const MAX_RONDAS_BUSQUEDA = 5

function ventanaMixta(fichas: FichaSesion[], consulta: ConsultaSesion): FichaSesion[] {
  if (consulta.fuente !== 'mixto' || fichas.length <= MAX_ITEMS_REVISION) return ventanaDeRevision(fichas, consulta.terminos)
  const preguntas = ventanaDeRevision(fichas.filter(f => f.tipo === 'pregunta'), consulta.terminos, 50)
  const conceptos = ventanaDeRevision(fichas.filter(f => f.tipo === 'concepto'), consulta.terminos, MAX_ITEMS_REVISION - preguntas.length)
  const chosen = new Set([...preguntas, ...conceptos].map(f => f.id))
  for (const f of ventanaDeRevision(fichas.filter(f => !chosen.has(f.id)), consulta.terminos, MAX_ITEMS_REVISION - chosen.size)) chosen.add(f.id)
  return fichas.filter(f => chosen.has(f.id))
}

export async function resolverSesion(e: EntradaResolver): Promise<ResultadoSesion> {
  const { consulta, pedido } = e
  const iniciales = filtrarFichas(e.fichas, consulta)
  let candidatas = iniciales
  let revision: { revisadas: number; encajan: number; deTotal: number; ampliada?: boolean } | undefined
  let sinRevisar = 0
  if (consulta.terminos.length) {
    candidatas = []
    const vistas = new Set<string>(), disponibles = new Set(iniciales.map(f => f.id))
    let revisadas = 0, ampliada = false
    const falta = (tipo: FichaSesion['tipo']) => (consulta.fuente === 'mixto' || consulta.fuente === (tipo === 'concepto' ? 'conceptos' : 'nbme'))
      && !candidatas.some(f => f.tipo === tipo)
    for (let ronda = 0; ronda < MAX_RONDAS_BUSQUEDA; ronda++) {
      if (e.signal?.aborted) return { estado: 'sin_ia', motivo: 'Se canceló la búsqueda.' }
      let pendientes = iniciales.filter(f => !vistas.has(f.id) && falta(f.tipo))
      if (!pendientes.length && (falta('concepto') || falta('pregunta'))) {
        // Keep history/source filters. Only taxonomy broadens, and Claude must verify the exact topic.
        pendientes = filtrarFichas(e.fichas, { ...consulta, sistemas: [], disciplinas: [] })
          .filter(f => !vistas.has(f.id) && falta(f.tipo))
        if (pendientes.length) ampliada = true
      }
      if (!pendientes.length) break
      pendientes.forEach(f => disponibles.add(f.id))
      const ventana = ventanaMixta(pendientes, consulta)
      const r = await e.revisar(pedido, consulta, ventana.map(aItemRevision), e.signal)
      if (e.signal?.aborted) return { estado: 'sin_ia', motivo: 'Se canceló la búsqueda.' }
      if (r.estado !== 'ok') return { estado: 'sin_ia', motivo: r.motivo }
      ventana.forEach(f => vistas.add(f.id))
      const elegidas = new Set(r.ids)
      candidatas.push(...ventana.filter(f => elegidas.has(f.id)))
      sinRevisar += r.sinRevisar
      revisadas += r.revisadas ?? Math.max(0, ventana.length - r.sinRevisar)
      if (!falta('concepto') && !falta('pregunta')) break
    }
    revision = { revisadas, encajan: candidatas.length, deTotal: disponibles.size, ...(ampliada ? { ampliada: true } : {}) }
    if (!candidatas.length) return { estado: 'vacio', motivo: `No encontré material verificable que encaje con ${consulta.terminos.map(t => `«${t}»`).join(', ')} después de buscar alternativas.${sinRevisar ? ` ${plural(sinRevisar, 'pregunta sigue', 'preguntas siguen')} sin una fuente utilizable para esta búsqueda.` : ''} Puedes pedir otro tema o una sesión más amplia.` }
  }
  if (!candidatas.length) return { estado: 'vacio', motivo: explicarVacio(e.fichas, consulta) }
  const armada = armarSesion(candidatas, consulta, e.ritmo)
  const material: MaterialNuevo = {
    conceptIds: armada.conceptIds, preguntas: armada.preguntas, titulo: consulta.titulo, nbmeSessionId: null, cada: armada.cada,
    subtitulo: pedido.length > 140 ? `${pedido.slice(0, 139)}…` : pedido,
  }
  const incompleta = consulta.fuente !== 'mixto' ? undefined : !armada.preguntas.length ? 'preguntas' : !armada.conceptIds.length ? 'conceptos' : undefined
  const tipoFaltante = incompleta === 'preguntas' ? 'pregunta' : 'concepto'
  const aviso = !incompleta ? undefined : candidatas.some(f => f.tipo === tipoFaltante)
    ? `Hay ${incompleta} pertinentes, pero no caben junto al otro material en el tiempo pedido. Puedes pedir una sesión más larga.`
    : `No encontré ${incompleta} verificables del tema para completar la mezcla. Puedes empezar con lo disponible o pedir otro tema.`
  return { estado: 'lista', material, conceptos: armada.conceptIds.length, preguntas: armada.preguntas.length, minutos: armada.minutos,
    ...(revision ? { revision } : {}), sinRevisar, ...(incompleta ? { incompleta, aviso } : {}) }
}
