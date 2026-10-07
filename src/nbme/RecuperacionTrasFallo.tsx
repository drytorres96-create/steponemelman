import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import { alternarFormatos, VERSION_FORMATO_ACTUAL } from '../lib/formatos'
import type { Concepto } from '../schema/concept'
import { type Reanudable } from '../store/model'
import { Reproductor, type Cola } from '../screens/Reproductor'
import { RecuperacionNbme } from './RecuperacionNbme'
import { recomendarConceptosNbme } from './relacionados'
import { guardarRepasoRelacionado, leerRepasoRelacionado, type OrigenRepasoNbme, type RepasoRelacionadoGuardado } from './repaso-relacionado-modelo'
import { useNbme } from './NbmeProvider'
import type { NbmeAttempt, NbmeQuestion } from './types'
import './recuperacion-flujo.css'

interface Props {
  pregunta: NbmeQuestion; intento: NbmeAttempt
  onActividad: (activa: boolean) => void; onSiguiente: () => void
}
/** Montado dentro del jugador: salir del repaso devuelve la misma pregunta y su orquestador. */
export function RecuperacionTrasFallo(props: Props) {
  const { user } = useAuth()
  const key = `${user?.id ?? ''}:${props.intento.id}:${props.pregunta.revision}`
  return user ? <Flujo key={key} {...props} ownerId={user.id} /> : null
}

function Flujo({ pregunta, intento, onActividad, onSiguiente, ownerId }: Props & { ownerId: string }) {
  const { indice, iniciarSesion } = useApp()
  const nbme = useNbme()
  const origen: OrigenRepasoNbme = { sessionId: intento.sessionId, attemptId: intento.id,
    questionId: pregunta.id, revision: pregunta.revision, position: intento.position }
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [expandido, setExpandido] = useState(false)
  const [elegidos, setElegidos] = useState<string[] | null>(null)
  const [guardada, setGuardada] = useState(() => leerRepasoRelacionado(ownerId, origen))
  const [iaActiva, setIaActiva] = useState(false)
  const [modo, setModo] = useState<'lista' | 'repaso' | 'terminado'>('lista')
  const [guardado, setGuardado] = useState(true)
  const [volviendo, setVolviendo] = useState(false)
  const volviendoRef = useRef(false)
  const [devolucion, setDevolucion] = useState<'original' | 'siguiente' | null>(null)
  const actual = useRef(nbme); actual.current = nbme
  const vivo = useRef(true)
  const titulo = useRef<HTMLHeadingElement>(null)
  const controles = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (controles.current) controles.current.inert = volviendo }, [volviendo])
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])
  useEffect(() => {
    let cancelado = false
    setCargando(true)
    if (!indice) { setCargando(false); return }
    cargarTodo(indice.modulos).then(lista => {
      if (!cancelado) { setConceptos(lista); setError(''); setCargando(false) }
    }).catch(() => {
      if (!cancelado) { setError('No se pudieron cargar los conceptos. Puedes volver a intentarlo o continuar el NBME.'); setCargando(false) }
    })
    return () => { cancelado = true }
  }, [indice])
  const recomendaciones = useMemo(() => recomendarConceptosNbme({ pregunta, catalogo: nbme.catalog,
    conceptos, limite: 12 }), [pregunta, nbme.catalog, conceptos])
  const seleccion = elegidos ?? recomendaciones.slice(0, 6).map(r => r.concepto.concept_id)
  const mapa = useMemo(() => new Map(conceptos.map(c => [c.concept_id, c])), [conceptos])
  const cola: Cola | null = guardada && !guardada.terminado && guardada.continuacion && guardada.ids.every(id => mapa.has(id))
    ? { titulo: 'Repaso de esta pregunta NBME', subtitulo: 'Al terminar vuelves a tu pregunta y a este bloque.',
      ruta: 'repaso', modulo: `nbme:${origen.sessionId}`, conceptos: alternarFormatos(guardada.ids.map(id => mapa.get(id)!), 'repaso'),
      sessionId: guardada.continuacion.sessionId } : null
  const vigente = () => {
    const n = actual.current
    return n.currentSession?.id === origen.sessionId && n.sessionView?.phase === 'feedback'
      && n.sessionView.current?.position === origen.position && n.currentQuestion?.id === origen.questionId
      && n.currentQuestion.revision === origen.revision && n.currentFeedback?.id === origen.attemptId
      && !n.currentFeedback.conflict
  }
  const persistir = useCallback((valor: RepasoRelacionadoGuardado) => {
    setGuardada(valor); setGuardado(guardarRepasoRelacionado(valor))
  }, [])
  const guardarContinuacion = useCallback((continuacion: Reanudable | null) => {
    setGuardada(previa => {
      if (!previa) return previa
      const valor = { ...previa, continuacion, terminado: continuacion === null }
      setGuardado(guardarRepasoRelacionado(valor))
      return valor
    })
  }, [])
  const volver = async (destino: 'original' | 'siguiente') => {
    if (volviendoRef.current) return
    if (!vigente()) { setError('El bloque cambió en otra ventana. Tus respuestas están guardadas; comprueba la pregunta actual.'); return }
    volviendoRef.current = true; setVolviendo(true)
    const reanudada = await actual.current.resumeSession(origen.sessionId)
    if (!vivo.current) return
    if (!reanudada) {
      volviendoRef.current = false; setVolviendo(false)
      setError('No se pudo retomar el bloque original. Conservas el repaso; vuelve a intentarlo.'); return
    }
    // La promesa puede resolver antes del commit que vuelve a publicar la
    // pregunta histórica en el contexto. La devolución se completa en el efecto.
    setDevolucion(destino)
  }
  useEffect(() => {
    if (!devolucion || !volviendoRef.current || nbme.busy || nbme.questionLoading) return
    const destino = devolucion
    setDevolucion(null); volviendoRef.current = false; setVolviendo(false)
    if (!vigente()) {
      setError('No se pudo retomar el bloque original. Conservas el repaso; vuelve a intentarlo.'); return
    }
    setModo('lista'); setIaActiva(false); onActividad(false)
    if (destino === 'siguiente') onSiguiente()
    else requestAnimationFrame(() => { if (vivo.current && vigente()) document.getElementById('nbme-feedback-title')?.focus() })
    // Espera al contexto comprometido, conservando sesión, revisión e intento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devolucion, nbme.busy, nbme.questionLoading, nbme.currentSession?.id, nbme.sessionView?.phase,
    nbme.sessionView?.current?.position, nbme.currentQuestion?.id, nbme.currentQuestion?.revision, nbme.currentFeedback?.id])
  const actividadIA = (activa: boolean) => {
    if (volviendoRef.current || !vigente()) return
    setIaActiva(activa)
    if (activa) { onActividad(true); actual.current.pauseSession() }
    else void volver('original')
  }
  const abrirRepaso = (retomar: boolean) => {
    if (volviendoRef.current || !vigente()) return
    setError('')
    if (retomar) {
      if (!cola) { setError('Faltan conceptos para retomar la cola exacta. El NBME y tus intentos se conservan.'); return }
    } else {
      const ids = seleccion.filter(id => mapa.has(id))
      if (!ids.length) return
      const sessionId = iniciarSesion(`nbme:${origen.sessionId}`, 'repaso')
      if (!sessionId) { setError('El guardado del progreso todavía se está preparando. Vuelve a intentarlo.'); return }
      const valor: RepasoRelacionadoGuardado = { version: 1, ownerId, origen, ids, terminado: false,
        continuacion: { versionFormato: VERSION_FORMATO_ACTUAL, modulo: `nbme:${origen.sessionId}`, sesion: 'repaso', indice: 0, ts: Date.now(), sessionId,
          conceptIds: ids, titulo: 'Repaso de esta pregunta NBME', subtitulo: 'Al terminar vuelves a tu pregunta y a este bloque.' } }
      persistir(valor)
    }
    actual.current.pauseSession(); setModo('repaso'); onActividad(true)
  }
  const terminarRepaso = () => { setModo('terminado') }
  useEffect(() => { if (modo === 'terminado') titulo.current?.focus() }, [modo])

  return <section className={`recuperacion-flujo pila${modo !== 'lista' ? ' activa' : ''}`} aria-label="Repaso relacionado con esta pregunta" aria-busy={volviendo}>
    {volviendo && <p role="status">Retomando el bloque original…</p>}
    <div ref={controles} className="pila">
    {error && <p role="alert" className="nbme-error">{error}</p>}
    {!guardado && <p role="alert" className="mini">La continuación del repaso no se pudo guardar en este dispositivo. Tus respuestas se registran; mantén la página abierta para terminar.</p>}
    {modo === 'repaso' && cola ? <Reproductor key={cola.sessionId} cola={cola} indiceInicial={guardada?.continuacion?.indice ?? 0}
      continuacion={{ valor: guardada?.continuacion ?? null, guardar: guardarContinuacion }} unaVuelta apoyoPrevio
      etiquetaSalida="Volver a la pregunta original" onSalir={() => void volver('original')} onTramoCompleto={terminarRepaso} />
      : modo === 'terminado' ? <div className="tarjeta pila">
        <h2 ref={titulo} tabIndex={-1}>Repaso terminado</h2><p>Los conceptos presentados cuentan como vistos. Tus respuestas se guardaron en el progreso de Melman.</p>
        <div className="recuperacion-acciones"><button className="btn principal" disabled={volviendo} onClick={() => void volver('original')}>Volver a la pregunta original</button>
          <button className="btn" disabled={volviendo} onClick={() => void volver('siguiente')}>Ir a la siguiente pregunta</button></div>
      </div> : <>
        <div className="pila" hidden={iaActiva} style={iaActiva ? { display: 'none' } : undefined}>
        <div><h3>Conceptos para recuperar esta pregunta</h3><p className="mini">Elige el fundamento y sus conceptos relacionados. Al terminar vuelves a este bloque NBME.</p></div>
        {cargando ? <p role="status">Buscando conceptos relacionados…</p> : recomendaciones.length ? <>
          <fieldset className="recuperacion-conceptos"><legend>Conceptos de Melman</legend>
            {(expandido ? recomendaciones : recomendaciones.slice(0, 6)).map(r => <label key={r.concepto.concept_id}>
              <input type="checkbox" checked={seleccion.includes(r.concepto.concept_id)} onChange={e => setElegidos(e.target.checked
                ? [...seleccion, r.concepto.concept_id] : seleccion.filter(id => id !== r.concepto.concept_id))} />
              <span><span lang="en">{r.concepto.objetivo}</span><small>{r.relacion === 'tested' ? 'Objetivo evaluado' : r.relacion === 'foundation' ? 'Fundamento' : 'Concepto relacionado'}{r.sugerido ? ' · relación sugerida' : ''}</small></span>
            </label>)}
          </fieldset>
          {recomendaciones.length > 6 && <button className="btn fantasma" onClick={() => setExpandido(!expandido)}>{expandido ? 'Ver menos conceptos' : `Ver más conceptos (${recomendaciones.length - 6})`}</button>}
          <button className="btn" disabled={!seleccion.length || volviendo} onClick={() => abrirRepaso(false)}>Practicar conceptos seleccionados</button>
        </> : <p className="mini">No hay conceptos suficientemente relacionados en el material disponible. Puedes usar el fundamento de esta pregunta y continuar el bloque.</p>}
        {guardada && !guardada.terminado && <button className="btn" disabled={cargando || volviendo} onClick={() => abrirRepaso(true)}>Retomar repaso guardado</button>}
        </div>
        {!intento.correct && <RecuperacionNbme ownerId={ownerId}
          origen={{ qid: pregunta.id, revision: pregunta.revision, optionId: intento.optionId, attemptId: intento.id }}
          onActividad={actividadIA} onTerminar={destino => void volver(destino)} />}
      </>}
    </div>
  </section>
}
