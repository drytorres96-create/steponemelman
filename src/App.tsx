import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './store/estado'
import { cargarConceptos, cargarModulo } from './data/corpus'
import type { Concepto } from './schema/concept'
import { Inicio } from './screens/Inicio'
import { Modulos } from './screens/Modulos'
import { Repaso } from './screens/Repaso'
import { Progreso } from './screens/Progreso'
import { Auditoria } from './screens/Auditoria'
import { Ajustes } from './screens/Ajustes'
import { Reproductor, type Cola } from './screens/Reproductor'
import { construirCola, RUTAS, type RutaId } from './lib/rutas'
import { cargarTodo } from './data/corpus'
import { useAuth } from './auth/AuthProvider'
import { APP_VERSION } from './release'
import type { OpcionesSesionPersonalizada } from './lib/busqueda'
import { alternarFormatos } from './lib/formatos'
import { aplicarVariante, siguienteVariante } from './lib/variantes'

type Vista = 'inicio' | 'modulos' | 'repaso' | 'progreso' | 'auditoria' | 'ajustes' | 'estudio'
const NAV: { id: Vista; txt: string }[] = [
  { id: 'inicio', txt: 'Hoy' }, { id: 'modulos', txt: 'Elegir contenido' }, { id: 'progreso', txt: 'Progreso' },
]
const SECUNDARIAS: { id: Vista; txt: string }[] = [
  { id: 'repaso', txt: 'Repasos pendientes' }, { id: 'ajustes', txt: 'Ajustes y respaldo' }, { id: 'auditoria', txt: 'Calidad del material' },
]

// A session queue is restored from the saved study state, never from the URL alone.
function vistaDesdeHash(): Vista {
  const value = location.hash.slice(1)
  return [...NAV, ...SECUNDARIAS].some(n => n.id === value) ? value as Vista : 'inicio'
}

export default function App() {
  const { listo, indice, estado, errorCarga, sincronizacion, sincronizarAhora } = useApp()
  const { signOut } = useAuth()
  const [vista, setVista] = useState<Vista>(vistaDesdeHash)
  const [cola, setCola] = useState<Cola | null>(null)
  const [indiceInicial, setIndiceInicial] = useState(0)
  const [seleccionManual, setSeleccionManual] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [concentracion, setConcentracion] = useState(true)
  const contenido = useRef<HTMLElement>(null)
  const enConcentracion = vista === 'estudio' && concentracion

  useEffect(() => {
    const h = () => { if (location.hash.slice(1) !== 'estudio') setVista(vistaDesdeHash()) }
    window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h)
  }, [])
  useEffect(() => { contenido.current?.focus({ preventScroll: true }) }, [vista])
  const ir = useCallback((v: string) => { setCola(null); setVista(v as Vista); location.hash = v }, [])

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
    <div className="app" data-app-version={APP_VERSION}>
      <a className="saltar-contenido" href="#contenido" onClick={e => { e.preventDefault(); contenido.current?.focus() }}>Saltar al contenido</a>
      <header className="barra">
        <div className="contenedor barra-in">
          <div className="marca"><span className="punto" /><span>Step 1</span></div>
          {!enConcentracion && <nav className="nav" aria-label="Navegación principal">
            {NAV.map(n => (
              <button key={n.id} onClick={() => ir(n.id)} aria-current={vista === n.id ? 'page' : undefined}>{n.txt}</button>
            ))}
          </nav>}
          <div className="barra-fin">
            {vista === 'estudio' && <button className="btn pequeno fantasma" aria-pressed={concentracion}
              onClick={() => setConcentracion(v => !v)}>{concentracion ? 'Mostrar menú' : 'Concentrarme'}</button>}
            <button className="btn pequeno fantasma" title="Comprobar y sincronizar el progreso" onClick={() => { void sincronizarAhora() }} aria-live="polite">{sincronizacion.mensaje}</button>
            {!enConcentracion && <details className="menu-cuenta"><summary>Cuenta y ajustes</summary><div className="menu-cuenta-opciones">{SECUNDARIAS.map(n => <button className="btn pequeno fantasma" key={n.id} onClick={e => { ir(n.id); e.currentTarget.closest('details')?.removeAttribute('open') }}>{n.txt}</button>)}<button className="btn pequeno fantasma" onClick={async () => {
              const guardado = await sincronizarAhora()
              if (!guardado && !confirm('Puede haber cambios pendientes. Se conservarán en este navegador para esta cuenta. ¿Cerrar sesión?')) return
              try { await signOut() } catch { setError('No se pudo cerrar la sesión. Vuelve a intentarlo.') }
            }}>Salir</button></div></details>}
          </div>
        </div>
      </header>

      <main id="contenido" ref={contenido} tabIndex={-1}>
        <div className="contenedor">
          {error && <div className="aviso" style={{ marginBottom: 16 }}><span>⚠</span><div>{error}</div></div>}
          {cargando && <div className="vacio">Preparando la sesión…</div>}

          {!cargando && vista === 'estudio' && cola && (
            <>
              <div style={{ maxWidth: 800, margin: '0 auto 14px' }}>
                <h1 style={{ fontSize: '1.25rem' }}>{cola.titulo}</h1>
                <p className="sutil" style={{ margin: 0 }}>{cola.subtitulo}</p>
              </div>
              <Reproductor cola={cola} indiceInicial={indiceInicial} onSalir={() => ir('inicio')} />
            </>
          )}
          {!cargando && vista === 'inicio' && <Inicio onIr={ir} onContinuar={continuar}
            onEmpezar={(limite, tiempo) => abrir('', 'guiada', limite, undefined, 0, tiempo)} />}
          {!cargando && vista === 'modulos' && <Modulos onEstudiar={estudiarIds} seleccion={seleccionManual} onSeleccion={setSeleccionManual} />}
          {!cargando && vista === 'repaso' && <Repaso onEstudiar={estudiarIds} />}
          {!cargando && vista === 'progreso' && <Progreso onEstudiar={estudiarIds} onContinuar={continuar} />}
          {!cargando && vista === 'auditoria' && <Auditoria />}
          {!cargando && vista === 'ajustes' && <Ajustes />}
        </div>
      </main>
    </div>
  )
}
