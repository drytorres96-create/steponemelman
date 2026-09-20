import { useEffect, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { NOMBRE_INTERACCION } from '../schema/concept'
import { estaVencido, prioridad, retencion, DIA } from '../srs/fsrs'
import { EtiquetaEstado, Vacio } from '../components/comunes'
import { ScreenHeading } from '../components/Editorial'

export function Repaso({ onEstudiar }: { onEstudiar: (ids: string[]) => void }) {
  const { indice, estado } = useApp()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  const [limite, setLimite] = useState(10)

  useEffect(() => {
    if (!indice) return
    let activo = true
    setError(false)
    cargarTodo(indice.modulos).then(cs => { if (activo) setConceptos(cs) }).catch(() => { if (activo) setError(true) })
    return () => { activo = false }
  }, [indice, reintento])
  if (error) return <Vacio titulo="No se pudo cargar el repaso" texto="Comprueba tu conexión y vuelve a intentarlo."
    accion={<button className="btn" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button>} />
  if (!conceptos) return <div className="vacio">Cargando la cola de repaso…</div>

  const ahora = Date.now()
  const cola = conceptos
    .filter(c => { const p = estado.progreso[c.concept_id]; return p && estaVencido(p, ahora) })
    .sort((a, b) => prioridad(estado.progreso[b.concept_id]!, ahora) - prioridad(estado.progreso[a.concept_id]!, ahora))

  const proximos = conceptos
    .filter(c => { const p = estado.progreso[c.concept_id]; return p?.proxima && p.proxima > ahora })
    .sort((a, b) => estado.progreso[a.concept_id]!.proxima! - estado.progreso[b.concept_id]!.proxima!)
    .slice(0, 8)

  return (
    <div className="pila">
      <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <ScreenHeading eyebrow="Lo que permanece" title="Repaso espaciado"
          description={cola.length ? `${cola.length} conceptos para repasar. Puedes avanzar en sesiones pequeñas.` : 'Todo al día por ahora.'} />
        {cola.length > 0 && (
          <div className="fila">
            <label htmlFor="limite-repaso">Carga de la sesión</label>
            <select id="limite-repaso" style={{ width: 'auto' }} value={limite} onChange={e => setLimite(Number(e.target.value))}>
              {[5, 10, 20].map(n => <option key={n} value={n}>{n} conceptos</option>)}
            </select>
            <button className="btn principal" onClick={() => onEstudiar(cola.slice(0, limite).map(c => c.concept_id))}>
              Repasar ahora ({Math.min(limite, cola.length)})
            </button>
          </div>
        )}
      </div>

      {cola.length === 0 ? (
        <Vacio titulo="Sin repasos pendientes ahora" texto="Los próximos repasos aparecerán aquí cuando corresponda. Puedes continuar con el plan de Inicio." />
      ) : (
        <details className="tarjeta detalles-estudio">
          <summary>Ver conceptos y detalles del planificador</summary>
          <p className="mini" style={{ marginTop: 12 }}>La retención es una estimación del planificador, no una medición directa de tu memoria. Puedes estudiar sin revisar estos valores.</p>
          <div className="scroll-x">
          <table className="tabla">
            <thead><tr><th>Concepto</th><th>Interacción</th><th>Estado</th><th>Retención</th><th>Prioridad</th><th>Vencido desde</th></tr></thead>
            <tbody>
              {cola.slice(0, 60).map(c => {
                const p = estado.progreso[c.concept_id]!
                const r = p.estabilidad > 0 ? retencion((ahora - (p.ultimo ?? ahora)) / DIA, p.estabilidad) : 0
                const atraso = (ahora - p.proxima!) / DIA
                return (
                  <tr key={c.concept_id}>
                    <td><b style={{ fontWeight: 560 }}>{c.objetivo}</b>
                      <div className="mini">{c.clasificacion.disciplina_primaria} · {c.clasificacion.tema}</div></td>
                    <td className="sutil">{NOMBRE_INTERACCION[c.interaccion.recomendada]}</td>
                    <td><EtiquetaEstado estado={p.estado} /></td>
                    <td style={{ color: r < 0.7 ? 'var(--ambar)' : 'var(--texto-2)' }}>{(r * 100).toFixed(0)} %</td>
                    <td>{prioridad(p, ahora).toFixed(2)}</td>
                    <td className="sutil">{atraso < 1 ? `${Math.max(0, Math.round(atraso * 24))} h` : `${Math.round(atraso)} d`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </details>
      )}

      {proximos.length > 0 && (
        <div className="tarjeta">
          <h2 style={{ marginBottom: 10 }}>Próximas revisiones</h2>
          {proximos.map(c => {
            const p = estado.progreso[c.concept_id]!
            const dias = (p.proxima! - ahora) / DIA
            return (
              <div key={c.concept_id} className="fila" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--linea-suave)' }}>
                <span className="sutil">{c.objetivo}</span>
                <span className="etq">{dias < 1 ? `en ${Math.round(dias * 24)} h` : `en ${Math.round(dias)} d`}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
