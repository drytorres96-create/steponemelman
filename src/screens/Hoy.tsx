import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Anillo, AnilloDoble, type SegmentoAnillo } from '../components/comunes'
import { ScenePhoto } from '../components/Editorial'
import { useAuth } from '../auth/AuthProvider'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import type { NbmeQuestionMeta } from '../nbme/types'
import { cargarHistorialSesiones } from '../semana/api'
import { separarGuion } from '../semana/guion'
import type { SesionSemanal } from '../semana/tipos'
import { cargarPlanSemana } from '../plan/api'
import { tituloDeCheckpoint } from '../plan/enlace'
import { esTarea, type PlanSemana } from '../plan/tipos'
import { cajaDeConcepto, cajasDelDia, type ItemCaja } from '../lib/cajas'
import {
  estadoDelDia, inicioDelDia, limitesSemana, referenciaDelDia, temaDeLaSemana,
  type EstadoDia, type TemaSemana,
} from '../lib/dia'
import type { CriteriosDominio } from '../srs/mastery'
import type { ProgresoConcepto } from '../srs/tipos'
import { fechaISO } from '../lib/tiempo'
import { TablaPlanificador } from './TablaPlanificador'
import { estimarBloque } from '../lib/ritmo'
import { hitoSemanalAprendizaje } from '../lib/progreso-aprendizaje'
import { prepararNuevoDeHoy, tituloDeHoy, type MaterialNuevo } from '../lib/nuevo-hoy'
import type { AccionesRecuperacion } from './RecuperarMeta'

const ResumenProgreso = lazy(() => import('./Progreso').then(m => ({ default: m.ResumenProgreso })))

export type { MaterialNuevo } from '../lib/nuevo-hoy'

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
    return { valor, total, segmentos, rotulo: 'Tema de la semana, dominio demostrado',
      leyenda: `el tema de la semana, ${valor} de ${total} con dominio demostrado` }
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

/** Lo que hizo hoy, en cifras. Sin frases de ánimo: el anillo cerrado ya lo dice. */
function fraseCierre(dia: EstadoDia): string {
  const partes = [
    dia.nuevo.conceptos ? plural(dia.nuevo.conceptos, 'concepto nuevo', 'conceptos nuevos') : '',
    dia.nuevo.preguntas ? plural(dia.nuevo.preguntas, 'pregunta', 'preguntas') : '',
    dia.cajas.hechos ? plural(dia.cajas.hechos, 'repaso realizado', 'repasos realizados') : '',
  ].filter(Boolean)
  if (!partes.length) return 'Hoy ya está: no tocaba nada nuevo ni ninguna caja.'
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0]
  return `Hoy ya está: ${lista}.`
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

/** «Cómo va todo»: las cifras de la semana, la meta de 60 días, la adherencia y el plan de la semana. */
function ComoVaTodo(acciones: AccionesRecuperacion) {
  return <Suspense fallback={<p role="status">Abriendo tu progreso…</p>}><ResumenProgreso {...acciones} /></Suspense>
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
 * dos se cierran, los botones desaparecen y la pantalla dice qué se hizo hoy. El
 * techo depende del tipo de día, y el viernes sale cerrado desde que amanece.
 * Debajo, plegado, lo que antes vivía en Mi semana, Recuperación y Progreso.
 * Ningún número de deuda fuera de los desplegables: los techos ya dicen lo que hay
 * que hacer.
 */
export function Hoy({ onNuevo, onCajas, onBiblioteca, onRetomar }: {
  onNuevo: (material: MaterialNuevo) => void
  onCajas: (items: ItemCaja[], titulo: string) => void
  onBiblioteca: (tipo: 'conceptos' | 'preguntas') => void
  onRetomar?: AccionesRecuperacion['onRetomar']
}) {
  const { indice, estado, sincronizacion } = useApp()
  const { session } = useAuth()
  const token = session?.access_token ?? ''
  const nbme = useNbme()
  useTic()
  // Se lee en cada render: lo recién respondido nunca queda por delante del reloj de la portada.
  const ahora = Date.now()
  const limites = limitesSemana(ahora)
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
    // Pedir el lunes mantiene el plan junto a los guiones hasta el domingo,
    // aunque el evento termine el sábado. El día de estudio cambia a las 3:00.
    cargarPlanSemana(token, limites.inicio).then(p => { if (vivo) setPlan(p) })
    return () => { vivo = false }
  }, [token, diaDeEstudio, limites.inicio])

  const intentosPreguntas = useMemo(() => Object.values(nbme.state.attempts), [nbme.state.attempts])

  const publicados = useMemo(() => new Set(indice?.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos)) ?? []), [indice])
  const listas = useMemo(() => new Map<string, NbmeQuestionMeta>((nbme.catalog?.questions ?? [])
    .filter(q => q.status === 'ready').map(q => [q.id, q])), [nbme.catalog])
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
  const hito = useMemo(() => hitoSemanalAprendizaje(Object.values(estado.progreso).filter(p => publicados.has(p.concept_id)),
    new Date(`${limites.inicio}T03:00:00`).getTime(), ahora, estado.criterios), [estado.progreso, estado.criterios, publicados, limites.inicio, ahora])

  // Sin el banco de preguntas no se sabe qué entra hoy; sin él tras un fallo, el día sigue sin preguntas.
  const bancoListo = !!nbme.catalog || (!nbme.loading && !!nbme.error)
  if (!bancoListo || (!sesiones && !fallo)) return <div className="vacio" role="status">Preparando tu día…</div>

  // El viernes va vacío a propósito: sale cerrado desde que amanece, sin botones ni cuentas,
  // y lo que venza entra en el techo del sábado. No depende de nada que tenga que cargar.
  const viernes = dia.tipo === 'vacio'
  // Sin las sesiones de la semana no se puede dar lo nuevo por cerrado: el día queda abierto.
  const nuevoConocido = !!sesiones || viernes
  const completo = nuevoConocido && dia.completo
  // Recién abierto un dispositivo, «ya está» sólo se dice cuando llegó el progreso de la cuenta:
  // un cierre calculado sobre una copia local a medias mandaría a cerrar el portátil con trabajo pendiente.
  const esperandoCuenta = (sincronizacion?.estado === 'inicializando' || sincronizacion?.estado === 'sincronizando') && !sincronizacion?.ultima
  const esperandoBanco = (nbme.syncStatus?.state === 'initializing' || nbme.syncStatus?.state === 'syncing') && !nbme.syncStatus?.lastSyncedAt
  if (completo && (esperandoCuenta || esperandoBanco)) return <div className="vacio" role="status">Preparando tu día…</div>
  const fecha = new Date(inicioDelDia(ahora)).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  // El título identifica la sesión NBME de hoy en cualquier dispositivo: no depende del idioma del navegador.
  const tituloCajas = tituloDeHoy('Cajas', ahora)

  const hechosNuevo = Math.min(dia.nuevo.conceptos, dia.nuevo.techoConceptos) + Math.min(dia.nuevo.preguntas, dia.nuevo.techoPreguntas)
  const techoNuevo = dia.nuevo.techoConceptos + dia.nuevo.techoPreguntas
  const hechosCajas = Math.min(dia.cajas.hechos, dia.cajas.techo)
  const interior = { valor: hechosNuevo + hechosCajas, total: techoNuevo + dia.cajas.techo,
    etiqueta: viernes ? 'Hoy, viernes sin estudio, pasos hechos' : completo ? 'Hoy, día cerrado, pasos hechos' : 'Hoy, pasos hechos' }

  const cajasAbiertas = !dia.cajas.cerrada
  const nuevoAbierto = nuevoConocido && !dia.nuevo.cerrada
  const ahoraToca = viernes ? 'Viernes: hoy no toca nada, a propósito. Lo que venza hoy entra el sábado.'
    : completo ? fraseCierre(dia)
    : cajasAbiertas && nuevoAbierto ? 'Primero las cajas, que ya las conoces. Después, lo nuevo de la semana.'
    : cajasAbiertas ? 'Te quedan las cajas de hoy.'
    : nuevoAbierto ? 'Ahora, lo nuevo de la semana.'
    : 'Lo nuevo de la semana no se pudo cargar; las cajas de hoy están hechas.'

  const empezarNuevo = () => {
    onNuevo(prepararNuevoDeHoy(entrada, listas, nbme.state))
  }

  const { conceptos: c, techoConceptos: tc, preguntas: q, techoPreguntas: tq } = dia.nuevo
  const cuentaNuevo = [
    tc || !tq ? `${Math.min(c, tc)} / ${tc} ${tc === 1 ? 'concepto' : 'conceptos'}` : '',
    tq ? `${Math.min(q, tq)} / ${tq} ${tq === 1 ? 'pregunta' : 'preguntas'}` : '',
  ].filter(Boolean).join(' · ')
  const pendientesCajas = cajas.items.filter(i => !i.hecho)
  const siguiente = cajasAbiertas ? 'cajas' : nuevoAbierto ? 'nuevo' : null
  const bloqueConceptos = siguiente === 'cajas' ? pendientesCajas.slice(0, 5).filter(i => i.tipo === 'concepto').length : Math.min(3, Math.max(0, tc - c))
  const bloquePreguntas = siguiente === 'cajas' ? pendientesCajas.slice(0, 5).filter(i => i.tipo === 'pregunta').length : Math.min(1, Math.max(0, tq - q))
  const tiempo = estimarBloque(estado.progreso, intentosPreguntas, { conceptos: bloqueConceptos, preguntas: bloquePreguntas })
  const retomar = hechosCajas + hechosNuevo > 0
  const quedan = interior.total - interior.valor

  return <div className="pila hoy hoy-focus">
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
        <p className="mini hoy-leyenda">Dentro, trabajo realizado hoy. Fuera, {anillo.leyenda}.</p>
      </div>
    </header>

    <p className="hoy-ahora" role="status">{ahoraToca}</p>
    {!completo && siguiente && <section className="tarjeta hoy-next-block" aria-labelledby="siguiente-bloque">
      <p className="rotulo">{retomar ? 'Retomamos aquí' : 'Tu siguiente bloque'}</p>
      <h2 id="siguiente-bloque">{siguiente === 'cajas' ? 'Repasar y mantener lo aprendido' : 'Avanzar en el tema de la semana'}</h2>
      <p className="hoy-objective">{bloqueConceptos > 0 && plural(bloqueConceptos, 'concepto', 'conceptos')}
        {bloqueConceptos > 0 && bloquePreguntas > 0 && ' + '}{bloquePreguntas > 0 && plural(bloquePreguntas, 'pregunta', 'preguntas')} en el siguiente bloque.</p>
      {siguiente === 'cajas' && pendientesCajas.some(i => i.mantenimiento) && <p className="mini">Incluye mantenimiento de conceptos cuyo dominio ya demostraste.</p>}
      {tiempo && <p className="mini">{tiempo}</p>}
      <button className="btn principal" onClick={siguiente === 'cajas' ? () => onCajas(pendientesCajas, tituloCajas) : empezarNuevo}>
        {siguiente === 'cajas' ? hechosCajas ? 'Seguir con las cajas' : 'Empezar las cajas' : hechosNuevo ? 'Seguir con lo nuevo' : 'Empezar lo nuevo'}
      </button>
      <p className="mini hoy-progress-summary">Tu objetivo de hoy: {interior.total} pasos dentro de tu techo diario. Avance: {interior.valor} hechos · quedan {quedan}. Las respuestas falladas también cuentan como trabajo realizado.</p>
    </section>}
    {completo && <section className="tarjeta hoy-completion" aria-labelledby="dia-terminado">
      <span className="rotulo">Plan de hoy terminado</span><h2 id="dia-terminado">Puedes cerrar por hoy.</h2>
      <p>{viernes ? 'Hoy es tu día libre.' : `Completaste ${interior.valor} pasos de tu plan.`}</p>
      <p className="mini">Tu práctica queda guardada. Al volver, Hoy preparará los repasos que correspondan y lo siguiente de tu semana.</p>
    </section>}
    {hito.conceptos > 0 && <p className="learning-milestone" role="note">
      Esta semana confirmaste {hito.conceptos} {hito.conceptos === 1 ? 'concepto' : 'conceptos'} sin ayuda después de al menos 24 h.
      {hito.nuevosDominios > 0 && ` ${hito.nuevosDominios} con dominio demostrado y un hito registrado esta semana.`}
      {hito.mantenimientoConfirmado > 0 && ` ${hito.mantenimientoConfirmado} en mantenimiento confirmado.`}
    </p>}

    <div className="hoy-bloques hoy-progress-summary">
      {viernes
        ? <p className="hoy-bloque-hecho"><span className="hoy-marca" aria-hidden="true">✓</span>
          <span>Cajas · el viernes no toca ninguna</span></p>
        : dia.cajas.cerrada
        ? <p className="hoy-bloque-hecho"><span className="hoy-marca" aria-hidden="true">✓</span>
          <span>{dia.cajas.techo ? `Cajas · ${hechosCajas} / ${dia.cajas.techo}` : 'Cajas · hoy no toca ninguna'}</span></p>
        : <section className="tarjeta hoy-bloque" aria-labelledby="hoy-cajas">
          <Anillo valor={hechosCajas} total={dia.cajas.techo} tam={76} etiqueta="cajas" />
          <div className="hoy-bloque-texto">
            <h2 id="hoy-cajas">Cajas</h2>
            <p className="hoy-cuenta">{hechosCajas} / {dia.cajas.techo} {dia.cajas.techo === 1 ? 'caja' : 'cajas'}</p>
            <p className="mini">Consolidación y mantenimiento dentro del techo de hoy.</p>
          </div>
        </section>}

      {!nuevoConocido
        ? <section className="tarjeta hoy-bloque" aria-labelledby="hoy-nuevo">
          <div className="hoy-bloque-texto" style={{ gridColumn: '1 / 3' }}>
            <h2 id="hoy-nuevo">Nuevo</h2>
            <p className="mini" role="alert">No se pudieron cargar las sesiones de la semana. Tu progreso está a salvo.</p>
          </div>
          <button className="btn" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button>
        </section>
        : viernes
          ? <p className="hoy-bloque-hecho"><span className="hoy-marca" aria-hidden="true">✓</span>
            <span>Nuevo · el viernes no toca</span></p>
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
            {siguiente !== 'nuevo' && <button className="btn fantasma" onClick={empezarNuevo}>
              {hechosNuevo ? 'Seguir con lo nuevo' : 'Empezar lo nuevo'}
            </button>}
          </section>}
    </div>

    <Desplegable titulo="Cómo va todo">{() => <ComoVaTodo onNuevo={onNuevo} onCajas={onCajas} onRetomar={onRetomar} />}</Desplegable>
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
