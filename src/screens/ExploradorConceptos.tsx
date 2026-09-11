import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/estado'
import type { Concepto } from '../schema/concept'
import { Vacio } from '../components/comunes'
import { referenciaPagina } from '../lib/fuente'
import { agregarSeleccion, alternarSeleccion, estadoDeBusqueda, MAXIMO_SELECCION_CONCEPTOS, NOMBRES_ESTADOS_BUSQUEDA, paginarConceptos } from '../lib/busqueda'

const ESTADOS = NOMBRES_ESTADOS_BUSQUEDA
export function ExploradorConceptos({ onEstudiar, activo = true, conceptos, resultados, seleccion, onSeleccion, elegir }: {
  onEstudiar: (ids: string[]) => void; activo?: boolean
  conceptos: Concepto[]; resultados: Concepto[]; seleccion: string[]; onSeleccion: (ids: string[]) => void; elegir: (cs: Concepto[]) => Concepto[]
}) {
  const { estado } = useApp()
  const [pagina, setPagina] = useState(1)
  const setSeleccion = (valor: string[] | ((prev: string[]) => string[])) => onSeleccion(typeof valor === 'function' ? valor(seleccion) : valor)
  const cabeceraResultados = useRef<HTMLHeadingElement>(null)
  useEffect(() => setPagina(1), [resultados])
  const vista = paginarConceptos(resultados, pagina)
  const seleccionados = useMemo(() => {
    const mapa = new Map(conceptos?.map(c => [c.concept_id, c]))
    return seleccion.map(id => mapa.get(id)).filter((c): c is Concepto => !!c)
  }, [conceptos, seleccion])
  const paraEstudiar = elegir(seleccionados)
  const cambiarPagina = (n: number) => { setPagina(n); cabeceraResultados.current?.focus() }

  if (!activo) return null
  return <div className="pila explorador-conceptos">
    <section className="tarjeta pila seleccion-conceptos" aria-label="Selección para practicar">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <span role="status" aria-live="polite">{seleccionados.length} de {MAXIMO_SELECCION_CONCEPTOS} seleccionados</span>
        <div className="fila" style={{ gap: 8 }}>
          <button className="btn principal" disabled={!paraEstudiar.length} onClick={() => onEstudiar(paraEstudiar.map(c => c.concept_id))}>Estudiar {paraEstudiar.length} de {seleccionados.length} seleccionados</button>
          <button className="btn pequeno fantasma" disabled={!seleccionados.length} onClick={() => setSeleccion([])}>Vaciar selección</button>
        </div>
      </div>
      {seleccionados.length > 0 && <details className="detalles-estudio"><summary>Ver objetivos seleccionados</summary>
        <ul className="lista-seleccion">{seleccionados.map(c => <li key={c.concept_id}><span>{c.objetivo}</span>
          <button className="btn pequeno fantasma" aria-label={`Quitar ${c.objetivo}`} onClick={() => setSeleccion(s => alternarSeleccion(s, c.concept_id))}>Quitar</button></li>)}</ul>
      </details>}
      <p className="mini" style={{ margin: 0 }}>{seleccionados.length >= MAXIMO_SELECCION_CONCEPTOS ? 'Llegaste a 20. Puedes quitar un objetivo para elegir otro.' : 'Tu selección se conserva al cambiar filtros, páginas y vistas. Se aplica el modo y la carga elegidos arriba.'}</p>
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
