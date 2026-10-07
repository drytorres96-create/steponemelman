import { useEffect, useRef, useState } from 'react'
import { generarRecuperacionNbme } from '../lib/recuperacion-nbme-ia'
import { avanzarRecuperacion, claveRecuperacion, crearRecuperacion, guardarRecuperacion, leerRecuperacion,
  responderRecuperacion, type OrigenRecuperacion, type RecuperacionGuardada } from './recuperacion-modelo'
import './recuperacion.css'

export interface RecuperacionNbmeProps {
  ownerId: string | null
  origen: OrigenRecuperacion
  onTerminar: (destino: 'original' | 'siguiente') => void
  puedeSeguir?: boolean
  onActividad?: (activa: boolean) => void
}

/** El cambio de cuenta/intento desmonta y cancela la petición anterior antes de mostrar otra práctica. */
export function RecuperacionNbme(props: RecuperacionNbmeProps) {
  const clave = props.ownerId ? claveRecuperacion(props.ownerId, props.origen) : null
  return clave && props.ownerId ? <PanelRecuperacion key={clave} {...props} ownerId={props.ownerId} /> : null
}

function PanelRecuperacion({ ownerId, origen, onTerminar, puedeSeguir = true, onActividad }: RecuperacionNbmeProps & { ownerId: string }) {
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
    onActividad?.(true)
    const r = await generarRecuperacionNbme({ ...origen, ...(razonamiento.trim() ? { razonamiento: razonamiento.trim() } : {}) }, abort.signal)
    if (abort.signal.aborted) return
    setPensando(false)
    if (r.estado === 'sin_ia') { setAviso(r.motivo); onActividad?.(false); return }
    actualizar(crearRecuperacion(ownerId, origen, r.data))
    setAbierta(true)
  }
  const comprobar = () => {
    if (sesion && !respuesta) actualizar(responderRecuperacion(sesion, sesion.borrador))
  }

  return <section className="recuperacion-nbme pila" aria-label="Recuperación del error NBME" aria-busy={pensando}>
    <div><h3>Recuperar este error</h3><p className="mini">Practica el objetivo con preguntas cortas. Tu resultado NBME se conserva.</p></div>
    {lectura.estado === 'invalido' && !sesion && <p className="mini" role="alert">La recuperación guardada no se pudo leer. Puedes generar otra; tu intento NBME se conserva.</p>}
    {!guardado && <p className="recuperacion-aviso" role="alert">No se pudo guardar esta práctica en el dispositivo. Puedes continuar aquí; mantén la página abierta si quieres terminarla.</p>}
    {!abierta && <>
      {sesion ? <button className="btn" onClick={() => { setAbierta(true); onActividad?.(true) }}>{sesion.cerrada ? 'Ver recuperación guardada' : `Retomar recuperación · ${sesion.cursor + 1} de ${sesion.contenido.ejercicios.length}`}</button>
        : <>
          <details><summary>Así lo razoné · opcional</summary><label className="recuperacion-razonamiento">¿Qué dato te llevó a elegir esa opción?
            <textarea value={razonamiento} maxLength={500} rows={2} onChange={e => setRazonamiento(e.target.value)} placeholder="Elegí esa opción porque…" /></label></details>
          <button className="btn" disabled={pensando} onClick={() => void generar()}>Practicar este error con IA</button>
        </>}
      {pensando && <p className="mini" role="status">Preparando una recuperación breve… Puedes volver a la pregunta cuando quieras.</p>}
      {aviso && <p className="recuperacion-aviso" role="status">{aviso} Conservas el material y puedes continuar.</p>}
      <div className="recuperacion-acciones"><button className="btn fantasma" onClick={() => salir('original')}>Volver a la pregunta original</button>
        {puedeSeguir && <button className="btn fantasma" onClick={() => salir('siguiente')}>Ir a la siguiente pregunta</button>}</div>
      {!sesion && <p className="mini">Usa el presupuesto gratuito de IA. La práctica se guarda en esta cuenta y dispositivo.</p>}
    </>}
    {abierta && sesion && <>
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
            <p className="mini">La interpretación de IA puede equivocarse; contrástala con el material.</p></details>
          <button className="btn principal" onClick={() => actualizar(avanzarRecuperacion(sesion))}>{sesion.cursor + 1 === sesion.contenido.ejercicios.length ? 'Terminar recuperación' : 'Siguiente ejercicio'}</button>
        </div>}
        <div className="recuperacion-acciones"><button className="btn fantasma" onClick={() => salir('original')}>Pausar y volver al NBME</button></div>
      </>}
      <p className="mini" role="status">{guardado ? 'Recuperación guardada en esta cuenta y dispositivo.' : 'La práctica sigue disponible mientras mantengas esta página abierta.'}</p>
    </>}
  </section>
}
