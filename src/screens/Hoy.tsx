import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Anillo, AnilloDoble, type SegmentoAnillo } from '../components/comunes'
import { ScenePhoto } from '../components/Editorial'
import { useAuth } from '../auth/AuthProvider'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { deriveNbmeSession } from '../nbme/model'
import type { NbmeQuestionMeta, NbmeQuestionRef, NbmeState } from '../nbme/types'
import { cargarHistorialSesiones } from '../semana/api'
import { separarGuion } from '../semana/guion'
import type { SesionSemanal } from '../semana/tipos'
import { cargarPlanSemana } from '../plan/api'
import { tituloDeCheckpoint } from '../plan/enlace'
import { esTarea, type PlanSemana } from '../plan/tipos'
import { cajaDeConcepto, cajasDelDia, type ItemCaja } from '../lib/cajas'
import {
  estadoDelDia, inicioDelDia, limitesSemana, materialNuevo, referenciaDelDia, temaDeLaSemana,
  type EstadoDia, type TemaSemana,
} from '../lib/dia'
import type { CriteriosDominio } from '../srs/mastery'
import type { ProgresoConcepto } from '../srs/tipos'
import { fechaISO } from '../lib/tiempo'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { BandaDeCifras } from './ProgresoCifras'
import { ProgresoHorizonte } from './ProgresoHorizonte'
import { BandaAdherencia } from './ProgresoAdherencia'
import { CalendarioSemana } from './CalendarioSemana'
import { TablaPlanificador } from './TablaPlanificador'

export interface MaterialNuevo {
  conceptIds: string[]
  preguntas: NbmeQuestionRef[]
  titulo: string
  /** Sesión NBME de lo nuevo de hoy que puede retomarse en lugar de abrir otra. */
  nbmeSessionId: string | null
}

interface AnilloSemana {
  valor: number
  total: number
  segmentos: SegmentoAnillo[]
  /** Para el lector de pantalla: qué mide, antes de las cifras. */
  rotulo: string
  /** Para la vista: qué mide y cuánto, en una frase. */
  leyenda: string
}

/**
 * El tema de la semana: conceptos cerrados sobre los que traen sus guiones, un
 * tramo por sesión. Sin sesiones esta semana, el anillo mide lo hecho del plan y
 * lo dice; sin plan tampoco, se queda vacío y lo dice. Nunca desaparece.
 */
function anilloDeLaSemana(tema: TemaSemana | null, plan: PlanSemana | null,
  progreso: Record<string, ProgresoConcepto>, criterios: CriteriosDominio, ahora: number): AnilloSemana {
  if (tema?.sesiones.length) {
    const cerrado = (id: string) => {
      const p = progreso[id]
      return !!p && cajaDeConcepto(p, criterios, ahora) === 'cerrado'
    }
    const segmentos = tema.sesiones.map(s => {
      const ids = [...new Set(separarGuion(s.guion).conceptIds)]
      return { valor: ids.filter(cerrado).length, total: ids.length }
    })
    const valor = tema.conceptIds.filter(cerrado).length, total = tema.conceptIds.length
    return { valor, total, segmentos, rotulo: 'Tema de la semana, conceptos cerrados',
      leyenda: `el tema de la semana, ${valor} de ${total} conceptos cerrados` }
  }
  if (!plan) return { valor: 0, total: 0, segmentos: [], rotulo: 'Sin semana planificada',
    leyenda: 'la semana, todavía sin sesiones planificadas' }
  const sesionesPlan = plan.checkpoints.filter(cp => tituloDeCheckpoint(cp) !== null)
  const base = sesionesPlan.length ? sesionesPlan : plan.checkpoints.filter(esTarea)
  const valor = base.filter(cp => cp.done).length
  return {
    valor, total: base.length,
    segmentos: base.map(cp => ({ valor: cp.done ? 1 : 0, total: 1 })),
    rotulo: sesionesPlan.length ? 'Sesiones de la semana hechas' : 'Compromisos del plan hechos',
    leyenda: sesionesPlan.length ? `las sesiones de la semana, ${valor} de ${base.length} hechas`
      : `el plan de la semana, ${valor} de ${base.length} compromisos hechos`,
  }
}

/** `S2 · 14–19 sep · Reproductivo (1/2)` → el tema, sin la semana ni las fechas. */
function rotuloTema(tema: TemaSemana | null, plan: PlanSemana | null): string {
  if (plan) {
    const partes = plan.titulo.split(' · ')
    return partes.length > 2 ? partes.slice(2).join(' · ') : plan.titulo
  }
  if (tema?.sesiones.length) return `Semana ${tema.sesiones[0].semana}`
  return 'Sin tema de la semana'
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Lo que hizo hoy, en cifras. Sin frases de ánimo: el anillo cerrado ya lo dice. */
function fraseCierre(dia: EstadoDia): string {
  const partes = [
    dia.nuevo.conceptos ? plural(dia.nuevo.conceptos, 'concepto nuevo', 'conceptos nuevos') : '',
    dia.nuevo.preguntas ? plural(dia.nuevo.preguntas, 'pregunta', 'preguntas') : '',
    dia.cajas.hechos ? plural(dia.cajas.hechos, 'caja cerrada', 'cajas cerradas') : '',
  ].filter(Boolean)
  if (!partes.length) return 'Hoy ya está: no tocaba nada nuevo ni ninguna caja.'
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0]
  return `Hoy ya está: ${lista}.`
}

/**
 * Una sesión NBME de lo nuevo de hoy que quedó a medias y sigue limpia —su
 * siguiente paso es una pregunta sin responder y le faltan justo las que tocan—
 * se retoma en lugar de abrir otra encima de las mismas preguntas.
 */
function sesionNuevoReutilizable(state: NbmeState, titulo: string, desde: number, refs: NbmeQuestionRef[]): string | null {
  if (!refs.length) return null
  for (const s of Object.values(state.sessions)) {
    if (s.title !== titulo || s.startedAt < desde) continue
    const vista = deriveNbmeSession(state, s.id)
    if (vista?.phase !== 'question' || vista.current?.round !== 0) continue
    const libres = s.initial.filter((_, posicion) => !state.attempts[`${s.id}:${posicion}`])
    if (libres.length === refs.length && libres.every((r, k) => r.id === refs[k].id && r.revision === refs[k].revision)) return s.id
  }
  return null
}

/**
 * Un desplegable cerrado por defecto que sólo monta su contenido al abrirse: lo que
 * hay dentro carga el corpus, el plan o la adherencia, y nada de eso debe pagarse
 * —ni verse— mientras nadie lo mira.
 */
function Desplegable({ titulo, children }: { titulo: string; children: () => ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return <details className="hoy-desplegable" open={abierto}>
    <summary onClick={e => { e.preventDefault(); setAbierto(a => !a) }}>{titulo}</summary>
    {abierto && <div className="hoy-desplegable-cuerpo">{children()}</div>}
  </details>
}

/** «Cómo va todo»: las cifras de Progreso tal como estaban, la adherencia y el plan de la semana. */
function ComoVaTodo() {
  const { indice } = useApp()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [fallo, setFallo] = useState(false)
  const [reintento, setReintento] = useState(0)
  useEffect(() => {
    if (!indice) return
    let vivo = true
    setFallo(false)
    cargarTodo(indice.modulos).then(cs => { if (vivo) setConceptos(cs) }).catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [indice, reintento])
  return <div className="pila">
    {conceptos ? <>
      <BandaDeCifras conceptos={conceptos} ventana="semana" />
      <ProgresoHorizonte conceptos={conceptos} />
    </> : fallo ? <div className="pila"><p className="mini" role="alert">No se pudieron cargar las cifras del material. Tu progreso está a salvo.</p>
      <div><button className="btn pequeno fantasma" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button></div></div>
      : <p className="mini" role="status">Cargando las cifras…</p>}
    <BandaAdherencia />
    <CalendarioSemana />
  </div>
}

/** Repinta cada minuto: el día cambia a las 3:00 aunque la pestaña siga abierta. */
function useTic(cada = 60_000): void {
  const [, setTic] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTic(n => n + 1), cada)
    return () => clearInterval(t)
  }, [cada])
}

/**
 * La portada, y la única pantalla. Todo cabe en ella y el techo lo pone el sitio:
 * dos vías con su cuenta y su botón, cajas primero y lo nuevo después. Cuando las
 * dos se cierran, los botones desaparecen y la pantalla dice qué se hizo hoy.
 * Debajo, plegado, lo que antes vivía en Mi semana, Recuperación y Progreso.
 * Ningún número de deuda fuera de los desplegables: los techos ya dicen lo que hay
 * que hacer.
 */
export function Hoy({ onNuevo, onCajas, onBiblioteca }: {
  onNuevo: (material: MaterialNuevo) => void
  onCajas: (items: ItemCaja[], titulo: string) => void
  onBiblioteca: (tipo: 'conceptos' | 'preguntas') => void
}) {
  const { indice, estado, sincronizacion } = useApp()
  const { session } = useAuth()
  const token = session?.access_token ?? ''
  const nbme = useNbme()
  useTic()
  // Se lee en cada render: lo recién respondido nunca queda por delante del reloj de la portada.
  const ahora = Date.now()
  const diaDeEstudio = fechaISO(new Date(inicioDelDia(ahora)))
  const [sesiones, setSesiones] = useState<SesionSemanal[] | null>(null)
  const [fallo, setFallo] = useState(false)
  const [reintento, setReintento] = useState(0)
  const [plan, setPlan] = useState<PlanSemana | null>(null)

  useEffect(() => {
    let vivo = true
    setFallo(false)
    cargarHistorialSesiones().then(s => { if (vivo) setSesiones(s) }).catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [reintento])
  // El plan sólo pone el rótulo y la reserva del anillo: nunca bloquea la portada.
  useEffect(() => {
    let vivo = true
    cargarPlanSemana(token, diaDeEstudio).then(p => { if (vivo) setPlan(p) })
    return () => { vivo = false }
  }, [token, diaDeEstudio])

  const intentosPreguntas = useMemo(() => Object.values(nbme.state.attempts), [nbme.state.attempts])

  const publicados = useMemo(() => new Set(indice?.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos)) ?? []), [indice])
  const listas = useMemo(() => new Map<string, NbmeQuestionMeta>((nbme.catalog?.questions ?? [])
    .filter(q => q.status === 'ready').map(q => [q.id, q])), [nbme.catalog])
  const limites = limitesSemana(ahora)
  const tema = useMemo(() => sesiones ? temaDeLaSemana(sesiones, limites.inicio, limites.fin) : null,
    [sesiones, limites.inicio, limites.fin])

  const cajas = cajasDelDia({
    progreso: estado.progreso, criterios: estado.criterios, intentosPreguntas,
    conceptoDisponible: id => publicados.has(id), preguntaDisponible: id => listas.has(id),
    referencia: referenciaDelDia(estado.progreso, intentosPreguntas, ahora), ahora,
  })
  const entrada = {
    progreso: estado.progreso, intentosPreguntas,
    conceptosSemana: (tema?.conceptIds ?? []).filter(id => publicados.has(id)),
    preguntasSemana: (tema?.preguntaIds ?? []).filter(id => listas.has(id)),
    cajas, ahora,
  }
  const dia = estadoDelDia(entrada)
  const anillo = anilloDeLaSemana(tema, plan, estado.progreso, estado.criterios, ahora)

  // Sin el banco de preguntas no se sabe qué entra hoy; sin él tras un fallo, el día sigue sin preguntas.
  const bancoListo = !!nbme.catalog || (!nbme.loading && !!nbme.error)
  if (!bancoListo || (!sesiones && !fallo)) return <div className="vacio" role="status">Preparando tu día…</div>

  // Sin las sesiones de la semana no se puede dar lo nuevo por cerrado: el día queda abierto.
  const nuevoConocido = !!sesiones
  const completo = nuevoConocido && dia.completo
  // Recién abierto un dispositivo, «ya está» sólo se dice cuando llegó el progreso de la cuenta:
  // un cierre calculado sobre una copia local a medias mandaría a cerrar el portátil con trabajo pendiente.
  const esperandoCuenta = (sincronizacion?.estado === 'inicializando' || sincronizacion?.estado === 'sincronizando') && !sincronizacion?.ultima
  const esperandoBanco = (nbme.syncStatus?.state === 'initializing' || nbme.syncStatus?.state === 'syncing') && !nbme.syncStatus?.lastSyncedAt
  if (completo && (esperandoCuenta || esperandoBanco)) return <div className="vacio" role="status">Preparando tu día…</div>
  const fecha = new Date(inicioDelDia(ahora)).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  // El título identifica la sesión NBME de hoy en cualquier dispositivo: no depende del idioma del navegador.
  const inicioHoy = new Date(inicioDelDia(ahora))
  const diaMes = `${inicioHoy.getDate()} ${MESES[inicioHoy.getMonth()]}`
  const tituloCajas = `Cajas de hoy · ${diaMes}`
  const tituloNuevo = `Nuevo de hoy · ${diaMes}`

  const hechosNuevo = Math.min(dia.nuevo.conceptos, dia.nuevo.techoConceptos) + Math.min(dia.nuevo.preguntas, dia.nuevo.techoPreguntas)
  const techoNuevo = dia.nuevo.techoConceptos + dia.nuevo.techoPreguntas
  const hechosCajas = Math.min(dia.cajas.hechos, dia.cajas.techo)
  const interior = { valor: hechosNuevo + hechosCajas, total: techoNuevo + dia.cajas.techo,
    etiqueta: completo ? 'Hoy, día cerrado, pasos hechos' : 'Hoy, pasos hechos' }

  const cajasAbiertas = !dia.cajas.cerrada
  const nuevoAbierto = nuevoConocido && !dia.nuevo.cerrada
  const ahoraToca = completo ? fraseCierre(dia)
    : cajasAbiertas && nuevoAbierto ? 'Primero las cajas, que ya las conoces. Después, lo nuevo de la semana.'
    : cajasAbiertas ? 'Te quedan las cajas de hoy.'
    : nuevoAbierto ? 'Ahora, lo nuevo de la semana.'
    : 'Lo nuevo de la semana no se pudo cargar; las cajas de hoy están hechas.'

  const empezarNuevo = () => {
    const material = materialNuevo(entrada)
    const preguntas = material.preguntas.map(id => listas.get(id)).filter((q): q is NbmeQuestionMeta => !!q)
      .map(q => ({ id: q.id, revision: q.revision }))
    onNuevo({ conceptIds: material.conceptos, preguntas, titulo: tituloNuevo,
      nbmeSessionId: sesionNuevoReutilizable(nbme.state, tituloNuevo, inicioDelDia(ahora), preguntas) })
  }

  const { conceptos: c, techoConceptos: tc, preguntas: q, techoPreguntas: tq } = dia.nuevo
  const cuentaNuevo = [
    tc || !tq ? `${Math.min(c, tc)} / ${tc} ${tc === 1 ? 'concepto' : 'conceptos'}` : '',
    tq ? `${Math.min(q, tq)} / ${tq} ${tq === 1 ? 'pregunta' : 'preguntas'}` : '',
  ].filter(Boolean).join(' · ')

  return <div className="pila hoy">
    <header className="semana-encabezado hoy-cabecera" data-depth-scene>
      <ScenePhoto scene="dawn" />
      <div className="hoy-anillo">
        <AnilloDoble interior={interior} exterior={{ valor: anillo.valor, total: anillo.total, etiqueta: anillo.rotulo }}
          segmentos={anillo.segmentos} cerrado={completo} />
      </div>
      <div className="semana-heading-copy">
        <p className="editorial-eyebrow">{fecha}</p>
        <h1>Hoy</h1>
        <p className="hoy-tema">{rotuloTema(tema, plan)}</p>
        <p className="mini hoy-leyenda">Dentro, el día. Fuera, {anillo.leyenda}.</p>
      </div>
    </header>

    <p className="hoy-ahora" role="status">{ahoraToca}</p>

    <div className="hoy-bloques">
      {dia.cajas.cerrada
        ? <p className="hoy-bloque-hecho"><span className="hoy-marca" aria-hidden="true">✓</span>
          <span>{dia.cajas.techo ? `Cajas · ${hechosCajas} / ${dia.cajas.techo}` : 'Cajas · hoy no toca ninguna'}</span></p>
        : <section className="tarjeta hoy-bloque" aria-labelledby="hoy-cajas">
          <Anillo valor={hechosCajas} total={dia.cajas.techo} tam={76} etiqueta="cajas" />
          <div className="hoy-bloque-texto">
            <h2 id="hoy-cajas">Cajas</h2>
            <p className="hoy-cuenta">{hechosCajas} / {dia.cajas.techo} {dia.cajas.techo === 1 ? 'caja' : 'cajas'}</p>
            <p className="mini">Lo que viste otros días y todavía no está cerrado.</p>
          </div>
          <button className="btn principal" onClick={() => onCajas(cajas.items.filter(i => !i.hecho), tituloCajas)}>
            {hechosCajas ? 'Seguir con las cajas' : 'Empezar las cajas'}
          </button>
        </section>}

      {!nuevoConocido
        ? <section className="tarjeta hoy-bloque" aria-labelledby="hoy-nuevo">
          <div className="hoy-bloque-texto" style={{ gridColumn: '1 / 3' }}>
            <h2 id="hoy-nuevo">Nuevo</h2>
            <p className="mini" role="alert">No se pudieron cargar las sesiones de la semana. Tu progreso está a salvo.</p>
          </div>
          <button className="btn" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button>
        </section>
        : dia.nuevo.cerrada
          ? <p className="hoy-bloque-hecho"><span className="hoy-marca" aria-hidden="true">✓</span>
            <span>{techoNuevo ? `Nuevo · ${cuentaNuevo}` : 'Nuevo · la semana no trae material por ver'}</span></p>
          : <section className="tarjeta hoy-bloque" aria-labelledby="hoy-nuevo">
            <Anillo valor={hechosNuevo} total={techoNuevo} tam={76} etiqueta="nuevo" />
            <div className="hoy-bloque-texto">
              <h2 id="hoy-nuevo">Nuevo</h2>
              <p className="hoy-cuenta">{cuentaNuevo}</p>
              <p className="mini">Tres conceptos y una pregunta, hasta el techo de hoy.</p>
            </div>
            <button className={`btn${cajasAbiertas ? '' : ' principal'}`} onClick={empezarNuevo}>
              {hechosNuevo ? 'Seguir con lo nuevo' : 'Empezar lo nuevo'}
            </button>
          </section>}
    </div>

    <Desplegable titulo="Cómo va todo">{() => <ComoVaTodo />}</Desplegable>
    {/* Con el día cerrado no hay nada que mirar por qué ni otra puerta al estudio: el cierre no enlaza a más. */}
    {!completo && <Desplegable titulo="Lo que estoy cerrando">{() => <TablaPlanificador items={cajas.items} ahora={ahora} />}</Desplegable>}
    {!completo && <Desplegable titulo="Quiero hacer algo más">{() => <>
      <p className="sutil">Puedes abrir la biblioteca y estudiar por tu cuenta lo que necesites.</p>
      <div className="fila">
        <button className="btn fantasma" onClick={() => onBiblioteca('conceptos')}>Elegir conceptos</button>
        <button className="btn fantasma" onClick={() => onBiblioteca('preguntas')}>Elegir preguntas</button>
      </div>
    </>}</Desplegable>}
  </div>
}
