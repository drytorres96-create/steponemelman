import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { Anillo, Vacio } from '../components/comunes'
import { NOMBRE_ERROR, type TipoError } from '../srs/tipos'
import { estaVencido } from '../srs/fsrs'

function Barras({ datos, total }: { datos: { etiqueta: string; n: number; clase?: string }[]; total: number }) {
  return (
    <div className="barras">
      {datos.map(d => (
        <div className="b" key={d.etiqueta}>
          <span className={d.clase}>{d.etiqueta}</span>
          <div className="pista-b"><span style={{ width: `${total ? (d.n / total) * 100 : 0}%` }} /></div>
          <b>{d.n}</b>
        </div>
      ))}
    </div>
  )
}

export function Progreso() {
  const { indice, estado } = useApp()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  useEffect(() => { if (indice) cargarTodo(indice.modulos).then(setConceptos) }, [indice])

  const agregados = useMemo(() => {
    if (!conceptos) return null
    const porDisc = new Map<string, { t: number; d: number }>()
    const porSis = new Map<string, { t: number; d: number }>()
    for (const c of conceptos) {
      const p = estado.progreso[c.concept_id]
      const dom = p?.dominado_en ? 1 : 0
      const d = c.clasificacion.disciplina_primaria, s = c.clasificacion.sistema_primario
      porDisc.set(d, { t: (porDisc.get(d)?.t ?? 0) + 1, d: (porDisc.get(d)?.d ?? 0) + dom })
      porSis.set(s, { t: (porSis.get(s)?.t ?? 0) + 1, d: (porSis.get(s)?.d ?? 0) + dom })
    }
    const errores = new Map<TipoError, number>()
    for (const p of Object.values(estado.progreso)) {
      for (const i of p.intentos) if (i.tipo_error !== 'ninguno') errores.set(i.tipo_error, (errores.get(i.tipo_error) ?? 0) + 1)
    }
    return { porDisc: [...porDisc.entries()].sort((a, b) => b[1].t - a[1].t),
             porSis: [...porSis.entries()].sort((a, b) => b[1].t - a[1].t),
             errores: [...errores.entries()].sort((a, b) => b[1] - a[1]) }
  }, [conceptos, estado.progreso])

  if (!conceptos || !agregados) return <div className="vacio">Cargando el corpus…</div>
  const total = conceptos.length
  const progresos = Object.values(estado.progreso)
  const dominados = progresos.filter(p => p.dominado_en).length
  const debiles = conceptos.filter(c => (estado.progreso[c.concept_id]?.fallos ?? 0) > 0)
    .sort((a, b) => (estado.progreso[b.concept_id]!.fallos) - (estado.progreso[a.concept_id]!.fallos)).slice(0, 12)
  const sesiones = [...estado.sesiones].reverse().slice(0, 12)

  return (
    <div className="pila">
      <div><h1>Progreso</h1><p className="sutil">El progreso mide aprendizaje —recuperaciones correctas y dominio— no páginas visitadas.</p></div>

      <div className="rejilla r4">
        <div className="tarjeta" style={{ display: 'grid', placeItems: 'center' }}>
          <Anillo valor={dominados} total={total} etiqueta="dominio global" oro />
        </div>
        {[
          { n: progresos.filter(p => p.intentos.length).length, r: 'conceptos vistos' },
          { n: progresos.filter(p => p.aciertos > 0).length, r: 'recuperados' },
          { n: progresos.filter(p => estaVencido(p)).length, r: 'vencidos' },
        ].map(x => (
          <div className="tarjeta" key={x.r}><div className="cifra">{x.n}</div><div className="rotulo">{x.r}</div>
            <div className="mini" style={{ marginTop: 8 }}>de {total} aprobados</div></div>
        ))}
      </div>

      <div className="rejilla r2">
        <div className="tarjeta">
          <h2 style={{ marginBottom: 12 }}>Dominio por disciplina</h2>
          <Barras total={Math.max(...agregados.porDisc.map(([, v]) => v.t))}
            datos={agregados.porDisc.map(([k, v]) => ({ etiqueta: `${k}`, n: v.d, clase: `d-${k.replace(/ /g, '\\ ')}` }))} />
          <div className="mini" style={{ marginTop: 10 }}>Barra = conceptos dominados sobre el total de esa disciplina.</div>
        </div>
        <div className="tarjeta">
          <h2 style={{ marginBottom: 12 }}>Dominio por sistema</h2>
          <Barras total={Math.max(...agregados.porSis.map(([, v]) => v.t))}
            datos={agregados.porSis.map(([k, v]) => ({ etiqueta: k, n: v.d }))} />
        </div>
      </div>

      <div className="rejilla r2">
        <div className="tarjeta">
          <h2 style={{ marginBottom: 12 }}>Tipos de error</h2>
          {agregados.errores.length === 0
            ? <Vacio titulo="Sin errores registrados" texto="Cada fallo se clasifica: la adaptación posterior depende del tipo de error, no sólo de acertar o fallar." />
            : <Barras total={Math.max(...agregados.errores.map(([, n]) => n))}
                datos={agregados.errores.map(([k, n]) => ({ etiqueta: NOMBRE_ERROR[k], n }))} />}
        </div>
        <div className="tarjeta">
          <h2 style={{ marginBottom: 12 }}>Conceptos débiles</h2>
          {debiles.length === 0 ? <Vacio titulo="Nada débil todavía" texto="Aparecerán aquí los conceptos que falles más de una vez." /> : (
            <div className="pila" style={{ gap: 6 }}>
              {debiles.map(c => (
                <div key={c.concept_id} className="fila" style={{ justifyContent: 'space-between', gap: 10 }}>
                  <span className="sutil" style={{ flex: 1 }}>{c.afirmacion.slice(0, 72)}</span>
                  <span className="etq rojo">{estado.progreso[c.concept_id]!.fallos}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="tarjeta">
        <h2 style={{ marginBottom: 10 }}>Historial de sesiones</h2>
        {sesiones.length === 0 ? <Vacio titulo="Sin sesiones aún" texto="Cada sesión queda registrada con lo que viste y lo que acertaste." /> : (
          <div className="scroll-x"><table className="tabla">
            <thead><tr><th>Fecha</th><th>Ruta</th><th>Vistos</th><th>Correctos</th><th>Tiempo</th></tr></thead>
            <tbody>{sesiones.map(s => (
              <tr key={s.id}>
                <td>{new Date(s.inicio).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="sutil">{s.ruta}</td><td>{s.vistos}</td>
                <td>{s.correctos}{s.vistos ? ` (${Math.round((s.correctos / s.vistos) * 100)} %)` : ''}</td>
                <td className="sutil">{Math.round(s.ms / 60000)} min</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
