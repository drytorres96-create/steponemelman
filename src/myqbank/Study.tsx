import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { Interaccion, usaTextoLibre, type Resultado } from '../components/interacciones'
import { calificarConIA } from '../lib/calificacion-ia'
import { EVALUADOR_VERSION } from '../lib/normalize'
import { RelojActividad } from '../screens/sesion'
import type { Intento } from '../srs/tipos'
import { Enunciado, useQuestionFigures, type LoadedFigure } from '../nbme/NbmePlayer'
import { analizarColumnasOpciones, normalizarTexto, preguntaConLecturasDudosas } from '../nbme/texto'
import { FigureViewer } from '../nbme/FigureViewer'
import { EditorialVariantBadge } from '../nbme/EditorialVariantBadge'
import { Modal } from '../components/comunes'
import { RecuperacionTrasFallo } from '../nbme/RecuperacionTrasFallo'
import { TutorClaude } from '../components/tutor/TutorClaude'
import { pareceCasoClinico, sugerenciasDePregunta } from '../lib/sugerencias-chat'
import { Button, Card, Icon, Rings, Segmented, StateMessage } from './components'
import { blockOpportunity, blockTime, timeBlock, learnConcept, draftBlock, markBlock, patchBlock, type StudyBlock } from './blocks'
import { crearUUID } from '../store/model'
import { nbmePosition } from './selection'
import { canReveal } from './contracts'
import { recentLearning } from './learning'
import { recheckAcceptedAnswer } from './grading'
import { Explanation } from './Explanation'
import { ExpectedAnswer } from './ExpectedAnswer'
import { Highlighter, HighlightText, type HighlightSource } from './HighlightText'
import { LabReference, useLabReference } from './LabReference'
import { useAnnotations } from './AnnotationProvider'

export function Study({ block, onExit, onRetry, onModeChange, busy = false }: { block: StudyBlock; onExit: () => void; onRetry: (block: StudyBlock) => Promise<void>; onModeChange: (block: StudyBlock, mode: StudyBlock['mode']) => Promise<void>; busy?: boolean }) {
  return <Highlighter key={block.id} selectionKey={`${block.cursor}`}><StudyBody block={block} onExit={onExit} onRetry={onRetry} onModeChange={onModeChange} busy={busy}/></Highlighter>
}
function StudyBody({ block, onExit, onRetry, onModeChange, busy = false }: { block: StudyBlock; onExit: () => void; onRetry: (block: StudyBlock) => Promise<void>; onModeChange: (block: StudyBlock, mode: StudyBlock['mode']) => Promise<void>; busy?: boolean }) {
  const app = useApp(), nbme = useNbme(), annotations = useAnnotations()
  const labView = useLabReference()
  const latestApp = useRef(app); latestApp.current = app
  const [rail, setRail] = useState(true), [labs, setLabs] = useState(false), [endOpen, setEndOpen] = useState(false)
  const [expanded, setExpanded] = useState<LoadedFigure | null>(null), [grading, setGrading] = useState(false), [message, setMessage] = useState('')
  const [recovery, setRecovery] = useState(false), [recovering, setRecovering] = useState(false)
  const endTitle = useId()
  const dialog = useRef<HTMLDialogElement>(null), figureRoot = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const feedback = useRef<HTMLDivElement>(null)
  const questionPane = useRef<HTMLDivElement>(null), explanationPane = useRef<HTMLElement>(null)
  const lastFeedback = useRef<{ opportunity: string; reveal: boolean } | null>(null)
  const submitLock = useRef(false), current = useRef(block); current.current = block
  const alive = useRef(true), abort = useRef(new AbortController()), clock = useRef(new RelojActividad())
  const timerRun = useRef(crearUUID())
  const entry = block.entries[block.cursor], concept = entry.kind === 'concept' ? entry.concept : null
  const qPosition = nbmePosition(block.entries, block.cursor)
  const question = entry.kind === 'nbme' ? nbme.sessionQuestions.find(q => q.id === entry.id && q.revision === entry.revision) ?? null : null
  const figures = useQuestionFigures(question, figureRoot)
  const columns = useMemo(() => question ? analizarColumnasOpciones(question.stem, question.options) : null, [question])
  const opportunity = blockOpportunity(block.id, block.cursor)
  const conceptAttempt = concept ? app.estado.progreso[concept.concept_id]?.intentos.find(i => i.session_id === block.id && i.pregunta_id === opportunity) : undefined
  const questionAttempt = entry.kind === 'nbme' ? nbme.state.attempts[`${block.id}:${qPosition}`] : undefined
  const submitted = !!conceptAttempt || !!questionAttempt, closed = block.completedAt !== undefined
  const learning = concept ? block.learning?.[block.cursor] : undefined
  const learningOpen = !!learning && !submitted && (learning.open || closed)
  const handled = submitted || !!learning
  const labsLeft = handled || closed
  const reveal = learningOpen || canReveal(block.mode, submitted, closed)
  const result: Resultado | null = conceptAttempt ? { veredicto: conceptAttempt.resultado ?? 'revision', tipoError: conceptAttempt.tipo_error,
    recuperacionActiva: conceptAttempt.recuperacion_activa, respuestaDada: conceptAttempt.respuesta_dada ?? '' } : null
  const uncertain = result?.veredicto === 'revision' || questionAttempt?.conflict
  const assisted = !!conceptAttempt && (conceptAttempt.explicacion_previa || conceptAttempt.fuente_consultada || conceptAttempt.pistas_usadas > 0 || !!learning)
  const correct = conceptAttempt ? ['correcta', 'ortografia'].includes(conceptAttempt.resultado ?? '') : questionAttempt?.correct
  const partial = conceptAttempt?.resultado === 'parcial'
  const canRecheck = !!concept && !!conceptAttempt && usaTextoLibre(concept) && !!recheckAcceptedAnswer(concept, conceptAttempt, Date.now())
  const source: HighlightSource = { material: entry.kind, sourceId: entry.id, sourceRevision: entry.revision,
    variantId: concept?.variante_id ?? '', editorialVersion: '' }
  const states = block.entries.map((item, position) => {
    const a = item.kind === 'concept' ? app.estado.progreso[item.id]?.intentos.find(i => i.session_id === block.id && i.pregunta_id === blockOpportunity(block.id, position)) : undefined
    const n = item.kind === 'nbme' ? nbme.state.attempts[`${block.id}:${nbmePosition(block.entries, position)}`] : undefined
    if (!a && !n) return block.learning?.[position] ? 'assisted' : block.skipped[position]?.value ? 'skipped' : 'unanswered'
    if (!canReveal(block.mode, true, closed)) return 'saved'
    if (a?.resultado === 'revision' || n?.conflict) return 'pending'
    if (a && (a.explicacion_previa || a.fuente_consultada || a.pistas_usadas > 0 || block.learning?.[position])) return 'assisted'
    if (a?.resultado === 'parcial') return 'partial'
    return a ? ['correcta', 'ortografia'].includes(a.resultado ?? '') ? 'correct' : 'incorrect' : n!.correct ? 'correct' : 'incorrect'
  })
  const completed = states.filter(s => !['skipped', 'unanswered'].includes(s)).length
  const studied = block.entries.filter((item, position) => item.kind === 'concept' && block.learning?.[position] && !app.estado.progreso[item.id]?.intentos.some(i => i.session_id === block.id && i.pregunta_id === blockOpportunity(block.id, position))).length
  const answered = completed - studied
  const assistedCount = states.filter(s => s === 'assisted').length
  const evaluated = states.filter(s => ['correct', 'incorrect', 'partial'].includes(s)).length
  const correctCount = states.filter(s => s === 'correct').length
  const ready = question?.status === 'ready' && !preguntaConLecturasDudosas(question) && nbme.currentSession?.id === block.id
    && nbme.sessionView?.current?.position === qPosition && !!nbme.catalog?.questions.some(q => q.id === entry.id && q.status === 'ready')
  const canSubmitNbme = !busy && ready && !closed && !submitted && !!nbme.selectedOption && !nbme.busy && (!question?.figureRequired || figures.ready)
  // Record exposure when feedback is revealed, including map/arrow navigation and reloads.
  useEffect(() => {
    if (handled && reveal && !block.reviewed[block.cursor]?.value) {
      latestApp.current.guardarBloque(markBlock(current.current, 'reviewed', block.cursor, true))
    }
  }, [opportunity, handled, reveal, block.reviewed[block.cursor]?.value])
  useEffect(() => { alive.current = true; const controller = new AbortController(); abort.current = controller; return () => { alive.current = false; controller.abort() } }, [])
  useEffect(() => { if (endOpen) dialog.current?.showModal(); else dialog.current?.close() }, [endOpen])
  // React reuses these panels between items. Do not carry the end of one
  // explanation into the next question, including navigation through answered items.
  useLayoutEffect(() => {
    if (questionPane.current) questionPane.current.scrollTop = 0
    if (explanationPane.current) explanationPane.current.scrollTop = 0
    heading.current?.focus({ preventScroll: true })
    if (matchMedia('(max-width: 960px), (max-height: 600px)').matches) heading.current?.scrollIntoView({ block: 'start' })
  }, [opportunity])
  useEffect(() => {
    const previous = lastFeedback.current
    lastFeedback.current = { opportunity, reveal }
    // Feedback takes focus only when it is newly revealed on this item. Opening
    // an already-answered item starts at its stem, not halfway down the page.
    if (reveal && previous?.opportunity === opportunity && !previous.reveal && matchMedia('(max-width: 960px), (max-height: 600px)').matches) {
      feedback.current?.focus({ preventScroll: true })
      feedback.current?.scrollIntoView({ block: 'start' })
    }
  }, [reveal, opportunity])
  useEffect(() => {
    setExpanded(null); setMessage(''); setRecovery(false); setRecovering(false); submitLock.current = false
    if (entry.kind === 'nbme' && nbme.currentSession?.id === block.id) nbme.goToQuestion(qPosition)
    nbme.setEngaged(entry.kind === 'nbme' && !closed)
    if (concept && !closed) app.registrarVistaConcepto(concept.concept_id, opportunity)
  }, [opportunity, nbme.currentSession?.id])
  useEffect(() => {
    const position = block.cursor
    clock.current.reiniciar(current.current.timeMs?.[position]?.[timerRun.current] ?? 0)
    const flush = () => { if (!closed && !submitted && !learningOpen) latestApp.current.guardarBloque(timeBlock(current.current, position, timerRun.current, clock.current.leer())) }
    const interval = setInterval(flush, 5000)
    window.addEventListener('pagehide', flush)
    return () => { clock.current.activar(false); flush(); clearInterval(interval); window.removeEventListener('pagehide', flush) }
  }, [opportunity, closed, submitted, learningOpen])
  useEffect(() => {
    const update = () => clock.current.activar(!closed && !submitted && !grading && !learningOpen && document.visibilityState === 'visible')
    update(); document.addEventListener('visibilitychange', update)
    return () => { clock.current.activar(false); document.removeEventListener('visibilitychange', update) }
  }, [opportunity, submitted, closed, grading, learningOpen])
  useEffect(() => {
    if (closed && nbme.currentSession?.id === block.id && nbme.currentSession.completedAt === undefined) nbme.completeSession()
  }, [closed, nbme.currentSession?.id, nbme.currentSession?.completedAt])
  const save = app.guardarBloque
  function move(position: number) {
    if (grading || recovering || busy) return
    save(patchBlock(current.current, { cursor: position }))
    if (block.entries[position].kind === 'nbme') nbme.goToQuestion(nbmePosition(block.entries, position))
  }
  function next() {
    let changed = current.current
    if (handled && reveal) changed = markBlock(changed, 'reviewed', block.cursor, true)
    else if (!handled && !closed) changed = markBlock(changed, 'skipped', block.cursor, true)
    if (block.cursor + 1 < block.entries.length) save(patchBlock(changed, { cursor: block.cursor + 1 }))
    else { save(changed); if (!closed) setEndOpen(true) }
  }
  function pause() { nbme.pauseSession(); save(patchBlock(current.current, { paused: true })); onExit() }
  const register = (r: Resultado, duration: number, ai: boolean, pending = false, reason?: string) => {
    if (!concept) return
    const existing = latestApp.current.progresoDe(concept.concept_id).intentos.find(i => i.pregunta_id === opportunity && i.session_id === block.id)
    const attempt: Intento = { attempt_id: opportunity, session_id: block.id, ts: existing?.ts ?? Date.now(),
      calificacion: r.veredicto === 'correcta' ? 3 : r.veredicto === 'incorrecta' || r.veredicto === 'revision' ? 1 : 2,
      resultado: r.veredicto, interaccion: concept.interaccion.recomendada, recuperacion_activa: r.recuperacionActiva,
      pistas_usadas: 0, ms: existing?.ms ?? duration, tipo_error: r.tipoError, confianza_declarada: null, respuesta_dada: r.respuestaDada,
      pregunta_id: opportunity, pregunta_version: entry.revision, evaluador_version: EVALUADOR_VERSION, fuente_consultada: false,
      explicacion_previa: !!existing?.explicacion_previa || !!block.retryOf || !!current.current.learning?.[block.cursor] || !!block.assistedConceptIds?.includes(concept.concept_id) || recentLearning(latestApp.current.estado, concept.concept_id, existing?.ts ?? Date.now()), modo: block.mode === 'test' ? 'examen' : 'repaso',
      tipo_evidencia: concept.interaccion.recomendada === 'caso_clinico' ? 'aplicacion' : r.recuperacionActiva ? 'recuerdo' : 'discriminacion',
      ...(concept.variante_id ? { variante_id: concept.variante_id, primera_presentacion: !app.progresoDe(concept.concept_id).intentos.some(t => t.variante_id === concept.variante_id) } : {}),
      ...(ai ? { calificado_por_ia: true, motivo_calificacion_ia: (reason ?? '').slice(0, 200) } : {}), ...(existing && !pending ? { calificacion_actualizada_en: Date.now() } : {}) }
    app.registrarIntento(concept.concept_id, attempt)
  }
  async function submitConcept(r: Resultado) {
    if (!concept || learningOpen || busy || submitLock.current || closed || conceptAttempt && conceptAttempt.resultado !== 'revision') return
    submitLock.current = true; clock.current.activar(false)
    const duration = blockTime(timeBlock(current.current, block.cursor, timerRun.current, clock.current.leer()), block.cursor)
    if (usaTextoLibre(concept) && r.respuestaDada.trim() && !['correcta', 'ortografia'].includes(r.veredicto)) {
      // The answer is durable before the optional network grading starts.
      register({ ...r, veredicto: 'revision', tipoError: 'error_por_revisar' }, duration, false, true)
      setGrading(true)
      const grade = await calificarConIA({ conceptId: concept.concept_id, answer: r.respuestaDada, questionId: opportunity,
        version: entry.revision, formatVersion: 3, variantId: concept.variante_id, index: block.cursor, route: block.mode === 'test' ? 'examen' : 'repaso', retry: false }, abort.current.signal)
      if (!alive.current) return
      const verdict = grade.estado === 'ok' ? grade.veredicto === 'correcta' && r.veredicto === 'ortografia' ? 'ortografia' : grade.veredicto : r.veredicto
      register({ ...r, veredicto: verdict, tipoError: verdict === 'correcta' ? 'ninguno' : verdict === 'parcial' ? 'recuerdo_incompleto' : verdict === 'revision' ? 'error_por_revisar' : verdict === 'incorrecta' ? 'confusion_conceptos' : r.tipoError }, duration, grade.estado === 'ok' && grade.origen !== 'respuesta_aceptada', false, grade.motivo)
      setGrading(false); if (grade.estado !== 'ok') setMessage(grade.motivo)
    } else register(r, duration, false)
    save(markBlock(current.current, 'skipped', block.cursor, false))
    submitLock.current = false
  }
  function teach(open: boolean) {
    if (!concept || submitted || closed || grading || busy) return
    clock.current.activar(false)
    const timed = timeBlock(current.current, block.cursor, timerRun.current, clock.current.leer())
    save(learnConcept(timed, block.cursor, open))
    if (!open) { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'nearest' }) }
  }
  function showQuestion() {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  return <>
    {nbme.error && entry.kind === 'nbme' && <p role="alert">{nbme.error}</p>}
    <div className="mq-study-tools"><div className="mq-inline"><Button aria-label="Toggle question navigator" aria-pressed={rail} onClick={() => setRail(v => !v)}><Icon name="rail"/></Button><Segmented label="Study mode" value={block.mode} disabled={busy || grading || recovering} options={[{value:'tutor',label:'Tutor'},{value:'test',label:'Test'}]} onChange={mode => { if (mode !== block.mode) { const timed = timeBlock(current.current, block.cursor, timerRun.current, clock.current.leer()); save(timed); void onModeChange(timed, mode) } }}/><span className="mq-mode-help">Changing mode starts a new block.</span><span className="mq-small mq-muted">{closed ? 'Block complete' : `${answered} answers saved${studied ? ` · ${studied} studied with help` : ''}`}</span></div>
      <div className="mq-inline"><Button aria-label="Previous question" disabled={!block.cursor || grading || recovering || busy} onClick={() => move(block.cursor - 1)}><Icon name="back"/></Button><span className="mq-position">{block.cursor + 1} / {block.entries.length}</span><Button aria-label="Next question" disabled={block.cursor === block.entries.length - 1 || grading || recovering || busy} onClick={() => move(block.cursor + 1)}><Icon name="arrow"/></Button></div>
      <div className="mq-inline"><Button aria-pressed={!!block.flags[block.cursor]?.value} onClick={() => save(markBlock(current.current, 'flags', block.cursor, !block.flags[block.cursor]?.value))}><Icon name="flag"/>Flag</Button><Button aria-expanded={labs} onClick={() => setLabs(v => !v)}><Icon name="labs"/>Labs</Button><Button disabled={grading || recovering || busy} onClick={pause}><Icon name={closed ? 'dashboard' : 'pause'}/>{closed ? 'Dashboard' : 'Pause'}</Button><Button variant="danger" disabled={closed || grading || recovering || busy} onClick={() => setEndOpen(true)}><Icon name="stop"/>End block</Button></div>
    </div>
    <main id="mq-main" tabIndex={-1} className={`mq-study ${rail ? '' : 'mq-study--no-rail'} ${reveal ? 'mq-study--revealed' : ''} ${labs && !labsLeft ? 'mq-study--labs' : ''}`}>
      {rail && <Card className="mq-rail" aria-label="Question navigator"><Rings used={completed} noun="completed" total={block.entries.length} correct={block.mode === 'test' && !closed ? null : correctCount} evaluated={evaluated} compact/><p className="mq-small mq-muted">{block.mode === 'test' && !closed ? 'Answers saved' : `${correctCount} correct · ${assistedCount} with help · ${states.filter(s => s === 'pending').length} pending`}</p><details className="mq-mobile-map"><summary>Question map</summary></details>
        <div className="mq-question-grid">{states.map((state, i) => <button type="button" key={i} className={`mq-question-number mq-question-number--${state}`} aria-current={i === block.cursor ? 'step' : undefined} aria-label={`Question ${i + 1}, ${state}${block.flags[i]?.value ? ', flagged' : ''}`} disabled={grading || recovering || busy} onClick={() => move(i)}>{i + 1}{block.flags[i]?.value && <Icon name="flag"/>}</button>)}</div>
      </Card>}
      <div ref={questionPane} className="mq-question-pane" role="region" aria-label="Question and answer" tabIndex={0}>{closed && <div className="mq-complete" role="status"><strong>Block complete</strong><span>{correctCount} / {evaluated} {assistedCount ? 'unassisted' : 'graded'} correct · {block.entries.length - completed} unanswered{assistedCount > 0 && <> · {assistedCount} with help</>} · {states.filter(s => s === 'pending').length} pending</span><Button aria-label="Practice again" title="Practice again" disabled={busy} onClick={() => void onRetry(block)}><Icon name="retry"/></Button></div>}
        <Card className="mq-stem"><h1 ref={heading} tabIndex={-1}>Question {block.cursor + 1}</h1>
          {question && <EditorialVariantBadge question={question}/>}
          {concept ? <><p><HighlightText text={concept.evaluacion.pregunta} source={source} region="stem"/></p>{concept.contexto && <p><HighlightText text={concept.contexto} source={source} region="context"/></p>}</>
            : question ? <Enunciado texto={columns?.enunciado ?? question.stem} renderText={(text, region) => <HighlightText text={text} source={source} region={`stem:${region}`}/>}/>
              : <StateMessage state="error" title="Question unavailable" action={<Button onClick={() => void nbme.retryQuestionLoad()}>Retry</Button>}>Your saved place and answers are preserved.</StateMessage>}
          {!!question?.figures.length && <div ref={figureRoot} className="nbme-question-images">{(figures.waiting || figures.loading) && <p role="status">Loading figure…</p>}{figures.error && <p role="alert">Figure unavailable. <Button onClick={figures.retry}>Retry figure</Button></p>}{figures.figures.map(f => <Button key={f.assetId} className="nbme-image-button" onClick={() => setExpanded(f)} aria-label={`Expand figure: ${f.alt}`}><img src={f.url} alt={f.alt || 'Question figure'}/></Button>)}</div>}
        </Card>
        {labs && labsLeft && <LabReference source={source} view={labView}/>}
        {concept && !learningOpen && <div className="mq-concept-interaction"><Interaccion key={opportunity} c={concept} semilla={opportunity} bloqueado={submitted || closed || grading || busy} resultado={result} ocultarFeedback={!reveal}
          draft={block.drafts[block.cursor]?.value} onDraft={value => save(draftBlock(current.current, block.cursor, value))} english renderText={(text, region) => <HighlightText text={text} source={source} region={region}/>} onResponder={r => void submitConcept(r)}/></div>}
        {concept && !submitted && !closed && <div className="mq-learning-actions">
          {block.mode === 'tutor' ? <><Button disabled={grading || busy} onClick={() => teach(!learningOpen)}><Icon name={learningOpen ? 'retry' : 'book'}/>{learningOpen ? 'Practice recall' : learning ? 'Review explanation' : 'Learn this concept'}</Button>
            <p className="mq-small mq-muted">{learning ? 'Studied with help. Your next answer is assisted practice.' : 'Not sure yet? Read first, then try to recall it.'}</p></>
            : <><Button disabled={grading || busy} onClick={() => { const timed = timeBlock(current.current, block.cursor, timerRun.current, clock.current.leer()); save(timed); void onModeChange(timed, 'tutor') }}><Icon name="book"/>Learn in Tutor</Button><p className="mq-small mq-muted">Starts a new Tutor block. Your Test answers stay saved.</p></>}
        </div>}
        {question && <form onSubmit={e => { e.preventDefault(); if (canSubmitNbme) { const timed = timeBlock(current.current, block.cursor, timerRun.current, clock.current.leer()); nbme.checkAnswer(blockTime(timed, block.cursor)); save(markBlock(timed, 'skipped', block.cursor, false)) } }}>
          <fieldset className="mq-options" disabled={submitted || closed || !ready || nbme.busy || busy}><legend className="mq-sr-only">Choose your answer</legend>{question.options.map(option => {
            const chosen = (questionAttempt?.optionId ?? nbme.selectedOption) === option.id
            const state = reveal && !uncertain && option.id === question.answer ? 'correct' : reveal && !uncertain && chosen ? 'incorrect' : chosen ? 'selected' : ''
            return <label className={`mq-option mq-option--${state}`} key={option.id}><input type="radio" name={opportunity} checked={chosen} onChange={() => nbme.selectAnswer(option.id)}/><span className="mq-letter">{option.id}</span><span lang="en"><HighlightText text={columns ? columns.columnas.map((c, i) => `${c}: ${columns.filas[option.id][i]}`).join(' · ') : normalizarTexto(option.text)} source={source} region={`option:${option.id}`}/></span>{state === 'correct' && <small>Correct answer</small>}{state === 'incorrect' && <small>Your answer</small>}</label>
          })}</fieldset>{!submitted && !closed && <div className="mq-answer-actions"><Button type="submit" variant="primary" disabled={!canSubmitNbme}><Icon name="check"/>Submit answer</Button></div>}
        </form>}
        {submitted && !reveal && <div className="mq-saved" role="status"><Icon name="check"/><div><strong>Answer saved</strong><p>Results appear when you end the block.</p></div></div>}
        {!handled && closed && <p role="status">Not answered · no grade recorded.</p>}
        {grading && <p role="status">Answer saved · checking the response…</p>}{message && reveal && <p role="status">{message}</p>}
        <div className="mq-answer-actions"><Button disabled={grading || recovering || busy || closed && block.cursor === block.entries.length - 1} variant={handled ? 'primary' : 'ghost'} onClick={next}>{block.cursor === block.entries.length - 1 ? closed ? 'Last question' : 'Finish block' : handled ? 'Next question' : closed ? 'Next question' : 'Skip for now'}<Icon name="arrow"/></Button></div>
        <p className="mq-small mq-muted" role="status">{app.sincronizacion.estado === 'error' || nbme.syncStatus.state === 'error' || nbme.storageWarning ? 'Sync needs attention. Keep this page open and retry in Settings.' : app.sincronizacion.estado === 'sincronizado' && nbme.syncStatus.state === 'synced' ? 'Progress synced' : 'Saving progress…'}</p>
        <p className="mq-small mq-muted">{annotations.status} <Button onClick={() => void annotations.sync()}>Sync annotations</Button></p>
      </div>
      {labs && !labsLeft && <aside className="mq-labs-pane"><LabReference source={source} view={labView}/></aside>}
      {reveal && <aside ref={explanationPane} className="mq-explanation-pane" aria-label="Explanation" tabIndex={0}><div ref={feedback} tabIndex={-1} role="status" className={`mq-result ${learningOpen || partial || assisted && correct ? 'mq-result--assisted' : uncertain ? '' : correct ? 'mq-result--correct' : 'mq-result--incorrect'}`}><Icon name={learningOpen || partial ? 'book' : correct ? 'check' : 'close'}/><strong>{learningOpen ? 'Studied with help' : uncertain ? 'Answer pending review' : partial ? 'Partially correct' : correct ? assisted ? 'Correct with help' : 'Correct' : 'Incorrect'}</strong></div>
        {conceptAttempt?.calificado_por_ia && !conceptAttempt.correccion_manual && <p className="mq-small mq-muted">AI-assisted grading.{conceptAttempt.motivo_calificacion_ia && <> <span lang="es">{conceptAttempt.motivo_calificacion_ia}</span></>}</p>}
        {conceptAttempt?.correccion_manual && <p className="mq-small mq-muted">Grade corrected. Your original answer and assistance record are preserved.</p>}
        {canRecheck && <div className="mq-learning-actions"><p>Your answer matches an accepted answer for this concept.</p><Button disabled={grading || busy} onClick={() => {
          if (!concept || !conceptAttempt) return
          const corrected = recheckAcceptedAnswer(concept, conceptAttempt, Date.now())
          if (corrected) app.registrarIntento(concept.concept_id, corrected)
        }}>Recheck accepted answer</Button></div>}
        {learningOpen && <p className="mq-small mq-muted">Saved as seen, with no grade. Find it later in the Learning pool.</p>}
        {uncertain && conceptAttempt?.respuestas_en_conflicto && <p>Different answers were saved on two devices. This item remains ungraded; use Practice again after ending the block.</p>}
        {uncertain && concept && result && !conceptAttempt?.respuestas_en_conflicto && usaTextoLibre(concept) && <Button disabled={grading} onClick={() => void submitConcept(result)}>Check pending answer</Button>}
        {concept && (usaTextoLibre(concept) || concept.interaccion.recomendada === 'numerico') && <ExpectedAnswer concept={concept} source={source}/>}
        {(concept || question) && <Explanation source={concept ?? question!} highlightSource={source} figures={figures.figures}/>}
        {/* Con cualquier resultado: el tutor no espera a que falles. El chat está en español; la interfaz que lo rodea sigue en inglés. */}
        {concept && conceptAttempt && !conceptAttempt.respuestas_en_conflicto && <TutorClaude key={`${opportunity}:${conceptAttempt.respuesta_dada ?? ''}`} semilla={opportunity} amplioInicial
          numero={block.cursor + 1} estado={conceptAttempt.resultado ?? 'revision'} stemKiller={pareceCasoClinico(concept)} sugerencias={sugerenciasDePregunta(concept, 2)}
          onVerPregunta={showQuestion}
          origen={{ tipo: 'concepto', resultado: conceptAttempt.resultado ?? 'revision', presentacion: { conceptId: concept.concept_id,
            answer: (conceptAttempt.respuesta_dada ?? '').slice(0, 500), questionId: opportunity, version: entry.revision, formatVersion: 3,
            variantId: concept.variante_id, index: block.cursor, route: block.mode === 'test' ? 'examen' : 'repaso', retry: false } }} />}
        {question && questionAttempt && !questionAttempt.conflict && <TutorClaude key={`${block.id}:${qPosition}:${questionAttempt.optionId}`} semilla={`${question.id}:${question.revision}`} amplioInicial
          numero={block.cursor + 1} estado={questionAttempt.correct ? 'correcta' : 'incorrecta'}
          onVerPregunta={showQuestion}
          origen={{ tipo: 'nbme', questionId: question.id, revision: question.revision, optionId: questionAttempt.optionId }} />}
        {question && questionAttempt && !questionAttempt.correct && !questionAttempt.conflict && <><Button aria-expanded={recovery} onClick={() => setRecovery(v => !v)}>Guided recovery</Button>{recovery && <RecuperacionTrasFallo pregunta={question} intento={questionAttempt} onActividad={setRecovering} onSiguiente={next}/>}</>}
        <div className="mq-explanation-actions">{learningOpen && !closed && <Button disabled={busy} onClick={() => teach(false)}><Icon name="retry"/>Hide and recall</Button>}<Button variant="primary" disabled={grading || recovering || busy} onClick={closed && block.cursor === block.entries.length - 1 ? onExit : next}>{block.cursor === block.entries.length - 1 ? closed ? 'Back to dashboard' : 'Finish block' : 'Next question'}<Icon name="arrow"/></Button></div>
      </aside>}
    </main>
    <dialog className="mq-dialog" aria-labelledby={endTitle} ref={dialog} onCancel={() => setEndOpen(false)} onClose={() => setEndOpen(false)}><h2 id={endTitle}>End this block?</h2><p>{answered} answered · {studied} studied with help · {block.entries.length - completed} unanswered. Studying without an answer records no grade.</p><div className="mq-inline"><Button onClick={() => setEndOpen(false)}>Keep studying</Button><Button variant="primary" onClick={() => { save(patchBlock(current.current, { completedAt: Date.now(), paused: true })); if (nbme.currentSession?.id === block.id) nbme.completeSession(); setEndOpen(false) }}>End and review</Button></div></dialog>
    {expanded && <Modal titulo="Question figure" onCerrar={() => setExpanded(null)} ancho={1100}><FigureViewer url={expanded.url} alt={expanded.alt}/></Modal>}
  </>
}
