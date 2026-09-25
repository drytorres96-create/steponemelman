import { useEffect, useState } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { cargarConceptos } from '../data/corpus'
import { NOMBRE_INTERACCION, type Concepto } from '../schema/concept'
import { DIA, retencion } from '../srs/fsrs'
import { cercaniaDominio } from '../srs/cercania'
import { EtiquetaEstado } from '../components/comunes'
import { cajaDeConcepto, escalonDePregunta, type ItemCaja } from '../lib/cajas'

/**
 * Lo que estoy cerrando: la tabla de detalle del planificador, que vivía al final de
 * Recuperación, ahora con las cajas de hoy. Es para cuando se quiere mirar por qué
 * algo está ahí —con qué caja entró, qué le falta para cerrarse y cuánto estima el
 * planificador que se recuerda—, no para decidir qué estudiar.
 */
export function TablaPlanificador({ items, ahora }: { items: ItemCaja[]; ahora: number }) {
  const { indice, estado } = useApp()
  const nbme = useNbme()
  const [conceptos, setConceptos] = useState<Map<string, Concepto> | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  const ids = items.filter(i => i.tipo === 'concepto').map(i => i.id)
  const clave = ids.join('|')

  useEffect(() => {
    if (!indice) return
    let vivo = true
    setError(false)
    cargarConceptos(ids, indice.modulos).then(mapa => { if (vivo) setConceptos(mapa) }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
    // `ids` se recalcula en cada render; lo que cambia la carga es su contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, indice, reintento])

  if (!items.length) return <p className="mini">Hoy no hay cajas: nada que explicar.</p>
  if (error) return <div className="pila"><p className="mini" role="alert">No se pudo cargar el detalle de las cajas.</p>
    <div><button className="btn pequeno fantasma" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button></div></div>
  if (!conceptos) return <p className="mini" role="status">Cargando el detalle…</p>

  const preguntas = new Map((nbme.catalog?.questions ?? []).map(q => [q.id, q]))
  const intentosPregunta = (id: string) => Object.values(nbme.state.attempts).filter(a => a.questionId === id)

  return <div className="pila">
    <p className="mini">La retención es una estimación del planificador, no una medición directa de tu memoria. Puedes estudiar sin revisar estos valores.</p>
    <div className="scroll-x">
      <table className="tabla">
        <thead><tr><th>Caja de hoy</th><th>Entró en</th><th>Qué falta para cerrarla</th><th>Retención</th><th>Estado</th><th>Interacción</th></tr></thead>
        <tbody>
          {items.map(item => {
            const hoy = <span className={`etq${item.hecho ? ' verde' : ''}`}>{item.hecho ? 'Hecha' : 'Por hacer'}</span>
            if (item.tipo === 'pregunta') {
              const q = preguntas.get(item.id)
              const escalon = escalonDePregunta(intentosPregunta(item.id))?.escalon
              const quedan = escalon === 'cerrado' ? 0 : 3 - ((escalon ?? 1) - 1)
              const falta = quedan ? `${quedan} ${quedan === 1 ? 'acierto' : 'aciertos'} en días distintos` : 'nada: cerrada'
              return <tr key={`pregunta:${item.id}`}>
                <td><b style={{ fontWeight: 560 }}>{q ? `NBME ${q.form} · pregunta ${q.item}` : item.id}</b>
                  <div className="mini">{q?.topic ?? 'Pregunta del banco'} · {hoy}</div></td>
                <td>caja {item.caja}</td>
                <td className="mini">{falta}</td>
                <td className="sutil">—</td>
                <td className="sutil">Pregunta fallada</td>
                <td className="sutil">Pregunta NBME</td>
              </tr>
            }
            const c = conceptos.get(item.id)
            const p = estado.progreso[item.id]
            if (!c || !p) return <tr key={`concepto:${item.id}`}><td colSpan={6} className="mini">Este concepto ya no está en el material publicado.</td></tr>
            const r = p.estabilidad > 0 ? retencion((ahora - (p.ultimo ?? ahora)) / DIA, p.estabilidad) : 0
            const cerrado = cajaDeConcepto(p, estado.criterios, ahora) === 'cerrado'
            const faltan = cerrado ? 'nada: cerrado' : cercaniaDominio(p, estado.criterios, ahora).faltan.join(' · ') || 'nada'
            return <tr key={`concepto:${item.id}`}>
              <td><b style={{ fontWeight: 560 }}>{c.objetivo}</b>
                <div className="mini">{c.clasificacion.disciplina_primaria} · {c.clasificacion.tema} · {hoy}</div></td>
              <td>caja {item.caja}</td>
              <td className="mini">{faltan}</td>
              <td style={{ color: r < 0.7 ? 'var(--ambar)' : 'var(--texto-2)' }}>{(r * 100).toFixed(0)} %</td>
              <td><EtiquetaEstado estado={p.estado} /></td>
              <td className="sutil">{NOMBRE_INTERACCION[c.interaccion.recomendada]}</td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>
}
