import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { progresoPorForma } from '../nbme/formas'
import { cargarHistorialSesiones } from '../semana/api'
import type { SesionSemanal } from '../semana/tipos'
import type { Concepto } from '../schema/concept'
import { Anillo } from '../components/comunes'
import { useAuth } from '../auth/AuthProvider'
import { cargarTopics } from '../plan/api'
import { evidenciaDiferida, evidenciaPorTopic, porcentajeObservado, type Fraccion, type TopicEstado } from '../lib/retencion-observada'
import { lunesDe } from '../lib/tiempo'
import { hitoSemanalAprendizaje, resumenProgresoAprendizaje } from '../lib/progreso-aprendizaje'

/** El examen es el lunes 21 de diciembre de 2026: todo el ritmo se mide contra esa fecha. */
export const FECHA_EXAMEN = new Date(2026, 11, 21)
const SEMANA_MS = 7 * 24 * 3_600_000

export type Ventana = 'semana' | 'general'

const hecha = (s: SesionSemanal) => s.estado === 'completada' || s.estado === 'auditada'

/** Fecha local del día de una sesión, sin desplazamiento por zona horaria. */
export function fechaDeSesion(s: SesionSemanal): Date {
  const [a, m, d] = s.semanaInicio.split('-').map(Number)
  return new Date(a, m - 1, d + s.dia - 1)
}

export interface Ritmo {
  completadas: number
  planificadas: number
  recientes: number
  porSemana: number
  necesarioPorSemana: number
  semanasRestantes: number
}

export function calcularRitmo(sesiones: SesionSemanal[], ahora = Date.now()): Ritmo {
  const completadas = sesiones.filter(hecha).length
  const recientes = sesiones.filter(s => hecha(s) && ahora - fechaDeSesion(s).getTime() <= 4 * SEMANA_MS && fechaDeSesion(s).getTime() <= ahora).length
  const pendientes = sesiones.filter(s => !hecha(s)).length
  const semanasRestantes = Math.max(1, Math.ceil((FECHA_EXAMEN.getTime() - ahora) / SEMANA_MS))
  return {
    completadas, planificadas: sesiones.length, recientes,
    porSemana: recientes / 4,
    necesarioPorSemana: pendientes / semanasRestantes,
    semanasRestantes,
  }
}

const fraccion = (f: Fraccion) => f.n ? `${porcentajeObservado(f)} % · ${f.favorables}/${f.n} · n=${f.n}` : 'Sin dato · n=0'
const TIPOS = [
  ['recuerdo', 'Recuerdo sin alternativas'], ['discriminacion', 'Discriminación entre alternativas'], ['aplicacion', 'Aplicación clínica'],
] as const

export function BandaDeCifras({ conceptos, conceptIds, cargarDetalleConceptos, ventana, compacta = false }: {
  conceptos?: Concepto[]; conceptIds?: string[]; cargarDetalleConceptos?: () => Promise<Concepto[]>; ventana: Ventana; compacta?: boolean
}) {
  const { estado } = useApp()
  const { session } = useAuth()
  const nbme = useNbme()
  const [sesiones, setSesiones] = useState<SesionSemanal[] | null>(null)
  const [topics, setTopics] = useState<TopicEstado[] | null>(null)
  const [detalleSolicitado, setDetalleSolicitado] = useState(false)
  const [conceptosDetalle, setConceptosDetalle] = useState<Concepto[] | null>(null)
  const [conceptosFallidos, setConceptosFallidos] = useState(false)
  const [topicsLeidos, setTopicsLeidos] = useState(false)
  const [fallo, setFallo] = useState(false)
  useEffect(() => {
    let vivo = true
    setSesiones(null)
    setFallo(false)
    cargarHistorialSesiones().then(s => { if (vivo) setSesiones(s) }).catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [session?.access_token])
  useEffect(() => {
    if (!detalleSolicitado) return
    let vivo = true
    setTopicsLeidos(false)
    cargarTopics(session?.access_token ?? '').then(t => { if (vivo) setTopics(t) })
      .catch(() => { if (vivo) setTopics(null) }).finally(() => { if (vivo) setTopicsLeidos(true) })
    return () => { vivo = false }
  }, [detalleSolicitado, session?.access_token])
  useEffect(() => {
    if (!detalleSolicitado || conceptos || !cargarDetalleConceptos) return
    let vivo = true
    setConceptosDetalle(null)
    setConceptosFallidos(false)
    cargarDetalleConceptos().then(c => { if (vivo) setConceptosDetalle(c) })
      .catch(() => { if (vivo) setConceptosFallidos(true) })
    return () => { vivo = false }
  }, [detalleSolicitado, conceptos, cargarDetalleConceptos])
  const ahora = Date.now(), desde = ventana === 'semana' ? lunesDe().getTime() : 0
  const hasta = ventana === 'semana' ? lunesDe().getTime() + SEMANA_MS : ahora + 1
  const formas = useMemo(() => progresoPorForma(nbme.state, nbme.catalog, desde), [nbme.state, nbme.catalog, desde])
  const preguntas = formas.reduce((n, f) => ({ n: n.n + f.nuevas, favorables: n.favorables + f.primeraVez }), { n: 0, favorables: 0 })
  const ids = useMemo(() => [...new Set(conceptIds ?? (conceptos ?? []).map(c => c.concept_id))], [conceptIds, conceptos])
  const publicados = useMemo(() => new Set(ids), [ids])
  const progresos = useMemo(() => ids.flatMap(id => estado.progreso[id] ? [estado.progreso[id]] : []), [ids, estado.progreso])
  const aprendizaje = useMemo(() => resumenProgresoAprendizaje(ids, estado.progreso, estado.criterios, ahora),
    [ids, estado.progreso, estado.criterios, ahora])
  const evidencia = useMemo(() => evidenciaDiferida(progresos, desde, ahora), [progresos, desde, ahora])
  const hito = useMemo(() => hitoSemanalAprendizaje(progresos, desde, ahora, estado.criterios), [progresos, desde, ahora, estado.criterios])
  const corpusDetalle = conceptos ?? conceptosDetalle
  const detalle = useMemo(() => detalleSolicitado && corpusDetalle && topics
    ? evidenciaPorTopic(corpusDetalle.filter(c => publicados.has(c.concept_id)), estado.progreso, topics, desde, ahora) : [],
  [detalleSolicitado, corpusDetalle, publicados, estado.progreso, topics, desde, ahora])
  const periodo = (sesiones ?? []).filter(s => fechaDeSesion(s).getTime() >= desde && fechaDeSesion(s).getTime() < hasta)
  const plan = { n: periodo.length, favorables: periodo.filter(hecha).length }
  const anillos = [
    { label: ventana === 'semana' ? 'Sesiones de esta semana' : 'Sesiones registradas', ...plan, tam: compacta ? 168 : 236 },
    { label: 'Acierto inicial en preguntas locales', ...preguntas, tam: compacta ? 136 : 194 },
    { label: 'Acierto sin ayuda tras ≥30 días', ...evidencia.retencion, tam: compacta ? 104 : 152 },
  ]
  return <section className={`tarjeta pila${compacta ? ' progress-radial-compact' : ''}`} aria-label={ventana === 'semana' ? 'Resumen de esta semana' : 'Resumen general'}>
    <div className="fila progress-radial-summary">
      <div className="progress-rings" aria-label="Tres dimensiones independientes; no se promedian">
        {anillos.map(a => <div key={a.label} className="progress-ring-layer"><Anillo valor={a.favorables} total={a.n} tam={a.tam} etiqueta={a.label} /></div>)}
        <div className="progress-ring-center"><strong>{sesiones ? plan.favorables : '—'}</strong><span>{compacta ? 'sesiones' : 'sesiones hechas'}</span>{!compacta && <small>{plan.n ? `de ${plan.n} registradas` : 'sin plan registrado'}</small>}</div>
      </div>
      <div className="pila progress-ring-legend">{!compacta && <h2>{ventana === 'semana' ? 'Tu semana, en tres anillos' : 'Tu práctica registrada'}</h2>}
        {anillos.map((a, i) => <p key={a.label}><b>{compacta ? ['Sesiones', 'Acierto inicial', 'Acierto ≥30 d'][i] : `${i === 0 ? 'Exterior' : i === 1 ? 'Medio' : 'Interior'} · ${a.label}`}</b><br />{fraccion(a)}</p>)}
        {fallo && <p role="status">No se pudieron leer las sesiones. Los otros registros se conservan.</p>}
        {!compacta && <p className="mini">Cada anillo conserva su denominador. Las preguntas locales son práctica; estas cifras no estiman aprobación.</p>}
      </div>
    </div>
    {ventana === 'semana' && hito.conceptos > 0 && <p className="mini" aria-label="Evidencia de esta semana">Esta semana comprobaste sin ayuda {hito.conceptos} {hito.conceptos === 1 ? 'concepto' : 'conceptos'} después de ≥24 h desde el intento anterior.</p>}
    <details onToggle={e => { if (e.currentTarget.open) setDetalleSolicitado(true) }}><summary>Qué muestran los anillos y su evidencia</summary>
      <p className="mini">Actividad registrada: {aprendizaje.actividad}/{aprendizaje.total} conceptos · Dominio demostrado: {aprendizaje.dominioDemostrado} · Mantenimiento al día: {aprendizaje.mantenimientoAlDia} · Mantenimiento pendiente: {aprendizaje.mantenimientoPendiente}{aprendizaje.mantenimientoPorComprobar > 0 && <> · Mantenimiento por comprobar: {aprendizaje.mantenimientoPorComprobar}</>}.</p>
      <p className="mini">Exterior: sesiones completadas del periodo. Medio: acierto en preguntas locales respondidas por primera vez. Interior: acierto sin ayuda después de 30 días. Cada uno conserva su denominador; no se promedian ni estiman aprobación.</p>
      <p><b>Acierto tras ≥30 días:</b> {fraccion(evidencia.retencion)}</p>
      <p><b>Errores repetidos tras ≥24 h:</b> {fraccion(evidencia.repeticion)}</p>
      <p className="mini">Correctas/intentadas tras 30 días; falladas/reexaminadas tras un fallo separado al menos 24 h. Parcial cuenta como fallo. Se excluyen ayudas, revisiones y condiciones o versiones no verificables. El intervalo parte del intento inmediatamente anterior.</p>
      <div className="scroll-x"><table className="tabla"><caption>Evidencia por tipo de respuesta</caption><thead><tr><th scope="col">Tipo</th><th scope="col">Acierto ≥30 d</th><th scope="col">Error repetido ≥24 h</th></tr></thead><tbody>{TIPOS.map(([tipo, nombre]) => <tr key={tipo}><th scope="row">{nombre}</th><td>{fraccion(evidencia.porTipo[tipo].retencion)}</td><td>{fraccion(evidencia.porTipo[tipo].repeticion)}</td></tr>)}</tbody></table></div>
      <p className="mini">Recuerdo exige responder sin alternativas; discriminación mide elegir entre ellas; aplicación exige un caso registrado como aplicación. Los formatos antiguos se interpretan de forma conservadora.</p>
      {ventana === 'semana' && hito.conceptos > 0 && <p className="mini">En la comprobación semanal: {hito.porTipo.recuerdo} por recuerdo · {hito.porTipo.discriminacion} por discriminación · {hito.porTipo.aplicacion} por aplicación. Hitos de dominio con fecha verificable bajo tus criterios actuales: {hito.nuevosDominios} obtenidos esta semana · {hito.mantenimientoConfirmado} anteriores comprobados esta semana. Una fecha antigua sin evidencia suficiente no se interpreta como mantenimiento confirmado.</p>}
      <h3>Temas cerrados en el plan</h3>
      {!detalleSolicitado || !topicsLeidos ? <p className="mini" role="status">{detalleSolicitado ? 'Cargando los temas del plan…' : 'El detalle se carga al abrir esta sección.'}</p>
        : topics === null ? <p className="mini">No se pudo consultar el estado de los temas; no se supone que estén cerrados.</p>
        : !corpusDetalle ? <p className="mini" role="status">{conceptosFallidos || !cargarDetalleConceptos ? 'No se pudieron leer los conceptos para asociar la evidencia a los temas.' : 'Cargando el detalle de conceptos…'}</p>
        : <div className="scroll-x"><table className="tabla"><thead><tr><th scope="col">Tema</th><th scope="col">Acierto ≥30 d</th><th scope="col">Error repetido ≥24 h</th></tr></thead><tbody>{detalle.map(t => <tr key={t.nombre}><th scope="row">{t.nombre}</th><td>{fraccion(t.retencion)}</td><td>{fraccion(t.repeticion)}</td></tr>)}</tbody></table></div>}
      <p className="mini">La correspondencia usa la disciplina o el sistema principal del concepto. Cerrado describe el plan; no demuestra dominio.</p>
    </details>
  </section>
}
