import { useEffect, useMemo, useState } from 'react'
import { DISCIPLINAS, SISTEMAS, type Concepto } from '../schema/concept'
import { useApp } from '../store/estado'
import { construirMapa, METRICAS_MAPA, prioridadesSemana, type MetricaMapa } from '../lib/mapa-progreso'
import { construirSesionPersonalizada, type OpcionesSesionPersonalizada } from '../lib/busqueda'
import { resumenTransferencia, priorizarVariantes } from '../lib/variantes'

export function MapaProgreso({ conceptos, onEstudiar }: { conceptos: Concepto[]; onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void }) {
  const { estado } = useApp()
  const [ahora, setAhora] = useState(Date.now())
  const [metrica, setMetrica] = useState<MetricaMapa>('vencidos')
  const [selected, setSelected] = useState('Cardiovascular:Fisiología')
  const [tamano, setTamano] = useState(10)
  const [grupo, setGrupo] = useState<MetricaMapa | 'todos'>('todos')
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 60000); return () => clearInterval(t) }, [])
  const celdas = useMemo(() => construirMapa(conceptos, estado, ahora), [conceptos, estado.progreso, estado.criterios, ahora])
  const prioridades = useMemo(() => prioridadesSemana(celdas, tamano), [celdas, tamano])
  const celda = celdas.find(c => c.id === selected)!
  const cs = grupo === 'todos' ? celda.conceptos : celda.grupos[grupo]
  const sesion = construirSesionPersonalizada(cs, estado.progreso, tamano, ahora)
  const piloto = conceptos.filter(c => c.variantes?.length)
  const transfer = resumenTransferencia(piloto, estado.progreso)
  const elegibles = piloto.filter(c => estado.progreso[c.concept_id]?.intentos.length)
  const lanzar = (lista: Concepto[], titulo: string, opciones: OpcionesSesionPersonalizada = {}) => onEstudiar(lista.map(c => c.concept_id), { titulo, subtitulo: 'Practica esta selección y conserva tus respuestas.', ...opciones })
  return <>
    <section className="tarjeta pila" aria-labelledby="prioridades-titulo">
      <h2 id="prioridades-titulo">Tres próximos pasos para esta semana</h2>
      <p className="sutil">Se actualizan con tus respuestas. Los conceptos nuevos son una oportunidad de estudio; no indican una debilidad.</p>
      <div className="rejilla r3">{prioridades.map((p, i) => <div className="prioridad" key={p.celda.id}>
        <span className="rotulo">Paso {i + 1}</span><h3>{p.celda.sistema} · {p.celda.disciplina}</h3><p>{p.motivo}</p>
        <button className="btn pequeno" onClick={() => lanzar(p.conceptos, `${p.celda.sistema} · ${p.celda.disciplina}`)}>Practicar {p.conceptos.length} conceptos</button>
      </div>)}</div>
      {!prioridades.length && <p>Sin repasos ni errores recientes pendientes. Puedes elegir una combinación del mapa.</p>}
    </section>
    <section className="tarjeta pila" aria-labelledby="mapa-titulo">
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
    </section>
    {piloto.length > 0 && <section className="tarjeta pila" aria-labelledby="aplicacion-titulo">
      <span className="rotulo">Piloto · {piloto.length} conceptos</span><h2 id="aplicacion-titulo">¿Puedes aplicarlo en una pregunta nueva?</h2>
      <p>Trabaja el concepto habitual, distingue mecanismos y después aplícalo en un caso diferente.</p>
      <div className="fila"><span className="etq">{transfer.correctos} / {transfer.evaluados} primeros intentos sin ayuda correctos</span><span className="etq">{transfer.disponibles - transfer.vistos} casos aún no presentados</span></div>
      <p className="mini">«Aplicación comprobada» requiere acertar una variante nueva sin pistas ni explicación previa. Se mide aparte del dominio vigente; repetir una pregunta ya vista no aporta una nueva comprobación. No equivale a un resultado NBME.</p>
      <div className="fila"><button className="btn principal" disabled={!elegibles.length} onClick={() => lanzar(priorizarVariantes(elegibles, estado.progreso).slice(0, tamano), 'Aplicar lo aprendido', { ruta: 'aplicacion', nivelVariante: 'aplicacion' })}>Practicar casos</button>
        <button className="btn" disabled={!elegibles.length} onClick={() => lanzar(priorizarVariantes(elegibles, estado.progreso, 'discriminacion').slice(0, tamano), 'Distinguir mecanismos', { ruta: 'aplicacion', nivelVariante: 'discriminacion' })}>Distinguir mecanismos</button>
        <button className="btn fantasma" onClick={() => lanzar(construirSesionPersonalizada(piloto, estado.progreso, tamano), 'Fundamentos del piloto')}>Estudiar los fundamentos</button></div>
      {!elegibles.length && <p className="mini">Empieza por los fundamentos. Los casos se habilitan para los conceptos que ya hayas trabajado.</p>}
    </section>}
  </>
}
