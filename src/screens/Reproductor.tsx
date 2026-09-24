import { useEffect, useMemo, useRef, useState } from 'react'
import type { Concepto } from '../schema/concept'
import { NOMBRE_INTERACCION } from '../schema/concept'
import { useApp } from '../store/estado'
import { Interaccion, EscrituraCorrectiva, usaTextoLibre, type Resultado } from '../components/interacciones'
import { calificarConIA } from '../lib/calificacion-ia'
import { Modal, PanelFuente, EtiquetaEstado } from '../components/comunes'
import { NOMBRE_ERROR, type Intento, type TipoError } from '../srs/tipos'
import { resumenDominio } from '../srs/mastery'
import { cercaniaDominio } from '../srs/cercania'
import { crearUUID } from '../store/model'
import { EVALUADOR_VERSION } from '../lib/normalize'
import { esRespuestaBreve, prepararConcepto } from '../lib/formatos'
import { AyudaIA } from '../components/AyudaIA'
import { ExamenIA } from '../components/ExamenIA'
import { ConfusionIA } from '../components/ConfusionIA'
import { ChatConcepto } from '../components/ChatConcepto'
import { Cronometro } from '../components/Cronometro'
import { BotonPiel, usePielEstudio } from '../components/PielEstudio'
import { tiempoLegible } from '../lib/tiempo'
import { buscarIntentoPaso, conAyuda, diasParaCalificacion, identificarPregunta, necesitaReintento, resumirCorrecciones, resumirIntentos, RelojActividad, siguienteCola, versionPregunta } from './sesion'

export interface Cola { titulo: string; subtitulo: string; ruta: string; modulo: string; conceptos: Concepto[]; sessionId?: string; presupuestoMinutos?: 10 | 20 | 30 }

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

export function Reproductor({ cola, onSalir, indiceInicial = 0, onTramoCompleto }:
  { cola: Cola; onSalir: () => void; indiceInicial?: number; onTramoCompleto?: () => void }) {
  const { registrarIntento, progresoDe, estado, guardarReanudable, iniciarSesion, cerrarSesion } = useApp()
  const pielEstudio = usePielEstudio()
  const guardada = cola.sessionId && estado.reanudable?.sessionId === cola.sessionId ? estado.reanudable : null
  const [versionFormato] = useState<1 | 2>(guardada ? guardada.versionFormato ?? 1 : 2)
  const [presupuesto] = useState(guardada?.presupuestoMinutos ?? cola.presupuestoMinutos)
  const [relojSesion] = useState(() => { const r = new RelojActividad(); r.reiniciar(guardada?.msVisibles ?? 0); return r })
  const [msVisibles, setMsVisibles] = useState(guardada?.msVisibles ?? 0)
  const [pausaTiempo, setPausaTiempo] = useState(guardada?.pausaPorTiempoPendiente ?? false)
  const [sinLimite, setSinLimite] = useState(guardada?.continuarSinLimite ?? false)
  const tiempoRef = useRef({ pausa: pausaTiempo, sinLimite })
  const saliendo = useRef(false)
  const pasoListo = useRef<number | null>(null)
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
  const [esperandoIA, setEsperandoIA] = useState(false)
  const [juzgandoIA, setJuzgandoIA] = useState(false)
  const [avisoIA, setAvisoIA] = useState<string | null>(null)
  const calificando = useRef(false)
  const abortoIA = useRef(new AbortController())
  const vivoIA = useRef(true)
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
  const c = useMemo(() => original ? prepararConcepto(original, { semilla: preguntaId, indice: i, ruta: cola.ruta, forzarReconocimiento: reintento, version: versionFormato }) : undefined,
    [original, preguntaId, i, cola.ruta, reintento, versionFormato])
  const datosSesion = () => {
    const intentos = Object.values(estado.progreso).flatMap(p => p.intentos).filter(t => t.session_id === sesionId.current)
    if (intentoActual.current) intentos.push(intentoActual.current)
    return { ...resumirIntentos(intentos), msVisibles: relojSesion.leer() }
  }

  const metadata = (lista = orden) => ({
    versionFormato,
    ...(presupuesto ? { presupuestoMinutos: presupuesto } : {}),
    msVisibles: relojSesion.leer(), continuarSinLimite: tiempoRef.current.sinLimite,
    pausaPorTiempoPendiente: tiempoRef.current.pausa,
    ...(lista.some(x => x.variante_id) ? { variantes: lista.map(x => x.variante_id ?? null) } : {}),
  })
  const guardarPaso = (cambios: Partial<{ ensenanzaAbierta: boolean; pistas: number; fuenteConsultada: boolean; explicacionPrevia: boolean; confianza: 1 | 2 | 3 | null }> = {}) => {
    if (!sesionLista || !sesionId.current || pasoListo.current !== i || !c) return
    const saved = estado.reanudable
    if (!saved || saved.sessionId !== sesionId.current || saved.indice !== i || saved.conceptIds?.join('|') !== orden.map(x => x.concept_id).join('|')) return
    guardarReanudable({
      modulo: cola.modulo, sesion: cola.ruta, indice: i, ts: Date.now(), sessionId: sesionId.current,
      conceptIds: orden.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      cantidadInicial, revisionInicialHecha, ...metadata(),
      ...(c && !tiempoRef.current.pausa ? { paso: { indice: i, pistas, fuenteConsultada, explicacionPrevia, confianza,
        ensenanzaAbierta: fase === 'ensenanza', msActivo: reloj.current.leer(), ...cambios } } : {}),
    })
  }
  const guardarPasoActual = useRef(guardarPaso)
  guardarPasoActual.current = guardarPaso

  // Al desmontar, ninguna corrección en vuelo debe escribir sobre un reproductor que ya no existe.
  // El montaje reestrena bandera y controlador: con StrictMode la limpieza corre una vez de más,
  // y reutilizarlos dejaría la corrección abortada para el resto de la sesión.
  useEffect(() => {
    vivoIA.current = true
    const aborto = new AbortController()
    abortoIA.current = aborto
    return () => { vivoIA.current = false; aborto.abort() }
  }, [])

  useEffect(() => {
    if (!sesionId.current) sesionId.current = iniciarSesion(cola.modulo, cola.ruta)
    setSesionLista(true)
    // El identificador vive durante todo el montaje, también con StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sesionLista || !sesionId.current || pausaTiempo) return
    pasoListo.current = i
    ultimaAccion.current = null
    intentoActual.current = null
    setVerFuente(false)
    setRes(null)
    setEsperandoIA(false)
    setAvisoIA(null)
    if (!c) { reloj.current.activar(false); guardarPasoActual.current(); return }
    const progreso = progresoDe(c.concept_id)
    const id = identificarPregunta(sesionId.current, i, c.concept_id)
    const anterior = buscarIntentoPaso(progreso, sesionId.current, id)
    const paso = estado.reanudable?.sessionId === sesionId.current && estado.reanudable.paso?.indice === i
      ? estado.reanudable.paso : null
    const mostrarEnsenanza = !examenSinAyuda && paso?.ensenanzaAbierta === true
    const previa = anterior?.explicacion_previa ?? paso?.explicacionPrevia ?? reintento
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
    } else setFase(mostrarEnsenanza ? 'ensenanza' : 'tarea')
    guardarReanudable({ modulo: cola.modulo, sesion: cola.ruta, indice: i, ts: Date.now(), sessionId: sesionId.current,
      conceptIds: orden.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      cantidadInicial, revisionInicialHecha, ...metadata(),
      paso: { indice: i, pistas: ayudas, fuenteConsultada: fuente, explicacionPrevia: previa,
        ensenanzaAbierta: mostrarEnsenanza, confianza: seguridad, msActivo: reloj.current.leer() } })
    // Se restaura un paso al entrar en él, nunca se reinicia mientras llega la sincronización.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionLista, i, c?.concept_id, pausaTiempo])

  useEffect(() => {
    const actualizar = (guardar = false) => {
      const visible = document.visibilityState === 'visible'
      reloj.current.activar(sesionLista && !pausaTiempo && visible && !!c && !revisionExamen && vistaActual.current.fase === 'tarea' && !vistaActual.current.verFuente)
      if (guardar && !visible) guardarPasoActual.current()
    }
    actualizar()
    const alCambiarVisibilidad = () => actualizar(true)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => { reloj.current.activar(false); document.removeEventListener('visibilitychange', alCambiarVisibilidad) }
  }, [fase, verFuente, i, c, sesionLista, revisionExamen, pausaTiempo])

  useEffect(() => {
    const visible = () => document.visibilityState === 'visible'
    const activar = () => relojSesion.activar(sesionLista && !!c && !pausaTiempo && visible())
    const checkpoint = () => { activar(); if (c && !saliendo.current && !tiempoRef.current.pausa) guardarPasoActual.current() }
    const alSalirPagina = () => { relojSesion.activar(false); reloj.current.activar(false); if (c && !saliendo.current) guardarPasoActual.current() }
    activar()
    let ticks = 0
    const timer = setInterval(() => { setMsVisibles(relojSesion.leer()); if (++ticks % 15 === 0) checkpoint() }, 1000)
    document.addEventListener('visibilitychange', checkpoint)
    window.addEventListener('pagehide', alSalirPagina)
    return () => { clearInterval(timer); relojSesion.activar(false); document.removeEventListener('visibilitychange', checkpoint); window.removeEventListener('pagehide', alSalirPagina) }
  }, [sesionLista, !!c, pausaTiempo, relojSesion])
  useEffect(() => {
    const saved = estado.reanudable
    if (!saved || saved.sessionId !== sesionId.current) return
    if ((saved.msVisibles ?? 0) > relojSesion.leer()) { const activo = sesionLista && !!c && !pausaTiempo && document.visibilityState === 'visible'; relojSesion.reiniciar(saved.msVisibles!); relojSesion.activar(activo); setMsVisibles(saved.msVisibles!) }
    if (saved.continuarSinLimite && !tiempoRef.current.sinLimite) { tiempoRef.current = { pausa: false, sinLimite: true }; setSinLimite(true); setPausaTiempo(false) }
  }, [estado.reanudable, relojSesion, sesionLista, !!c, pausaTiempo])
  useEffect(() => () => { if (!saliendo.current && !tiempoRef.current.pausa) guardarPasoActual.current() }, [])

  // Cuando el reproductor es un tramo dentro de una sesión mixta, el final de la cola
  // devuelve el control al orquestador en vez de sacar al estudiante de la sesión.
  const salir = () => {
    saliendo.current = true; relojSesion.activar(false)
    reloj.current.activar(false)
    if (sesionId.current) cerrarSesion(sesionId.current, datosSesion())
    guardarReanudable(null)
    ;(onTramoCompleto ?? onSalir)()
  }
  const pausar = () => {
    saliendo.current = true; relojSesion.activar(false)
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
    if (i + 1 >= siguiente.length) relojSesion.activar(false)
    const vencio = !!presupuesto && !tiempoRef.current.sinLimite && relojSesion.leer() >= presupuesto * 60000 && i + 1 < siguiente.length
    if (vencio) { tiempoRef.current.pausa = true; relojSesion.activar(false); setPausaTiempo(true) }
    guardarReanudable({ modulo: cola.modulo, sesion: cola.ruta, indice: i + 1, ts: Date.now(), sessionId: sesionId.current ?? undefined,
      conceptIds: siguiente.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      cantidadInicial, revisionInicialHecha, ...metadata(siguiente) })
    if (i + 1 >= siguiente.length && sesionId.current) cerrarSesion(sesionId.current, datosSesion())
    setOrden(siguiente)
    setI(Math.min(i + 1, siguiente.length))
  }
  const avanzar = () => avanzarPaso(false)

  const responder = (r: Resultado) => {
    if (!c || !sesionId.current || intentoActual.current || fase !== 'tarea' || calificando.current) return
    const anterior = buscarIntentoPaso(progresoDe(c.concept_id), sesionId.current, preguntaId)
    if (anterior) {
      intentoActual.current = anterior
      setRes({ veredicto: anterior.resultado ?? 'revision', tipoError: anterior.tipo_error,
        recuperacionActiva: anterior.recuperacion_activa, respuestaDada: anterior.respuesta_dada ?? '' })
      setFase('retro'); return
    }
    reloj.current.activar(false)
    // Una palabra o frase corta la juzga la IA; lo demás lo resuelve el corrector propio.
    if (usaTextoLibre(c) && r.respuestaDada.trim()) {
      calificando.current = true
      setEsperandoIA(true)
      void (async () => {
        // Pase lo que pase, la pregunta no puede quedarse congelada esperando a la IA.
        let fallo: Awaited<ReturnType<typeof calificarConIA>>
        try {
          fallo = await calificarConIA({
            conceptId: c.concept_id, answer: r.respuestaDada, questionId: preguntaId, version: versionPregunta(c),
            formatVersion: versionFormato, variantId: c.variante_id, index: i, route: cola.ruta, retry: reintento,
          }, abortoIA.current.signal)
        } catch { fallo = { estado: 'sin_ia', motivo: 'No se pudo corregir con IA.' } }
        calificando.current = false
        if (!vivoIA.current) return
        setEsperandoIA(false)
        setAvisoIA(fallo.estado === 'ok' ? null : fallo.motivo)
        registrarRespuesta(fallo.estado === 'ok' ? veredictoDeIA(r, fallo) : r, fallo.estado === 'ok')
      })()
      return
    }
    registrarRespuesta(r, false)
  }

  /**
   * La IA manda sobre el veredicto, con una excepción: si el corrector propio detectó una errata
   * y la IA da el concepto por bueno, se conserva «ortografía». Los dos coinciden en que el
   * concepto está bien, y así no se pierde la práctica de escritura.
   */
  const veredictoDeIA = (local: Resultado, ia: { veredicto: 'correcta' | 'parcial' | 'incorrecta'; motivo: string }): Resultado => {
    if (ia.veredicto === 'correcta' && local.veredicto === 'ortografia') return local
    const tipoError: TipoError = ia.veredicto === 'correcta' ? 'ninguno'
      : ia.veredicto === 'parcial' ? 'recuerdo_incompleto' : 'confusion_conceptos'
    return { ...local, veredicto: ia.veredicto, tipoError, detalle: ia.motivo }
  }

  const registrarRespuesta = (r: Resultado, porIA: boolean) => {
    if (!c || !sesionId.current || intentoActual.current) return
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
      ...(c.variante_id ? { variante_id: c.variante_id, primera_presentacion: !progresoDe(c.concept_id).intentos.some(t => t.variante_id === c.variante_id) } : {}),
      pregunta_id: preguntaId, pregunta_version: versionPregunta(c), evaluador_version: EVALUADOR_VERSION,
      fuente_consultada: fuenteConsultada, explicacion_previa: explicacionPrevia, modo: modoRegistro,
      tipo_evidencia: c.interaccion.recomendada === 'caso_clinico' ? 'aplicacion' : r.recuperacionActiva ? 'recuerdo' : 'discriminacion',
      ...(porIA ? { calificado_por_ia: true } : {}),
    }
    intentoActual.current = intento
    registrarIntento(c.concept_id, intento)
    setRes({ ...r, tipoError: tipo })
    setFase('retro')
  }

  /**
   * Pedir a la IA que juzgue una respuesta que el corrector propio no supo decidir.
   *
   * Una respuesta «en revisión» no cuenta ni como acierto ni como fallo: se escribió, se
   * pensó, y no acredita nada. Casi siempre pasa cuando la IA no estaba disponible en ese
   * momento. Esto reescribe el mismo intento, no crea otro, así que el esfuerzo original
   * es el que acaba contando.
   */
  const juzgarConIA = async () => {
    const intento = intentoActual.current
    if (!c || !intento || !res || juzgandoIA || !res.respuestaDada.trim()) return
    setJuzgandoIA(true); setAvisoIA(null)
    const fallo = await calificarConIA({
      conceptId: c.concept_id, answer: res.respuestaDada, questionId: preguntaId, version: versionPregunta(c),
      formatVersion: versionFormato, variantId: c.variante_id, index: i, route: cola.ruta, retry: reintento,
    }, abortoIA.current.signal).catch(() => ({ estado: 'sin_ia', motivo: 'No se pudo corregir con IA.' } as const))
    if (!vivoIA.current) return
    setJuzgandoIA(false)
    if (fallo.estado !== 'ok') { setAvisoIA(fallo.motivo); return }
    const juzgado = veredictoDeIA(res, fallo)
    const actualizado: Intento = { ...intento, resultado: juzgado.veredicto, tipo_error: juzgado.tipoError,
      calificacion: juzgado.veredicto === 'correcta' ? 3 : juzgado.veredicto === 'incorrecta' ? 1 : 2,
      calificado_por_ia: true,
      calificacion_actualizada_en: Math.max(Date.now(), (intento.calificacion_actualizada_en ?? intento.ts) + 1) }
    intentoActual.current = actualizado
    registrarIntento(c.concept_id, actualizado)
    setRes(juzgado)
  }

  /** Rectificar un veredicto de la IA: reescribe el mismo intento y manda sobre él. */
  const corregirVeredicto = (correcta: boolean) => {
    const intento = intentoActual.current
    if (!c || !intento || !res || ultimaAccion.current === preguntaId) return
    const veredicto: Intento['resultado'] = correcta ? 'correcta' : 'incorrecta'
    const tipo: TipoError = correcta ? 'ninguno' : 'confusion_conceptos'
    const actualizado: Intento = { ...intento, resultado: veredicto, tipo_error: tipo,
      calificacion: correcta ? 3 : 1, correccion_manual: true,
      calificacion_actualizada_en: Math.max(Date.now(), (intento.calificacion_actualizada_en ?? intento.ts) + 1) }
    intentoActual.current = actualizado
    registrarIntento(c.concept_id, actualizado)
    setRes({ ...res, veredicto, tipoError: tipo, detalle: undefined })
  }

  const calificar = (calificacion: 1 | 2 | 3 | 4) => {
    const intento = intentoActual.current
    if (!c || !intento || ultimaAccion.current === preguntaId || intento.resultado === 'revision') return
    const actualizado = { ...intento, calificacion,
      calificacion_actualizada_en: Math.max(Date.now(), (intento.calificacion_actualizada_en ?? intento.ts) + 1) }
    intentoActual.current = actualizado
    registrarIntento(c.concept_id, actualizado)
    avanzar()
  }

  const revisiones = (limite = orden.length) => <div className="pila"><h3>Revisar mis respuestas</h3>
    {orden.slice(0, limite).map((original, posicion) => {
      const id = identificarPregunta(sesionId.current!, posicion, original.concept_id)
      const concepto = prepararConcepto(original, { semilla: id, indice: posicion, ruta: cola.ruta,
        forzarReconocimiento: posicion >= cantidadInicial, version: versionFormato })
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
      cantidadInicial, revisionInicialHecha: true, ...metadata() })
  }

  if (!sesionLista) return <p role="status">Preparando tu sesión…</p>
  if (!estado.reanudable || estado.reanudable.sessionId !== sesionId.current || estado.reanudable.indice !== i || estado.reanudable.conceptIds?.join('|') !== orden.map(x => x.concept_id).join('|')) return <div className="tarjeta pila" role="status">
    <h2>Tu sesión cambió en otra ventana</h2><p>Las respuestas registradas se conservan. Vuelve a tu plan para abrir el punto de continuación más reciente.</p>
    <button className="btn principal" onClick={() => { saliendo.current = true; relojSesion.activar(false); onSalir() }}>Volver a mi plan</button>
  </div>
  if (pausaTiempo && c) return <div className="reproductor tarjeta pila" role="status">
    <span className="rotulo">Objetivo de tiempo alcanzado</span><h2>Has estudiado {tiempoLegible(relojSesion.leer())}</h2>
    <p>La última respuesta está guardada. Quedan {new Set(orden.slice(i).map(x => x.concept_id)).size} conceptos en esta sesión, incluidos los errores que vuelven a aparecer.</p>
    <div className="fila"><button className="btn principal" onClick={pausar}>Pausar y guardar</button>
      <button className="btn" onClick={() => { tiempoRef.current = { pausa: false, sinLimite: true }; setSinLimite(true); setPausaTiempo(false) }}>Continuar sin límite</button></div>
  </div>
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
        <p>Tiempo de estudio, incluidas explicaciones: {tiempoLegible(relojSesion.leer())}.</p>
        <p>{correcciones.conceptos} conceptos · {correcciones.aciertosIniciales} aciertos en la primera vuelta.</p>
        {correcciones.reintentos > 0 && <p>{correcciones.erroresIniciales > 0
          ? `${correcciones.recuperados} de ${correcciones.erroresIniciales} errores iniciales corregidos en ${correcciones.reintentos} reintentos.`
          : `${correcciones.reintentos} reintentos para comprobar respuestas pendientes.`}</p>}
        <p>{resumen.correctos} respuestas correctas en total, de ellas {resumen.independientes} sin ayuda. Usaste apoyo en {resumen.ayudas} preguntas.</p>
        {resumen.porRevisar > 0 && <p>{resumen.porRevisar} respuestas por revisar. No se contaron como aciertos ni fallos.</p>}
        <p className="sutil">Los errores evaluados se han vuelto a practicar en esta sesión. Acertarlos después de ver la explicación cuenta como corrección; el dominio se confirma en repasos posteriores.</p>
        {examen && <p className="mini">Práctica sin ayuda con preguntas de tu corpus. Este resultado no estima tu probabilidad de aprobar Step 1.</p>}
        <button className="btn principal" onClick={salir}>{onTramoCompleto ? 'Continuar la sesión' : 'Volver a mi plan'}</button>
      </div>
      {revisiones()}
    </div>
  }
  const p = progresoDe(c.concept_id)
  const presentacionCambio = !!intentoActual.current?.pregunta_version && intentoActual.current.pregunta_version !== versionPregunta(c)
  const dominio = resumenDominio(p, estado.criterios)
  const cercania = cercaniaDominio(p, estado.criterios)
  const modo = modoEnsenanza(c)
  const alternativa = res?.veredicto === 'revision' && original ? prepararConcepto(original, {
    semilla: identificarPregunta(sesionId.current!, orden.length, original.concept_id), indice: orden.length,
    ruta: cola.ruta, forzarReconocimiento: true, version: versionFormato,
  }) : null
  const puedeRevisarConOpciones = alternativa && ['opcion_multiple', 'caso_clinico', 'verdadero_falso'].includes(alternativa.interaccion.recomendada)
  const puedeResponderDeNuevo = puedeRevisarConOpciones || (alternativa && esRespuestaBreve(alternativa.respuesta_canonica))

  return <div className="reproductor pila">
    {presupuesto && <Cronometro msVisibles={msVisibles} presupuesto={presupuesto} sinLimite={sinLimite} />}
    {c.variante_id && <p className="mini">{c.interaccion.recomendada === 'caso_clinico' ? 'Aplicación en un caso' : 'Distinguir conceptos'} · {progresoDe(c.concept_id).intentos.some(t => t.variante_id === c.variante_id && t.pregunta_id !== preguntaId) ? 'Variante ya practicada' : 'Primera presentación de esta variante'}</p>}
    <div className="fila" style={{ justifyContent: 'space-between' }}>
      <div className="fila" style={{ gap: 8 }}>
        <span className="etq">{c.clasificacion.disciplina_primaria}</span><span className="etq">{c.clasificacion.sistema_primario}</span>
        <span className="etq violeta">{NOMBRE_INTERACCION[c.interaccion.recomendada]}</span>
        {!examenSinAyuda && <EtiquetaEstado estado={p.estado} />}
      </div>
      <div className="fila" style={{ gap: 8 }}>
        <BotonPiel piel={pielEstudio.piel} alternar={pielEstudio.alternar} />
        <button className="btn pequeno fantasma" onClick={pausar}>Necesito una pausa</button>
      </div>
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
        <button className="btn principal" style={{ marginTop: 12 }} onClick={() => { setFase('tarea'); guardarPaso({ ensenanzaAbierta: false }) }}>{c.clasificacion.disciplina_primaria === 'Bioquímica' ? 'Ocultar y reconstruir la cadena' : 'Ahora recupéralo'}</button>
      </div>}
      <div hidden={fase === 'ensenanza'}>
        {fase === 'tarea' && explicacionPrevia && !examenSinAyuda && c.clasificacion.disciplina_primaria === 'Bioquímica' && <p className="aviso">Con la explicación oculta, di en voz alta: qué cambió → qué proceso afecta → qué consecuencia esperas y por qué. Después completa esta misma pregunta. Esto sustituye releer; cuenta como práctica con ayuda previa.</p>}
        <div className="pregunta">{c.evaluacion.pregunta}</div>
        {fase === 'tarea' && <details key={`confianza-${preguntaId}`} className="mini" style={{ marginBottom: 14 }}><summary>Registrar confianza (opcional)</summary><div className="fila" style={{ gap: 6, marginTop: 8 }}>
          {([[1, 'Poca'], [2, 'Media'], [3, 'Mucha']] as const).map(([v, t]) => <button key={v} className={`btn pequeno ${confianza === v ? 'principal' : 'fantasma'}`}
            aria-pressed={confianza === v} onClick={() => { setConfianza(v); guardarPaso({ confianza: v }) }}>{t}</button>)}
        </div></details>}
        {!examenSinAyuda && pistas > 0 && c.pistas.slice(0, pistas).map((t, k) => <div key={k} className="pista"><b>Pista {k + 1}:</b> {t}</div>)}
        {(!examenSinAyuda || fase === 'tarea') && <Interaccion key={`interaccion-${preguntaId}`} c={c} semilla={preguntaId} ocultarFeedback={examenSinAyuda}
          bloqueado={fase !== 'tarea' || esperandoIA} resultado={res} onResponder={responder} />}
        {esperandoIA && <p className="mini" role="status" style={{ marginTop: 10 }}>Comprobando tu respuesta con la IA…</p>}
        {fase === 'tarea' && !examenSinAyuda && <div className="fila" style={{ marginTop: 14 }}>
          <button className="btn pequeno fantasma" onClick={() => { setExplicacionPrevia(true); setFase('ensenanza'); guardarPaso({ explicacionPrevia: true, ensenanzaAbierta: true }) }}>Necesito aprenderlo</button>
          <button className="btn pequeno fantasma" disabled={pistas >= c.pistas.length} onClick={() => { setPistas(pistas + 1); guardarPaso({ pistas: pistas + 1 }) }}>
            {pistas === 0 ? 'Necesito una pista' : pistas < c.pistas.length ? `Otra pista (${pistas}/${c.pistas.length})` : 'Sin más pistas'}</button>
          <button className="btn pequeno fantasma" onClick={() => { setFuenteConsultada(true); setVerFuente(true); guardarPaso({ fuenteConsultada: true }) }}>Ver la fuente</button>
        </div>}
      </div>
      {fase === 'retro' && examenSinAyuda && <div className="tarjeta pila" role="status"><b>Respuesta registrada</b>
        <p className="sutil">Podrás revisar la respuesta y su explicación al terminar la primera vuelta.</p>
        <button className="btn principal" onClick={avanzar}>{i + 1 === cantidadInicial ? 'Terminar y revisar' : 'Siguiente pregunta'}</button>
      </div>}
      {fase === 'retro' && res && !examenSinAyuda && <div className={`retro ${res.veredicto === 'correcta' ? 'ok' : res.veredicto === 'incorrecta' ? 'no' : 'parcial'}`} role="status">
        <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 8 }}><b>{etiquetaResultado(res.veredicto)}</b></div>
        <p className="mini">Tu respuesta ya está registrada.{intentoActual.current && conAyuda(intentoActual.current) ? ' Esta práctica tuvo ayuda.' : ''}</p>
        {avisoIA && <p className="mini">La IA no pudo corregir esta respuesta: {avisoIA} Decidió el corrector propio.</p>}
        {intentoActual.current?.calificado_por_ia && <div className="veredicto-ia">
          <p className="mini">{intentoActual.current.correccion_manual
            ? 'Lo decidió la IA y tú lo rectificaste. Vale tu corrección.'
            : 'Este veredicto lo decidió la IA. Si se equivocó, corrígelo y contará como tú digas.'}</p>
          {!intentoActual.current.correccion_manual && <button className="btn pequeno fantasma"
            onClick={() => corregirVeredicto(res.veredicto !== 'correcta')}>
            {res.veredicto === 'correcta' ? 'No, mi respuesta era incorrecta' : 'Mi respuesta sí era correcta'}</button>}
        </div>}
        {presentacionCambio && <p className="aviso">La pregunta guardada pertenece a otra presentación. Tu respuesta y su resultado original se conservan; el texto mostrado es el actual.</p>}
        <p>Tu respuesta: <b>{res.respuestaDada || 'Respuesta registrada'}</b></p>
        {res.veredicto !== 'correcta' && <p>Respuesta de referencia: <b>{c.respuesta_canonica}</b></p>}
        {res.veredicto === 'revision' && <p>El corrector no puede decidir esta respuesta con seguridad. Compárala con la referencia; no se contará como acierto ni fallo.</p>}
        {/* Una respuesta escrita que nadie juzga no acredita nada: la IA puede decidirla. */}
        {res.veredicto === 'revision' && res.respuestaDada.trim() && usaTextoLibre(c) && !presentacionCambio
          && <button className="btn pequeno" disabled={juzgandoIA} onClick={() => void juzgarConIA()}>
            {juzgandoIA ? 'Corrigiendo con IA…' : 'Que la IA juzgue mi respuesta'}</button>}
        {necesitaReintento(res.veredicto) && <p>Este concepto volverá al final de la cola hasta que lo aciertes.</p>}
        {(res.detalle || c.evaluacion.opciones?.find(o => !o.correcta && o.texto === res.respuestaDada)?.por_que) && <p className="sutil">{res.detalle || c.evaluacion.opciones?.find(o => !o.correcta && o.texto === res.respuestaDada)?.por_que}</p>}
        {/* Solo con respuesta escrita: en un formato de opciones ya se sabe qué se eligió. */}
        {res.veredicto !== 'correcta' && res.veredicto !== 'revision' && usaTextoLibre(c) && res.respuestaDada.trim()
          && <ConfusionIA conceptId={c.concept_id} respuesta={res.respuestaDada} />}
        <p>{c.explicacion}</p>
        {c.patron && <p className="patron"><b>Si ves esto → piensa:</b> {c.patron}</p>}
        {c.confusiones.length > 0 && <p className="mini">No lo confundas con: {c.confusiones.join(' · ')}</p>}
        {c.revision_editorial && <p className="aviso">{c.revision_editorial.nota}</p>}
        {res.veredicto !== 'revision' && <button className="btn principal" onClick={avanzar}>Siguiente pregunta</button>}
        <details style={{ marginTop: 14 }}><summary>Profundizar</summary>
          {c.contexto && <p>{c.contexto}</p>}
          <p className="mini">Clasificación para el planificador: {NOMBRE_ERROR[res.tipoError]}</p>
          {c.evaluacion.opciones?.filter(o => !o.correcta && o.texto !== res.respuestaDada && o.por_que).map(o => <p className="mini" key={o.texto}><b>{o.texto}:</b> {o.por_que}</p>)}
          {c.relacionados.length > 0 && <p className="mini">Conecta con: {c.relacionados.join(' · ')}</p>}
          <p className="mini">{dominio.texto}</p>
          {/* Acertar de nuevo no adelanta la separación: decirlo aquí evita repetirlo en balde. */}
          {cercania.esperandoSeparacion && cercania.disponibleDesde !== null
            ? <p className="mini">Ya tiene los aciertos que pide el umbral. Falta que estén separados {estado.criterios.separacionHoras} h:
              se acredita a partir del {new Date(cercania.disponibleDesde).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}.
              Repetirlo antes no adelanta ese reloj.</p>
            : dominio.pendientes.length > 0 && <ul className="mini">{dominio.pendientes.map(criterio => <li key={criterio}>{criterio}</li>)}</ul>}
        </details>
        {/* A diferencia de la ayuda, esto no espera a que falles: sirve igual cuando aciertas. */}
        {!presentacionCambio && <details style={{ marginTop: 12 }}><summary>Cómo caería en el examen</summary><ExamenIA key={c.concept_id} concepto={c} /></details>}
        {/* Solo después de responder: preguntar antes sería pedirle la respuesta. */}
        {!presentacionCambio && <details style={{ marginTop: 12 }}><summary>Preguntar sobre esta pregunta</summary><ChatConcepto key={c.concept_id} concepto={c} /></details>}
        {res.veredicto !== 'correcta' && !presentacionCambio && <details style={{ marginTop: 12 }}><summary>Sigo sin entender</summary><AyudaIA key={preguntaId} concepto={c} respuesta={res.respuestaDada} preguntaId={preguntaId} indice={i} ruta={cola.ruta} reintento={reintento} versionFormato={versionFormato} /></details>}
        <button className="btn pequeno fantasma" style={{ marginTop: 10 }} onClick={() => setVerFuente(true)}>Abrir la fuente</button>
        {res.veredicto === 'ortografia' && c.escritura_correctiva.elegible && c.escritura_correctiva.termino && <button className="btn pequeno fantasma" onClick={() => setFase('ortografia')}>Practicar escritura (opcional)</button>}
        {res.veredicto === 'revision' ? <div className="fila" style={{ marginTop: 12 }}>
          {puedeResponderDeNuevo && <button className="btn principal" onClick={() => avanzarPaso(true)}>{puedeRevisarConOpciones ? 'Practicar de nuevo con opciones' : 'Volver a responder'}</button>}
          <button className={`btn ${puedeResponderDeNuevo ? 'fantasma' : 'principal'}`} onClick={avanzar}>Continuar con respuesta pendiente de revisión</button></div>
          : <details style={{ marginTop: 12 }}><summary>Ajustar dificultad (opcional)</summary><p className="mini">El resultado ya programó tu repaso. Puedes ajustar cómo te resultó y avanzar.</p>
            <div className="escalera">{(res.veredicto === 'incorrecta' ? [[1, 'Volver a practicar']] as const
              : res.veredicto === 'parcial' || res.veredicto === 'ortografia' ? [[1, 'Volver a practicar'], [2, 'Difícil']] as const
              : [[2, 'Difícil'], [3, 'Bien'], [4, 'Fácil']] as const).map(([g, txt]) => <button key={g} onClick={() => calificar(g)}>
                <b>{txt}</b><small>{intentoActual.current && formatoIntervalo(diasParaCalificacion(p, intentoActual.current, g))}</small></button>)}</div></details>}
      </div>}
      {fase === 'ortografia' && c.escritura_correctiva.termino && <div className="pila"><EscrituraCorrectiva termino={c.escritura_correctiva.termino} onHecho={avanzar} /><button className="btn" onClick={avanzar}>Continuar sin practicar escritura</button></div>}
    </div>
    {verFuente && !examenSinAyuda && <Modal titulo="Fuente del concepto" onCerrar={() => setVerFuente(false)}><PanelFuente c={c} /></Modal>}
  </div>
}
