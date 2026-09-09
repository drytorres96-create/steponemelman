import { useCallback, useEffect, useState } from 'react'
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

type Vista = 'inicio' | 'modulos' | 'repaso' | 'progreso' | 'auditoria' | 'ajustes' | 'estudio'
const NAV: { id: Vista; txt: string }[] = [
  { id: 'inicio', txt: 'Inicio' }, { id: 'modulos', txt: 'Módulos' }, { id: 'repaso', txt: 'Repaso' },
  { id: 'progreso', txt: 'Progreso' }, { id: 'auditoria', txt: 'Auditoría' }, { id: 'ajustes', txt: 'Ajustes' },
]

export default function App() {
  const { listo, indice, estado, errorCarga, sincronizacion, sincronizarAhora } = useApp()
  const { signOut } = useAuth()
  const [vista, setVista] = useState<Vista>(() => (location.hash.slice(1) as Vista) || 'inicio')
  const [cola, setCola] = useState<Cola | null>(null)
  const [indiceInicial, setIndiceInicial] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const h = () => { const v = (location.hash.slice(1) as Vista); if (v && v !== 'estudio') setVista(v || 'inicio') }
    window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h)
  }, [])
  const ir = useCallback((v: string) => { setCola(null); setVista(v as Vista); location.hash = v }, [])

  const abrir = useCallback(async (moduloId: string, ruta: RutaId, limite: number, sesionId?: string, desde = 0) => {
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
      const lista = sesionId ? conceptos : construirCola(ruta, conceptos, estado.progreso, limite)
      if (!lista.length) { setError('No hay conceptos disponibles para esta ruta ahora mismo.'); setCargando(false); return }
      setIndiceInicial(Math.min(desde, lista.length - 1))
      setCola({ titulo, subtitulo, ruta, modulo: moduloId || ruta, conceptos: lista })
      setVista('estudio'); location.hash = 'estudio'
    } catch (e) { setError(String(e)) } finally { setCargando(false) }
  }, [indice, estado.progreso])

  const estudiarIds = useCallback(async (ids: string[]) => {
    if (!indice) return
    setCargando(true)
    const mapa = await cargarConceptos(ids, indice.modulos)
    const lista = ids.map(i => mapa.get(i)).filter(Boolean) as Concepto[]
    setIndiceInicial(0)
    setCola({ titulo: 'Repaso espaciado', subtitulo: 'Ordenado por prioridad de olvido', ruta: 'repaso', modulo: 'repaso', conceptos: lista })
    setVista('estudio'); location.hash = 'estudio'; setCargando(false)
  }, [indice])

  const continuar = useCallback(async () => {
    const r = estado.reanudable
    if (!r) return
    if (r.conceptIds?.length && indice) {
      setCargando(true); setError(null)
      try {
        const mapa = await cargarConceptos(r.conceptIds, indice.modulos)
        const faltantes = [...new Set(r.conceptIds.filter(id => !mapa.has(id)))]
        if (faltantes.length) throw new Error(`No se pudo restaurar la cola exacta: faltan ${faltantes.length} conceptos del corpus actual.`)
        const conceptos = r.conceptIds.map(id => mapa.get(id) as Concepto)
        setCola({
          titulo: r.titulo ?? 'Sesión reanudada', subtitulo: r.subtitulo ?? 'Continúa exactamente donde la dejaste.',
          ruta: r.sesion, modulo: r.modulo, conceptos, sessionId: r.sessionId,
        })
        setIndiceInicial(Math.min(r.indice, conceptos.length - 1))
        setVista('estudio'); location.hash = 'estudio'
      } catch (e) { setError(String(e)) } finally { setCargando(false) }
      return
    }
    await abrir(r.modulo && indice?.modulos.some(m => m.module_id === r.modulo) ? r.modulo : '', (r.sesion as RutaId) || 'guiada', 30, undefined, r.indice)
  }, [estado.reanudable, abrir, indice])

  if (!listo) return <div className="vacio" style={{ paddingTop: 120 }}>Cargando el corpus auditado…</div>
  if (!indice) return <div className="vacio" style={{ paddingTop: 120 }}><p>{errorCarga ?? 'No se pudo cargar el material de estudio.'}</p><button className="btn" onClick={() => location.reload()}>Volver a intentar</button></div>

  return (
    <div className="app">
      <header className="barra">
        <div className="contenedor barra-in">
          <div className="marca"><span className="punto" /><span>Step 1</span></div>
          <nav className="nav" aria-label="Navegación principal">
            {NAV.map(n => (
              <button key={n.id} onClick={() => ir(n.id)} aria-current={vista === n.id ? 'page' : undefined}>{n.txt}</button>
            ))}
          </nav>
          <div className="barra-fin">
            <button className="btn pequeno fantasma" title="Comprobar y sincronizar el progreso" onClick={() => { void sincronizarAhora() }} aria-live="polite">{sincronizacion.mensaje}</button>
            <button className="btn pequeno fantasma" onClick={async () => {
              const guardado = await sincronizarAhora()
              if (!guardado && !confirm('Puede haber cambios pendientes. Se conservarán en este navegador para esta cuenta. ¿Cerrar sesión?')) return
              try { await signOut() } catch { setError('No se pudo cerrar la sesión. Vuelve a intentarlo.') }
            }}>Salir</button>
          </div>
        </div>
      </header>

      <main>
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
          {!cargando && vista === 'inicio' && <Inicio onIr={ir} onContinuar={continuar} onEmpezar={id => abrir(id, 'guiada', 14)} />}
          {!cargando && vista === 'modulos' && <Modulos onAbrir={abrir} />}
          {!cargando && vista === 'repaso' && <Repaso onEstudiar={estudiarIds} />}
          {!cargando && vista === 'progreso' && <Progreso />}
          {!cargando && vista === 'auditoria' && <Auditoria />}
          {!cargando && vista === 'ajustes' && <Ajustes />}
        </div>
      </main>
    </div>
  )
}
