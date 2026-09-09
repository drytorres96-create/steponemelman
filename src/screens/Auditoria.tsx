import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarCuarentena, cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { NOMBRE_INTERACCION } from '../schema/concept'
import { Modal, PanelFuente, Vacio } from '../components/comunes'
import { leer, escribir } from '../store/db'
import { useDescarga } from '../components/descarga'

type Correccion = { tema?: string; disciplina_primaria?: string; sistema_primario?: string; nota?: string }
const CLAVE = 'correcciones-auditoria'

export function Auditoria() {
  const { indice } = useApp()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [cuarentena, setCuarentena] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [doc, setDoc] = useState('')
  const [pagina, setPagina] = useState('')
  const [soloAlertas, setSoloAlertas] = useState(false)
  const [abierto, setAbierto] = useState<Concepto | null>(null)
  const [correcciones, setCorrecciones] = useState<Record<string, Correccion>>({})
  const [verCuarentena, setVerCuarentena] = useState(false)
  const { entregar: descargar, dialogo } = useDescarga()

  useEffect(() => {
    if (!indice) return
    cargarTodo(indice.modulos).then(setConceptos)
    cargarCuarentena().then(d => setCuarentena(d.conceptos ?? []))
    leer<Record<string, Correccion>>(CLAVE).then(c => c && setCorrecciones(c))
  }, [indice])

  const filtrados = useMemo(() => {
    if (!conceptos) return []
    const t = q.trim().toLowerCase()
    return conceptos.filter(c => {
      if (doc && c.source.doc !== doc) return false
      if (pagina && String(c.source.page) !== pagina.trim()) return false
      if (soloAlertas && c.calidad.alertas.length === 0) return false
      if (!t) return true
      return c.concept_id.toLowerCase().includes(t) || c.afirmacion.toLowerCase().includes(t) ||
             c.respuesta_canonica.toLowerCase().includes(t) || (c.clasificacion.tema ?? '').toLowerCase().includes(t)
    }).slice(0, 300)
  }, [conceptos, q, doc, pagina, soloAlertas])

  const guardar = (id: string, patch: Correccion) => {
    const next = { ...correcciones, [id]: { ...correcciones[id], ...patch } }
    setCorrecciones(next); escribir(CLAVE, next)
  }

  if (!conceptos) return <div className="vacio">Cargando el corpus…</div>

  const exportarCSV = () => {
    const filas = [['concept_id','doc','page','disciplina','sistema','tipo','interaccion','confianza','alertas','afirmacion','respuesta']]
    for (const c of filtrados) filas.push([c.concept_id, c.source.doc, String(c.source.page),
      c.clasificacion.disciplina_primaria, c.clasificacion.sistema_primario, c.clasificacion.tipo_conocimiento,
      c.interaccion.recomendada, String(c.calidad.confianza), c.calidad.alertas.join(' | '),
      c.afirmacion, c.respuesta_canonica])
    descargar('corpus-auditoria.csv', filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv')
  }

  return (
    <div className="pila">
      {dialogo}
      <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Panel de auditoría</h1>
          <p className="sutil" style={{ margin: 0 }}>
            El corpus necesita revisión continua. Aquí se ve la fuente y el concepto lado a lado, con sus alertas.
          </p>
        </div>
        <div className="fila">
          <button className="btn pequeno fantasma" onClick={() => setVerCuarentena(true)}>Cuarentena ({cuarentena.length})</button>
          <button className="btn pequeno" onClick={exportarCSV}>Exportar CSV</button>
          <button className="btn pequeno" onClick={() => descargar('corpus-filtrado.json', JSON.stringify(filtrados, null, 1), 'application/json')}>Exportar JSON</button>
        </div>
      </div>

      <div className="aviso"><span>⚠</span><div>
        Las revisiones de fidelidad, coherencia médica y coherencia pedagógica de este corpus las realizó un sistema
        de inteligencia artificial. <b>No se presentan como revisión humana</b> y el material conserva las alertas y
        contradicciones detectadas para que puedas comprobarlas contra el PDF original.
      </div></div>

      <div className="tarjeta fila" style={{ gap: 10 }}>
        <input type="search" placeholder="Buscar por concept_id, afirmación, respuesta o tema…" value={q}
          onChange={e => setQ(e.target.value)} aria-label="Buscar conceptos" style={{ flex: 2, minWidth: 240 }} />
        <select value={doc} onChange={e => setDoc(e.target.value)} aria-label="Filtrar por documento" style={{ width: 'auto', minWidth: 180 }}>
          <option value="">Todos los PDF</option>
          {(indice?.documentos ?? []).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="text" inputMode="numeric" placeholder="Página" value={pagina} onChange={e => setPagina(e.target.value)}
          aria-label="Filtrar por página" style={{ width: 100 }} />
        <label className="fila" style={{ gap: 6 }}>
          <input type="checkbox" checked={soloAlertas} onChange={e => setSoloAlertas(e.target.checked)} style={{ width: 'auto' }} />
          Sólo con alertas
        </label>
        <span className="mini" style={{ marginLeft: 'auto' }}>{filtrados.length} resultados</span>
      </div>

      <div className="tarjeta scroll-x" style={{ padding: 0 }}>
        <table className="tabla">
          <thead><tr><th>concept_id</th><th>Fuente</th><th>Clasificación</th><th>Interacción</th><th>Confianza</th><th>Alertas</th><th></th></tr></thead>
          <tbody>
            {filtrados.map(c => (
              <tr key={c.concept_id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '.75rem' }}>{c.concept_id}
                  <div className="mini" style={{ fontFamily: 'var(--fuente)' }}>{c.afirmacion.slice(0, 64)}…</div></td>
                <td className="sutil">{c.source.doc}<div className="mini">p. {c.source.page}</div></td>
                <td className="sutil">{correcciones[c.concept_id]?.disciplina_primaria ?? c.clasificacion.disciplina_primaria}
                  <div className="mini">{c.clasificacion.sistema_primario} · {c.clasificacion.tipo_conocimiento}</div></td>
                <td className="sutil">{NOMBRE_INTERACCION[c.interaccion.recomendada]}
                  <div className="mini">prohibidas: {c.interaccion.prohibidas.length ? c.interaccion.prohibidas.join(', ') : '—'}</div></td>
                <td style={{ color: c.calidad.confianza < 0.8 ? 'var(--ambar)' : undefined }}>{(c.calidad.confianza * 100).toFixed(0)}%</td>
                <td>{c.calidad.alertas.length ? <span className="etq ambar">{c.calidad.alertas.length}</span> : <span className="mini">—</span>}</td>
                <td><button className="btn pequeno fantasma" onClick={() => setAbierto(c)}>Revisar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && <Vacio titulo="Sin resultados" texto="Ajusta la búsqueda o los filtros." />}
      </div>

      {abierto && (
        <Modal titulo={abierto.concept_id} onCerrar={() => setAbierto(null)} ancho={900}>
          <div className="rejilla r2" style={{ alignItems: 'start' }}>
            <PanelFuente c={abierto} />
            <div className="pila" style={{ gap: 12 }}>
              <div>
                <div className="rotulo" style={{ marginBottom: 6 }}>Pregunta publicada</div>
                <p style={{ margin: 0 }}>{abierto.evaluacion.pregunta}</p>
              </div>
              {abierto.evaluacion.opciones?.length ? (
                <div>
                  <div className="rotulo" style={{ marginBottom: 6 }}>Opciones</div>
                  {abierto.evaluacion.opciones.map((o, i) => (
                    <div key={i} className="sutil" style={{ marginBottom: 4 }}>
                      {o.correcta ? '✓' : '·'} {o.texto}{!o.correcta && o.por_que ? ` — ${o.por_que}` : ''}
                    </div>
                  ))}
                </div>
              ) : null}
              <div>
                <div className="rotulo" style={{ marginBottom: 6 }}>Corregir metadatos</div>
                <p className="mini">Se guarda en tu dispositivo y se puede exportar; no modifica el componente ni el corpus original.</p>
                <label>Tema</label>
                <input type="text" defaultValue={correcciones[abierto.concept_id]?.tema ?? abierto.clasificacion.tema}
                  onBlur={e => guardar(abierto.concept_id, { tema: e.target.value })} />
                <label style={{ marginTop: 8, display: 'block' }}>Nota de revisión</label>
                <textarea rows={3} defaultValue={correcciones[abierto.concept_id]?.nota ?? ''}
                  onBlur={e => guardar(abierto.concept_id, { nota: e.target.value })} />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {verCuarentena && (
        <Modal titulo={`Conceptos en cuarentena (${cuarentena.length})`} onCerrar={() => setVerCuarentena(false)} ancho={880}>
          <p className="sutil">No se publican. Cada uno indica por qué requiere revisión humana antes de estudiarse.</p>
          <div className="scroll-x"><table className="tabla">
            <thead><tr><th>concept_id</th><th>Fuente</th><th>Motivo</th><th>Confianza</th></tr></thead>
            <tbody>{cuarentena.map((c: any) => (
              <tr key={c.concept_id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '.75rem' }}>{c.concept_id}
                  <div className="mini" style={{ fontFamily: 'var(--fuente)' }}>{c.afirmacion}</div></td>
                <td className="sutil">{c.source?.doc} p. {c.source?.page}</td>
                <td className="sutil">{c.motivo}</td>
                <td>{c.confianza != null ? `${(c.confianza * 100).toFixed(0)}%` : '—'}</td>
              </tr>))}</tbody>
          </table></div>
        </Modal>
      )}
    </div>
  )
}
