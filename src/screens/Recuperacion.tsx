import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { NOMBRE_INTERACCION } from '../schema/concept'
import { estaVencido, prioridad, retencion, DIA } from '../srs/fsrs'
import { cercaniaDominio, type Cercania } from '../srs/cercania'
import { erroresRecientesPendientes } from '../lib/plan-estudio'
import { EtiquetaEstado, Vacio } from '../components/comunes'
import { ScreenHeading } from '../components/Editorial'
import { useNbme } from '../nbme/NbmeProvider'
import { questionProgress } from '../nbme/model'
import type { NbmeQuestionRef } from '../nbme/types'
import type { OpcionesSesionPersonalizada } from '../lib/busqueda'

const TAMANOS = [5, 10, 20] as const

/** Cuándo deja de bloquear la separación, dicho en el lenguaje de quien espera. */
function fechaDisponible(cuando: number | null, ahora: number): string {
  if (cuando === null) return 'sin fecha'
  const horas = (cuando - ahora) / 3_600_000
  if (horas <= 0) return 'ya disponible'
  if (horas < 24) return `en ${Math.ceil(horas)} h`
  return new Date(cuando).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })
}

/**
 * Recuperación reúne en un sitio lo que hoy estaba repartido: conceptos vencidos
 * o fallados hace poco y preguntas NBME sin corregir. Arriba va lo más barato —
 * lo que con un acierto más cruza el umbral de dominio.
 */
export function Recuperacion({ onEstudiar, onPreguntas, onMezclar }: {
  onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void
  onPreguntas: (refs: NbmeQuestionRef[], titulo: string) => void
  onMezclar: (conceptIds: string[], refs: NbmeQuestionRef[], titulo: string) => void
}) {
  const { indice, estado } = useApp()
  const nbme = useNbme()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  const [limite, setLimite] = useState<(typeof TAMANOS)[number]>(10)

  useEffect(() => {
    if (!indice) return
    let activo = true
    setError(false)
    cargarTodo(indice.modulos).then(cs => { if (activo) setConceptos(cs) }).catch(() => { if (activo) setError(true) })
    return () => { activo = false }
  }, [indice, reintento])

  const preguntas = useMemo<NbmeQuestionRef[]>(() => (nbme.catalog?.questions ?? [])
    .filter(q => q.status === 'ready' && questionProgress(nbme.state, q.id).pendingError)
    .map(q => ({ id: q.id, revision: q.revision })), [nbme.catalog, nbme.state])

  if (error) return <Vacio titulo="No se pudo cargar la recuperación" texto="Tu historial se conserva. Comprueba la conexión y vuelve a intentarlo."
    accion={<button className="btn" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button>} />
  if (!conceptos) return <div className="vacio" role="status">Cargando lo que toca recuperar…</div>

  const ahora = Date.now()
  const porPrioridad = (a: Concepto, b: Concepto) =>
    prioridad(estado.progreso[b.concept_id]!, ahora) - prioridad(estado.progreso[a.concept_id]!, ahora)
  const cercania = new Map<string, Cercania>()
  for (const c of conceptos) {
    const p = estado.progreso[c.concept_id]
    if (p) cercania.set(c.concept_id, cercaniaDominio(p, estado.criterios, ahora))
  }
  // «Cerca de dominio» son sólo los que de verdad cierran con un acierto más. Los que
  // ya tienen los aciertos y lo único que les falta es la separación en el tiempo van
  // aparte: responderlos hoy no adelanta ese reloj.
  const cerca = conceptos.filter(c => cercania.get(c.concept_id)?.bastaUnAcierto).sort(porPrioridad)
  const esperando = conceptos.filter(c => cercania.get(c.concept_id)?.esperandoSeparacion)
    .sort((a, b) => (cercania.get(a.concept_id)!.disponibleDesde ?? 0) - (cercania.get(b.concept_id)!.disponibleDesde ?? 0))
  const yaContados = new Set([...cerca, ...esperando].map(c => c.concept_id))

  const vencidos = conceptos
    .filter(c => { const p = estado.progreso[c.concept_id]; return p && estaVencido(p, ahora) && !yaContados.has(c.concept_id) })
    .sort((a, b) => prioridad(estado.progreso[b.concept_id]!, ahora) - prioridad(estado.progreso[a.concept_id]!, ahora))
  const errores = erroresRecientesPendientes(conceptos, estado.progreso, ahora)
    .filter(c => !yaContados.has(c.concept_id) && !vencidos.some(v => v.concept_id === c.concept_id))
  const paraConceptos = [...vencidos, ...errores]

  const idsMezcla = [...cerca, ...paraConceptos].slice(0, limite).map(c => c.concept_id)
  const refsMezcla = preguntas.slice(0, Math.min(Math.max(1, Math.ceil(limite / 3)), preguntas.length, 20))
  const nada = !cerca.length && !esperando.length && !paraConceptos.length && !preguntas.length

  const grupo = (
    clave: string, titulo: string, texto: string, cuenta: number,
    accion: React.ReactNode,
  ) => <section className={`recovery-group recovery-group-${clave}${cuenta ? ' con-pendientes' : ''}`} aria-labelledby={`recuperacion-${clave}`}>
    <div className="recovery-group-copy"><h2 id={`recuperacion-${clave}`}>{titulo} <span className="recovery-count">({cuenta})</span></h2><p className="sutil">{texto}</p></div>
    <div className="recovery-group-action">{cuenta > 0 ? accion : <p className="mini">Nada pendiente en este grupo.</p>}</div>
  </section>

  return <div className="pila recovery-workspace">
    <ScreenHeading landscape="lens" eyebrow="Lo que te debe la memoria" title="Recuperación" scene="fluid"
      description="Lo que fallaste y lo que vence, en un solo sitio. Empieza por lo que está a un acierto de consolidarse." />

    {esperando.length > 0 && cerca.length === 0 && <div className="aviso" role="status"><span>ⓘ</span><div>
      {esperando.length === 1 ? 'Un concepto tiene' : `${esperando.length} conceptos tienen`} ya todos los aciertos que pide el umbral;
      lo único que falta es que pase el tiempo de separación. Repasarlos hoy no los marcará como dominados.
    </div></div>}

    <div className="fila recovery-toolbar" role="group" aria-label="Tamaño de la sesión de recuperación">
      <label htmlFor="limite-recuperacion">Carga de la sesión</label>
      <select id="limite-recuperacion" style={{ width: 'auto' }} value={limite}
        onChange={e => setLimite(Number(e.target.value) as (typeof TAMANOS)[number])}>
        {TAMANOS.map(n => <option key={n} value={n}>{n} elementos</option>)}
      </select>
    </div>

    {nada && <Vacio titulo="No hay nada que recuperar ahora" texto="Ni repasos vencidos, ni errores recientes, ni preguntas por corregir. Vuelve a Mi semana cuando quieras." />}

    {grupo('cerca', 'Cerca de dominio', 'Sólo les falta un acierto independiente: hoy sí cruzan el umbral.', cerca.length,
      <button className="btn principal" style={{ alignSelf: 'flex-start' }}
        onClick={() => onEstudiar(cerca.slice(0, limite).map(c => c.concept_id), { titulo: 'Cerca de dominio', subtitulo: 'Un acierto más y quedan consolidados.', ruta: 'repaso', modulo: 'recuperacion' })}>
        Consolidar ahora ({Math.min(limite, cerca.length)})
      </button>)}

    {esperando.length > 0 && <section className="tarjeta pila" aria-labelledby="recuperacion-esperando">
      <div><h2 id="recuperacion-esperando">Esperando separación ({esperando.length})</h2>
        <p className="sutil">Ya tienen los aciertos que pide el umbral. Lo único que falta es tiempo:
          el dominio exige que los aciertos estén separados {estado.criterios.separacionHoras} h, y ese
          reloj no se adelanta respondiendo otra vez. Acertarlos hoy no los acredita.</p></div>
      <ul className="espera-lista">
        {esperando.slice(0, 12).map(c => <li key={c.concept_id}>
          <span>{c.objetivo}</span>
          <span className="etq">{fechaDisponible(cercania.get(c.concept_id)!.disponibleDesde, ahora)}</span>
        </li>)}
      </ul>
      {esperando.length > 12 && <p className="mini">Y {esperando.length - 12} más.</p>}
      <button className="btn fantasma" style={{ alignSelf: 'flex-start' }}
        onClick={() => onEstudiar(esperando.slice(0, limite).map(c => c.concept_id), { titulo: 'Repaso sin acreditar', subtitulo: 'Refuerzo voluntario: el umbral sigue esperando su separación.', ruta: 'repaso', modulo: 'recuperacion' })}>
        Repasarlos igualmente ({Math.min(limite, esperando.length)})
      </button>
    </section>}

    {grupo('conceptos', 'Conceptos', 'Repasos vencidos por el planificador y errores de los últimos siete días.', paraConceptos.length,
      <button className="btn principal" style={{ alignSelf: 'flex-start' }}
        onClick={() => onEstudiar(paraConceptos.slice(0, limite).map(c => c.concept_id), { titulo: 'Recuperación de conceptos', subtitulo: 'Vencidos y errores recientes.', ruta: 'repaso', modulo: 'recuperacion' })}>
        Recuperar ahora ({Math.min(limite, paraConceptos.length)})
      </button>)}

    {grupo('preguntas', 'Preguntas', 'Preguntas NBME cuyo último intento sigue sin corregir.', preguntas.length,
      <div className="pila">
        <button className="btn principal" style={{ alignSelf: 'flex-start' }} disabled={nbme.busy || nbme.loading}
          onClick={() => onPreguntas(preguntas.slice(0, Math.min(limite, 20)), 'Recuperación de preguntas')}>
          Corregir ahora ({Math.min(limite, preguntas.length, 20)})
        </button>
        {!nbme.catalog && <p className="mini">El banco de preguntas todavía no está disponible en esta sesión.</p>}
      </div>)}

    {(idsMezcla.length > 0 && refsMezcla.length > 0) && <section className="tarjeta pila" aria-labelledby="recuperacion-mezcla">
      <div><h2 id="recuperacion-mezcla">Mezclar</h2>
        <p className="sutil">Una sesión mixta al vuelo con lo que haya de ambos: una pregunta cada tres conceptos.</p></div>
      <button className="btn principal" style={{ alignSelf: 'flex-start' }} disabled={nbme.busy || nbme.loading}
        onClick={() => onMezclar(idsMezcla, refsMezcla, 'Recuperación mixta')}>
        Mezclar {idsMezcla.length} conceptos y {refsMezcla.length} preguntas
      </button>
    </section>}

    {paraConceptos.length > 0 && <details className="tarjeta detalles-estudio">
      <summary>Ver conceptos y detalles del planificador</summary>
      <p className="mini" style={{ marginTop: 12 }}>La retención es una estimación del planificador, no una medición directa de tu memoria. Puedes estudiar sin revisar estos valores.</p>
      <div className="scroll-x">
        <table className="tabla">
          <thead><tr><th>Concepto</th><th>Interacción</th><th>Estado</th><th>Qué falta</th><th>Retención</th><th>Prioridad</th><th>Vencido desde</th></tr></thead>
          <tbody>
            {paraConceptos.slice(0, 60).map(c => {
              const p = estado.progreso[c.concept_id]!
              const r = p.estabilidad > 0 ? retencion((ahora - (p.ultimo ?? ahora)) / DIA, p.estabilidad) : 0
              const atraso = p.proxima ? (ahora - p.proxima) / DIA : 0
              return <tr key={c.concept_id}>
                <td><b style={{ fontWeight: 560 }}>{c.objetivo}</b>
                  <div className="mini">{c.clasificacion.disciplina_primaria} · {c.clasificacion.tema}</div></td>
                <td className="sutil">{NOMBRE_INTERACCION[c.interaccion.recomendada]}</td>
                <td><EtiquetaEstado estado={p.estado} /></td>
                <td className="mini">{cercania.get(c.concept_id)?.faltan.join(' · ') || 'nada'}</td>
                <td style={{ color: r < 0.7 ? 'var(--ambar)' : 'var(--texto-2)' }}>{(r * 100).toFixed(0)} %</td>
                <td>{prioridad(p, ahora).toFixed(2)}</td>
                <td className="sutil">{!p.proxima ? 'sin fecha' : atraso < 1 ? `${Math.max(0, Math.round(atraso * 24))} h` : `${Math.round(atraso)} d`}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </details>}
  </div>
}
