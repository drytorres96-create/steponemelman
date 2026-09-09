import { useEffect, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { NOMBRE_INTERACCION } from '../schema/concept'
import { estaVencido, prioridad, retencion, DIA } from '../srs/fsrs'
import { EtiquetaEstado, Vacio } from '../components/comunes'

export function Repaso({ onEstudiar }: { onEstudiar: (ids: string[]) => void }) {
  const { indice, estado } = useApp()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)

  useEffect(() => { if (indice) cargarTodo(indice.modulos).then(setConceptos) }, [indice])
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
        <div>
          <h1>Repaso espaciado</h1>
          <p className="sutil" style={{ margin: 0 }}>
            {cola.length ? `${cola.length} conceptos vencidos · unos ${Math.round(cola.length * 0.8)} minutos` : 'Nada vencido por ahora.'}
          </p>
        </div>
        {cola.length > 0 && (
          <button className="btn principal" onClick={() => onEstudiar(cola.slice(0, 30).map(c => c.concept_id))}>
            Repasar ahora ({Math.min(30, cola.length)})
          </button>
        )}
      </div>

      {cola.length === 0 ? (
        <Vacio titulo="Sin repasos vencidos" texto="El planificador te avisará cuando la retención estimada baje. Mientras tanto, avanza con material nuevo." />
      ) : (
        <div className="tarjeta scroll-x">
          <table className="tabla">
            <thead><tr><th>Concepto</th><th>Interacción</th><th>Estado</th><th>Retención</th><th>Prioridad</th><th>Vencido desde</th></tr></thead>
            <tbody>
              {cola.slice(0, 60).map(c => {
                const p = estado.progreso[c.concept_id]!
                const r = p.estabilidad > 0 ? retencion((ahora - (p.ultimo ?? ahora)) / DIA, p.estabilidad) : 0
                const atraso = (ahora - p.proxima!) / DIA
                return (
                  <tr key={c.concept_id}>
                    <td><b style={{ fontWeight: 560 }}>{c.afirmacion.slice(0, 78)}{c.afirmacion.length > 78 ? '…' : ''}</b>
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
      )}

      {proximos.length > 0 && (
        <div className="tarjeta">
          <h2 style={{ marginBottom: 10 }}>Próximas revisiones</h2>
          {proximos.map(c => {
            const p = estado.progreso[c.concept_id]!
            const dias = (p.proxima! - ahora) / DIA
            return (
              <div key={c.concept_id} className="fila" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--linea-suave)' }}>
                <span className="sutil">{c.afirmacion.slice(0, 70)}</span>
                <span className="etq">{dias < 1 ? `en ${Math.round(dias * 24)} h` : `en ${Math.round(dias)} d`}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
