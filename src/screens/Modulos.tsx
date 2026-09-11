import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { Barra, Vacio } from '../components/comunes'
import type { Concepto, Modulo } from '../schema/concept'
import { estaVencido } from '../srs/fsrs'
import { construirCola, RUTAS, type RutaId } from '../lib/rutas'
import { dominioVigente } from '../srs/mastery'
import { ExploradorConceptos } from './ExploradorConceptos'
import { cargarTodo } from '../data/corpus'
import {
  buscarConceptos, construirSesionPersonalizada, descripcionFiltros, FILTROS_BUSQUEDA_INICIALES,
  indexarConceptos, NOMBRES_ESTADOS_BUSQUEDA, type EstadoBusqueda, type FiltrosBusqueda, type OpcionesSesionPersonalizada,
} from '../lib/busqueda'

export function Modulos({ onAbrir, onEstudiar }: {
  onAbrir: (moduloId: string, ruta: RutaId, limite: number, sesion?: string) => void
  onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void
}) {
  const { indice, estado } = useApp()
  const [filtros, setFiltros] = useState<FiltrosBusqueda>({ ...FILTROS_BUSQUEDA_INICIALES })
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [errorCarga, setErrorCarga] = useState(false)
  const [reintento, setReintento] = useState(0)
  const [limite, setLimite] = useState(10)
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
  const resultados = useMemo(() => buscarConceptos(indiceBusqueda, filtros, estado.progreso), [indiceBusqueda, filtros, estado.progreso])
  const idsCoincidentes = useMemo(() => new Set(resultados.map(c => c.concept_id)), [resultados])
  const resumenFiltros = descripcionFiltros(filtros)
  const hayFiltros = !!resumenFiltros
  const cambiarFiltros = (nuevos: FiltrosBusqueda) => { setFiltros(nuevos); setAviso('') }
  const cambiarFiltro = (patch: Partial<FiltrosBusqueda>) => cambiarFiltros({ ...filtros, ...patch })
  const idsModulo = (m: Modulo) => [...new Set(m.sesiones.flatMap(s => s.conceptos))]
  const coincidenciasModulo = (m: Modulo) => idsModulo(m).filter(id => idsCoincidentes.has(id))
  const practicar = (cs: Concepto[], cantidad: number, titulo = 'Mi sesión personalizada') => {
    const seleccion = construirSesionPersonalizada(cs, estado.progreso, cantidad)
    if (!seleccion.length) { setAviso('No hay conceptos que coincidan con esta selección. Prueba otros filtros.'); return }
    onEstudiar(seleccion.map(c => c.concept_id), { titulo, subtitulo: resumenFiltros || 'Práctica libre con conceptos nuevos y ya estudiados.' })
  }
  const abrirModulo = (m: Modulo, cantidad: number, sesionId?: string) => {
    if (!hayFiltros) { onAbrir(m.module_id, 'guiada', cantidad, sesionId); return }
    const sesion = m.sesiones.find(s => s.session_id === sesionId)
    const ids = new Set(sesion?.conceptos ?? idsModulo(m))
    practicar(resultados.filter(c => ids.has(c.concept_id)), cantidad, `${m.nombre}${sesion ? ` · ${sesion.titulo}` : ''}`)
  }
  const abrirRuta = (ruta: RutaId, cantidad: number) => {
    if (!hayFiltros) { onAbrir('', ruta, cantidad); return }
    const r = RUTAS.find(x => x.id === ruta)!
    const seleccion = ruta === 'sistemas' || ruta === 'disciplinas'
      ? construirSesionPersonalizada(resultados, estado.progreso, cantidad)
      : construirCola(ruta, resultados, estado.progreso, cantidad)
    if (!seleccion.length) { setAviso(`No hay conceptos elegibles para «${r.nombre}» con estos filtros. Puedes usar «Practicar filtros» para estudiar cualquier concepto coincidente.`); return }
    onEstudiar(seleccion.map(c => c.concept_id), { titulo: r.nombre, subtitulo: resumenFiltros, ruta, modulo: ruta })
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
    <div className="pila">
      <div>
        <h1>Elige qué estudiar</h1>
        <p className="sutil">Combina disciplina y sistema para crear una sesión a tu medida. Puedes practicar conceptos nuevos o ya estudiados.</p>
      </div>

      <div className="pestanas-explorador" role="tablist" aria-label="Explorar el material">
        {([{ id: 'modulos', titulo: 'Módulos y rutas' }, { id: 'conceptos', titulo: 'Buscar conceptos' }] as const).map(p =>
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

      <div className="tarjeta pila">
        <div><h2>Sesión personalizada</h2><p className="mini">Ejemplos: Farmacología + Endocrino; Fisiología + Cardiovascular; Patología + Hematológico y oncológico. Cada concepto debe cumplir todos los filtros elegidos.</p></div>
        <div className="rejilla filtros-conceptos">
        <div><label htmlFor="modulos-disciplina">Disciplina</label><select id="modulos-disciplina" value={filtros.disciplina} onChange={e => cambiarFiltro({ disciplina: e.target.value })} aria-label="Filtrar por disciplina" disabled={!conceptos}>
          <option value="">Todas las disciplinas</option>
          {disciplinas.map(d => <option key={d} value={d}>{d}</option>)}
        </select></div>
        <div><label htmlFor="modulos-sistema">Sistema</label><select id="modulos-sistema" value={filtros.sistema} onChange={e => cambiarFiltro({ sistema: e.target.value })} aria-label="Filtrar por sistema" disabled={!conceptos}>
          <option value="">Todos los sistemas</option>
          {sistemas.map(s => <option key={s} value={s}>{s}</option>)}
        </select></div>
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
        <div className="fila" style={{ gap: 10 }}>
          <div><label htmlFor="modulos-cantidad">Conceptos por sesión</label><select id="modulos-cantidad" value={limite} onChange={e => setLimite(Number(e.target.value))}>
            {[5, 10, 20].map(n => <option key={n} value={n}>Hasta {n}</option>)}
          </select></div>
          <button className="btn principal" disabled={!conceptos || !resultados.length} onClick={() => practicar(resultados, limite)}>
            Practicar filtros ({Math.min(limite, resultados.length)})
          </button>
          <button className="btn pequeno fantasma" disabled={!hayFiltros} onClick={() => cambiarFiltros({ ...FILTROS_BUSQUEDA_INICIALES })}>Limpiar filtros</button>
          <span className="mini" role="status" aria-live="polite">{conceptos ? `${resultados.length} conceptos coincidentes · ${visibles.length} de ${modulos.length} módulos` : 'Preparando filtros…'}</span>
        </div>
        {hayFiltros && <p className="mini" style={{ margin: 0 }}>Filtros activos: {resumenFiltros}. También se aplican al abrir los módulos, sesiones y rutas de abajo.</p>}
        <p className="mini" style={{ margin: 0 }}>Con «Cualquier estado» también puedes repetir conceptos que están al día. Primero se priorizan repasos pendientes y conceptos nuevos.</p>
        {errorCarga && <div role="alert"><p>No se pudieron cargar los conceptos para filtrar.</p><button className="btn" onClick={() => setReintento(n => n + 1)}>Reintentar filtros</button></div>}
        {aviso && <p role="alert" className="aviso">{aviso}</p>}
      </div>

      {conceptos && visibles.length === 0 && <Vacio titulo="Ningún concepto coincide" texto="Prueba con otros filtros." />}

      <div className="rejilla r2">
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
                <button className="btn principal pequeno" onClick={() => abrirModulo(m, 10)}>Hasta 10 conceptos</button>
                <button className="btn pequeno" onClick={() => abrirModulo(m, 20)}>Hasta 20 conceptos</button>
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
                        onClick={() => abrirModulo(m, 999, ses.session_id)}>
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

      <div className="tarjeta">
        <h2 style={{ marginBottom: 4 }}>Rutas de estudio</h2>
        <p className="sutil">Elige qué habilidad practicar. {hayFiltros ? 'Estas rutas respetan tus filtros y mantienen sus condiciones de práctica.' : 'La selección considera tu historial y el material disponible.'}</p>
        <div className="rejilla r3" style={{ marginTop: 12 }}>
          {RUTAS.filter(r => r.id !== 'guiada').map(r => (
            <button key={r.id} className="tarjeta pulsable" style={{ padding: 13 }}
              onClick={() => abrirRuta(r.id, r.id === 'examen' ? 20 : 14)}>
              <b style={{ fontSize: '.93rem' }}>{r.nombre}</b>
              <div className="mini" style={{ marginTop: 3 }}>{r.descripcion}</div>
            </button>
          ))}
        </div>
      </div>
      </section>
      <section id="panel-conceptos" role="tabpanel" aria-labelledby="pestana-conceptos" hidden={pestana !== 'conceptos'}>
        <ExploradorConceptos activo={pestana === 'conceptos'} onEstudiar={onEstudiar} filtros={filtros} onCambiarFiltros={cambiarFiltros} />
      </section>
    </div>
  )
}
