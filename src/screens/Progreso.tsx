import { useEffect, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { Vacio } from '../components/comunes'
import { estaVencido } from '../srs/fsrs'
import { dominioVigente } from '../srs/mastery'
import { RUTAS } from '../lib/rutas'
import { MapaProgreso } from '../components/MapaProgreso'
import type { OpcionesSesionPersonalizada } from '../lib/busqueda'
import { ScreenHeading } from '../components/Editorial'
import { BandaDeCifras, type Ventana } from './ProgresoCifras'
import { BandaAdherencia } from './ProgresoAdherencia'
import { ProgresoHorizonte } from './ProgresoHorizonte'
import { LecturaSemana } from './LecturaSemana'
import { lunesDe } from '../lib/tiempo'

export function Progreso({ onEstudiar, onContinuar, ventana = 'general' }:
  { onContinuar?: () => void; ventana?: Ventana; onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void }) {
  const { indice, estado } = useApp()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
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
  const semanal = ventana === 'semana'
  const desde = lunesDe().getTime()
  const sesiones = [...estado.sesiones].reverse()
    .filter(s => !semanal || s.inicio >= desde).slice(0, 12)
  const respuestasSemana = progresos.flatMap(p => p.intentos).filter(t => t.ts >= desde).length
  const tarjetas = semanal ? [
    { n: progresos.filter(p => p.intentos.some(t => t.ts >= desde)).length, r: 'conceptos respondidos esta semana' },
    { n: respuestasSemana, r: 'respuestas de concepto esta semana' },
    { n: progresos.filter(p => dominioVigente(p, estado.criterios) && (p.dominado_en ?? 0) >= desde).length, r: 'nuevos dominios esta semana' },
  ] : [
    { n: progresos.filter(p => p.intentos.length).length, r: 'conceptos trabajados' },
    { n: progresos.filter(p => estaVencido(p)).length, r: 'para repasar' },
    { n: dominados, r: 'dominio vigente' },
  ]

  return <div className="pila progress-workspace">
    <ScreenHeading landscape="dawn" eyebrow="Tu recorrido de aprendizaje" title="Progreso" description="Evidencia de tu práctica dentro del material publicado. No estima tu probabilidad de aprobar Step 1." />
    <div className="progress-overview"><BandaAdherencia />
    <BandaDeCifras conceptos={conceptos} ventana={ventana} />
    <div className="rejilla r3 progress-concepts">{tarjetas.map(x => <div className="tarjeta" key={x.r}>
      <div className="cifra">{x.n}</div><div className="rotulo">{x.r}</div><p className="mini">de {total} disponibles</p></div>)}</div></div>
    <LecturaSemana conceptos={conceptos} onEstudiar={onEstudiar} />
    <ProgresoHorizonte conceptos={conceptos} />
    <MapaProgreso conceptos={conceptos} onEstudiar={onEstudiar} onContinuar={onContinuar} />
    <details className="tarjeta"><summary>Ver historial de sesiones</summary><p className="mini">Las cifras cuentan respuestas e incluyen reintentos. Se muestran {semanal ? 'las sesiones de esta semana' : 'las 12 sesiones más recientes'}.</p>
      {!sesiones.length ? <Vacio titulo={semanal ? 'Sin sesiones esta semana' : 'Sin sesiones aún'} texto="Verás lo que trabajaste, las respuestas correctas y el tiempo activo registrado." />
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
