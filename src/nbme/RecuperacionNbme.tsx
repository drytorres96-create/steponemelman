import { useEffect, useRef, useState } from 'react'
import { generarRecuperacionNbme } from '../lib/recuperacion-nbme-ia'
import { avanzarRecuperacion, claveRecuperacion, crearRecuperacion, guardarRecuperacion, leerRecuperacion,
  responderRecuperacion, type OrigenRecuperacion, type RecuperacionGuardada } from './recuperacion-modelo'
import './recuperacion.css'
import { loadNbmeSourceSafety } from '../lib/nbme-source-safety'
import { originalRecoveryAllowed } from './source-safety'
import type { NbmeQuestion } from './types'
import { Explanation } from '../myqbank/Explanation'

export interface RecuperacionNbmeProps {
  ownerId: string | null
  origen: OrigenRecuperacion
  onTerminar: (destino: 'original' | 'siguiente') => void
  puedeSeguir?: boolean
  onActividad?: (activa: boolean) => void
  pregunta?: NbmeQuestion
  figures?: { assetId: string; sha256?: string }[]
}

/** El cambio de cuenta/intento desmonta y cancela la petición anterior antes de mostrar otra práctica. */
export function RecuperacionNbme(props: RecuperacionNbmeProps) {
  const clave = props.ownerId ? claveRecuperacion(props.ownerId, props.origen) : null
  return clave && props.ownerId ? <RecoveryGate key={clave} {...props} ownerId={props.ownerId} /> : null
}

function RecoveryGate(props: RecuperacionNbmeProps & { ownerId: string }) {
  const [access, setAccess] = useState<'loading' | 'original' | 'reviewed'>('loading')
  const alive = useRef(true)
  const request = useRef(0)
  const active = useRef(false)
  const activity = (value: boolean) => { active.current = value; props.onActividad?.(value) }
  const authorizeOriginal = async () => {
    const sequence = ++request.current
    const allowed = originalRecoveryAllowed(await loadNbmeSourceSafety(), props.origen.qid)
    if (!alive.current || sequence !== request.current) return false
    setAccess(allowed ? 'original' : 'reviewed')
    return allowed
  }
  useEffect(() => {
    alive.current = true
    const offline = () => { request.current++; setAccess('reviewed'); if (active.current) activity(false) }
    window.addEventListener('offline', offline)
    void authorizeOriginal()
    return () => { alive.current = false; request.current++; window.removeEventListener('offline', offline) }
  }, [])
  if (access === 'loading') return <p role="status" lang="en">Checking recovery availability…</p>
  if (access === 'original') return <PanelRecuperacion {...props} onActividad={activity} authorizeOriginal={authorizeOriginal}/>
  const q = props.pregunta
  return <section className="recuperacion-nbme pila" aria-label="Reviewed recovery" lang="en">
    <h3>Reviewed recovery</h3>
    {q && q.id === props.origen.qid && q.revision === props.origen.revision
      ? <Explanation source={q} figures={props.figures} drillsOnly highlightSource={{ material: 'nbme', sourceId: q.id,
        sourceRevision: q.revision, variantId: '', editorialVersion: '' }}/>
      : <p role="status">Reviewed practice unavailable. Your answer is saved.</p>}
    <button className="btn" onClick={() => void authorizeOriginal()}>Retry recovery availability</button>
    <div className="recuperacion-acciones"><button className="btn" onClick={() => props.onTerminar('original')}>Back to question</button>
      {props.puedeSeguir !== false && <button className="btn" onClick={() => props.onTerminar('siguiente')}>Next question</button>}</div>
  </section>
}

function PanelRecuperacion({ ownerId, origen, onTerminar, puedeSeguir = true, onActividad, authorizeOriginal }: RecuperacionNbmeProps & { ownerId: string; authorizeOriginal: () => Promise<boolean> }) {
  const [lectura] = useState(() => leerRecuperacion(ownerId, origen))
  const [sesion, setSesion] = useState<RecuperacionGuardada | null>(() => lectura.estado === 'ok' ? lectura.sesion : null)
  const [abierta, setAbierta] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [razonamiento, setRazonamiento] = useState('')
  const [aviso, setAviso] = useState('')
  const [guardado, setGuardado] = useState(lectura.estado !== 'sin_almacenamiento')
  const control = useRef<AbortController | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const feedback = useRef<HTMLDivElement>(null)
  const ejercicio = sesion && !sesion.cerrada ? sesion.contenido.ejercicios[sesion.cursor] : null
  const respuesta = sesion?.respuestas[sesion.cursor]

  useEffect(() => () => control.current?.abort(), [])
  useEffect(() => {
    if (abierta && sesion) {
      if (respuesta) feedback.current?.focus()
      else titulo.current?.focus()
    }
  }, [abierta, sesion?.cursor, sesion?.cerrada, !!respuesta])

  const actualizar = (nueva: RecuperacionGuardada) => {
    setSesion(nueva)
    setGuardado(guardarRecuperacion(nueva))
  }
  const salir = (destino: 'original' | 'siguiente') => {
    control.current?.abort()
    setPensando(false)
    setAbierta(false)
    onTerminar(destino)
  }
  const generar = async () => {
    if (pensando) return
    control.current?.abort()
    const abort = new AbortController(); control.current = abort
    setPensando(true); setAviso('')
    if (!await authorizeOriginal() || abort.signal.aborted) { setPensando(false); return }
    onActividad?.(true)
    const r = await generarRecuperacionNbme({ ...origen, ...(razonamiento.trim() ? { razonamiento: razonamiento.trim() } : {}) }, abort.signal)
    if (abort.signal.aborted) return
    setPensando(false)
    if (r.estado === 'sin_ia') { setAviso(r.motivo); onActividad?.(false); return }
    actualizar(crearRecuperacion(ownerId, origen, r.data))
    setAbierta(true)
  }
  const retomar = async () => {
    control.current?.abort()
    const abort = new AbortController(); control.current = abort
    if (await authorizeOriginal() && !abort.signal.aborted) { setAbierta(true); onActividad?.(true) }
  }
  const comprobar = () => {
    if (sesion && !respuesta) actualizar(responderRecuperacion(sesion, sesion.borrador))
  }

  return <section className="recuperacion-nbme pila" aria-label="Recuperación del error NBME" aria-busy={pensando}>
    <div><h3>Recuperar este error</h3><p className="mini">Practica el objetivo con preguntas cortas. Tu resultado NBME se conserva.</p></div>
    {lectura.estado === 'invalido' && !sesion && <p className="mini" role="alert">La recuperación guardada no se pudo leer. Puedes generar otra; tu intento NBME se conserva.</p>}
    {!guardado && <p className="recuperacion-aviso" role="alert">No se pudo guardar esta práctica en el dispositivo. Puedes continuar aquí; mantén la página abierta si quieres terminarla.</p>}
    {!abierta && <>
      {sesion ? <button className="btn" onClick={() => void retomar()}>{sesion.cerrada ? 'Ver recuperación guardada' : `Retomar recuperación · ${sesion.cursor + 1} de ${sesion.contenido.ejercicios.length}`}</button>
        : <>
          <details><summary>Así lo razoné · opcional</summary><label className="recuperacion-razonamiento">¿Qué dato te llevó a elegir esa opción?
            <textarea value={razonamiento} maxLength={500} rows={2} onChange={e => setRazonamiento(e.target.value)} placeholder="Elegí esa opción porque…" /></label></details>
          <button className="btn" disabled={pensando} onClick={() => void generar()}>Practicar este error con IA</button>
        </>}
      {pensando && <div className="pila" role="status">
        <p><b>Preparando una recuperación breve…</b></p>
        <progress aria-label="Generando ejercicios de recuperación" style={{ width: '100%', height: 8, accentColor: 'var(--verde)' }} />
        <p className="mini">Puede tardar hasta un minuto. Puedes volver a la pregunta cuando quieras.</p>
      </div>}
      {aviso && <p className="recuperacion-aviso" role="status">{aviso} Conservas el material y puedes continuar.</p>}
      <div className="recuperacion-acciones"><button className="btn fantasma" onClick={() => salir('original')}>Volver a la pregunta original</button>
        {puedeSeguir && <button className="btn fantasma" onClick={() => salir('siguiente')}>Ir a la siguiente pregunta</button>}</div>
      {!sesion && <p className="mini">Usa el presupuesto gratuito de IA. La práctica se guarda en esta cuenta y dispositivo.</p>}
    </>}
    {abierta && sesion && <>
      {sesion.contenido.preparacion === 'fuente_verificada' && <p className="mini">Preparada desde el material verificado; la IA no pudo completar la selección.</p>}
      <p className="recuperacion-objetivo" lang="en"><b lang="es">Objetivo:</b> {sesion.contenido.objetivo}</p>
      {sesion.cerrada ? <div className="pila" aria-live="polite">
        <h4 ref={titulo} tabIndex={-1}>Recuperación terminada</h4>
        <p>Respondiste {sesion.contenido.ejercicios.length} ejercicios; {sesion.respuestas.filter(r => r.correcta).length} acertados.</p>
        <div className="recuperacion-acciones"><button className="btn principal" onClick={() => salir('original')}>Volver a la pregunta original</button>
          {puedeSeguir && <button className="btn" onClick={() => salir('siguiente')}>Ir a la siguiente pregunta</button>}</div>
      </div> : ejercicio && <>
        <p className="mini">Ejercicio {sesion.cursor + 1} de {sesion.contenido.ejercicios.length} · {ejercicio.tipo === 'completar' ? 'Respuesta breve' : ejercicio.tipo === 'verdadero_falso' ? 'Verdadero o falso' : 'Elige una respuesta'}</p>
        <form className="pila" onSubmit={e => { e.preventDefault(); comprobar() }}>
          <h4 ref={titulo} tabIndex={-1} lang="en">{ejercicio.pregunta}</h4>
          {ejercicio.tipo === 'completar' ? <label className="recuperacion-escrita">Completa con el término exacto
            <input type="text" value={sesion.borrador} maxLength={120} autoComplete="off" disabled={!!respuesta}
              onChange={e => actualizar({ ...sesion, borrador: e.target.value, actualizadaEn: Date.now() })} /></label>
            : <fieldset className="recuperacion-opciones" disabled={!!respuesta}><legend>Selecciona una respuesta</legend>
              {(ejercicio.tipo === 'verdadero_falso' ? ['Verdadero', 'Falso'] : ejercicio.alternativas ?? []).map((opcion, index) => <label key={opcion}
                className={`recuperacion-opcion${!respuesta && sesion.borrador === opcion ? ' elegida' : ''}${respuesta && opcion === ejercicio.respuesta ? ' correct' : ''}${respuesta && sesion.borrador === opcion && !respuesta.correcta ? ' incorrect' : ''}`}>
                <input type="radio" name={`recuperacion-${ejercicio.id}`} value={opcion} checked={sesion.borrador === opcion}
                  onChange={() => actualizar({ ...sesion, borrador: opcion, actualizadaEn: Date.now() })} />
                <span className="recuperacion-opcion-texto">
                  <span lang={ejercicio.tipo === 'verdadero_falso' ? 'es' : 'en'}>{ejercicio.tipo === 'verdadero_falso' ? opcion : `${String.fromCharCode(65 + index)}. ${opcion}`}</span>
                  {respuesta && opcion === ejercicio.respuesta && <span className="recuperacion-opcion-state"><span aria-hidden="true">✓</span> Respuesta correcta</span>}
                  {respuesta && sesion.borrador === opcion && !respuesta.correcta && <span className="recuperacion-opcion-state"><span aria-hidden="true">×</span> Tu respuesta · incorrecta</span>}
                </span>
              </label>)}
            </fieldset>}
          {!respuesta && <button className="btn principal" disabled={!sesion.borrador.trim()}>Comprobar respuesta</button>}
        </form>
        {respuesta && <div className={`recuperacion-feedback pila ${respuesta.correcta ? 'correct' : 'incorrect'}`} ref={feedback} tabIndex={-1} aria-live="polite">
          <p><b><span aria-hidden="true">{respuesta.correcta ? '✓ ' : '× '}</span>{respuesta.correcta ? 'Correcto.' : 'Revisa el dato decisivo.'}</b></p>
          <p><b>Respuesta:</b> <span lang={ejercicio.tipo === 'verdadero_falso' ? 'es' : 'en'}>{ejercicio.respuesta}</span></p>
          <p lang="en">{ejercicio.explicacion}</p>
          <details><summary>Ver el fragmento utilizado</summary><blockquote lang="en">{ejercicio.evidencia}</blockquote>
            {ejercicio.source && <p className="mini">{ejercicio.source.title} · página {ejercicio.source.page}</p>}
            <p className="mini">El ejercicio y su respuesta se apoyan en este fragmento.</p></details>
          <button className="btn principal" onClick={() => actualizar(avanzarRecuperacion(sesion))}>{sesion.cursor + 1 === sesion.contenido.ejercicios.length ? 'Terminar recuperación' : 'Siguiente ejercicio'}</button>
        </div>}
        <div className="recuperacion-acciones"><button className="btn fantasma" onClick={() => salir('original')}>Pausar y volver al NBME</button></div>
      </>}
      <p className="mini" role="status">{guardado ? 'Recuperación guardada en esta cuenta y dispositivo.' : 'La práctica sigue disponible mientras mantengas esta página abierta.'}</p>
    </>}
  </section>
}
