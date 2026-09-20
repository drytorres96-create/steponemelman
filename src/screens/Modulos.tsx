import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { Barra, Vacio } from '../components/comunes'
import type { Concepto, Modulo } from '../schema/concept'
import { estaVencido } from '../srs/fsrs'
import { construirCola, RUTAS, type RutaId } from '../lib/rutas'
import { dominioVigente } from '../srs/mastery'
import { SelectorCarga, useCargaEstudio } from '../components/SelectorCarga'
import { ExploradorConceptos } from './ExploradorConceptos'
import { cargarTodo } from '../data/corpus'
import { ScreenHeading } from '../components/Editorial'
import {
  buscarConceptos, construirSesionPersonalizada, descripcionFiltros, FILTROS_BUSQUEDA_INICIALES,
  indexarConceptos, NOMBRES_ESTADOS_BUSQUEDA, type EstadoBusqueda, type FiltrosBusqueda, type OpcionesSesionPersonalizada,
} from '../lib/busqueda'

export function Modulos({ onEstudiar, seleccion: seleccionExterna, onSeleccion, filtrosIniciales }: {
  seleccion?: string[]; onSeleccion?: (ids: string[]) => void
  filtrosIniciales?: Partial<FiltrosBusqueda>
  onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void
}) {
  const { indice, estado } = useApp()
  const [filtros, setFiltros] = useState<FiltrosBusqueda>({ ...FILTROS_BUSQUEDA_INICIALES })
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [errorCarga, setErrorCarga] = useState(false)
  const [reintento, setReintento] = useState(0)
  const [seleccionLocal, setSeleccionLocal] = useState<string[]>([])
  const seleccionManual = seleccionExterna ?? seleccionLocal
  const cambiarSeleccion = onSeleccion ?? setSeleccionLocal
  const carga = useCargaEstudio(estado.sesiones)
  const [ruta, setRuta] = useState<RutaId>('guiada')
  const [aviso, setAviso] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'modulos' | 'conceptos'>('modulos')

  const modulos = indice?.modulos ?? []
  useEffect(() => {
    if (!indice) return
    let vigente = true
    setErrorCarga(false)
    cargarTodo(indice.modulos).then(cs => { if (vigente) setConceptos(cs) })
      .catch(() => { if (vigente) setErrorCarga(true) })
    return () => { vigente = false }
  }, [indice, reintento])
  const indiceBusqueda = useMemo(() => indexarConceptos(conceptos ?? []), [conceptos])
  const disciplinas = useMemo(() => [...new Set((conceptos ?? []).flatMap(c => [c.clasificacion.disciplina_primaria, ...c.clasificacion.disciplinas_secundarias]))].sort(), [conceptos])
  const sistemas = useMemo(() => [...new Set((conceptos ?? []).flatMap(c => [c.clasificacion.sistema_primario, ...c.clasificacion.sistemas_secundarios]))].sort(), [conceptos])
  const temas = useMemo(() => [...new Set((conceptos ?? []).map(c => c.clasificacion.tema).filter(Boolean))].sort(), [conceptos])
  useEffect(() => {
    if (!filtrosIniciales || !conceptos) return
    setFiltros({ ...FILTROS_BUSQUEDA_INICIALES, ...filtrosIniciales,
      sistema: sistemas.some(s => s === filtrosIniciales.sistema) ? filtrosIniciales.sistema ?? '' : '',
      disciplina: disciplinas.some(d => d === filtrosIniciales.disciplina) ? filtrosIniciales.disciplina ?? '' : '' })
  }, [filtrosIniciales, conceptos, sistemas, disciplinas])
  const resultados = useMemo(() => buscarConceptos(indiceBusqueda, filtros, estado.progreso), [indiceBusqueda, filtros, estado.progreso])
  const idsCoincidentes = useMemo(() => new Set(resultados.map(c => c.concept_id)), [resultados])
  const resumenFiltros = descripcionFiltros(filtros)
  const hayFiltros = !!resumenFiltros
  const cambiarFiltros = (nuevos: FiltrosBusqueda) => { setFiltros(nuevos); setAviso('') }
  const cambiarFiltro = (patch: Partial<FiltrosBusqueda>) => cambiarFiltros({ ...filtros, ...patch })
  const idsModulo = (m: Modulo) => [...new Set(m.sesiones.flatMap(s => s.conceptos))]
  const coincidenciasModulo = (m: Modulo) => idsModulo(m).filter(id => idsCoincidentes.has(id))
  const elegir = (cs: Concepto[], manual = false) => ruta === 'guiada'
    ? manual ? cs.slice(0, carga.cantidad) : construirSesionPersonalizada(cs, estado.progreso, carga.cantidad)
    : construirCola(ruta, cs, estado.progreso, carga.cantidad)
  const candidatos = elegir(resultados)
  const practicar = (cs: Concepto[], titulo = 'Mi sesión personalizada', modulo = 'personalizada', subtitulo = resumenFiltros) => {
    const seleccion = elegir(cs)
    if (!seleccion.length) { setAviso('No hay conceptos elegibles para este modo con tus filtros. Prueba «Práctica general» u otros filtros.'); return }
    onEstudiar(seleccion.map(c => c.concept_id), { titulo, subtitulo: subtitulo || 'Conceptos nuevos y ya estudiados.', ruta, modulo, presupuestoMinutos: carga.presupuestoMinutos })
  }
  const abrirModulo = (m: Modulo, sesionId?: string) => {
    const sesion = m.sesiones.find(s => s.session_id === sesionId)
    const ids = new Set(sesion?.conceptos ?? idsModulo(m))
    practicar(resultados.filter(c => ids.has(c.concept_id)), `${m.nombre}${sesion ? ` · ${sesion.titulo}` : ''}`, m.module_id, [resumenFiltros, sesion?.objetivo].filter(Boolean).join(' · '))
  }

  const stats = (m: Modulo) => {
    const ids = idsModulo(m)
    let nuevos = 0, aprendiendo = 0, dominados = 0, vencidos = 0
    for (const id of ids) {
      const p = estado.progreso[id]
      if (!p || !p.intentos.length) { nuevos++; continue }
      if (dominioVigente(p, estado.criterios)) dominados++; else aprendiendo++
      if (estaVencido(p)) vencidos++
    }
    return { total: ids.length, nuevos, aprendiendo, dominados, vencidos }
  }

  const visibles = hayFiltros ? modulos.filter(m => coincidenciasModulo(m).length > 0) : modulos

  return (
    <div className="pila library-workspace">
      <ScreenHeading landscape="constellation" eyebrow="Biblioteca de conceptos" title="Elige qué estudiar" description="Combina disciplina y sistema para crear una sesión a tu medida. Puedes practicar conceptos nuevos o ya estudiados." />

      <div className="tarjeta pila library-composer">
        <div className="library-composer-heading"><span className="editorial-eyebrow">Preparar una sesión</span><h2>Sesión personalizada</h2><p className="mini">Ejemplos: Farmacología + Endocrino; Fisiología + Cardiovascular; Patología + Hematológico y oncológico. Cada concepto debe cumplir todos los filtros elegidos.</p></div>
        <div className="rejilla filtros-conceptos">
        <div><label htmlFor="modulos-disciplina">Disciplina</label><select id="modulos-disciplina" value={filtros.disciplina} onChange={e => cambiarFiltro({ disciplina: e.target.value })} aria-label="Filtrar por disciplina" disabled={!conceptos}>
          <option value="">Todas las disciplinas</option>
          {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
        </select></div>
        <div><label htmlFor="modulos-sistema">Sistema</label><select id="modulos-sistema" value={filtros.sistema} onChange={e => cambiarFiltro({ sistema: e.target.value })} aria-label="Filtrar por sistema" disabled={!conceptos}>
          <option value="">Todos los sistemas</option>
          {sistemas.map(s => <option key={s} value={s}>{s}</option>)}
        </select></div>
        </div>
        <details><summary>Más filtros y modo de práctica</summary><div className="rejilla filtros-conceptos" style={{ marginTop: 12 }}>
        <div><label htmlFor="modulos-tema">Tema</label><select id="modulos-tema" value={filtros.tema} onChange={e => cambiarFiltro({ tema: e.target.value })} aria-label="Filtrar por tema" disabled={!conceptos}>
          <option value="">Todos los temas</option>{temas.map(t => <option key={t} value={t}>{t}</option>)}
        </select></div>
        <div><label htmlFor="modulos-estado">Estado del concepto</label><select id="modulos-estado" value={filtros.estado} onChange={e => cambiarFiltro({ estado: e.target.value as EstadoBusqueda | '' })} aria-label="Filtrar por estado" disabled={!conceptos}>
          <option value="">Cualquier estado</option>
          {Object.entries(NOMBRES_ESTADOS_BUSQUEDA).map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select></div>
        </div>
        <div><label htmlFor="modulos-texto">Palabra o concepto (opcional)</label><input id="modulos-texto" type="search" maxLength={200} value={filtros.texto}
          placeholder="Ej.: tiroides, hemostasia…" onChange={e => cambiarFiltro({ texto: e.target.value })} /></div>
        <div><label htmlFor="modo-practica">Modo de práctica</label><select id="modo-practica" value={ruta} onChange={e => { setRuta(e.target.value as RutaId); setAviso('') }}>
          <option value="guiada">Práctica general</option>{RUTAS.filter(r => !['guiada', 'sistemas', 'disciplinas'].includes(r.id)).map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select><p className="mini">{RUTAS.find(r => r.id === ruta)?.descripcion}</p></div>
        </details>
        <SelectorCarga carga={carga} />
        {ruta !== 'guiada' && <p className="mini">Modo activo: {RUTAS.find(r => r.id === ruta)?.nombre}</p>}
        <div className="fila" style={{ gap: 10 }}>
          <button className="btn principal" disabled={!conceptos || !resultados.length} onClick={() => practicar(resultados)}>
            Estudiar estos filtros ({candidatos.length})
          </button>
          <button className="btn pequeno fantasma" disabled={!hayFiltros} onClick={() => cambiarFiltros({ ...FILTROS_BUSQUEDA_INICIALES })}>Limpiar filtros</button>
          <span className="mini" role="status" aria-live="polite">{conceptos ? `${resultados.length} conceptos coincidentes · ${visibles.length} de ${modulos.length} módulos` : 'Preparando filtros…'}</span>
        </div>
        {hayFiltros && <p className="mini" style={{ margin: 0 }}>Filtros activos: {resumenFiltros}. También se aplican al abrir los módulos y sesiones. La duración elegida también se conserva.</p>}
        <p className="mini" style={{ margin: 0 }}>Con «Cualquier estado» también puedes repetir conceptos que están al día. Primero se priorizan repasos pendientes y conceptos nuevos.</p>
        {errorCarga && <div role="alert"><p>No se pudieron cargar los conceptos para filtrar.</p><button className="btn" onClick={() => setReintento(n => n + 1)}>Reintentar filtros</button></div>}
        {aviso && <p role="alert" className="aviso">{aviso}</p>}
      </div>

      <div className="pestanas-explorador" role="tablist" aria-label="Explorar el material">
        {([{ id: 'modulos', titulo: 'Módulos' }, { id: 'conceptos', titulo: 'Conceptos' }] as const).map(p =>
          <button key={p.id} id={`pestana-${p.id}`} role="tab" aria-selected={pestana === p.id} aria-controls={`panel-${p.id}`}
            tabIndex={pestana === p.id ? 0 : -1} onClick={() => setPestana(p.id)} onKeyDown={e => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
              e.preventDefault()
              const siguiente = e.key === 'Home' ? 'modulos' : e.key === 'End' ? 'conceptos' : pestana === 'modulos' ? 'conceptos' : 'modulos'
              setPestana(siguiente)
              document.getElementById(`pestana-${siguiente}`)?.focus()
            }}>{p.titulo}</button>)}
      </div>

      <section id="panel-modulos" role="tabpanel" aria-labelledby="pestana-modulos" hidden={pestana !== 'modulos'} className="pila">

      {conceptos && visibles.length === 0 && <Vacio titulo="Ningún concepto coincide" texto="Prueba con otros filtros." />}

      <div className="rejilla r2 library-modules">
        {visibles.map(m => {
          const s = stats(m)
          const abiertoEste = abierto === m.module_id
          return (
            <div className="tarjeta" key={m.module_id}>
              <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h3>{m.nombre}</h3>
                  <p className="mini" style={{ margin: '2px 0 8px' }}>{m.proposito}</p>
                </div>
                {s.vencidos > 0 && <span className="etq ambar">{s.vencidos} vencidos</span>}
              </div>

              <Barra valor={s.dominados} total={s.total} oro etiqueta={`Dominio vigente de ${m.nombre}`} />
              <div className="fila" style={{ gap: 12, marginTop: 8 }}>
                <span className="mini">{s.total} conceptos</span>
                <span className="mini">·</span>
                <span className="mini">{s.nuevos} nuevos</span>
                <span className="mini">·</span>
                <span className="mini">{s.aprendiendo} en curso</span>
                <span className="mini">·</span>
                <span className="mini" style={{ color: 'var(--oro)' }}>{s.dominados} dominados</span>
              </div>
              {hayFiltros && <p className="mini">{coincidenciasModulo(m).length} conceptos de este módulo cumplen tus filtros.</p>}

              <div className="fila" style={{ gap: 6, marginTop: 10 }}>
                {m.disciplinas.slice(0, 3).map(d => (
                  <span key={d} className={`etq d-${d.replace(/ /g, '\\ ')}`}><i className="punto-d" />{d}</span>
                ))}
                {m.prerrequisitos.length > 0 && <span className="etq">Base sugerida: {m.prerrequisitos.map(id => modulos.find(m => m.module_id === id)?.nombre || id).join(', ')}</span>}
              </div>

              <hr className="sep" />
              <div className="fila">
                <button className="btn principal pequeno" disabled={!conceptos} onClick={() => abrirModulo(m)}>Estudiar este módulo</button>
                <button className="btn pequeno fantasma" aria-expanded={abiertoEste} onClick={() => setAbierto(abiertoEste ? null : m.module_id)}>
                  {abiertoEste ? 'Ocultar sesiones' : `Ver ${m.sesiones.length} sesiones`}
                </button>
              </div>

              {abiertoEste && (
                <div className="pila" style={{ gap: 6, marginTop: 12 }}>
                  {m.sesiones.map(ses => {
                    const coincidencias = ses.conceptos.filter(id => idsCoincidentes.has(id)).length
                    const hechos = ses.conceptos.filter(id => estado.progreso[id]?.intentos.length).length
                    return (
                      <button key={ses.session_id} className="tarjeta pulsable" style={{ padding: 11 }} disabled={hayFiltros && !coincidencias}
                        onClick={() => abrirModulo(m, ses.session_id)}>
                        <div className="fila" style={{ justifyContent: 'space-between' }}>
                          <b style={{ fontSize: '.92rem' }}>{ses.titulo}</b>
                          <span className="mini">{hayFiltros ? `${coincidencias} coincidentes` : `${hechos}/${ses.conceptos.length}`}</span>
                        </div>
                        <div className="mini" style={{ marginTop: 2 }}>{ses.objetivo || 'Objetivos variados'}</div>
                      </button>
                    )
                  })}
                  <div className="mini">Cobertura documental: {m.cobertura_documental.join(', ')}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      </section>
      <section id="panel-conceptos" role="tabpanel" aria-labelledby="pestana-conceptos" hidden={pestana !== 'conceptos'}>
        {conceptos ? <ExploradorConceptos activo={pestana === 'conceptos'} conceptos={conceptos} resultados={resultados} seleccion={seleccionManual} onSeleccion={cambiarSeleccion} elegir={cs => elegir(cs, true)}
          onEstudiar={ids => onEstudiar(ids, { titulo: 'Mi selección de conceptos', subtitulo: 'Selección manual conservada entre filtros y páginas.', ruta, presupuestoMinutos: carga.presupuestoMinutos })} /> : !errorCarga && <p role="status">Preparando conceptos…</p>}
      </section>
    </div>
  )
}
