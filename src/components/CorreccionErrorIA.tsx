import { useEffect, useRef, useState } from 'react'
import { analizarError, type CorreccionError, type PeticionErrorIA } from '../lib/error-ia'

/** Después del intento; nunca registra respuestas, cambia notas ni impide continuar. */
export function CorreccionErrorIA({ peticion }: { peticion: PeticionErrorIA }) {
  const identidad = JSON.stringify(peticion)
  const [error, setError] = useState<CorreccionError | null>(null)
  const [aviso, setAviso] = useState('')
  const [pensando, setPensando] = useState(false)
  const [razonamiento, setRazonamiento] = useState('')
  const [revisado, setRevisado] = useState(false)
  const control = useRef<AbortController | null>(null)
  const pedir = async (datos: PeticionErrorIA) => {
    control.current?.abort()
    const abort = new AbortController(); control.current = abort
    setPensando(true); setAviso('')
    const r = await analizarError(datos, abort.signal)
    if (abort.signal.aborted) return
    setPensando(false)
    if (r.estado === 'ok') { setError(r.data); setRevisado(!!datos.razonamiento?.trim()) }
    else setAviso(r.motivo)
  }
  useEffect(() => {
    setError(null); setRazonamiento(''); setRevisado(false)
    void pedir(JSON.parse(identidad))
    return () => control.current?.abort()
  }, [identidad])
  return <section className="correccion-error-ia" aria-label="Corrección personalizada de tu error" aria-busy={pensando}>
    <h3>Para tu próximo intento</h3>
    {pensando && <p className="mini" role="status">Analizando tu respuesta… Puedes continuar cuando quieras.</p>}
    {error && <div className="pila" aria-live="polite">
      <p><b>Lo observado:</b> {error.observado}</p>
      <p><b>{revisado ? 'Revisión de tu razonamiento:' : 'Posible confusión:'}</b> {error.confusion}</p>
      <p className="session-feedback-key"><b>Dato decisivo:</b> {error.clave}</p>
      <p><b>Antes de elegir otra vez:</b> {error.evitar}</p>
      <details><summary>Ver el fragmento utilizado</summary><blockquote>{error.evidencia}</blockquote>
        <p className="mini">La cita coincide con el material. La interpretación de IA puede equivocarse.</p></details>
    </div>}
    {aviso && <p className="mini" role="status">{aviso} Conservas la explicación del material y puedes seguir.</p>}
    {!pensando && aviso && <button className="btn pequeno fantasma" onClick={() => void pedir(peticion)}>Volver a pedir la corrección</button>}
    <details className="error-razonamiento"><summary>Así lo razoné · opcional</summary>
      <form className="pila" onSubmit={e => { e.preventDefault(); if (razonamiento.trim() && !pensando) void pedir({ ...peticion, razonamiento: razonamiento.trim() }) }}>
        <label>¿Qué dato te llevó a esa respuesta?
          <textarea value={razonamiento} maxLength={500} rows={2} onChange={e => setRazonamiento(e.target.value)} placeholder="Elegí esa opción porque…" />
        </label>
        <button className="btn pequeno" disabled={pensando || !razonamiento.trim()}>Revisar mi razonamiento</button>
      </form>
    </details>
    <p className="mini">Usa el presupuesto gratuito. Sin tu razonamiento, la confusión es una hipótesis. Tu nota y tus repasos se conservan.</p>
  </section>
}
