import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { Anillo, Vacio } from '../components/comunes'
import { NOMBRE_ERROR, type TipoError } from '../srs/tipos'
import { estaVencido } from '../srs/fsrs'
import { dominioVigente } from '../srs/mastery'
import { erroresRecientesPendientes } from '../lib/plan-estudio'
import { RUTAS } from '../lib/rutas'

function Barras({ datos }: { datos: { etiqueta: string; n: number; total: number; fraccion?: boolean }[] }) {
  return <div className="barras">{datos.map(d => <div className="b" key={d.etiqueta}>
    <span>{d.etiqueta}</span>
    <div className="pista-b"><span style={{ width: `${d.total ? Math.min(100, d.n / d.total * 100) : 0}%` }} /></div>
    <b>{d.fraccion ? `${d.n}/${d.total}` : d.n}</b>
  </div>)}</div>
}

export function Progreso({ onEstudiar }: { onEstudiar: (ids: string[]) => void }) {
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

  const agregados = useMemo(() => {
    if (!conceptos) return null
    const porDisc = new Map<string, { t: number; d: number }>()
    const porSis = new Map<string, { t: number; d: number }>()
    for (const c of conceptos) {
      const p = estado.progreso[c.concept_id]
      const dom = p && dominioVigente(p, estado.criterios) ? 1 : 0
      const d = c.clasificacion.disciplina_primaria, s = c.clasificacion.sistema_primario
      porDisc.set(d, { t: (porDisc.get(d)?.t ?? 0) + 1, d: (porDisc.get(d)?.d ?? 0) + dom })
      porSis.set(s, { t: (porSis.get(s)?.t ?? 0) + 1, d: (porSis.get(s)?.d ?? 0) + dom })
    }
    const errores = new Map<TipoError, number>()
    const publicados = new Set(conceptos.map(c => c.concept_id))
    for (const p of Object.values(estado.progreso).filter(p => publicados.has(p.concept_id))) for (const i of p.intentos) {
      if (i.tipo_error !== 'ninguno' && i.resultado !== 'revision' && i.resultado !== 'correcta') {
        errores.set(i.tipo_error, (errores.get(i.tipo_error) ?? 0) + 1)
      }
    }
    return { porDisc: [...porDisc.entries()].sort((a, b) => b[1].t - a[1].t),
      porSis: [...porSis.entries()].sort((a, b) => b[1].t - a[1].t), errores: [...errores.entries()].sort((a, b) => b[1] - a[1]) }
  }, [conceptos, estado.progreso, estado.criterios])

  if (error) return <Vacio titulo="No se pudo cargar el progreso" texto="Tu historial se conserva. Comprueba la conexión y vuelve a intentarlo."
    accion={<button className="btn" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button>} />
  if (!conceptos || !agregados) return <div className="vacio" role="status">Cargando tu progreso…</div>
  const total = conceptos.length
  const publicados = new Set(conceptos.map(c => c.concept_id))
  const progresos = Object.values(estado.progreso).filter(p => publicados.has(p.concept_id))
  const dominados = progresos.filter(p => dominioVigente(p, estado.criterios)).length
  const debiles = erroresRecientesPendientes(conceptos, estado.progreso).slice(0, 12)
  const pendientes = conceptos.filter(c => estado.progreso[c.concept_id]?.intentos.at(-1)?.resultado === 'revision')
  const sesiones = [...estado.sesiones].reverse().slice(0, 12)

  return <div className="pila">
    <div><h1>Progreso</h1><p className="sutil">Evidencia de tu práctica dentro del material publicado. No estima tu probabilidad de aprobar Step 1.</p></div>
    <div className="rejilla r4">
      <div className="tarjeta" style={{ display: 'grid', placeItems: 'center' }}><Anillo valor={dominados} total={total} etiqueta="dominio vigente" oro /></div>
      {[
        { n: progresos.filter(p => p.intentos.length).length, r: 'conceptos trabajados' },
        { n: progresos.filter(p => p.aciertos > 0).length, r: 'recordados alguna vez' },
        { n: progresos.filter(p => estaVencido(p)).length, r: 'para repasar' },
      ].map(x => <div className="tarjeta" key={x.r}><div className="cifra">{x.n}</div><div className="rotulo">{x.r}</div><p className="mini" style={{ marginTop: 8 }}>de {total} disponibles</p></div>)}
    </div>
    <div className="rejilla r2">
      <div className="tarjeta"><h2 style={{ marginBottom: 12 }}>Dominio por disciplina</h2>
        <Barras datos={agregados.porDisc.map(([k, v]) => ({ etiqueta: k, n: v.d, total: v.t, fraccion: true }))} />
        <p className="mini" style={{ marginTop: 10 }}>Dominio vigente / conceptos publicados de cada disciplina. El material todavía está en ampliación.</p>
      </div>
      <div className="tarjeta"><h2 style={{ marginBottom: 12 }}>Dominio por sistema</h2>
        <Barras datos={agregados.porSis.map(([k, v]) => ({ etiqueta: k, n: v.d, total: v.t, fraccion: true }))} />
        <p className="mini" style={{ marginTop: 10 }}>Dominio vigente / conceptos publicados de cada sistema.</p>
      </div>
    </div>
    <div className="rejilla r2">
      <div className="tarjeta"><h2 style={{ marginBottom: 12 }}>Historial de tipos de error</h2>
        <p className="mini">Incluye errores que después has superado.</p>
        {!agregados.errores.length ? <Vacio titulo="Sin errores registrados" texto="Los errores ayudan a elegir la siguiente práctica." />
          : <Barras datos={agregados.errores.map(([k, n]) => ({ etiqueta: NOMBRE_ERROR[k], n, total: Math.max(...agregados.errores.map(([, n]) => n)) }))} />}
      </div>
      <div className="tarjeta"><h2 style={{ marginBottom: 12 }}>Para reforzar ahora</h2>
        {!debiles.length ? <Vacio titulo="Sin errores recientes pendientes" texto="Esta vista cambia cuando vuelves a responder correctamente." />
          : debiles.map(c => <div key={c.concept_id} className="fila concepto-resumen"><span>{c.objetivo}</span><span className="etq ambar">Reforzar</span></div>)}
      </div>
    </div>
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
        <p className="mini">{c.source.doc_title}, página {c.source.page}. Consulta la fuente si necesitas aclarar una diferencia.</p>
      </details>)}
      {pendientes.length > visiblesRevision && <button className="btn pequeno fantasma" style={{ alignSelf: 'flex-start' }}
        onClick={() => setVisiblesRevision(n => n + 20)}>Mostrar 20 más ({pendientes.length - visiblesRevision} restantes)</button>}
    </section>}
    <div className="tarjeta"><h2 style={{ marginBottom: 10 }}>Historial de sesiones</h2>
      {!sesiones.length ? <Vacio titulo="Sin sesiones aún" texto="Verás lo que trabajaste, las respuestas correctas y el tiempo activo registrado." />
        : <div className="scroll-x"><table className="tabla">
          <thead><tr><th>Fecha</th><th>Ruta</th><th>Trabajados</th><th>Correctos</th><th>Tiempo activo</th></tr></thead>
          <tbody>{sesiones.map(s => <tr key={s.id}>
            <td>{new Date(s.inicio).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td className="sutil">{RUTAS.find(r => r.id === s.ruta)?.nombre || indice?.modulos.flatMap(m => m.sesiones).find(r => r.session_id === s.ruta)?.titulo || 'Sesión de estudio'}</td>
            <td>{s.vistos}</td><td>{s.correctos}{s.vistos ? ` (${Math.round(s.correctos / s.vistos * 100)} %)` : ''}</td><td className="sutil">{Math.round(s.ms / 60000)} min</td>
          </tr>)}</tbody>
        </table></div>}
    </div>
  </div>
}
