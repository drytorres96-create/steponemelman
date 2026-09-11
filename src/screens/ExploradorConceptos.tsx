import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { Vacio } from '../components/comunes'
import { referenciaPagina } from '../lib/fuente'
import {
  agregarSeleccion, alternarSeleccion, buscarConceptos, estadoDeBusqueda, FILTROS_BUSQUEDA_INICIALES,
  construirSesionPersonalizada, descripcionFiltros, indexarConceptos, MAXIMO_SELECCION_CONCEPTOS,
  NOMBRES_ESTADOS_BUSQUEDA, paginarConceptos, type EstadoBusqueda, type FiltrosBusqueda, type OpcionesSesionPersonalizada,
} from '../lib/busqueda'

const ESTADOS = NOMBRES_ESTADOS_BUSQUEDA
const ordenar = (valores: string[]) => [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))

export function ExploradorConceptos({ onEstudiar, activo = true, filtros: filtrosExternos, onCambiarFiltros }: {
  onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void; activo?: boolean
  filtros?: FiltrosBusqueda; onCambiarFiltros?: (filtros: FiltrosBusqueda) => void
}) {
  const { indice, estado } = useApp()
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [filtrosLocales, setFiltrosLocales] = useState<FiltrosBusqueda>({ ...FILTROS_BUSQUEDA_INICIALES })
  const filtros = filtrosExternos ?? filtrosLocales
  const setFiltros = (nuevos: FiltrosBusqueda) => { setFiltrosLocales(nuevos); onCambiarFiltros?.(nuevos) }
  const [limite, setLimite] = useState(10)
  const [pagina, setPagina] = useState(1)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  const buscador = useRef<HTMLInputElement>(null)
  const cabeceraResultados = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!activo || !indice || conceptos) return
    let vigente = true
    setError(false)
    cargarTodo(indice.modulos).then(c => { if (vigente) setConceptos(c) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [activo, indice, conceptos, reintento])

  const indiceBusqueda = useMemo(() => indexarConceptos(conceptos ?? []), [conceptos])
  const opciones = useMemo(() => ({
    disciplinas: ordenar((conceptos ?? []).flatMap(c => [c.clasificacion.disciplina_primaria, ...c.clasificacion.disciplinas_secundarias])),
    sistemas: ordenar((conceptos ?? []).flatMap(c => [c.clasificacion.sistema_primario, ...c.clasificacion.sistemas_secundarios])),
    temas: ordenar((conceptos ?? []).map(c => c.clasificacion.tema)),
  }), [conceptos])
  const resultados = useMemo(() => buscarConceptos(indiceBusqueda, filtros, estado.progreso), [indiceBusqueda, filtros, estado.progreso])
  const vista = paginarConceptos(resultados, pagina)
  const seleccionados = useMemo(() => {
    const mapa = new Map(conceptos?.map(c => [c.concept_id, c]))
    return seleccion.map(id => mapa.get(id)).filter((c): c is Concepto => !!c)
  }, [conceptos, seleccion])
  const cambiarFiltro = (patch: Partial<FiltrosBusqueda>) => { setFiltros({ ...filtros, ...patch }); setPagina(1) }
  const cambiarPagina = (n: number) => { setPagina(n); cabeceraResultados.current?.focus() }

  if (!activo) return null
  if (error) return <Vacio titulo="No se pudieron cargar los conceptos" texto="Comprueba la conexión y vuelve a intentarlo."
    accion={<button className="btn" onClick={() => { setError(false); setReintento(n => n + 1) }}>Volver a intentar</button>} />
  if (!conceptos) return <div className="vacio" role="status" aria-busy="true">Preparando el buscador de conceptos…</div>

  return <div className="pila explorador-conceptos">
    <div><h2>Busca lo que quieres practicar</h2><p className="sutil">Combina filtros y comienza una sesión directamente, o elige hasta 20 conceptos a mano.</p></div>
    <div className="tarjeta pila">
      <div><label htmlFor="busqueda-conceptos">Buscar conceptos</label>
        <input ref={buscador} id="busqueda-conceptos" type="search" maxLength={200} autoComplete="off" spellCheck={false}
          placeholder="Ej.: fisiología renal, IgG, glucógeno…" value={filtros.texto}
          onChange={e => cambiarFiltro({ texto: e.target.value })} aria-describedby="busqueda-ayuda" />
        <p id="busqueda-ayuda" className="mini" style={{ marginTop: 6 }}>Puedes combinar varias palabras. Las tildes y mayúsculas no cambian la búsqueda.</p>
      </div>
      <div className="rejilla filtros-conceptos">
        <div><label htmlFor="busqueda-disciplina">Disciplina</label><select id="busqueda-disciplina" aria-label="Filtrar conceptos por disciplina" value={filtros.disciplina} onChange={e => cambiarFiltro({ disciplina: e.target.value })}>
          <option value="">Todas las disciplinas</option>{opciones.disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
        </select></div>
        <div><label htmlFor="busqueda-sistema">Sistema</label><select id="busqueda-sistema" aria-label="Filtrar conceptos por sistema" value={filtros.sistema} onChange={e => cambiarFiltro({ sistema: e.target.value })}>
          <option value="">Todos los sistemas</option>{opciones.sistemas.map(s => <option key={s} value={s}>{s}</option>)}
        </select></div>
        <div><label htmlFor="busqueda-tema">Tema</label><select id="busqueda-tema" aria-label="Filtrar conceptos por tema" value={filtros.tema} onChange={e => cambiarFiltro({ tema: e.target.value })}>
          <option value="">Todos los temas</option>{opciones.temas.map(t => <option key={t} value={t}>{t}</option>)}
        </select></div>
        <div><label htmlFor="busqueda-estado">Estado</label><select id="busqueda-estado" aria-label="Filtrar conceptos por estado" value={filtros.estado} onChange={e => cambiarFiltro({ estado: e.target.value as EstadoBusqueda | '' })}>
          <option value="">Cualquier estado</option>{Object.entries(ESTADOS).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select></div>
      </div>
      <button className="btn pequeno fantasma" style={{ alignSelf: 'flex-start' }} onClick={() => { setFiltros({ ...FILTROS_BUSQUEDA_INICIALES }); setPagina(1); buscador.current?.focus() }}>Limpiar filtros</button>
      <div className="fila" style={{ gap: 10 }}>
        <div><label htmlFor="busqueda-cantidad">Conceptos por sesión</label><select id="busqueda-cantidad" value={limite} onChange={e => setLimite(Number(e.target.value))}>
          {[5, 10, 20].map(n => <option key={n} value={n}>Hasta {n}</option>)}
        </select></div>
        <button className="btn principal" disabled={!resultados.length} onClick={() => onEstudiar(
          construirSesionPersonalizada(resultados, estado.progreso, limite).map(c => c.concept_id),
          { titulo: 'Mi sesión personalizada', subtitulo: descripcionFiltros(filtros) || 'Práctica libre con conceptos nuevos y ya estudiados.' },
        )}>Practicar filtros ({Math.min(limite, resultados.length)})</button>
        <span className="mini" role="status">{resultados.length} conceptos coincidentes</span>
      </div>
      <p className="mini" style={{ margin: 0 }}>Esta sesión usa los resultados de todas las páginas y puede incluir conceptos ya estudiados, aunque aún no tengan repaso pendiente.</p>
    </div>

    <section className="tarjeta pila seleccion-conceptos" aria-label="Selección para practicar">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <span role="status" aria-live="polite">{seleccionados.length} de {MAXIMO_SELECCION_CONCEPTOS} seleccionados</span>
        <div className="fila" style={{ gap: 8 }}>
          <button className="btn principal" disabled={!seleccionados.length} onClick={() => onEstudiar(seleccionados.slice(0, MAXIMO_SELECCION_CONCEPTOS).map(c => c.concept_id))}>Practicar selección ({seleccionados.length})</button>
          <button className="btn pequeno fantasma" disabled={!seleccionados.length} onClick={() => setSeleccion([])}>Vaciar selección</button>
        </div>
      </div>
      {seleccionados.length > 0 && <details className="detalles-estudio"><summary>Ver objetivos seleccionados</summary>
        <ul className="lista-seleccion">{seleccionados.map(c => <li key={c.concept_id}><span>{c.objetivo}</span>
          <button className="btn pequeno fantasma" aria-label={`Quitar ${c.objetivo}`} onClick={() => setSeleccion(s => alternarSeleccion(s, c.concept_id))}>Quitar</button></li>)}</ul>
      </details>}
      <p className="mini" style={{ margin: 0 }}>{seleccionados.length >= MAXIMO_SELECCION_CONCEPTOS ? 'Llegaste a 20. Puedes quitar un objetivo para elegir otro.' : 'Tu selección se conserva al cambiar filtros y páginas.'}</p>
    </section>

    <div className="fila" style={{ justifyContent: 'space-between' }}>
      <h3 ref={cabeceraResultados} tabIndex={-1}>Resultados</h3>
      <span className="mini" role="status" aria-live="polite">{resultados.length ? `${vista.inicio}–${vista.fin} de ${resultados.length} conceptos` : '0 conceptos'}</span>
      <button className="btn pequeno" disabled={!vista.elementos.some(c => !seleccion.includes(c.concept_id)) || seleccionados.length >= MAXIMO_SELECCION_CONCEPTOS}
        onClick={() => setSeleccion(s => agregarSeleccion(s, vista.elementos.map(c => c.concept_id)))}>Agregar esta página</button>
    </div>
    {!resultados.length ? <Vacio titulo="No hay conceptos que coincidan" texto="Prueba un término más corto o quita algún filtro. El corpus todavía está en ampliación." />
      : <ul className="lista-conceptos">{vista.elementos.map(c => {
        const marcado = seleccion.includes(c.concept_id)
        return <li className="tarjeta concepto-buscado" key={c.concept_id}>
          <label className="elegir-concepto"><input type="checkbox" checked={marcado} disabled={!marcado && seleccionados.length >= MAXIMO_SELECCION_CONCEPTOS}
            aria-label={`${marcado ? 'Quitar' : 'Agregar'} ${c.objetivo}`} onChange={() => setSeleccion(s => alternarSeleccion(s, c.concept_id))} /><span>{c.objetivo}</span></label>
          <div className="fila" style={{ gap: 7 }}><span className="etq">{c.clasificacion.disciplina_primaria}</span><span className="etq">{c.clasificacion.sistema_primario}</span>
            {c.clasificacion.tema && <span className="etq">{c.clasificacion.tema}</span>}<span className="etq violeta">{ESTADOS[estadoDeBusqueda(estado.progreso[c.concept_id])]}</span></div>
          <p className="mini" style={{ margin: 0 }}>{c.source.doc_title} · {referenciaPagina(c.source)}</p>
        </li>
      })}</ul>}
    {vista.paginas > 1 && <nav className="fila paginacion-conceptos" aria-label="Páginas de conceptos">
      <button className="btn" disabled={vista.pagina <= 1} onClick={() => cambiarPagina(vista.pagina - 1)}>Anterior</button>
      <span className="sutil">Página {vista.pagina} de {vista.paginas}</span>
      <button className="btn" disabled={vista.pagina >= vista.paginas} onClick={() => cambiarPagina(vista.pagina + 1)}>Siguiente</button>
    </nav>}
  </div>
}
