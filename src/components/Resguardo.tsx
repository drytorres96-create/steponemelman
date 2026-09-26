import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { useDescarga } from './descarga'
import { nombreRespaldo, respaldoDeEmergencia } from '../lib/respaldo'

/**
 * Resguardo ante un fallo al pintar una pantalla. Sin él, un error en cualquier parte
 * desmonta la aplicación entera y deja la página en blanco a mitad de sesión. Para volver
 * a intentarlo, quien lo usa le cambia la `key`.
 */
export class Resguardo extends Component<{ children: ReactNode; alFallar: (error: Error) => ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Una línea en la consola para poder distinguir el fallo sin adivinar.
    console.error('[resguardo]', error, info.componentStack)
  }
  render() { return this.state.error ? this.props.alFallar(this.state.error) : this.props.children }
}

function DetalleTecnico({ error }: { error: Error }) {
  return <details className="mini"><summary>Detalle técnico</summary><pre className="fallo-detalle">{error.message || error.name}</pre></details>
}

/** Una pantalla falló, pero los proveedores siguen vivos: el respaldo sale de la memoria. */
export function FalloPantalla({ error, onHoy }: { error: Error; onHoy: () => void }) {
  const { exportar } = useApp()
  const nbme = useNbme()
  const { entregar, dialogo } = useDescarga()
  const volver = useRef<HTMLButtonElement>(null)
  useEffect(() => { volver.current?.focus({ preventScroll: true }) }, [])
  return <section className="tarjeta pila fallo-pantalla" role="alert" aria-labelledby="fallo-titulo">
    {dialogo}
    <span className="rotulo">Algo falló</span>
    <h2 id="fallo-titulo">Esta pantalla no pudo mostrarse.</h2>
    <p>Tu progreso está a salvo: cada respuesta se guarda en cuanto la das.</p>
    <div className="fila">
      <button ref={volver} className="btn principal" onClick={onHoy}>Volver a Hoy</button>
      <button className="btn" onClick={() => location.reload()}>Recargar la página</button>
      <button className="btn fantasma" onClick={() => entregar(nombreRespaldo(), exportar({ nbme: nbme.state }), 'application/json')}>Descargar respaldo</button>
    </div>
    <DetalleTecnico error={error} />
  </section>
}

/** Falló la aplicación entera, quizá un proveedor: el respaldo sale de lo guardado en el navegador. */
export function FalloGeneral({ error }: { error: Error }) {
  const { entregar, dialogo } = useDescarga()
  return <main className="contenedor fallo-general">
    {dialogo}
    <section className="tarjeta pila" role="alert" aria-labelledby="fallo-general-titulo">
      <span className="rotulo">Algo falló</span>
      <h1 id="fallo-general-titulo">La aplicación se ha detenido.</h1>
      <p>Tu progreso está guardado en este dispositivo y en tu cuenta. Recargar suele bastar.</p>
      <div className="fila">
        <button className="btn principal" onClick={() => location.reload()}>Recargar la página</button>
        <button className="btn fantasma" onClick={async () => entregar(nombreRespaldo(), await respaldoDeEmergencia(), 'application/json')}>Descargar respaldo</button>
      </div>
      <DetalleTecnico error={error} />
    </section>
  </main>
}
