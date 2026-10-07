import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Modal } from '../components/comunes'
import { FigureViewer } from './FigureViewer'
import { useNbme } from './NbmeProvider'
import { analizarColumnasOpciones, analizarEnunciado, normalizarTexto, preguntaConLecturasDudosas } from './texto'
import type { NbmeQuestion } from './types'
import { CorreccionErrorIA } from '../components/CorreccionErrorIA'
import { RecuperacionTrasFallo } from './RecuperacionTrasFallo'
import './nbme.css'

interface LoadedFigure { assetId: string; alt: string; url: string }

/**
 * Presenta el enunciado importado: prosa en párrafos y, cuando la extracción
 * permite reconstruirla sin ambigüedad, la tabla de laboratorio en dos columnas.
 */
function Enunciado({ texto }: { texto: string }) {
  const bloques = useMemo(() => analizarEnunciado(texto), [texto])
  return <div className="nbme-stem" lang="en">
    {bloques.map((bloque, indice) => bloque.tipo === 'parrafo'
      ? <p key={indice} className="nbme-stem-parrafo">{bloque.texto}</p>
      : bloque.tipo === 'tabla'
        ? <div key={indice} className="nbme-lab-scroll nbme-matrix-scroll" tabIndex={0} role="region" aria-label="Tabla del enunciado">
          <table className="nbme-lab-tabla nbme-matrix">
            <thead><tr>{bloque.columnas.map((columna, i) => <th key={i} scope="col">{columna}</th>)}</tr></thead>
            <tbody>{bloque.filas.map((fila, i) => <tr key={i}>{fila.map((celda, j) => j === 0
              ? <th key={j} scope="row">{celda}</th> : <td key={j}>{celda}</td>)}</tr>)}</tbody>
          </table>
        </div>
      : <figure key={indice} className="nbme-lab">
        <figcaption className="nbme-lab-encabezado">{bloque.encabezado}</figcaption>
        <div className="nbme-lab-scroll" tabIndex={0} role="region" aria-label="Laboratorio de la pregunta">
          <table className="nbme-lab-tabla">
            <tbody>
              {bloque.filas.map((fila, i) => <tr key={i}>
                <th scope="row">{fila.etiqueta}</th>
                <td>{fila.valor}{fila.dudoso && <abbr className="nbme-dudoso" title="Lectura dudosa en la fuente: contrasta este valor con el PDF">?</abbr>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </figure>)}
  </div>
}

/** Texto de apoyo (explicaciones y objetivos) con la misma tipografía corregida. */
function TextoFuente({ texto, className = 'nbme-source-text' }: { texto: string; className?: string }) {
  const limpio = useMemo(() => normalizarTexto(texto), [texto])
  return <div className={className} lang="en">{limpio.split('\n').map((parrafo, indice) =>
    <p key={indice} className="nbme-parrafo-fuente">{parrafo}</p>)}</div>
}

function decodeFigure(url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const finish = (error?: Error) => {
      image.onload = null; image.onerror = null
      signal.removeEventListener('abort', abort)
      if (error) reject(error); else resolve()
    }
    const abort = () => { image.src = ''; finish(new DOMException('Aborted', 'AbortError')) }
    image.onload = () => image.naturalWidth > 0 ? finish() : finish(new Error('Invalid figure'))
    image.onerror = () => finish(new Error('Invalid figure'))
    signal.addEventListener('abort', abort, { once: true })
    image.src = url
  })
}

function useQuestionFigures(question: NbmeQuestion | null, target: RefObject<HTMLDivElement>) {
  const { loadFigure } = useNbme()
  const [figures, setFigures] = useState<LoadedFigure[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [loadedIdentity, setLoadedIdentity] = useState('')
  const identity = question ? `${question.id}:${question.revision}` : ''
  const assets = question?.figures ?? []
  useEffect(() => {
    const controller = new AbortController()
    let urls: string[] = []
    setFigures([])
    setError(false)
    setLoading(false)
    setLoadedIdentity('')
    let observer: IntersectionObserver | undefined
    let started = false
    const load = () => {
      if (started || controller.signal.aborted) return
      started = true
      observer?.disconnect()
      setLoading(true)
      Promise.all(assets.map(figure => loadFigure(figure.assetId, controller.signal))).then(async blobs => {
        if (controller.signal.aborted) return
        urls = blobs.map(blob => URL.createObjectURL(blob))
        await Promise.all(urls.map(url => decodeFigure(url, controller.signal)))
        if (controller.signal.aborted) return
        setFigures(assets.map((figure, index) => ({ ...figure, url: urls[index] })))
        setLoadedIdentity(identity)
        setLoading(false)
      }).catch(() => {
        urls.forEach(url => URL.revokeObjectURL(url)); urls = []
        if (!controller.signal.aborted) { setError(true); setLoading(false) }
      })
    }
    if (assets.length) {
      if (typeof IntersectionObserver === 'undefined' || !target.current) load()
      else {
        observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) load() }, { rootMargin: '200px' })
        observer.observe(target.current)
      }
    }
    return () => { observer?.disconnect(); controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); urls = [] }
  }, [identity, retry, loadFigure, target])
  const ready = loadedIdentity === identity && figures.length === assets.length
  return { figures: ready ? figures : [], loading, error, ready, waiting: assets.length > 0 && !ready && !loading && !error, retry: () => setRetry(value => value + 1) }
}

/**
 * `modoPaso` presenta UNA pregunta y devuelve el control: el orquestador de la
 * sesión mixta decide qué viene después y es quien llama a `nbme.nextQuestion()`
 * antes de volver a montar el reproductor. En ese modo la cuenta y el progreso los
 * pone quien orquesta, así que aquí no se repiten, y `avisoFallo` dice adónde va un
 * fallo. Corregida la respuesta, el foco va a «Continuar»: con el teclado basta con
 * la letra, Intro, leer, Intro.
 */
export function NbmePlayer({ onSalir, onEstudiar, onBuscar, modoPaso = false, onPasoCompleto, etiquetaSalida, avisoFallo, recuperarErrores = false, onRecuperacion }:
  { onSalir: () => void; onEstudiar?: (ids: string[]) => void; onBuscar?: (question: NbmeQuestion) => void
    modoPaso?: boolean; onPasoCompleto?: () => void; etiquetaSalida?: string; avisoFallo?: string; recuperarErrores?: boolean; onRecuperacion?: (activa: boolean) => void }) {
  const {
    catalog, state, currentSession, sessionView, currentQuestion, selectedOption, currentFeedback, questionLoading,
    loading, busy, error, storageWarning, syncStatus, selectAnswer, checkAnswer, nextQuestion, pauseSession,
    retryQuestionLoad, syncNow, budgetReached, continueWithoutBudget,
  } = useNbme()
  const [recuperando, setRecuperando] = useState(false)
  const [expandedFigure, setExpandedFigure] = useState<LoadedFigure | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const feedbackRef = useRef<HTMLHeadingElement>(null)
  const continuarRef = useRef<HTMLButtonElement>(null)
  const figureRef = useRef<HTMLDivElement>(null)
  const figures = useQuestionFigures(currentQuestion, figureRef)
  const columnasOpciones = useMemo(() => currentQuestion ? analizarColumnasOpciones(currentQuestion.stem, currentQuestion.options) : null, [currentQuestion])
  const feedback = sessionView?.phase === 'feedback' ? currentFeedback : null
  const preguntaFeedback = useRef<{ clave: string; pregunta: NbmeQuestion } | null>(null)
  const claveFeedback = feedback ? `${currentSession?.id}:${feedback.id}:${feedback.questionId}:${feedback.revision}` : ''
  if (feedback && !feedback.conflict && currentQuestion?.id === feedback.questionId && currentQuestion.revision === feedback.revision) {
    preguntaFeedback.current = { clave: claveFeedback, pregunta: currentQuestion }
  } else if (!claveFeedback || preguntaFeedback.current?.clave !== claveFeedback || feedback?.conflict) {
    preguntaFeedback.current = null
  }
  // La revalidación histórica puede retirar momentáneamente el objeto del caché.
  // Conservar sólo este host mientras carga evita perder su devolución asíncrona.
  const preguntaRecuperacion = currentQuestion ?? ((busy || questionLoading) && preguntaFeedback.current?.clave === claveFeedback
    ? preguntaFeedback.current.pregunta : null)

  const currentReady = !!currentQuestion && currentQuestion.status === 'ready' && currentQuestion.id === sessionView?.current?.id
    && !preguntaConLecturasDudosas(currentQuestion)
    && !!catalog?.questions.some(q => q.id === currentQuestion.id && q.status === 'ready')
  const requiredFigureUnavailable = !!currentQuestion?.figureRequired && (!currentQuestion.figures.length || !figures.ready)
  const canAnswer = currentReady && !!selectedOption && !questionLoading && !busy && !requiredFigureUnavailable && !feedback
  const revisionPosterior = !!currentQuestion && !!catalog?.questions.some(q => q.id === currentQuestion.id && q.revision !== currentQuestion.revision)

  useEffect(() => {
    setExpandedFigure(null)
    if (!questionLoading && sessionView?.phase === 'question') titleRef.current?.focus()
    if (sessionView?.phase === 'feedback') (modoPaso ? continuarRef : feedbackRef).current?.focus({ preventScroll: modoPaso })
  }, [sessionView?.current?.position, sessionView?.phase, currentQuestion?.id, currentQuestion?.revision, questionLoading, modoPaso])

  useEffect(() => {
    setRecuperando(false); onRecuperacion?.(false)
  }, [currentSession?.id, sessionView?.current?.position, sessionView?.phase, sessionView?.current?.id, sessionView?.current?.revision, feedback?.conflict, onRecuperacion])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || feedback || questionLoading || busy || !currentReady) return
      if (event.target instanceof Element && event.target.closest('textarea, input:not([type="radio"]), select, [contenteditable="true"], [role="dialog"]')) return
      // Intro comprueba lo elegido con la letra. Se consume aquí: si no, la misma pulsación
      // activaría «Continuar», que recibe el foco al corregir. Sobre un botón manda el botón.
      if (event.key === 'Enter') {
        if (!canAnswer || (event.target instanceof Element && event.target.closest('button, a, summary'))) return
        event.preventDefault()
        checkAnswer()
        return
      }
      const option = currentQuestion?.options.find(item => item.id.toLocaleLowerCase() === event.key.toLocaleLowerCase())
      if (option) { event.preventDefault(); selectAnswer(option.id) }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [currentQuestion, feedback, questionLoading, busy, currentReady, selectAnswer, canAnswer, checkAnswer])

  const pause = () => { pauseSession(); onSalir() }
  const syncText = storageWarning ? (syncStatus.state === 'synced' ? 'Progreso sincronizado; revisa el aviso de almacenamiento local.' : 'Revisa el aviso de guardado antes de cerrar la página.')
    : syncStatus.state === 'synced' ? 'Progreso sincronizado.'
    : syncStatus.state === 'syncing' ? 'Sincronizando progreso…'
      : syncStatus.state === 'pending' ? 'Guardado en este dispositivo; sincronización pendiente.'
        : syncStatus.state === 'offline' ? 'Sin conexión. El progreso está guardado en este dispositivo.'
          : syncStatus.state === 'error' ? 'No se pudo sincronizar todavía. Tu sesión sigue guardada en este dispositivo.'
            : 'Preparando el guardado de la sesión…'

  if (loading) return <div className="nbme-player tarjeta" role="status">Preparando tu sesión…</div>
  if (!currentSession || !sessionView) return <div className="nbme-player tarjeta nbme-empty"><h1>Elige una sesión de preguntas</h1>
    <p className="sutil">Puedes iniciar una nueva o retomar una guardada.</p><button className="btn principal" onClick={onSalir}>{etiquetaSalida ?? 'Elegir preguntas'}</button></div>

  const scoredFirst = sessionView.firstAnswered - sessionView.firstConflicts
  if (sessionView.phase === 'complete') return <section className="nbme-player tarjeta pila" aria-labelledby="nbme-complete-title">
    <div><span className="etq verde">Sesión terminada</span><h1 id="nbme-complete-title" style={{ marginTop: 10 }}>Práctica completada</h1></div>
    <p>{currentSession.title}</p>
    <dl className="nbme-counts"><div><dt>Aciertos en primera vuelta</dt><dd>{sessionView.firstCorrect}/{scoredFirst}</dd></div>
      <div><dt>Reintentos realizados</dt><dd>{sessionView.retryCount}</dd></div></dl>
    {sessionView.firstConflicts > 0 && <p className="sutil">{sessionView.firstConflicts} respuestas distintas enviadas desde varios dispositivos quedaron fuera del resultado inicial.</p>}
    <p className="sutil">Las correcciones posteriores se guardan por separado y no cambian tu resultado de primera vuelta.</p>
    {storageWarning && <div className="nbme-error" role="alert"><p>{storageWarning}</p><button className="btn" onClick={() => void syncNow()}>Sincronizar ahora</button></div>}
    <p className="nbme-status" role="status">{syncText}</p>
    {(syncStatus.state === 'error' || syncStatus.state === 'offline') && <button className="btn" disabled={busy} onClick={() => void syncNow()}>Reintentar sincronización</button>}
    <div className="nbme-actions"><button className="btn principal" onClick={onSalir}>{etiquetaSalida ?? 'Volver a elegir contenido'}</button></div>
  </section>

  const source = currentQuestion ? `NBME ${currentQuestion.form} · sección ${currentQuestion.section} · pregunta ${currentQuestion.item} · página ${currentQuestion.page}` : 'Pregunta de aplicación'
  const reintentoTrasExplicacion = (sessionView.current?.round ?? 0) > 0
  const yaPracticada = !!currentQuestion && Object.values(state.attempts).some(attempt =>
    attempt.questionId === currentQuestion.id
    && !(attempt.sessionId === currentSession.id && attempt.position === sessionView.current?.position)
    && (!feedback || attempt.submittedAt < feedback.submittedAt))
  const distractorElegido = feedback && !feedback.correct && !feedback.conflict
    ? currentQuestion?.distractorExplanations?.[feedback.optionId] : null
  const reviewedLinks = (currentQuestion?.conceptLinks ?? []).filter(link => link.review === 'reviewed')
  const relatedLinks = reviewedLinks.length ? reviewedLinks : (currentQuestion?.conceptLinks ?? []).filter(link => link.review === 'suggested' && link.confidence >= 0.74)
  const conceptIds = [...new Set(relatedLinks.map(link => link.conceptId))].slice(0, 3)
  const suggestedLinks = conceptIds.length > 0 && !reviewedLinks.length

  return <div className={`nbme-player pila${recuperando ? ' recuperando' : ''}`}>
    <p className="mini">National Board of Medical Examiners (NBME)</p>
    <header className={`nbme-player-header${modoPaso ? ' paso' : ''}`}>
      {!modoPaso && <div><p className="mini">{currentSession.title}</p><p className="sutil">Primera vuelta: {sessionView.firstAnswered}/{sessionView.initialCount} · Correcciones pendientes: {sessionView.pendingErrors}</p></div>}
      <button className="btn fantasma" onClick={pause}>{etiquetaSalida ?? 'Pausar y guardar'}</button>
    </header>
    {!modoPaso && <progress className="nbme-session-progress" aria-label="Preguntas respondidas en primera vuelta" value={sessionView.firstAnswered} max={sessionView.initialCount || 1} />}
    {budgetReached && !feedback && <section className="tarjeta pila" aria-label="Aviso de pausa"><div><h2>Un momento para decidir</h2>
      <p className="sutil">Llegaste al tiempo que elegiste. Puedes pausar o continuar esta sesión.</p></div>
      <div className="nbme-actions"><button className="btn" onClick={pause}>Pausar y guardar</button><button className="btn principal" onClick={continueWithoutBudget}>Continuar sin aviso de tiempo</button></div>
    </section>}
    {error && <div className="nbme-error" role="alert"><p>{error}</p></div>}
    {revisionPosterior && <p className="mini" role="status">Este bloque conserva su versión guardada. Hay una revisión publicada posterior; tu respuesta se registra contra la versión que estás viendo.</p>}
    {storageWarning && <div className="nbme-error" role="alert"><p>{storageWarning}</p><button className="btn" onClick={() => void syncNow()}>Sincronizar ahora</button></div>}
    {questionLoading ? <div className="tarjeta" role="status">Cargando pregunta…</div>
      : !currentQuestion ? <div className="tarjeta pila"><p>No se pudo cargar esta pregunta. Tu posición está guardada.</p>
        <div className="nbme-actions"><button className="btn principal" disabled={busy} onClick={() => void retryQuestionLoad()}>Reintentar</button><button className="btn" onClick={pause}>Pausar sesión</button></div></div>
        : !currentReady ? <div className="tarjeta pila"><h2>Pregunta pendiente de revisión</h2><p className="sutil">Esta versión no puede calificarse. Tu sesión permanece guardada.</p><button className="btn" onClick={pause}>{etiquetaSalida ?? 'Volver a elegir contenido'}</button></div>
          : <>
            <section className="tarjeta nbme-question" aria-labelledby="nbme-question-title">
              <h1 id="nbme-question-title" className="nbme-question-heading" tabIndex={-1} ref={titleRef}>
                {sessionView.current?.round ? 'Vuelve a intentarlo' : modoPaso ? 'Pregunta NBME' : `Pregunta ${(sessionView.current?.position ?? 0) + 1} de ${sessionView.initialCount}`}
              </h1>
              <p className="mini">{yaPracticada ? 'Pregunta ya practicada aquí' : 'Pregunta nueva aquí'}
                {reintentoTrasExplicacion && ' · Corrección tras ver la explicación'}</p>
              <Enunciado texto={columnasOpciones?.enunciado ?? currentQuestion.stem} />
              {currentQuestion.figureRequired && !currentQuestion.figures.length && <p role="alert" className="nbme-error">Falta una figura necesaria para responder esta pregunta.</p>}
              {!!currentQuestion.figures.length && <div id="nbme-figures" ref={figureRef} tabIndex={-1} className="nbme-question-images">
                {figures.waiting && <p className="sutil nbme-figure-placeholder">Figura de la pregunta</p>}
                {figures.loading && <p role="status" className="sutil nbme-figure-placeholder">Cargando figura…</p>}
                {figures.error && <div className="nbme-error" role="alert"><p>No se pudo cargar la figura.{currentQuestion.figureRequired && ' Necesitas la figura antes de comprobar la respuesta.'}</p><button className="btn" onClick={figures.retry}>Reintentar figura</button></div>}
                {figures.figures.map(figure => <button type="button" className="nbme-image-button" key={figure.assetId}
                onClick={() => setExpandedFigure(figure)} aria-label={`Ampliar: ${figure.alt || 'figura de la pregunta'}`}>
                <img src={figure.url} alt={figure.alt || 'Figura de la pregunta'} decoding="async" /><span>Ampliar figura</span>
              </button>)}</div>}
              <form onSubmit={event => { event.preventDefault(); if (canAnswer) checkAnswer() }}>
                <fieldset id="nbme-answers" tabIndex={-1} className="nbme-options" disabled={!!feedback || busy}>
                  <legend>Selecciona una respuesta</legend>
                  {currentQuestion.options.map(option => {
                    const isSelected = selectedOption === option.id
                    const isCorrect = !!feedback && !feedback.conflict && option.id === currentQuestion.answer
                    const isIncorrect = !!feedback && !feedback.conflict && isSelected && !feedback.correct
                    return <label key={option.id} className={`nbme-option${isSelected ? ' selected' : ''}${isCorrect ? ' correct' : ''}${isIncorrect ? ' incorrect' : ''}`}>
                      <input type="radio" name={`nbme-answer-${sessionView.current?.position}`} value={option.id} checked={isSelected} onChange={() => selectAnswer(option.id)} />
                      <span className="nbme-option-letter">{option.id}.</span><span className="nbme-option-text" lang="en">
                        {columnasOpciones ? <span className="nbme-option-cells" style={{ gridTemplateColumns: `repeat(${columnasOpciones.columnas.length}, minmax(0, 1fr))` }}>
                          {columnasOpciones.filas[option.id].map((valor, i) => <span key={i} className="nbme-option-cell"><small>{columnasOpciones.columnas[i]}</small><span>{valor}</span></span>)}
                        </span> : normalizarTexto(option.text)}
                        {isCorrect && <span className="nbme-option-state" lang="es"><span aria-hidden="true">✓</span> Respuesta correcta</span>}
                        {isIncorrect && <span className="nbme-option-state" lang="es"><span aria-hidden="true">×</span> Tu respuesta incorrecta</span>}
                      </span>
                    </label>
                  })}
                </fieldset>
                {!feedback && <><p className="mini" style={{ marginTop: 10 }}>También puedes seleccionar con la letra de la opción.</p>
                  <div className="nbme-actions" style={{ marginTop: 16 }}><button className="btn principal" type="submit" disabled={!canAnswer}>Comprobar respuesta</button></div></>}
              </form>
            </section>

            {feedback && <section className={`tarjeta nbme-feedback pila ${feedback.conflict ? 'conflict' : feedback.correct ? 'correct' : 'incorrect'}`} aria-labelledby="nbme-feedback-title">
              <div><h2 ref={feedbackRef} tabIndex={-1} id="nbme-feedback-title">{feedback.conflict ? 'Respuesta por revisar' : feedback.correct ? 'Respuesta correcta' : 'Vamos a repasarla'}</h2>
                <p className="sutil" role="status">{feedback.conflict ? 'Se recibieron respuestas distintas desde varios dispositivos. Este intento no cuenta como acierto inicial.'
                  : feedback.correct ? 'Tu respuesta quedó registrada.'
                    : modoPaso ? avisoFallo ?? 'Vuelve en las cajas de los próximos días.'
                      : 'Esta pregunta volverá durante la práctica. Puedes pausar cuando lo necesites.'}</p></div>
              {!feedback.conflict && <p className="nbme-respuesta"><b>Respuesta: {currentQuestion.answer}.</b> <span lang="en">{normalizarTexto(currentQuestion.options.find(option => option.id === currentQuestion.answer)?.text ?? '')}</span></p>}
              {reintentoTrasExplicacion && <p className="mini">Esta corrección tuvo la explicación previa. Se registra aparte de la primera vuelta.</p>}
              {currentQuestion.objective && <div className="session-feedback-key"><h3>Objetivo del aprendizaje</h3><TextoFuente texto={currentQuestion.objective} /></div>}
              {distractorElegido && <div className="nbme-distractor session-feedback-key"><h3>Por qué tu opción no responde</h3><b>{feedback.optionId}. <span lang="en">{normalizarTexto(currentQuestion.options.find(option => option.id === feedback.optionId)?.text ?? '')}</span></b><TextoFuente texto={distractorElegido} /></div>}
              {currentQuestion.explanation && currentQuestion.explanation !== currentQuestion.objective && <div><h3>Fundamento de la respuesta</h3><TextoFuente texto={currentQuestion.explanation} /></div>}
              {currentQuestion.options.some(option => option.id !== currentQuestion.answer && (!distractorElegido || option.id !== feedback.optionId) && currentQuestion.distractorExplanations?.[option.id]) && <details className="nbme-details"><summary>Por qué las otras opciones no</summary>
                <div className="pila nbme-distractores">{currentQuestion.options.filter(option => option.id !== currentQuestion.answer && (!distractorElegido || option.id !== feedback.optionId) && currentQuestion.distractorExplanations?.[option.id]).map(option => <div key={option.id} className="nbme-distractor"><b>{option.id}. <span lang="en">{normalizarTexto(option.text)}</span></b><TextoFuente texto={currentQuestion.distractorExplanations?.[option.id] ?? ''} /></div>)}</div>
              </details>}
              <p className="mini">Fuente: {source}. Explicación procedente del material importado.</p>
              {suggestedLinks && <p className="mini">Relación sugerida; confirma que corresponde al fundamento.</p>}
              <div className="nbme-actions"><button ref={continuarRef} className="btn principal" disabled={busy}
                onClick={modoPaso && onPasoCompleto ? onPasoCompleto : nextQuestion}>Continuar</button>
                {!recuperarErrores && conceptIds.length > 0 && onEstudiar && <button className="btn fantasma" onClick={() => { pauseSession(); onEstudiar(conceptIds) }}>{suggestedLinks ? 'Explorar conceptos relacionados' : 'Repasar fundamento'}</button>}
                {!recuperarErrores && conceptIds.length === 0 && onBuscar && <button className="btn fantasma" onClick={() => { pauseSession(); onBuscar(currentQuestion) }}>Explorar fundamentos</button>}
              </div>
              {!recuperarErrores && !feedback.correct && !feedback.conflict && <CorreccionErrorIA key={`${feedback.id}:${feedback.optionId}`}
                peticion={{ tipo: 'nbme', questionId: currentQuestion.id, revision: currentQuestion.revision, optionId: feedback.optionId }} />}
            </section>}
          </>}
    {recuperarErrores && feedback && !feedback.conflict && preguntaRecuperacion && <RecuperacionTrasFallo
      key={`${feedback.id}:${preguntaRecuperacion.revision}`} pregunta={preguntaRecuperacion} intento={feedback}
      onActividad={activa => { setRecuperando(activa); onRecuperacion?.(activa) }} onSiguiente={modoPaso && onPasoCompleto ? onPasoCompleto : nextQuestion} />}
    <div className="nbme-status" role="status"><span>{syncText}</span>
      {(syncStatus.state === 'error' || syncStatus.state === 'offline') && <button className="btn pequeno fantasma" disabled={busy} style={{ marginLeft: 8 }} onClick={() => void syncNow()}>Reintentar</button>}
    </div>
    {expandedFigure && <Modal titulo="Figura de la pregunta" onCerrar={() => setExpandedFigure(null)} ancho={1100}><FigureViewer key={expandedFigure.url} url={expandedFigure.url} alt={expandedFigure.alt || 'Figura ampliada de la pregunta'} /></Modal>}
  </div>
}
