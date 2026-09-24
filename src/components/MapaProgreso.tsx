import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DISCIPLINAS, SISTEMAS, type Concepto } from '../schema/concept'
import { useApp } from '../store/estado'
import { construirMapa, METRICAS_MAPA, type MetricaMapa } from '../lib/mapa-progreso'
import { construirSesionPersonalizada, type OpcionesSesionPersonalizada } from '../lib/busqueda'
import { construirPlanDiario } from '../lib/plan-estudio'
import { cargaPorTiempo } from '../lib/tiempo'

export function MapaProgreso({ conceptos, onEstudiar, onContinuar, resumen }: { resumen?: ReactNode; conceptos: Concepto[]; onContinuar?: () => void; onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void }) {
  const { estado } = useApp()
  const [ahora, setAhora] = useState(Date.now())
  const [metrica, setMetrica] = useState<MetricaMapa>('vencidos')
  const [selected, setSelected] = useState('Cardiovascular:Fisiología')
  const [tamano, setTamano] = useState(10)
  const [grupo, setGrupo] = useState<MetricaMapa | 'todos'>('todos')
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 60000); return () => clearInterval(t) }, [])
  const celdas = useMemo(() => construirMapa(conceptos, estado, ahora), [conceptos, estado.progreso, estado.criterios, ahora])
  const plan = useMemo(() => construirPlanDiario(conceptos, estado.progreso, cargaPorTiempo(20, estado.sesiones), ahora), [conceptos, estado.progreso, estado.sesiones, ahora])
  const celda = celdas.find(c => c.id === selected)!
  const cs = grupo === 'todos' ? celda.conceptos : celda.grupos[grupo]
  const sesion = construirSesionPersonalizada(cs, estado.progreso, tamano, ahora)
  const lanzar = (lista: Concepto[], titulo: string, opciones: OpcionesSesionPersonalizada = {}) => onEstudiar(lista.map(c => c.concept_id), { titulo, subtitulo: 'Practica esta selección y conserva tus respuestas.', ...opciones })
  const siguiente = <><button className="btn principal" disabled={!plan.conceptos.length} onClick={() => lanzar(plan.conceptos, 'Tu siguiente sesión', { ruta: 'guiada', presupuestoMinutos: 20 })}>Estudiar 20 minutos</button>
    <p className="mini">{plan.vencidos} de repaso · {plan.errores} para reforzar · {plan.nuevos} nuevos</p>
    <details><summary>Por qué esta sesión</summary><p>{plan.explicacion}</p></details></>
  return <>
    <section className="tarjeta pila progress-next-session" aria-labelledby="prioridades-titulo">
      <div className={resumen ? 'progress-next-layout' : undefined}>
        {resumen}
        <div className="pila progress-next-action">
          <h2 id="prioridades-titulo">Tu siguiente sesión</h2>
          {estado.reanudable ? <><p>{estado.reanudable.titulo || 'Tu sesión guardada'}</p>
            <button className="btn principal" onClick={onContinuar ?? (() => { location.hash = 'inicio' })}>Continuar sesión guardada</button>
            <details><summary>Empezar una sesión nueva</summary>{siguiente}</details></> : siguiente}
        </div>
      </div>
    </section>
    <details className="tarjeta"><summary>Explorar mapa por sistema y disciplina</summary><section className="pila" style={{ marginTop: 16 }} aria-labelledby="mapa-titulo">
      <div><h2 id="mapa-titulo">Tu mapa por sistema y disciplina</h2><p className="sutil">Elige una casilla para preparar una sesión.</p></div>
      <label className="fila">Mostrar <select value={metrica} onChange={e => setMetrica(e.target.value as MetricaMapa)}>{Object.entries(METRICAS_MAPA).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <div className="scroll-x mapa-scroll" tabIndex={0} role="region" aria-label="Mapa de progreso; desplázate horizontalmente para ver todas las disciplinas">
        <table className="tabla mapa"><caption>{METRICAS_MAPA[metrica]} / conceptos disponibles</caption>
          <thead><tr><th scope="col">Sistema</th>{DISCIPLINAS.map(d => <th scope="col" key={d}>{d}</th>)}</tr></thead>
          <tbody>{SISTEMAS.map(s => <tr key={s}><th scope="row">{s}</th>{DISCIPLINAS.map(d => {
            const cell = celdas.find(c => c.sistema === s && c.disciplina === d)!
            return <td key={d}>{cell.conceptos.length ? <button className="mapa-celda" aria-pressed={selected === cell.id} aria-label={`${s}, ${d}: ${cell.grupos[metrica].length} ${METRICAS_MAPA[metrica]}, ${cell.conceptos.length} disponibles`}
              onClick={() => { setSelected(cell.id); setGrupo('todos') }}><b>{cell.grupos[metrica].length}</b><span> / {cell.conceptos.length}</span></button> : <span className="mini" title="Sin material publicado">Sin material</span>}</td>
          })}</tr>)}</tbody>
        </table>
      </div>
      <p className="mini">Un concepto puede pertenecer a varias casillas. No sumes las casillas para calcular el total. «Sin material» describe el contenido disponible, no tus conocimientos.</p>
      <div className="detalle-celda pila"><h3>{celda.sistema} · {celda.disciplina}</h3>
        <div className="fila"><span className="etq">{celda.conceptos.length} disponibles</span>{Object.entries(METRICAS_MAPA).map(([id, label]) => <span className="etq" key={id}>{celda.grupos[id as MetricaMapa].length} {label.toLocaleLowerCase()}</span>)}</div>
        <div className="fila"><label>Practicar <select value={grupo} onChange={e => setGrupo(e.target.value as typeof grupo)}><option value="todos">Toda la combinación</option>{Object.entries(METRICAS_MAPA).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Conceptos <select value={tamano} onChange={e => setTamano(Number(e.target.value))}>{[5, 10, 20].map(n => <option key={n}>{n}</option>)}</select></label>
          <button className="btn principal" disabled={!sesion.length} onClick={() => lanzar(sesion, `${celda.sistema} · ${celda.disciplina}`)}>Practicar {sesion.length} conceptos</button></div>
        {!sesion.length && <p className="mini">No hay conceptos en este grupo. Puedes seleccionar toda la combinación.</p>}
      </div>
    </section></details>
  </>
}
