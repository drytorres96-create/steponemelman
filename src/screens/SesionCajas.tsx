import { useCallback, useEffect, useRef, useState } from 'react'
import { cargarConceptos } from '../data/corpus'
import { useApp } from '../store/estado'
import { crearUUID } from '../store/model'
import { useNbme } from '../nbme/NbmeProvider'
import { deriveNbmeSession, isNbmeSessionArchived } from '../nbme/model'
import type { NbmeState } from '../nbme/types'
import { NbmePlayer } from '../nbme/NbmePlayer'
import { MAX_REINSERCIONES, reinsertarFallo, TITULO_NBME_CAJAS, type ItemCaja } from '../lib/cajas'
import { usePielEstudio } from '../components/PielEstudio'
import { PausaDeBloque } from '../components/PausaDeBloque'
import type { Concepto } from '../schema/concept'
import type { Intento } from '../srs/tipos'
import { Reproductor, type Cola } from './Reproductor'
import { necesitaReintento } from './sesion'
import { prepararPracticaConcepto } from '../lib/practica-aplicacion'
import { aplicarVariante } from '../lib/variantes'

const SUBTITULO = 'Consolidación y mantenimiento de lo que ya estudiaste.'
/**
 * Título fijo de las sesiones NBME de las cajas. Una pregunta fallada deja su sesión
 * con el reintento pendiente; cuando vuelve a tocar, otro día, se retoma esa misma
 * en lugar de abrir otra, así que no se acumulan sesiones a medias.
 */
export { TITULO_NBME_CAJAS } from '../lib/cajas'

/** La sesión NBME de las cajas que espera justo el reintento de esta pregunta. */
function sesionPendiente(state: NbmeState, id: string, revision: string): string | null {
  for (const s of Object.values(state.sessions)) {
    if (isNbmeSessionArchived(state, s.id) || s.title !== TITULO_NBME_CAJAS || s.initial.length !== 1 || s.initial[0].id !== id || s.initial[0].revision !== revision) continue
    const vista = deriveNbmeSession(state, s.id)
    if (vista?.phase === 'question') return s.id
  }
  return null
}

interface PasoCaja { item: ItemCaja; vez: number }

/**
 * El recorrido de las cajas de hoy. No reescribe ningún reproductor: monta el de
 * conceptos o el de preguntas para cada paso y decide qué viene después. Un fallo
 * vuelve cuatro pasos más adelante, como mucho tres veces; después se deja para
 * otro día. Cada pregunta tiene su propia sesión NBME, así que su reinserción es
 * exactamente el reintento que esa sesión ya trae. Cada paso de concepto registra
 * con su propio identificador de sesión: retomarlo desde otra pantalla encuentra
 * la respuesta ya dada en lugar de pedirla dos veces.
 *
 * Lo estudiado vive en `study_state` y `nbme_state`: salir a mitad no pierde nada,
 * y al volver las cajas hechas ya no se ofrecen.
 *
 * Toda la sesión va con la piel de estudio, también los pasos de pregunta: la
 * pantalla no cambia de color entre un concepto y una pregunta. El progreso cuenta
 * cajas sobre las de hoy, así que un fallo que vuelve no lo hace retroceder, y cada
 * veinte pasos seguidos se sugiere un respiro.
 */
export function SesionCajas({ items, titulo, onSalir }: { items: ItemCaja[]; titulo: string; onSalir: () => void }) {
  const { indice, estado, guardarReanudable } = useApp()
  usePielEstudio()
  const nbme = useNbme()
  const nbmeRef = useRef(nbme)
  nbmeRef.current = nbme
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  const [sesionId] = useState(crearUUID)
  const [pasos, setPasos] = useState<PasoCaja[]>(() => items.map(item => ({ item, vez: 0 })))
  const [cursor, setCursor] = useState(0)
  const [conceptos, setConceptos] = useState<Map<string, Concepto> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorPaso, setErrorPaso] = useState<string | null>(null)
  const [preparado, setPreparado] = useState<number | null>(null)
  const [sesionesPregunta, setSesionesPregunta] = useState<Record<string, string>>({})
  const [fallos, setFallos] = useState(0)
  // Omitir un paso no acredita un repaso ni cambia el progreso guardado.
  const [omitidos, setOmitidos] = useState<Set<number>>(() => new Set())
  const pasosRef = useRef(pasos)
  pasosRef.current = pasos
  const esperando = useRef<{ paso: number; pregunta: string } | null>(null)
  const reanudando = useRef(-1)
  const cerrado = useRef(-1)

  const paso = pasos[cursor] ?? null
  const modulo = `hoy:cajas:${cursor}`
  const sesionPaso = `${sesionId}:${cursor}`

  /** Cierra el paso actual una sola vez y, si falló, lo reinserta. */
  const avanzar = useCallback((fallo: boolean, omitido = false) => {
    if (cerrado.current === cursor) return
    cerrado.current = cursor
    if (omitido) setOmitidos(previos => new Set([...previos, cursor]))
    if (fallo) setFallos(n => n + 1)
    const siguientes = fallo ? reinsertarFallo(pasosRef.current, cursor) : pasosRef.current
    setPasos(siguientes)
    setCursor(cursor + 1)
    setPreparado(null)
    setErrorPaso(null)
  }, [cursor])

  useEffect(() => {
    let vivo = true
    const ids = [...new Set(items.filter(i => i.tipo === 'concepto').map(i => i.id))]
    if (!ids.length || !indice) { setConceptos(new Map()); return }
    cargarConceptos(ids, indice.modulos).then(mapa => {
      if (!vivo) return
      const actual = estadoRef.current
      const guardada = actual.reanudable
      const ahora = Date.now()
      setConceptos(new Map([...mapa].map(([id, c]) => {
        // Una continuación existente tiene prioridad, incluso si conservó la base.
        const restaurando = guardada?.sessionId === sesionPaso && guardada.modulo === modulo
          && guardada.conceptIds?.length === 1 && guardada.conceptIds[0] === id
        return [id, restaurando ? aplicarVariante(c, guardada.variantes?.[0])
          : prepararPracticaConcepto(c, actual.progreso[id], actual.criterios, { ruta: 'repaso', ahora })]
      })))
    })
      .catch(() => { if (vivo) setError('No se pudieron cargar los conceptos de tus cajas. Comprueba la conexión y vuelve a intentarlo.') })
    return () => { vivo = false }
    // Las cajas se preparan una vez al entrar: estudiar no cambia qué hay que cargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Paso de concepto: el reproductor exige un punto de continuación que describa exactamente su cola.
  useEffect(() => {
    if (!paso || paso.item.tipo !== 'concepto' || !conceptos || preparado === cursor) return
    const c = conceptos.get(paso.item.id)
    if (!c) { setPreparado(cursor); return }
    const r = estado.reanudable
    if (r && r.sessionId === sesionPaso && r.modulo === modulo && r.indice === 0 && r.conceptIds?.join('|') === c.concept_id) {
      setPreparado(cursor)
      return
    }
    guardarReanudable({ versionFormato: 3, modulo, sesion: 'repaso', indice: 0, ts: Date.now(), sessionId: sesionPaso,
      conceptIds: [c.concept_id], variantes: [c.variante_id ?? null], titulo, subtitulo: SUBTITULO,
      cantidadInicial: 1, revisionInicialHecha: false, msVisibles: 0 })
  }, [paso, cursor, conceptos, preparado, estado.reanudable, guardarReanudable, sesionPaso, modulo, titulo])

  // Paso de pregunta: la primera vez abre su sesión; una reinserción retoma la misma, que ya trae el reintento.
  // Una pregunta se prepara una sola vez al llegar a su paso.
  useEffect(() => {
    if (!paso || paso.item.tipo !== 'pregunta' || preparado === cursor || errorPaso || nbme.loading || nbme.busy) return
    const pregunta = paso.item.id
    const abierta = sesionesPregunta[pregunta]
    if (abierta && nbme.state.sessions[abierta] && !isNbmeSessionArchived(nbme.state, abierta)) {
      // Si otro dispositivo ya la corrigió, no queda reintento que hacer.
      if (deriveNbmeSession(nbme.state, abierta)?.phase === 'complete') { avanzar(false); return }
      const guardada = nbme.state.sessions[abierta]
      if (nbme.state.activeSessionId === abierta && !guardada.paused) { setPreparado(cursor); return }
      if (reanudando.current === cursor) return
      reanudando.current = cursor
      void nbmeRef.current.resumeSession(abierta).then(ok => {
        if (!ok) setErrorPaso(nbmeRef.current.error ?? 'No se pudo retomar esta pregunta.')
      })
      return
    }
    if (esperando.current?.paso === cursor) return
    const meta = nbme.catalog?.questions.find(q => q.id === pregunta && q.status === 'ready')
    if (!meta) { setPreparado(cursor); return }
    // Si un día anterior quedó su reintento pendiente, se retoma esa sesión: su siguiente paso es esta pregunta.
    const pendiente = sesionPendiente(nbme.state, meta.id, meta.revision)
    if (pendiente) { setSesionesPregunta(mapa => ({ ...mapa, [pregunta]: pendiente })); return }
    esperando.current = { paso: cursor, pregunta }
    // Una caja tras otra: el catálogo que se trajo hace un momento vale, no se descarga entero en cada pregunta.
    void nbmeRef.current.startSession([{ id: meta.id, revision: meta.revision }],
      { title: TITULO_NBME_CAJAS, budgetMinutes: null, reuseRecentCatalog: true }).then(ok => {
      if (ok) return
      esperando.current = null
      setErrorPaso(nbmeRef.current.error ?? 'No se pudo abrir esta pregunta.')
    })
  }, [paso, cursor, preparado, errorPaso, nbme.loading, nbme.busy, nbme.state, nbme.catalog, sesionesPregunta, avanzar])

  // Cada paso empieza arriba: la explicación larga del anterior no deja la siguiente pregunta fuera de la vista.
  useEffect(() => { document.scrollingElement?.scrollTo?.({ top: 0 }) }, [cursor])

  // El identificador de la sesión NBME sólo se conoce cuando el proveedor la activa.
  useEffect(() => {
    const activa = nbme.state.activeSessionId
    const espera = esperando.current
    if (!espera || !activa || espera.paso !== cursor) return
    const sesion = nbme.state.sessions[activa]
    if (!sesion || sesion.initial.length !== 1 || sesion.initial[0].id !== espera.pregunta) return
    esperando.current = null
    setSesionesPregunta(mapa => ({ ...mapa, [espera.pregunta]: activa }))
    setPreparado(cursor)
  }, [nbme.state.activeSessionId, nbme.state.sessions, cursor])

  /** El último resultado resuelto de este paso decide; una respuesta por revisar no es un fallo. */
  const conceptoTerminado = () => {
    if (!paso) return
    const ultimo = (estadoRef.current.progreso[paso.item.id]?.intentos ?? [])
      .filter(t => t.session_id === sesionPaso && t.resultado !== 'revision')
      .reduce<Intento | undefined>((u, t) => !u || t.ts >= u.ts ? t : u, undefined)
    avanzar(!!ultimo && necesitaReintento(ultimo.resultado))
  }

  const preguntaTerminada = () => {
    const intento = nbmeRef.current.sessionView?.attempt
    nbmeRef.current.nextQuestion()
    avanzar(!!intento && (!intento.correct || !!intento.conflict))
  }

  if (error) return <div className="tarjeta pila" role="alert"><h2>No se pudieron abrir las cajas</h2><p>{error}</p>
    <div><button className="btn principal" onClick={onSalir}>Volver a Hoy</button></div></div>

  // Cuenta cajas respondidas una sola vez; las correcciones y omisiones no llenan la barra.
  const recorridas = pasos.slice(0, cursor).filter(p => p.vez === 0).length
  const hechas = pasos.slice(0, cursor).filter((p, posicion) => p.vez === 0 && !omitidos.has(posicion)).length
  const cajasSinRepasar = new Set([...omitidos].map(posicion => {
    const item = pasos[posicion].item
    return `${item.tipo}:${item.id}`
  })).size

  if (cursor >= pasos.length) return <section className="tarjeta pila hoy-completion" aria-labelledby="cajas-fin">
    <div><span className={`etq${omitidos.size ? '' : ' verde'}`}>{omitidos.size ? 'Recorrido terminado' : 'Cajas hechas'}</span><h2 id="cajas-fin" style={{ marginTop: 10 }}>{titulo}</h2></div>
    <p>{hechas === 1 ? 'Una caja repasada' : `${hechas} cajas repasadas`}{fallos
      ? omitidos.size
        ? `. ${fallos === 1 ? 'Hubo una respuesta con fallo' : `Hubo ${fallos} respuestas con fallo`}. Lo fallado vuelve a la caja 1.`
        : `. ${fallos === 1 ? 'Un fallo volvió' : `${fallos} fallos volvieron`} a la caja 1 y ${fallos === 1 ? 'se repitió' : 'se repitieron'} más adelante.`
      : omitidos.size ? '.' : ', todas a la primera.'}</p>
    {cajasSinRepasar > 0 && <p>{cajasSinRepasar === 1 ? 'Una caja quedó con un repaso pendiente para otro día.'
      : `${cajasSinRepasar} cajas quedaron con un repaso pendiente para otro día.`}</p>}
    <p className="sutil">Tus respuestas quedan guardadas. El siguiente repaso se programa según la evidencia de cada concepto o pregunta.</p>
    <div><button className="btn principal" onClick={onSalir}>Volver a Hoy</button></div>
  </section>

  if (!paso || !conceptos) return <div className="vacio" role="status">Preparando tus cajas…</div>

  const encabezado = <div className="sesion-mixta-guia session-stepper">
    <p className="mini">{titulo}</p>
    {paso.vez ? <p className="session-step-label">Corrección · repaso de un fallo</p>
      : <p className="session-step-label">Bloque {Math.floor(recorridas / 5) + 1} de {Math.ceil(items.length / 5)} · Paso {recorridas % 5 + 1} de {Math.min(5, items.length - Math.floor(recorridas / 5) * 5)}</p>}
    <p className="sutil">{paso.vez
      ? `Repaso de un fallo · caja 1 · ${hechas} de ${items.length} hechas`
      : `${recorridas + 1} de ${items.length} · ${paso.item.mantenimiento ? 'mantenimiento' : `caja ${paso.item.caja}`}`}</p>
    {cajasSinRepasar > 0 && <p className="mini">{hechas} de {items.length} cajas respondidas · {cajasSinRepasar} con un repaso pendiente</p>}
    <progress className="sesion-mixta-progreso" aria-label="Cajas hechas" value={hechas} max={items.length} />
    {recorridas > 0 && recorridas % 5 === 0 && paso.vez === 0 && <PausaDeBloque onParar={onSalir} />}
  </div>
  const avisoFallo = paso.vez < MAX_REINSERCIONES
    ? 'Vuelve a la caja 1 y aparecerá otra vez dentro de unos pasos.'
    : 'Vuelve a la caja 1. Por hoy ya está: lo verás otro día.'
  const seguir = <button className="btn principal" onClick={() => avanzar(false, true)}>Seguir con el resto</button>
  const volver = <button className="btn fantasma" onClick={onSalir}>Volver a Hoy</button>
  // Entre una caja y la siguiente la cabecera no se mueve: sólo cambia lo de debajo.
  const preparando = (texto: string) => <div className="pila">{encabezado}<div className="vacio" role="status">{texto}</div></div>

  if (paso.item.tipo === 'concepto') {
    const c = conceptos.get(paso.item.id)
    if (!c) return <div className="pila">{encabezado}<div className="tarjeta pila" role="alert"><h2>Este concepto no está disponible</h2>
      <p>No está en el material publicado ahora mismo. Puedes seguir con el resto de las cajas.</p>
      <div className="fila">{seguir}{volver}</div></div></div>
    if (preparado !== cursor) return preparando('Preparando el concepto…')
    const cola: Cola = { titulo, subtitulo: SUBTITULO, ruta: 'repaso', modulo, conceptos: [c], sessionId: sesionPaso }
    return <div className="pila">{encabezado}
      <Reproductor key={sesionPaso} cola={cola} onSalir={onSalir} onTramoCompleto={conceptoTerminado}
        modoCaja={{ reintento: paso.vez > 0, avisoFallo }} />
    </div>
  }

  if (errorPaso) return <div className="pila">{encabezado}<div className="tarjeta pila" role="alert"><h2>Esta pregunta no se pudo abrir</h2>
    <p>{errorPaso}</p><div className="fila">{seguir}{volver}</div></div></div>
  const disponible = !!sesionesPregunta[paso.item.id] || !!nbme.catalog?.questions.some(q => q.id === paso.item.id && q.status === 'ready')
  if (!disponible) return <div className="pila">{encabezado}<div className="tarjeta pila" role="alert"><h2>Esta pregunta no está disponible</h2>
    <p>El banco la retiró o está en revisión. Puedes seguir con el resto de las cajas.</p>
    <div className="fila">{seguir}{volver}</div></div></div>
  if (preparado !== cursor) return preparando('Preparando la pregunta…')
  return <div className="pila">{encabezado}
    <NbmePlayer recuperarErrores modoPaso etiquetaSalida="Volver a Hoy" avisoFallo={avisoFallo} onSalir={onSalir} onPasoCompleto={preguntaTerminada} />
  </div>
}
