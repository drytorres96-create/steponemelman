import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './store/estado'
import { cargarConceptos, cargarModulo } from './data/corpus'
import type { Concepto } from './schema/concept'
import { Inicio } from './screens/Inicio'
import { Modulos } from './screens/Modulos'
import { Hoy, type MaterialNuevo } from './screens/Hoy'
import { SesionCajas, TITULO_NBME_CAJAS } from './screens/SesionCajas'
import type { ItemCaja } from './lib/cajas'
import { fechaISO } from './lib/tiempo'
import { SesionMixta } from './semana/SesionMixta'
import { construirGuion } from './semana/guion'
import type { SesionSemanal } from './semana/tipos'
import { crearUUID } from './store/model'
import { Auditoria } from './screens/Auditoria'
import { Ajustes } from './screens/Ajustes'
import { Reproductor, type Cola } from './screens/Reproductor'
import { construirCola, RUTAS, type RutaId } from './lib/rutas'
import { cargarTodo } from './data/corpus'
import { useAuth } from './auth/AuthProvider'
import { APP_VERSION } from './release'
import { MedidorIA } from './components/MedidorIA'
import type { OpcionesSesionPersonalizada } from './lib/busqueda'
import { alternarFormatos } from './lib/formatos'
import { aplicarVariante, siguienteVariante } from './lib/variantes'
import { useNbme } from './nbme/NbmeProvider'
import { NbmeLibrary } from './nbme/NbmeLibrary'
import { NbmePlayer } from './nbme/NbmePlayer'
import { deriveNbmeSession } from './nbme/model'
import type { FiltrosBusqueda } from './lib/busqueda'
import { Brand, NavigationIcon, StudyHero, CinematicBackdrop, type CinematicObject, type CinematicScene } from './components/Editorial'
import { Resguardo, FalloPantalla } from './components/Resguardo'

type Vista = 'hoy' | 'inicio' | 'modulos' | 'auditoria' | 'ajustes'
  | 'estudio' | 'preguntas' | 'sesion' | 'cajas'
/**
 * Una sola entrada: la portada pone el techo del día y absorbe lo que antes eran Mi
 * semana, Recuperación y Progreso. Para estudiar más hay que abrir el menú discreto
 * y elegir contenido a propósito.
 */
const NAV: { id: Vista; txt: string }[] = [{ id: 'hoy', txt: 'Hoy' }]
const SECUNDARIAS: { id: Vista; txt: string }[] = [
  { id: 'modulos', txt: 'Elegir contenido' },
  { id: 'ajustes', txt: 'Ajustes y respaldo' },
  { id: 'auditoria', txt: 'Calidad del material' }, { id: 'inicio', txt: 'Plan diario clásico' },
]
/** Las vistas de concentración no llevan navegación ni migas. */
const CONCENTRACION: Vista[] = ['estudio', 'preguntas', 'sesion', 'cajas']
/** Vistas que recorren una sesión NBME: al salir de ellas se pausa. */
const CON_PREGUNTAS: Vista[] = ['preguntas', 'sesion', 'cajas']

/**
 * Cada vista tiene su escena estable: la fotografía del fondo, la del panel lateral y el
 * objeto recortado que cruza su borde. Cambiar de vista funde la escena entera.
 */
const SCENES: Record<Vista, { fondo: CinematicScene; ventana: CinematicScene; objeto: CinematicObject }> = {
  hoy: { fondo: 'dawn', ventana: 'constellation', objeto: 'crystal' },
  inicio: { fondo: 'dawn', ventana: 'forest', objeto: 'crystal' },
  modulos: { fondo: 'ribbons', ventana: 'constellation', objeto: 'crystal' },
  auditoria: { fondo: 'stone', ventana: 'lens', objeto: 'neural-violet' },
  ajustes: { fondo: 'smoke', ventana: 'stone', objeto: 'optical-violet' },
  estudio: { fondo: 'smoke', ventana: 'smoke', objeto: 'optical-violet' },
  preguntas: { fondo: 'smoke', ventana: 'smoke', objeto: 'optical-violet' },
  sesion: { fondo: 'smoke', ventana: 'smoke', objeto: 'optical-violet' },
  cajas: { fondo: 'smoke', ventana: 'smoke', objeto: 'optical-violet' },
}
/** Pantallas que Hoy absorbió: los enlaces guardados siguen llegando, ahora a la portada. */
const ABSORBIDAS = ['semana', 'recuperacion', 'progreso', 'repaso']

// A session queue is restored from the saved study state, never from the URL alone.
export function vistaDesdeHash(): Vista {
  const value = location.hash.slice(1)
  if (ABSORBIDAS.includes(value)) return 'hoy'
  return [...NAV, ...SECUNDARIAS].some(n => n.id === value) ? value as Vista : 'hoy'
}

export default function App() {
  const { listo, indice, estado, errorCarga, sincronizacion, sincronizarAhora, avisoLocal, descartarAvisoLocal } = useApp()
  const { signOut } = useAuth()
  const nbme = useNbme()
  const [vista, setVista] = useState<Vista>(vistaDesdeHash)
  const [cola, setCola] = useState<Cola | null>(null)
  const [indiceInicial, setIndiceInicial] = useState(0)
  const [seleccionManual, setSeleccionManual] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tipoContenido, setTipoContenido] = useState<'conceptos' | 'preguntas'>('conceptos')
  const [sesionSemanal, setSesionSemanal] = useState<SesionSemanal | null>(null)
  const [cajasHoy, setCajasHoy] = useState<{ items: ItemCaja[]; titulo: string } | null>(null)
  const [filtrosConceptos, setFiltrosConceptos] = useState<Partial<FiltrosBusqueda> | undefined>()
  /** Cambia la `key` del resguardo para volver a montar una pantalla que falló. */
  const [reintento, setReintento] = useState(0)
  const contenido = useRef<HTMLElement>(null)
  const vistaAnterior = useRef(vista)
  const estudiando = CONCENTRACION.includes(vista)
  // Estudiando se estudia: la barra no muestra navegación, menú ni estado de sincronización.
  const enConcentracion = estudiando
  // El sincronismo corre solo. Solo se enseña cuando hay algo que el estudio no puede resolver:
  // un fallo, o cambios sin subir por falta de conexión. Callarlos arriesgaría perder progreso.
  const sincronizacionVisible = CON_PREGUNTAS.includes(vista)
    ? (nbme.syncStatus.state === 'error' || nbme.syncStatus.state === 'offline' ? nbme.syncStatus.message : null)
    : (sincronizacion.estado === 'error' ? sincronizacion.mensaje : null)
  // Las sesiones de las cajas las retoma Hoy cuando vuelve a tocar su pregunta: no se ofrecen aparte.
  const sesionPreguntasPendiente = Object.values(nbme.state.sessions)
    .filter(s => s.title !== TITULO_NBME_CAJAS && deriveNbmeSession(nbme.state, s.id)?.phase !== 'complete')
    .sort((a, b) => b.controlChangedAt - a.controlChangedAt)[0]
  const sincronizarTodo = async () => {
    const resultados = await Promise.all([sincronizarAhora(), nbme.catalog ? nbme.syncNow() : Promise.resolve(true)])
    return resultados.every(Boolean)
  }

  useEffect(() => {
    const h = () => { if (!CONCENTRACION.includes(location.hash.slice(1) as Vista)) setVista(vistaDesdeHash()) }
    window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h)
  }, [])
  useEffect(() => { contenido.current?.focus({ preventScroll: true }) }, [vista])
  useEffect(() => {
    if (CON_PREGUNTAS.includes(vistaAnterior.current) && vista !== vistaAnterior.current) nbme.pauseSession()
    vistaAnterior.current = vista
  }, [vista, nbme.pauseSession])
  const ir = useCallback((v: string) => {
    if (CON_PREGUNTAS.includes(vista) && v !== vista) nbme.pauseSession()
    setCola(null); setSesionSemanal(null); setCajasHoy(null); setVista(v as Vista); location.hash = v
  }, [vista, nbme.pauseSession])
  const continuarPreguntas = async () => {
    if (sesionPreguntasPendiente && await nbme.resumeSession(sesionPreguntasPendiente.id)) ir('preguntas')
  }

  /**
   * Lo nuevo de hoy: tres conceptos y una pregunta hasta el techo. Se arma al vuelo
   * desde lo que falta y no se guarda como sesión de la semana; lo estudiado se
   * registra igual, y eso es lo que cierra la vía.
   */
  const abrirNuevo = useCallback(({ conceptIds, preguntas, titulo, nbmeSessionId }: MaterialNuevo) => {
    const guion = construirGuion(conceptIds, preguntas, 3)
    if (!guion.length) return
    setCola(null); setError(null)
    setSesionSemanal({
      id: crearUUID(), semana: 'Hoy', semanaInicio: fechaISO(new Date()), dia: 1, orden: 1, titulo,
      subtitulo: 'Lo nuevo de hoy: tres conceptos y una pregunta.',
      guion, presupuestoMin: 30, estado: 'en_curso', cursor: 0, nbmeSessionId, completadaEn: null,
    })
    setVista('sesion'); location.hash = 'sesion'
  }, [])

  /** Las cajas de hoy: lo que queda del techo, en el orden en que vence. */
  const abrirCajas = useCallback((items: ItemCaja[], titulo: string) => {
    if (!items.length) return
    setCola(null); setError(null); setSesionSemanal(null)
    setCajasHoy({ items, titulo })
    setVista('cajas'); location.hash = 'cajas'
  }, [])

  const abrir = useCallback(async (moduloId: string, ruta: RutaId, limite: number, sesionId?: string, desde = 0, presupuestoMinutos?: 10 | 20 | 30) => {
    if (!indice) return
    setCargando(true); setError(null)
    try {
      let conceptos: Concepto[] = []
      let titulo = '', subtitulo = ''
      if (moduloId) {
        const m = indice.modulos.find(x => x.module_id === moduloId)!
        conceptos = await cargarModulo(moduloId)
        if (sesionId) {
          const ses = m.sesiones.find(s => s.session_id === sesionId)!
          const ids = new Set(ses.conceptos)
          conceptos = conceptos.filter(c => ids.has(c.concept_id))
          titulo = `${m.nombre} · ${ses.titulo}`; subtitulo = ses.objetivo
        } else { titulo = m.nombre; subtitulo = m.proposito }
      } else {
        conceptos = await cargarTodo(indice.modulos)
        const r = RUTAS.find(x => x.id === ruta)!
        titulo = r.nombre; subtitulo = r.descripcion
      }
      const seleccion = sesionId ? conceptos.slice(0, limite) : construirCola(ruta, conceptos, estado.progreso, limite)
      const lista = alternarFormatos(seleccion.map(c => ruta === 'aplicacion' ? aplicarVariante(c, siguienteVariante(c, estado.progreso[c.concept_id])) : c), ruta)
      if (!lista.length) { setError('No hay conceptos disponibles para esta ruta ahora mismo.'); setCargando(false); return }
      setIndiceInicial(Math.min(desde, lista.length - 1))
      setCola({ titulo, subtitulo, ruta, modulo: moduloId || ruta, conceptos: lista, presupuestoMinutos })
      setVista('estudio'); location.hash = 'estudio'
    } catch (e) { setError(String(e)) } finally { setCargando(false) }
  }, [indice, estado.progreso])

  const estudiarIds = useCallback(async (ids: string[], opciones: OpcionesSesionPersonalizada = {}) => {
    if (!indice) return
    setCargando(true); setError(null)
    try {
      const mapa = await cargarConceptos(ids, indice.modulos)
      const seleccion = [...new Set(ids)].map(i => mapa.get(i)).filter(Boolean) as Concepto[]
      const lista = alternarFormatos(seleccion.map(c => opciones.ruta === 'aplicacion' ? aplicarVariante(c, siguienteVariante(c, estado.progreso[c.concept_id], opciones.nivelVariante)) : c), opciones.ruta ?? 'repaso')
      if (!lista.length) throw new Error('No hay conceptos disponibles para esta sesión.')
      setIndiceInicial(0)
      setCola({ titulo: opciones.titulo ?? 'Mi selección de estudio', subtitulo: opciones.subtitulo ?? 'Practica los conceptos que has elegido',
        ruta: opciones.ruta ?? 'repaso', modulo: opciones.modulo ?? 'repaso', conceptos: lista, presupuestoMinutos: opciones.presupuestoMinutos })
      setVista('estudio'); location.hash = 'estudio'
    } catch {
      setError('No se pudo preparar el repaso. Comprueba la conexión y vuelve a intentarlo.')
    } finally { setCargando(false) }
  }, [indice, estado.progreso])

  const continuar = useCallback(async () => {
    const r = estado.reanudable
    if (!r) return
    if (r.conceptIds?.length && indice) {
      setCargando(true); setError(null)
      try {
        const mapa = await cargarConceptos(r.conceptIds, indice.modulos)
        const faltantes = [...new Set(r.conceptIds.filter(id => !mapa.has(id)))]
        if (faltantes.length) throw new Error(`No se pudo restaurar la cola exacta: faltan ${faltantes.length} conceptos del corpus actual.`)
        const conceptos = r.conceptIds.map((id, n) => aplicarVariante(mapa.get(id) as Concepto, r.variantes?.[n]))
        setCola({
          titulo: r.titulo ?? 'Sesión reanudada', subtitulo: r.subtitulo ?? 'Continúa exactamente donde la dejaste.',
          ruta: r.sesion, modulo: r.modulo, conceptos, sessionId: r.sessionId, presupuestoMinutos: r.presupuestoMinutos,
        })
        setIndiceInicial(Math.min(r.indice, conceptos.length))
        setVista('estudio'); location.hash = 'estudio'
      } catch (e) { setError(String(e)) } finally { setCargando(false) }
      return
    }
    await abrir(r.modulo && indice?.modulos.some(m => m.module_id === r.modulo) ? r.modulo : '', (r.sesion as RutaId) || 'guiada', 30, undefined, r.indice)
  }, [estado.reanudable, abrir, indice])

  if (!listo) return <div className="vacio" style={{ paddingTop: 120 }}>Cargando el material de estudio…</div>
  if (!indice) return <div className="vacio" style={{ paddingTop: 120 }}><p>{errorCarga ?? 'No se pudo cargar el material de estudio.'}</p><button className="btn" onClick={() => location.reload()}>Volver a intentar</button></div>

  return (
    <div className={`app editorial-app${enConcentracion ? ' study-focus' : ''}`} data-app-version={APP_VERSION} data-view={vista}>
      <CinematicBackdrop scene={SCENES[vista].fondo} quiet={enConcentracion} />
      <a className="saltar-contenido" href="#contenido" onClick={e => { e.preventDefault(); contenido.current?.focus() }}>Saltar al contenido</a>
      <header className="barra">
        <div className="contenedor barra-in">
          <Brand />
          {!enConcentracion && <p className="sidebar-caption">Espacio de estudio</p>}
          {!enConcentracion && <nav className="nav" aria-label="Navegación principal">
            {NAV.map(n => (
              <button key={n.id} onClick={() => ir(n.id)} aria-current={vista === n.id ? 'page' : undefined}><NavigationIcon name={n.id} /><span>{n.txt}</span></button>
            ))}
          </nav>}
          {!enConcentracion && <div className="sidebar-note"><span className="sidebar-rule" /><span className="editorial-eyebrow">USMLE STEP 1</span></div>}
          <div className="barra-fin">
            {!enConcentracion && <MedidorIA />}
            {sincronizacionVisible && <button className="btn pequeno fantasma" title="Comprobar y sincronizar el progreso"
              onClick={() => { void sincronizarTodo() }} aria-live="polite">{sincronizacionVisible}</button>}
            {!enConcentracion && <details className="menu-cuenta"><summary>Cuenta y ajustes</summary><div className="menu-cuenta-opciones">{SECUNDARIAS.map(n => <button className="btn pequeno fantasma" key={n.id} onClick={e => { ir(n.id); e.currentTarget.closest('details')?.removeAttribute('open') }}>{n.txt}</button>)}<button className="btn pequeno fantasma" onClick={async () => {
              const guardado = await sincronizarTodo()
              if (!guardado && !confirm('Puede haber cambios pendientes. Se conservarán en este navegador para esta cuenta. ¿Cerrar sesión?')) return
              try { await signOut() } catch { setError('No se pudo cerrar la sesión. Vuelve a intentarlo.') }
            }}>Salir</button></div></details>}
          </div>
        </div>
      </header>

      <main id="contenido" ref={contenido} tabIndex={-1}>
        <div className="contenedor">
          {!enConcentracion && <div className="workspace-topline"><span>Mi espacio <span aria-hidden="true">/</span> {[...NAV, ...SECUNDARIAS].find(n => n.id === vista)?.txt}</span><span className="workspace-edition">Medicina · Aprendizaje activo</span></div>}
          {/* El fondo conserva la escena; la zona de trabajo ocupa el ancho disponible. */}
          <div className="cine-escenario" data-depth-scene data-depth-calm={enConcentracion ? 'true' : undefined}>
          <div className="cine-columna">
          {error && <div className="aviso" style={{ marginBottom: 16 }}><span>⚠</span><div>{error}</div></div>}
          {!enConcentracion && [{ texto: avisoLocal, cerrar: descartarAvisoLocal }, { texto: nbme.localNotice, cerrar: nbme.dismissLocalNotice }]
            .filter(a => a.texto).map(a => <div key={a.texto} className="aviso aviso-local" role="status" style={{ marginBottom: 16 }}>
              <span>ℹ</span><div>{a.texto}</div><button className="btn pequeno fantasma" onClick={a.cerrar}>Entendido</button></div>)}
          {cargando && <div className="vacio">Preparando la sesión…</div>}

          <Resguardo key={`${vista}:${reintento}`} alFallar={fallo => <FalloPantalla error={fallo}
            onHoy={() => { setReintento(n => n + 1); ir('hoy') }} />}>
          {!cargando && vista === 'estudio' && cola && (
            <>
              <div style={{ maxWidth: 800, margin: '0 auto 14px' }}>
                <h1 style={{ fontSize: '1.25rem' }}>{cola.titulo}</h1>
                <p className="sutil" style={{ margin: 0 }}>{cola.subtitulo}</p>
              </div>
              <Reproductor cola={cola} indiceInicial={indiceInicial} onSalir={() => ir('hoy')} />
            </>
          )}
          {!cargando && vista === 'preguntas' && <NbmePlayer onSalir={() => { setTipoContenido('preguntas'); ir('modulos') }}
            onEstudiar={ids => { nbme.pauseSession(); void estudiarIds(ids) }}
            onBuscar={q => { nbme.pauseSession(); setFiltrosConceptos({ sistema: q.systems[0] ?? '', disciplina: q.disciplines[0] ?? '' }); setTipoContenido('conceptos'); ir('modulos') }} />}
          {!cargando && vista === 'hoy' && <Hoy onNuevo={abrirNuevo} onCajas={abrirCajas}
            onBiblioteca={tipo => { setTipoContenido(tipo); ir('modulos') }} />}
          {!cargando && vista === 'cajas' && cajasHoy && <SesionCajas key={cajasHoy.titulo + cajasHoy.items.length}
            items={cajasHoy.items} titulo={cajasHoy.titulo} onSalir={() => ir('hoy')} />}
          {!cargando && vista === 'cajas' && !cajasHoy && <div className="vacio"><p>Estas cajas ya no están abiertas.</p>
            <button className="btn" onClick={() => ir('hoy')}>Volver a Hoy</button></div>}
          {!cargando && vista === 'sesion' && sesionSemanal && <SesionMixta key={sesionSemanal.id}
            sesion={sesionSemanal} efimera onSalir={() => ir('hoy')} etiquetaSalida="Volver a Hoy" />}
          {!cargando && vista === 'sesion' && !sesionSemanal && <div className="vacio"><p>Esta sesión ya no está abierta.</p>
            <button className="btn" onClick={() => ir('hoy')}>Volver a Hoy</button></div>}
          {!cargando && vista === 'inicio' && <div className="pila"><StudyHero />
            {sesionPreguntasPendiente && <section className="tarjeta home-session"><div className="pila">
              <p className="editorial-eyebrow">Tu sesión guardada</p><h2>Continúa tus preguntas</h2><p className="sutil">{sesionPreguntasPendiente.title}</p>
              <div><button className="btn principal" disabled={nbme.loading || nbme.busy} onClick={() => void continuarPreguntas()}>Continuar sesión de preguntas</button></div>
              {nbme.error && <p role="alert">{nbme.error}</p>}
            </div></section>}
            <Inicio embedded onIr={ir} onContinuar={continuar} onEmpezar={(limite, tiempo) => abrir('', 'guiada', limite, undefined, 0, tiempo)} />
          </div>}
          {!cargando && vista === 'modulos' && <div className="section-workspace"><div className="section-toolbar fila" role="group" aria-label="Tipo de contenido">
            <button className={`btn${tipoContenido === 'conceptos' ? ' principal' : ' fantasma'}`} aria-pressed={tipoContenido === 'conceptos'} onClick={() => setTipoContenido('conceptos')}>Conceptos</button>
            <button className={`btn${tipoContenido === 'preguntas' ? ' principal' : ' fantasma'}`} aria-pressed={tipoContenido === 'preguntas'} onClick={() => setTipoContenido('preguntas')}>Preguntas</button>
          </div>{tipoContenido === 'preguntas' ? <NbmeLibrary onStart={() => ir('preguntas')} />
            : <Modulos onEstudiar={estudiarIds} seleccion={seleccionManual} onSeleccion={setSeleccionManual} filtrosIniciales={filtrosConceptos} />}</div>}
          {!cargando && vista === 'auditoria' && <Auditoria />}
          {!cargando && vista === 'ajustes' && <Ajustes />}
          </Resguardo>
          </div>
          </div>
        </div>
      </main>
    </div>
  )
}
