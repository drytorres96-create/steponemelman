import { useEffect, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { Vacio } from '../components/comunes'
import { estaVencido } from '../srs/fsrs'
import { dominioVigente } from '../srs/mastery'
import { RUTAS } from '../lib/rutas'
import { referenciaPagina } from '../lib/fuente'
import { MapaProgreso } from '../components/MapaProgreso'
import type { OpcionesSesionPersonalizada } from '../lib/busqueda'

export function Progreso({ onEstudiar, onContinuar }: { onContinuar?: () => void; onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void }) {
  const { indice, estado } = useApp()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  const [visiblesRevision, setVisiblesRevision] = useState(20)
  useEffect(() => {
    if (!indice) return
    let activo = true
    setError(false)
    cargarTodo(indice.modulos).then(cs => { if (activo) setConceptos(cs) }).catch(() => { if (activo) setError(true) })
    return () => { activo = false }
  }, [indice, reintento])

  if (error) return <Vacio titulo="No se pudo cargar el progreso" texto="Tu historial se conserva. Comprueba la conexión y vuelve a intentarlo."
    accion={<button className="btn" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button>} />
  if (!conceptos) return <div className="vacio" role="status">Cargando tu progreso…</div>
  const total = conceptos.length
  const publicados = new Set(conceptos.map(c => c.concept_id))
  const progresos = Object.values(estado.progreso).filter(p => publicados.has(p.concept_id))
  const dominados = progresos.filter(p => dominioVigente(p, estado.criterios)).length
  const pendientes = conceptos.filter(c => estado.progreso[c.concept_id]?.intentos.at(-1)?.resultado === 'revision')
  const sesiones = [...estado.sesiones].reverse().slice(0, 12)

  return <div className="pila">
    <div><h1>Progreso</h1><p className="sutil">Evidencia de tu práctica dentro del material publicado. No estima tu probabilidad de aprobar Step 1.</p></div>
    <div className="rejilla r3">{[
      { n: progresos.filter(p => p.intentos.length).length, r: 'conceptos trabajados' },
      { n: progresos.filter(p => estaVencido(p)).length, r: 'para repasar' },
      { n: dominados, r: 'dominio vigente' },
    ].map(x => <div className="tarjeta" key={x.r}><div className="cifra">{x.n}</div><div className="rotulo">{x.r}</div><p className="mini">de {total} disponibles</p></div>)}</div>
    <MapaProgreso conceptos={conceptos} onEstudiar={onEstudiar} onContinuar={onContinuar} />
    {pendientes.length > 0 && <section className="tarjeta pila" aria-labelledby="revision-titulo">
      <h2 id="revision-titulo">Respuestas por revisar ({pendientes.length})</h2>
      <p className="sutil">El corrector automático no pudo decidir. Estas respuestas no cuentan como acierto ni como fallo.</p>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => onEstudiar(pendientes.slice(0, 20).map(c => c.concept_id))}>
        Volver a practicar estas respuestas ({Math.min(20, pendientes.length)})
      </button>
      {pendientes.slice(0, visiblesRevision).map(c => <details key={c.concept_id} className="detalles-estudio">
        <summary>{c.objetivo}</summary>
        <p style={{ marginTop: 8 }}><b>Tu respuesta:</b> {estado.progreso[c.concept_id]?.intentos.at(-1)?.respuesta_dada || 'No disponible en este registro.'}</p>
        <p><b>Respuesta de referencia:</b> {c.respuesta_canonica}</p><p className="sutil">{c.explicacion}</p>
        <p className="mini">{c.source.doc_title}. {referenciaPagina(c.source)}. Consulta la fuente si necesitas aclarar una diferencia.</p>
      </details>)}
      {pendientes.length > visiblesRevision && <button className="btn pequeno fantasma" style={{ alignSelf: 'flex-start' }}
        onClick={() => setVisiblesRevision(n => n + 20)}>Mostrar 20 más ({pendientes.length - visiblesRevision} restantes)</button>}
    </section>}
    <details className="tarjeta"><summary>Ver historial de sesiones</summary><p className="mini">Las cifras cuentan respuestas e incluyen reintentos. Se muestran las 12 sesiones más recientes.</p>
      {!sesiones.length ? <Vacio titulo="Sin sesiones aún" texto="Verás lo que trabajaste, las respuestas correctas y el tiempo activo registrado." />
        : <div className="scroll-x"><table className="tabla">
          <thead><tr><th>Fecha</th><th>Ruta</th><th>Respuestas</th><th>Correctas (incluye reintentos)</th><th>Tiempo de estudio</th></tr></thead>
          <tbody>{sesiones.map(s => <tr key={s.id}>
            <td>{new Date(s.inicio).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td className="sutil">{RUTAS.find(r => r.id === s.ruta)?.nombre || indice?.modulos.flatMap(m => m.sesiones).find(r => r.session_id === s.ruta)?.titulo || 'Sesión de estudio'}</td>
            <td>{s.vistos}</td><td>{s.correctos}{s.vistos ? ` (${Math.round(s.correctos / s.vistos * 100)} %)` : ''}</td><td className="sutil">{Math.round((s.msVisibles ?? s.ms) / 60000)} min{s.msVisibles === undefined ? ' (solo respuestas)' : ''}</td>
          </tr>)}</tbody>
        </table></div>}
    </details>
  </div>
}
