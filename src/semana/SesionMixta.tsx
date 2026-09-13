import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cargarConceptos } from '../data/corpus'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { deriveNbmeSession } from '../nbme/model'
import { NbmePlayer } from '../nbme/NbmePlayer'
import { Reproductor, type Cola } from '../screens/Reproductor'
import { resumirIntentos } from '../screens/sesion'
import type { Concepto } from '../schema/concept'
import { guardarAvance } from './api'
import { pasoActual, separarGuion, tramoDeConceptos } from './guion'
import type { SesionSemanal } from './tipos'

/**
 * Orquestador del recorrido mixto. No reescribe ninguno de los dos reproductores:
 * monta uno u otro según el paso del guion y mueve el cursor. El progreso real
 * sigue viviendo en `study_state` y `nbme_state`; `weekly_sessions` sólo guarda
 * por dónde va, así que un fallo al guardar la posición no borra nada estudiado.
 */
export function SesionMixta({ sesion, onSalir, efimera = false }:
  { sesion: SesionSemanal; onSalir: () => void; efimera?: boolean }) {
  const { indice, estado, guardarReanudable } = useApp()
  const nbme = useNbme()
  const nbmeRef = useRef(nbme)
  nbmeRef.current = nbme

  const { conceptIds, preguntas } = useMemo(() => separarGuion(sesion.guion), [sesion.guion])
  const [cursor, setCursor] = useState(Math.min(sesion.cursor, sesion.guion.length))
  const [conceptos, setConceptos] = useState<Map<string, Concepto> | null>(null)
  const [nbmeId, setNbmeId] = useState<string | null>(sesion.nbmeSessionId)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tramoListo, setTramoListo] = useState<string | null>(null)
  const esperandoId = useRef(false)

  // Una sesión de recuperación se arma al vuelo y no tiene fila que actualizar:
  // lo estudiado se registra igual en `study_state` y `nbme_state`.
  const guardar = useCallback(async (avance: Parameters<typeof guardarAvance>[1]) => {
    if (efimera) return
    const resultado = await guardarAvance(sesion.id, avance)
    setAviso(resultado.ok ? null : resultado.aviso ?? null)
  }, [sesion.id, efimera])

  // Arranque: las dos colas se preparan una sola vez. Las preguntas se abren como una
  // única sesión NBME que se retoma en visitas posteriores en lugar de duplicarse.
  useEffect(() => {
    // Con el estado NBME a medio cargar no se sabe si la sesión guardada existe, y
    // arrancar ahí abriría un bloque duplicado sobre las mismas preguntas.
    if (nbme.loading) return
    let vivo = true
    setCargando(true)
    setError(null)
    void (async () => {
      try {
        const mapa = conceptIds.length && indice ? await cargarConceptos(conceptIds, indice.modulos) : new Map<string, Concepto>()
        if (!vivo) return
        setConceptos(mapa)
        if (preguntas.length > 20) throw new Error('demasiadas preguntas')
        if (preguntas.length) {
          const guardadaId = sesion.nbmeSessionId
          if (guardadaId && nbmeRef.current.state.sessions[guardadaId]) {
            await nbmeRef.current.resumeSession(guardadaId)
          } else {
            esperandoId.current = true
            const abierta = await nbmeRef.current.startSession(preguntas, { title: sesion.titulo, budgetMinutes: null })
            if (!abierta) esperandoId.current = false
          }
        }
      } catch (fallo) {
        if (vivo) setError(fallo instanceof Error && fallo.message === 'demasiadas preguntas'
          ? 'Esta sesión tiene más de veinte preguntas y no puede abrirse como un solo bloque.'
          : 'No se pudo preparar esta sesión. Comprueba la conexión y vuelve a intentarlo.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
    // La sesión se prepara al entrar en ella; el cursor no vuelve a arrancarla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.id, indice, nbme.loading])

  // El identificador de la sesión NBME sólo se conoce cuando el proveedor la activa.
  useEffect(() => {
    const activa = nbme.state.activeSessionId
    if (!esperandoId.current || !activa || activa === nbmeId) return
    esperandoId.current = false
    setNbmeId(activa)
    void guardar({ nbmeSessionId: activa, estado: 'en_curso' })
  }, [nbme.state.activeSessionId, nbmeId, guardar])

  const paso = pasoActual(sesion.guion, cursor)
  const tramo = useMemo(() => paso?.kind === 'concepto' ? tramoDeConceptos(sesion.guion, cursor) : null, [paso, sesion.guion, cursor])
  const conceptosTramo = useMemo(() => tramo && conceptos
    ? tramo.ids.map(id => conceptos.get(id)).filter((c): c is Concepto => Boolean(c))
    : [], [tramo, conceptos])
  const claveTramo = tramo ? `${sesion.id}:${tramo.inicio}` : null

  const avanzarA = useCallback((siguiente: number) => {
    const destino = Math.min(Math.max(siguiente, 0), sesion.guion.length)
    setCursor(destino)
    if (destino >= sesion.guion.length) void guardar({ cursor: destino, estado: 'completada', completadaEn: new Date().toISOString() })
    else void guardar({ cursor: destino, estado: 'en_curso' })
  }, [guardar, sesion.guion.length])

  // El reproductor de conceptos exige que el punto de continuación guardado describa
  // exactamente su cola. Se escribe antes de montarlo para que no vea una cola ajena.
  useEffect(() => {
    if (!claveTramo || !tramo || tramoListo === claveTramo || !conceptosTramo.length) return
    const ids = conceptosTramo.map(c => c.concept_id)
    const guardada = estado.reanudable
    if (guardada && guardada.sessionId === sesion.id && guardada.conceptIds?.join('|') === ids.join('|')) {
      setTramoListo(claveTramo)
      return
    }
    guardarReanudable({
      versionFormato: 2, modulo: `semana:${sesion.id}`, sesion: 'repaso',
      indice: Math.min(tramo.desde, ids.length), ts: Date.now(), sessionId: sesion.id, conceptIds: ids,
      titulo: sesion.titulo, subtitulo: sesion.subtitulo ?? 'Sesión de la semana',
      cantidadInicial: ids.length, revisionInicialHecha: false, msVisibles: 0,
    })
  }, [claveTramo, tramo, tramoListo, conceptosTramo, estado.reanudable, guardarReanudable, sesion])

  const cola: Cola | null = tramo && conceptosTramo.length ? {
    titulo: sesion.titulo, subtitulo: sesion.subtitulo ?? 'Sesión de la semana',
    ruta: 'repaso', modulo: `semana:${sesion.id}`, conceptos: conceptosTramo, sessionId: sesion.id,
  } : null

  // En un paso de pregunta la sesión NBME tiene que estar activa y sin pausar.
  useEffect(() => {
    if (paso?.kind !== 'pregunta' || !nbmeId || nbme.busy || nbme.loading) return
    const guardada = nbme.state.sessions[nbmeId]
    if (!guardada) return
    if (nbme.state.activeSessionId !== nbmeId || guardada.paused) void nbmeRef.current.resumeSession(nbmeId)
  }, [paso?.kind, nbmeId, nbme.busy, nbme.loading, nbme.state])

  const vista = nbmeId ? deriveNbmeSession(nbme.state, nbmeId) : null
  const intentosSesion = Object.values(estado.progreso).flatMap(p => p.intentos).filter(t => t.session_id === sesion.id)
  const resumen = resumirIntentos(intentosSesion)
  const sinConflicto = vista ? vista.firstAnswered - vista.firstConflicts : 0

  const encabezado = <div className="sesion-mixta-guia">
    <p className="mini">{sesion.titulo}</p>
    <p className="sutil">Paso {Math.min(cursor + 1, sesion.guion.length)} de {sesion.guion.length} · {conceptIds.length} conceptos · {preguntas.length} preguntas</p>
    <progress className="sesion-mixta-progreso" aria-label="Avance de la sesión" value={cursor} max={sesion.guion.length} />
  </div>

  if (error) return <div className="tarjeta pila" role="alert"><h2>No se pudo abrir la sesión</h2><p>{error}</p>
    <button className="btn principal" onClick={onSalir}>Volver a mis sesiones</button></div>

  if (cursor >= sesion.guion.length) return <section className="tarjeta pila" aria-labelledby="sesion-mixta-fin">
    <div><span className="rotulo">Sesión terminada</span><h2 id="sesion-mixta-fin">{sesion.titulo}</h2></div>
    <p>{conceptIds.length} conceptos y {preguntas.length} preguntas en este recorrido.</p>
    <p>{resumen.independientes} de {resumen.vistos} respuestas de concepto resueltas sin ayuda.</p>
    {vista && <p>{vista.firstCorrect} de {sinConflicto} preguntas NBME acertadas en primera vuelta.</p>}
    {vista && vista.pendingErrors > 0 && <p className="sutil">{vista.pendingErrors} preguntas quedan pendientes de corregir; las encontrarás en Recuperación.</p>}
    {aviso && <p className="mini">{aviso}</p>}
    <button className="btn principal" style={{ alignSelf: 'flex-start' }} onClick={onSalir}>Volver a mis sesiones</button>
  </section>

  if (cargando || !paso) return <div className="vacio" role="status">Preparando tu sesión…</div>

  if (paso.kind === 'concepto') {
    if (!cola) return <div className="tarjeta pila" role="alert"><h2>Este tramo no está disponible</h2>
      <p>Los conceptos de este tramo no están en el corpus publicado ahora mismo. Puedes seguir con el resto de la sesión.</p>
      <div className="fila"><button className="btn principal" onClick={() => avanzarA((tramo?.inicio ?? cursor) + (tramo?.ids.length ?? 1))}>Continuar la sesión</button>
        <button className="btn fantasma" onClick={onSalir}>Volver a mis sesiones</button></div></div>
    if (tramoListo !== claveTramo) return <div className="vacio" role="status">Preparando el tramo de conceptos…</div>
    return <div className="pila">{encabezado}
      {aviso && <p className="mini">{aviso}</p>}
      <Reproductor key={claveTramo} cola={cola} indiceInicial={Math.min(tramo!.desde, conceptosTramo.length - 1)}
        onSalir={onSalir} onTramoCompleto={() => avanzarA(tramo!.inicio + tramo!.ids.length)} />
    </div>
  }

  return <div className="pila">{encabezado}
    {aviso && <p className="mini">{aviso}</p>}
    {!nbmeId && nbme.error && <div className="tarjeta" role="alert"><p>{nbme.error}</p></div>}
    <NbmePlayer modoPaso etiquetaSalida="Volver a mis sesiones" onSalir={onSalir}
      onPasoCompleto={() => { nbme.nextQuestion(); avanzarA(cursor + 1) }} />
  </div>
}
