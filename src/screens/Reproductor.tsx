import { useEffect, useMemo, useRef, useState } from 'react'
import type { Concepto } from '../schema/concept'
import { NOMBRE_INTERACCION } from '../schema/concept'
import { useApp } from '../store/estado'
import { Interaccion, EscrituraCorrectiva, type Resultado } from '../components/interacciones'
import { Modal, PanelFuente, EtiquetaEstado } from '../components/comunes'
import { NOMBRE_ERROR, type Intento, type TipoError } from '../srs/tipos'
import { resumenDominio } from '../srs/mastery'
import { crearUUID } from '../store/model'
import { EVALUADOR_VERSION } from '../lib/normalize'
import { esRespuestaBreve, prepararConcepto } from '../lib/formatos'
import { buscarIntentoPaso, conAyuda, diasParaCalificacion, identificarPregunta, necesitaReintento, resumirCorrecciones, resumirIntentos, RelojActividad, siguienteCola, versionPregunta } from './sesion'

export interface Cola { titulo: string; subtitulo: string; ruta: string; modulo: string; conceptos: Concepto[]; sessionId?: string }

function modoEnsenanza(c: Concepto): 'mecanismo' | 'comparacion' | 'explicacion' | 'directo' {
  const t = c.clasificacion.tipo_conocimiento
  if (t === 'Diagnóstico' || t === 'Hallazgo clínico' || t === 'Patrón visual') return 'directo'
  if (t === 'Mecanismo' || t === 'Secuencia' || t === 'Relación causa-efecto' || t === 'Algoritmo') return 'mecanismo'
  return t === 'Comparación' ? 'comparacion' : 'explicacion'
}

const formatoIntervalo = (dias: number | null) => dias === null ? 'Pendiente de revisión'
  : dias < 1 / 24 ? `${Math.max(1, Math.round(dias * 1440))} min` : dias < 1 ? `${Math.round(dias * 24)} h`
  : dias < 30 ? `${Math.round(dias)} d` : `${(dias / 30).toFixed(1)} meses`

const etiquetaResultado = (r: Intento['resultado']) => r === 'correcta' ? 'Correcto' : r === 'parcial' ? 'Parcialmente correcto'
  : r === 'ortografia' ? 'Concepto correcto, revisa la escritura' : r === 'revision' ? 'Respuesta por revisar' : 'Incorrecto'

export function Reproductor({ cola, onSalir, indiceInicial = 0 }:
  { cola: Cola; onSalir: () => void; indiceInicial?: number }) {
  const { registrarIntento, progresoDe, estado, guardarReanudable, iniciarSesion, cerrarSesion } = useApp()
  const guardada = cola.sessionId && estado.reanudable?.sessionId === cola.sessionId ? estado.reanudable : null
  const [orden, setOrden] = useState(cola.conceptos)
  const [cantidadInicial] = useState(guardada?.cantidadInicial ?? cola.conceptos.length)
  const [revisionInicialHecha, setRevisionInicialHecha] = useState(guardada?.revisionInicialHecha ?? false)
  const [i, setI] = useState(Math.min(Math.max(0, indiceInicial), orden.length))
  const [fase, setFase] = useState<'ensenanza' | 'tarea' | 'retro' | 'ortografia'>('tarea')
  const [pistas, setPistas] = useState(0)
  const [res, setRes] = useState<Resultado | null>(null)
  const [verFuente, setVerFuente] = useState(false)
  const [confianza, setConfianza] = useState<1 | 2 | 3 | null>(null)
  const [fuenteConsultada, setFuenteConsultada] = useState(false)
  const [explicacionPrevia, setExplicacionPrevia] = useState(false)
  const [sesionLista, setSesionLista] = useState(false)
  const sesionId = useRef<string | null>(cola.sessionId ?? null)
  const intentoActual = useRef<Intento | null>(null)
  const ultimaAccion = useRef<string | null>(null)
  const reloj = useRef(new RelojActividad())
  const vistaActual = useRef({ fase, verFuente })
  vistaActual.current = { fase, verFuente }
  const examen = cola.ruta === 'examen'
  const reintento = i >= cantidadInicial
  const examenSinAyuda = examen && !reintento
  const revisionExamen = examen && reintento && i < orden.length && !revisionInicialHecha
  const modoRegistro = examenSinAyuda ? 'examen' : cola.ruta === 'repaso' || reintento ? 'repaso' : 'aprendizaje'
  const original = orden[i]
  const preguntaId = original && sesionId.current ? identificarPregunta(sesionId.current, i, original.concept_id) : ''
  const c = useMemo(() => original ? prepararConcepto(original, { semilla: preguntaId, indice: i, ruta: cola.ruta, forzarReconocimiento: reintento }) : undefined,
    [original, preguntaId, i, cola.ruta, reintento])
  const datosSesion = () => {
    const intentos = Object.values(estado.progreso).flatMap(p => p.intentos).filter(t => t.session_id === sesionId.current)
    if (intentoActual.current) intentos.push(intentoActual.current)
    return resumirIntentos(intentos)
  }

  const guardarPaso = (cambios: Partial<{ pistas: number; fuenteConsultada: boolean; explicacionPrevia: boolean; confianza: 1 | 2 | 3 | null }> = {}) => {
    if (!sesionId.current) return
    guardarReanudable({
      modulo: cola.modulo, sesion: cola.ruta, indice: i, ts: Date.now(), sessionId: sesionId.current,
      conceptIds: orden.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      cantidadInicial, revisionInicialHecha,
      ...(c ? { paso: { indice: i, pistas, fuenteConsultada, explicacionPrevia, confianza,
        msActivo: reloj.current.leer(), ...cambios } } : {}),
    })
  }
  const guardarPasoActual = useRef(guardarPaso)
  guardarPasoActual.current = guardarPaso

  useEffect(() => {
    if (!sesionId.current) sesionId.current = iniciarSesion(cola.modulo, cola.ruta)
    setSesionLista(true)
    // El identificador vive durante todo el montaje, también con StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sesionLista || !sesionId.current) return
    ultimaAccion.current = null
    intentoActual.current = null
    setVerFuente(false)
    setRes(null)
    if (!c) { reloj.current.activar(false); guardarPasoActual.current(); return }
    const progreso = progresoDe(c.concept_id)
    const id = identificarPregunta(sesionId.current, i, c.concept_id)
    const anterior = buscarIntentoPaso(progreso, sesionId.current, id)
    const paso = estado.reanudable?.sessionId === sesionId.current && estado.reanudable.paso?.indice === i
      ? estado.reanudable.paso : null
    const mostrarEnsenanza = !examenSinAyuda && !reintento && cola.ruta !== 'repaso' && progreso.intentos.length === 0 && modoEnsenanza(c) !== 'directo'
    const previa = anterior?.explicacion_previa ?? paso?.explicacionPrevia ?? (reintento || mostrarEnsenanza)
    const fuente = anterior?.fuente_consultada ?? paso?.fuenteConsultada ?? false
    const ayudas = anterior?.pistas_usadas ?? paso?.pistas ?? 0
    const seguridad = anterior?.confianza_declarada ?? paso?.confianza ?? null
    setExplicacionPrevia(previa); setFuenteConsultada(fuente); setPistas(ayudas); setConfianza(seguridad)
    reloj.current.reiniciar(anterior ? 0 : paso?.msActivo ?? 0)
    if (anterior) {
      intentoActual.current = anterior
      setRes({ veredicto: anterior.resultado ?? 'revision', tipoError: anterior.tipo_error,
        recuperacionActiva: anterior.recuperacion_activa, respuestaDada: anterior.respuesta_dada ?? '' })
      setFase('retro')
    } else setFase(mostrarEnsenanza && !paso ? 'ensenanza' : 'tarea')
    guardarReanudable({ modulo: cola.modulo, sesion: cola.ruta, indice: i, ts: Date.now(), sessionId: sesionId.current,
      conceptIds: orden.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      cantidadInicial, revisionInicialHecha,
      paso: { indice: i, pistas: ayudas, fuenteConsultada: fuente, explicacionPrevia: previa,
        confianza: seguridad, msActivo: reloj.current.leer() } })
    // Se restaura un paso al entrar en él, nunca se reinicia mientras llega la sincronización.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionLista, i, c?.concept_id])

  useEffect(() => {
    const actualizar = (guardar = false) => {
      const visible = document.visibilityState === 'visible'
      reloj.current.activar(sesionLista && visible && !!c && !revisionExamen && vistaActual.current.fase === 'tarea' && !vistaActual.current.verFuente)
      if (guardar && !visible) guardarPasoActual.current()
    }
    actualizar()
    const alCambiarVisibilidad = () => actualizar(true)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => { reloj.current.activar(false); document.removeEventListener('visibilitychange', alCambiarVisibilidad) }
  }, [fase, verFuente, i, c, sesionLista, revisionExamen])

  const salir = () => {
    reloj.current.activar(false)
    if (sesionId.current) cerrarSesion(sesionId.current, datosSesion())
    guardarReanudable(null)
    onSalir()
  }
  const pausar = () => {
    reloj.current.activar(false)
    if (sesionId.current) cerrarSesion(sesionId.current, datosSesion())
    guardarPaso()
    onSalir()
  }
  const avanzarPaso = (reintentarRevision: boolean) => {
    if (ultimaAccion.current === preguntaId) return
    ultimaAccion.current = preguntaId
    reloj.current.activar(false)
    const siguiente = reintentarRevision && intentoActual.current?.resultado === 'revision'
      ? [...orden, orden[i]] : siguienteCola(orden, i, intentoActual.current?.resultado)
    guardarReanudable({ modulo: cola.modulo, sesion: cola.ruta, indice: i + 1, ts: Date.now(), sessionId: sesionId.current ?? undefined,
      conceptIds: siguiente.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      cantidadInicial, revisionInicialHecha })
    if (i + 1 >= siguiente.length && sesionId.current) cerrarSesion(sesionId.current, datosSesion())
    setOrden(siguiente)
    setI(Math.min(i + 1, siguiente.length))
  }
  const avanzar = () => avanzarPaso(false)

  const responder = (r: Resultado) => {
    if (!c || !sesionId.current || intentoActual.current || fase !== 'tarea') return
    const anterior = buscarIntentoPaso(progresoDe(c.concept_id), sesionId.current, preguntaId)
    if (anterior) {
      intentoActual.current = anterior
      setRes({ veredicto: anterior.resultado ?? 'revision', tipoError: anterior.tipo_error,
        recuperacionActiva: anterior.recuperacion_activa, respuestaDada: anterior.respuesta_dada ?? '' })
      setFase('retro'); return
    }
    reloj.current.activar(false)
    let tipo: TipoError = r.tipoError
    const ayuda = pistas > 0 || fuenteConsultada || explicacionPrevia
    if (r.veredicto === 'correcta' && ayuda) tipo = 'correcta_con_pistas'
    else if (r.veredicto === 'correcta' && confianza === 1) tipo = 'correcta_baja_confianza'
    else if (r.veredicto === 'incorrecta' && confianza === 3) tipo = 'incorrecta_exceso_confianza'
    const intento: Intento = {
      attempt_id: crearUUID(), session_id: sesionId.current,
      ts: Math.max(Date.now(), (progresoDe(c.concept_id).intentos.at(-1)?.ts ?? 0) + 1),
      calificacion: r.veredicto === 'correcta' ? 3 : r.veredicto === 'incorrecta' || r.veredicto === 'revision' ? 1 : 2,
      resultado: r.veredicto, interaccion: c.interaccion.recomendada,
      recuperacion_activa: r.recuperacionActiva, pistas_usadas: pistas, ms: reloj.current.leer(),
      tipo_error: tipo, confianza_declarada: confianza, respuesta_dada: r.respuestaDada,
      pregunta_id: preguntaId, pregunta_version: versionPregunta(c), evaluador_version: EVALUADOR_VERSION,
      fuente_consultada: fuenteConsultada, explicacion_previa: explicacionPrevia, modo: modoRegistro,
      tipo_evidencia: c.interaccion.recomendada === 'caso_clinico' ? 'aplicacion' : r.recuperacionActiva ? 'recuerdo' : 'discriminacion',
    }
    intentoActual.current = intento
    registrarIntento(c.concept_id, intento)
    setRes({ ...r, tipoError: tipo })
    setFase('retro')
  }

  const calificar = (calificacion: 1 | 2 | 3 | 4) => {
    const intento = intentoActual.current
    if (!c || !intento || ultimaAccion.current === preguntaId || intento.resultado === 'revision') return
    const actualizado = { ...intento, calificacion,
      calificacion_actualizada_en: Math.max(Date.now(), (intento.calificacion_actualizada_en ?? intento.ts) + 1) }
    intentoActual.current = actualizado
    registrarIntento(c.concept_id, actualizado)
    if (res?.tipoError === 'error_ortografico' && c.escritura_correctiva.elegible && c.escritura_correctiva.termino) {
      setFase('ortografia'); return
    }
    avanzar()
  }

  const revisiones = (limite = orden.length) => <div className="pila"><h3>Revisar mis respuestas</h3>
    {orden.slice(0, limite).map((original, posicion) => {
      const id = identificarPregunta(sesionId.current!, posicion, original.concept_id)
      const concepto = prepararConcepto(original, { semilla: id, indice: posicion, ruta: cola.ruta,
        forzarReconocimiento: posicion >= cantidadInicial })
      const t = buscarIntentoPaso(progresoDe(concepto.concept_id), sesionId.current!, id)
      if (!t) return null
      return <details className="tarjeta" key={`${posicion}:${concepto.concept_id}`}>
        <summary>{posicion + 1}. {etiquetaResultado(t.resultado)}{conAyuda(t) ? ' · Con ayuda' : ''}{posicion >= cantidadInicial ? ' · Corrección' : ''} · {concepto.objetivo}</summary>
        {t.pregunta_version && t.pregunta_version !== versionPregunta(concepto) && <p className="mini">El contenido cambió desde tu respuesta. Se muestra la versión actual.</p>}
        <p style={{ marginTop: 12 }}>{concepto.evaluacion.pregunta}</p>
        <p>Tu respuesta: <b>{t.respuesta_dada || 'No registrada en esta versión anterior'}</b></p>
        <p>Respuesta de referencia: <b>{concepto.respuesta_canonica}</b></p><p>{concepto.explicacion}</p>
        {concepto.evaluacion.opciones?.filter(o => !o.correcta && o.por_que).map(o => <p className="mini" key={o.texto}><b>{o.texto}:</b> {o.por_que}</p>)}
      </details>
    })}
  </div>
  const correcciones = resumirCorrecciones(orden.map((concepto, posicion) => ({ conceptId: concepto.concept_id,
    intento: sesionId.current ? buscarIntentoPaso(progresoDe(concepto.concept_id), sesionId.current,
      identificarPregunta(sesionId.current, posicion, concepto.concept_id)) : undefined })), cantidadInicial)

  const comenzarCorrecciones = () => {
    setRevisionInicialHecha(true)
    if (sesionId.current) guardarReanudable({ modulo: cola.modulo, sesion: cola.ruta, indice: i, ts: Date.now(),
      sessionId: sesionId.current, conceptIds: orden.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      cantidadInicial, revisionInicialHecha: true })
  }

  if (!sesionLista) return <p role="status">Preparando tu sesión…</p>
  if (revisionExamen) return <div className="reproductor pila">
    <div className="tarjeta pila" role="status">
      <span className="rotulo">Primera vuelta terminada</span><h2>{correcciones.aciertosIniciales} de {cantidadInicial} correctas sin ayuda</h2>
      <p>Ahora practicarás {orden.length - i} errores. Puedes revisar tus respuestas antes de continuar.</p>
      <p className="mini">Las correcciones se registran aparte de la primera vuelta y no acreditan dominio independiente. Este ejercicio no estima tu probabilidad de aprobar Step 1.</p>
      <div className="fila"><button className="btn principal" onClick={comenzarCorrecciones}>Practicar los errores</button>
        <button className="btn fantasma" onClick={pausar}>Necesito una pausa</button></div>
    </div>{revisiones(cantidadInicial)}
  </div>
  if (!c) {
    const resumen = datosSesion()
    return <div className="reproductor pila">
      <div className="tarjeta pila" role="status">
        <span className="rotulo">Sesión terminada</span><h2>Has completado {resumen.vistos} preguntas</h2>
        <p>{correcciones.conceptos} conceptos · {correcciones.aciertosIniciales} aciertos en la primera vuelta.</p>
        {correcciones.reintentos > 0 && <p>{correcciones.erroresIniciales > 0
          ? `${correcciones.recuperados} de ${correcciones.erroresIniciales} errores iniciales corregidos en ${correcciones.reintentos} reintentos.`
          : `${correcciones.reintentos} reintentos para comprobar respuestas pendientes.`}</p>}
        <p>{resumen.correctos} respuestas correctas en total, de ellas {resumen.independientes} sin ayuda. Usaste apoyo en {resumen.ayudas} preguntas.</p>
        {resumen.porRevisar > 0 && <p>{resumen.porRevisar} respuestas por revisar. No se contaron como aciertos ni fallos.</p>}
        <p className="sutil">Los errores evaluados se han vuelto a practicar en esta sesión. Acertarlos después de ver la explicación cuenta como corrección; el dominio se confirma en repasos posteriores.</p>
        {examen && <p className="mini">Práctica sin ayuda con preguntas de tu corpus. Este resultado no estima tu probabilidad de aprobar Step 1.</p>}
        <button className="btn principal" onClick={salir}>Volver a mi plan</button>
      </div>
      {revisiones()}
    </div>
  }
  const p = progresoDe(c.concept_id)
  const dominio = resumenDominio(p, estado.criterios)
  const modo = modoEnsenanza(c)
  const alternativa = res?.veredicto === 'revision' && original ? prepararConcepto(original, {
    semilla: identificarPregunta(sesionId.current!, orden.length, original.concept_id), indice: orden.length,
    ruta: cola.ruta, forzarReconocimiento: true,
  }) : null
  const puedeRevisarConOpciones = alternativa && ['opcion_multiple', 'caso_clinico', 'verdadero_falso'].includes(alternativa.interaccion.recomendada)
  const puedeResponderDeNuevo = puedeRevisarConOpciones || (alternativa && esRespuestaBreve(alternativa.respuesta_canonica))

  return <div className="reproductor pila">
    <div className="fila" style={{ justifyContent: 'space-between' }}>
      <div className="fila" style={{ gap: 8 }}>
        <span className="etq">{c.clasificacion.disciplina_primaria}</span><span className="etq">{c.clasificacion.sistema_primario}</span>
        <span className="etq violeta">{NOMBRE_INTERACCION[c.interaccion.recomendada]}</span>
        {!examenSinAyuda && <EtiquetaEstado estado={p.estado} />}
      </div>
      <button className="btn pequeno fantasma" onClick={pausar}>Necesito una pausa</button>
    </div>
    <div className="fila" style={{ justifyContent: 'space-between' }}><span className="mini">{reintento
      ? `Corrección · ${orden.length - i} pendientes, incluida esta`
      : `Primera vuelta · Pregunta ${i + 1} de ${cantidadInicial}${!examenSinAyuda && orden.length > cantidadInicial ? ` · ${orden.length - cantidadInicial} errores para corregir` : ''}`}</span>
      <span className="mini">{examenSinAyuda ? 'Sin ayuda · Revisión al terminar la primera vuelta' : 'Puedes pausar y retomar'}</span></div>
    <div className="avance" aria-label={`Pregunta ${i + 1} de ${examenSinAyuda ? cantidadInicial : orden.length}`}>
      {orden.slice(0, examenSinAyuda ? cantidadInicial : orden.length).map((_, k) => <i key={k} className={k < i ? 'hecho' : k === i ? 'actual' : ''} />)}
    </div>
    <div className="tarea">
      {reintento && <p className="mini">Volvemos a un concepto de esta sesión. Este acierto contará como corrección con explicación previa.</p>}
      {fase === 'ensenanza' && !examenSinAyuda && <div>
        <div className="rotulo" style={{ marginBottom: 10 }}>{modo === 'mecanismo' ? 'Mecanismo paso a paso' : modo === 'comparacion' ? 'Comparación' : 'Antes de recuperar'}</div>
        <p style={{ fontSize: '1.05rem', lineHeight: 1.55 }}>{c.afirmacion}</p><p className="sutil">{c.explicacion}</p>
        {c.patron && <div className="pista"><b>Patrón:</b> {c.patron}</div>}
        {c.confusiones.length > 0 && <p className="mini">Se confunde con: {c.confusiones.join(' · ')}</p>}
        <p className="mini">Esta primera respuesta contará como práctica con explicación previa.</p>
        <button className="btn principal" style={{ marginTop: 12 }} onClick={() => setFase('tarea')}>Ahora recupéralo</button>
      </div>}
      {fase !== 'ensenanza' && <>
        <div className="pregunta">{c.evaluacion.pregunta}</div>
        {fase === 'tarea' && <div className="fila" style={{ gap: 6, marginBottom: 14 }}><span className="mini">Confianza (opcional):</span>
          {([[1, 'Poca'], [2, 'Media'], [3, 'Mucha']] as const).map(([v, t]) => <button key={v} className={`btn pequeno ${confianza === v ? 'principal' : 'fantasma'}`}
            aria-pressed={confianza === v} onClick={() => { setConfianza(v); guardarPaso({ confianza: v }) }}>{t}</button>)}
        </div>}
        {!examenSinAyuda && pistas > 0 && c.pistas.slice(0, pistas).map((t, k) => <div key={k} className="pista"><b>Pista {k + 1}:</b> {t}</div>)}
        {(!examenSinAyuda || fase === 'tarea') && <Interaccion key={preguntaId} c={c} semilla={preguntaId} ocultarFeedback={examenSinAyuda}
          bloqueado={fase !== 'tarea'} resultado={res} onResponder={responder} />}
        {fase === 'tarea' && !examenSinAyuda && <div className="fila" style={{ marginTop: 14 }}>
          <button className="btn pequeno fantasma" disabled={pistas >= c.pistas.length} onClick={() => { setPistas(pistas + 1); guardarPaso({ pistas: pistas + 1 }) }}>
            {pistas === 0 ? 'Necesito una pista' : pistas < c.pistas.length ? `Otra pista (${pistas}/${c.pistas.length})` : 'Sin más pistas'}</button>
          <button className="btn pequeno fantasma" onClick={() => { setFuenteConsultada(true); setVerFuente(true); guardarPaso({ fuenteConsultada: true }) }}>Ver la fuente</button>
        </div>}
      </>}
      {fase === 'retro' && examenSinAyuda && <div className="tarjeta pila" role="status"><b>Respuesta registrada</b>
        <p className="sutil">Podrás revisar la respuesta y su explicación al terminar la primera vuelta.</p>
        <button className="btn principal" onClick={avanzar}>{i + 1 === cantidadInicial ? 'Terminar y revisar' : 'Siguiente pregunta'}</button>
      </div>}
      {fase === 'retro' && res && !examenSinAyuda && <div className={`retro ${res.veredicto === 'correcta' ? 'ok' : res.veredicto === 'incorrecta' ? 'no' : 'parcial'}`} role="status">
        <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b>{etiquetaResultado(res.veredicto)}</b><span className="etq">{NOMBRE_ERROR[res.tipoError]}</span></div>
        <p className="mini">Tu respuesta ya está registrada.{intentoActual.current && conAyuda(intentoActual.current) ? ' Esta práctica tuvo ayuda.' : ''}</p>
        <p>Tu respuesta: <b>{res.respuestaDada || 'Respuesta registrada'}</b></p>
        {res.veredicto !== 'correcta' && <p>Respuesta de referencia: <b>{c.respuesta_canonica}</b></p>}
        {res.veredicto === 'revision' && <p>El corrector no puede decidir esta respuesta con seguridad. Compárala con la referencia; no se contará como acierto ni fallo.</p>}
        {necesitaReintento(res.veredicto) && <p>Este concepto volverá al final de la cola hasta que lo aciertes.</p>}
        {res.detalle && <p className="sutil">{res.detalle}</p>}<p>{c.explicacion}</p>
        {c.patron && <p><span className="decisiva">Patrón reutilizable</span> · {c.patron}</p>}{c.contexto && <p className="sutil">{c.contexto}</p>}
        {c.relacionados.length > 0 && <p className="mini">Conecta con: {c.relacionados.join(' · ')}</p>}
        <div className="fila" style={{ marginTop: 10 }}><button className="btn pequeno fantasma" onClick={() => setVerFuente(true)}>Abrir la fuente</button>
          <span className="mini">{dominio.texto}</span></div>
        {dominio.pendientes.length > 0 && <details className="mini" style={{ marginTop: 8 }}><summary>Qué falta para el dominio</summary>
          <ul>{dominio.pendientes.map(criterio => <li key={criterio}>{criterio}</li>)}</ul></details>}
        {res.veredicto === 'revision' ? <div className="fila" style={{ marginTop: 12 }}>
          {puedeResponderDeNuevo && <button className="btn principal" onClick={() => avanzarPaso(true)}>{puedeRevisarConOpciones ? 'Practicar de nuevo con opciones' : 'Volver a responder'}</button>}
          <button className={`btn ${puedeResponderDeNuevo ? 'fantasma' : 'principal'}`} onClick={avanzar}>Continuar con respuesta pendiente de revisión</button></div>
          : <><hr className="sep" /><div className="rotulo" style={{ marginBottom: 8 }}>Ajusta la dificultad · Próximo repaso aproximado</div>
            <div className="escalera">{(res.veredicto === 'incorrecta' ? [[1, 'Volver a practicar']] as const
              : res.veredicto === 'parcial' || res.veredicto === 'ortografia' ? [[1, 'Volver a practicar'], [2, 'Difícil']] as const
              : [[2, 'Difícil'], [3, 'Bien'], [4, 'Fácil']] as const).map(([g, txt]) => <button key={g} onClick={() => calificar(g)}>
                <b>{txt}</b><small>{intentoActual.current && formatoIntervalo(diasParaCalificacion(p, intentoActual.current, g))}</small></button>)}</div></>}
      </div>}
      {fase === 'ortografia' && c.escritura_correctiva.termino && <EscrituraCorrectiva termino={c.escritura_correctiva.termino} onHecho={avanzar} />}
    </div>
    {verFuente && !examenSinAyuda && <Modal titulo="Fuente del concepto" onCerrar={() => setVerFuente(false)}><PanelFuente c={c} /></Modal>}
  </div>
}
