import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Modal } from '../components/comunes'
import { RecuperacionTrasFallo } from '../nbme/RecuperacionTrasFallo'
import { Button, Card, Icon, Rings, StateMessage } from './components'
import { blockOpportunity, blockTime, timeBlock, draftBlock, markBlock, patchBlock, type StudyBlock } from './blocks'
import { crearUUID } from '../store/model'
import { nbmePosition } from './selection'
import { canReveal } from './contracts'
import { Explanation } from './Explanation'
import { Highlighter, HighlightText, type HighlightSource } from './HighlightText'
import { LabReference } from './LabReference'
import { useAnnotations } from './AnnotationProvider'

export function Study({ block, onExit, onRetry }: { block: StudyBlock; onExit: () => void; onRetry: (block: StudyBlock) => Promise<void> }) {
  return <Highlighter key={block.id} selectionKey={`${block.cursor}`}><StudyBody block={block} onExit={onExit} onRetry={onRetry}/></Highlighter>
}
function StudyBody({ block, onExit, onRetry }: { block: StudyBlock; onExit: () => void; onRetry: (block: StudyBlock) => Promise<void> }) {
  const app = useApp(), nbme = useNbme(), annotations = useAnnotations()
  const latestApp = useRef(app); latestApp.current = app
  const [rail, setRail] = useState(true), [labs, setLabs] = useState(false), [endOpen, setEndOpen] = useState(false)
  const [expanded, setExpanded] = useState<LoadedFigure | null>(null), [grading, setGrading] = useState(false), [message, setMessage] = useState('')
  const [recovery, setRecovery] = useState(false), [recovering, setRecovering] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), figureRoot = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null)
  const feedback = useRef<HTMLDivElement>(null)
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
  const reveal = canReveal(block.mode, submitted, closed)
  const result: Resultado | null = conceptAttempt ? { veredicto: conceptAttempt.resultado ?? 'revision', tipoError: conceptAttempt.tipo_error,
    recuperacionActiva: conceptAttempt.recuperacion_activa, respuestaDada: conceptAttempt.respuesta_dada ?? '' } : null
  const uncertain = result?.veredicto === 'revision' || questionAttempt?.conflict
  const correct = conceptAttempt ? ['correcta', 'ortografia'].includes(conceptAttempt.resultado ?? '') : questionAttempt?.correct
  const source: HighlightSource = { material: entry.kind, sourceId: entry.id, sourceRevision: entry.revision,
    variantId: concept?.variante_id ?? '', editorialVersion: '' }
  const states = block.entries.map((item, position) => {
    const a = item.kind === 'concept' ? app.estado.progreso[item.id]?.intentos.find(i => i.session_id === block.id && i.pregunta_id === blockOpportunity(block.id, position)) : undefined
    const n = item.kind === 'nbme' ? nbme.state.attempts[`${block.id}:${nbmePosition(block.entries, position)}`] : undefined
    if (!a && !n) return block.skipped[position]?.value ? 'skipped' : 'unanswered'
    if (!canReveal(block.mode, true, closed)) return 'saved'
    if (a?.resultado === 'revision' || n?.conflict) return 'pending'
    return a ? ['correcta', 'ortografia'].includes(a.resultado ?? '') ? 'correct' : 'incorrect' : n!.correct ? 'correct' : 'incorrect'
  })
  const answered = states.filter(s => !['skipped', 'unanswered'].includes(s)).length
  const evaluated = states.filter(s => ['correct', 'incorrect'].includes(s)).length
  const correctCount = states.filter(s => s === 'correct').length
  const ready = question?.status === 'ready' && !preguntaConLecturasDudosas(question) && nbme.currentSession?.id === block.id
    && nbme.sessionView?.current?.position === qPosition && !!nbme.catalog?.questions.some(q => q.id === entry.id && q.status === 'ready')
  const canSubmitNbme = ready && !closed && !submitted && !!nbme.selectedOption && !nbme.busy && (!question?.figureRequired || figures.ready)
  useEffect(() => { alive.current = true; const controller = new AbortController(); abort.current = controller; return () => { alive.current = false; controller.abort() } }, [])
  useEffect(() => { if (endOpen) dialog.current?.showModal(); else dialog.current?.close() }, [endOpen])
  useEffect(() => {
    if (reveal && matchMedia('(max-width: 960px)').matches) {
      feedback.current?.focus({ preventScroll: true })
      feedback.current?.scrollIntoView({ block: 'start' })
    }
  }, [reveal, opportunity])
  useEffect(() => {
    setExpanded(null); setMessage(''); setRecovery(false); setRecovering(false); submitLock.current = false
    heading.current?.focus()
    if (entry.kind === 'nbme' && nbme.currentSession?.id === block.id) nbme.goToQuestion(qPosition)
    nbme.setEngaged(entry.kind === 'nbme' && !closed)
    if (concept && !closed) app.registrarVistaConcepto(concept.concept_id, opportunity)
  }, [opportunity, nbme.currentSession?.id])
  useEffect(() => {
    const position = block.cursor
    clock.current.reiniciar(current.current.timeMs?.[position]?.[timerRun.current] ?? 0)
    const flush = () => { if (!closed && !submitted) latestApp.current.guardarBloque(timeBlock(current.current, position, timerRun.current, clock.current.leer())) }
    const interval = setInterval(flush, 5000)
    window.addEventListener('pagehide', flush)
    return () => { clock.current.activar(false); flush(); clearInterval(interval); window.removeEventListener('pagehide', flush) }
  }, [opportunity, closed, submitted])
  useEffect(() => {
    const update = () => clock.current.activar(!closed && !submitted && !grading && document.visibilityState === 'visible')
    update(); document.addEventListener('visibilitychange', update)
    return () => { clock.current.activar(false); document.removeEventListener('visibilitychange', update) }
  }, [opportunity, submitted, closed, grading])
  useEffect(() => {
    if (closed && nbme.currentSession?.id === block.id && nbme.currentSession.completedAt === undefined) nbme.completeSession()
  }, [closed, nbme.currentSession?.id, nbme.currentSession?.completedAt])
  const save = app.guardarBloque
  function move(position: number) {
    if (grading || recovering) return
    save(patchBlock(current.current, { cursor: position }))
    if (block.entries[position].kind === 'nbme') nbme.goToQuestion(nbmePosition(block.entries, position))
  }
  function next() {
    let changed = current.current
    if (submitted && reveal) changed = markBlock(changed, 'reviewed', block.cursor, true)
    else if (!submitted && !closed) changed = markBlock(changed, 'skipped', block.cursor, true)
    if (block.cursor + 1 < block.entries.length) save(patchBlock(changed, { cursor: block.cursor + 1 }))
    else { save(changed); if (!closed) setEndOpen(true) }
  }
  function pause() { nbme.pauseSession(); save(patchBlock(current.current, { paused: true })); onExit() }
  const register = (r: Resultado, duration: number, ai: boolean, pending = false) => {
    if (!concept) return
    const existing = latestApp.current.progresoDe(concept.concept_id).intentos.find(i => i.pregunta_id === opportunity && i.session_id === block.id)
    const attempt: Intento = { attempt_id: opportunity, session_id: block.id, ts: existing?.ts ?? Date.now(),
      calificacion: r.veredicto === 'correcta' ? 3 : r.veredicto === 'incorrecta' || r.veredicto === 'revision' ? 1 : 2,
      resultado: r.veredicto, interaccion: concept.interaccion.recomendada, recuperacion_activa: r.recuperacionActiva,
      pistas_usadas: 0, ms: existing?.ms ?? duration, tipo_error: r.tipoError, confianza_declarada: null, respuesta_dada: r.respuestaDada,
      pregunta_id: opportunity, pregunta_version: entry.revision, evaluador_version: EVALUADOR_VERSION, fuente_consultada: false,
      explicacion_previa: !!block.retryOf, modo: block.mode === 'test' ? 'examen' : 'repaso',
      tipo_evidencia: concept.interaccion.recomendada === 'caso_clinico' ? 'aplicacion' : r.recuperacionActiva ? 'recuerdo' : 'discriminacion',
      ...(concept.variante_id ? { variante_id: concept.variante_id, primera_presentacion: !app.progresoDe(concept.concept_id).intentos.some(t => t.variante_id === concept.variante_id) } : {}),
      ...(ai ? { calificado_por_ia: true } : {}), ...(existing && !pending ? { calificacion_actualizada_en: Date.now() } : {}) }
    app.registrarIntento(concept.concept_id, attempt)
  }
  async function submitConcept(r: Resultado) {
    if (!concept || submitLock.current || closed || conceptAttempt && conceptAttempt.resultado !== 'revision') return
    submitLock.current = true; clock.current.activar(false)
    const duration = blockTime(timeBlock(current.current, block.cursor, timerRun.current, clock.current.leer()), block.cursor)
    if (usaTextoLibre(concept) && r.respuestaDada.trim()) {
      // The answer is durable before the optional network grading starts.
      register({ ...r, veredicto: 'revision', tipoError: 'error_por_revisar' }, duration, false, true)
      setGrading(true)
      const grade = await calificarConIA({ conceptId: concept.concept_id, answer: r.respuestaDada, questionId: opportunity,
        version: entry.revision, formatVersion: 3, variantId: concept.variante_id, index: block.cursor, route: block.mode === 'test' ? 'examen' : 'repaso', retry: false }, abort.current.signal)
      if (!alive.current) return
      const verdict = grade.estado === 'ok' ? grade.veredicto === 'correcta' && r.veredicto === 'ortografia' ? 'ortografia' : grade.veredicto : r.veredicto
      register({ ...r, veredicto: verdict, tipoError: verdict === 'correcta' ? 'ninguno' : verdict === 'revision' ? 'error_por_revisar' : verdict === 'incorrecta' && r.tipoError === 'ninguno' ? 'interpretacion_incorrecta' : r.tipoError }, duration, grade.estado === 'ok')
      setGrading(false); if (grade.estado !== 'ok') setMessage(grade.motivo)
    } else register(r, duration, false)
    save(markBlock(current.current, 'skipped', block.cursor, false))
    submitLock.current = false
  }
  return <>
    {nbme.error && entry.kind === 'nbme' && <p role="alert">{nbme.error}</p>}
    <div className="mq-study-tools"><div className="mq-inline"><Button aria-label="Toggle question navigator" aria-pressed={rail} onClick={() => setRail(v => !v)}><Icon name="rail"/></Button><span className="mq-mode-label">{block.mode === 'test' ? 'Test' : 'Tutor'}</span><span className="mq-small mq-muted">{closed ? 'Block complete' : `${answered} answers saved`}</span></div>
      <div className="mq-inline"><Button aria-label="Previous question" disabled={!block.cursor || grading || recovering} onClick={() => move(block.cursor - 1)}><Icon name="back"/></Button><span className="mq-position">{block.cursor + 1} / {block.entries.length}</span><Button aria-label="Next question" disabled={block.cursor === block.entries.length - 1 || grading || recovering} onClick={() => move(block.cursor + 1)}><Icon name="arrow"/></Button></div>
      <div className="mq-inline"><Button aria-pressed={!!block.flags[block.cursor]?.value} onClick={() => save(markBlock(current.current, 'flags', block.cursor, !block.flags[block.cursor]?.value))}><Icon name="flag"/>Flag</Button><Button aria-expanded={labs} onClick={() => setLabs(v => !v)}><Icon name="labs"/>Labs</Button><Button disabled={grading || recovering} onClick={pause}>{closed ? 'Dashboard' : 'Pause'}</Button><Button variant="danger" disabled={closed || grading || recovering} onClick={() => setEndOpen(true)}>End block</Button></div>
    </div>
    <main id="mq-main" tabIndex={-1} className={`mq-study ${rail ? '' : 'mq-study--no-rail'} ${reveal ? 'mq-study--revealed' : ''} ${labs && !reveal ? 'mq-study--labs' : ''}`}>
      {rail && <Card className="mq-rail" aria-label="Question navigator"><Rings used={answered} total={block.entries.length} correct={block.mode === 'test' && !closed ? null : correctCount} evaluated={evaluated} compact/><p className="mq-small mq-muted">{block.mode === 'test' && !closed ? 'Answers saved' : `${correctCount} correct · ${states.filter(s => s === 'pending').length} pending`}</p><details className="mq-mobile-map"><summary>Question map</summary></details>
        <div className="mq-question-grid">{states.map((state, i) => <button type="button" key={i} className={`mq-question-number mq-question-number--${state}`} aria-current={i === block.cursor ? 'step' : undefined} aria-label={`Question ${i + 1}, ${state}${block.flags[i]?.value ? ', flagged' : ''}`} disabled={grading || recovering} onClick={() => move(i)}>{i + 1}{block.flags[i]?.value && <span aria-hidden="true">⚑</span>}</button>)}</div>
      </Card>}
      <div className="mq-question-pane">{closed && <div className="mq-complete" role="status"><strong>Block complete</strong><span>{correctCount} / {evaluated} graded correct · {block.entries.length - answered} unanswered · {states.filter(s => s === 'pending').length} pending</span><Button onClick={() => void onRetry(block)}>Practice again</Button></div>}
        <Card className="mq-stem"><div className="mq-heading"><span className="mq-eyebrow">{entry.kind === 'nbme' ? 'NBME' : 'MEHLMAN CONCEPT'}</span><span>{entry.id}</span></div><h1 ref={heading} tabIndex={-1}>Question {block.cursor + 1}</h1>
          {concept ? <><p><HighlightText text={concept.evaluacion.pregunta} source={source} region="stem"/></p>{concept.contexto && <p><HighlightText text={concept.contexto} source={source} region="context"/></p>}</>
            : question ? <Enunciado texto={columns?.enunciado ?? question.stem} renderText={(text, region) => <HighlightText text={text} source={source} region={`stem:${region}`}/>}/>
              : <StateMessage state="error" title="Question unavailable" action={<Button onClick={() => void nbme.retryQuestionLoad()}>Retry</Button>}>Your saved place and answers are preserved.</StateMessage>}
          {!!question?.figures.length && <div ref={figureRoot} className="nbme-question-images">{(figures.waiting || figures.loading) && <p role="status">Loading figure…</p>}{figures.error && <p role="alert">Figure unavailable. <Button onClick={figures.retry}>Retry figure</Button></p>}{figures.figures.map(f => <Button key={f.assetId} className="nbme-image-button" onClick={() => setExpanded(f)} aria-label={`Expand figure: ${f.alt}`}><img src={f.url} alt={f.alt || 'Question figure'}/></Button>)}</div>}
        </Card>
        {concept && <div className="mq-concept-interaction"><Interaccion key={opportunity} c={concept} semilla={opportunity} bloqueado={submitted || closed || grading} resultado={result} ocultarFeedback={!reveal}
          draft={block.drafts[block.cursor]?.value} onDraft={value => save(draftBlock(current.current, block.cursor, value))} english renderText={(text, region) => <HighlightText text={text} source={source} region={region}/>} onResponder={r => void submitConcept(r)}/></div>}
        {question && <form onSubmit={e => { e.preventDefault(); if (canSubmitNbme) { const timed = timeBlock(current.current, block.cursor, timerRun.current, clock.current.leer()); nbme.checkAnswer(blockTime(timed, block.cursor)); save(markBlock(timed, 'skipped', block.cursor, false)) } }}>
          <fieldset className="mq-options" disabled={submitted || closed || !ready || nbme.busy}><legend className="mq-sr-only">Choose your answer</legend>{question.options.map(option => {
            const chosen = (questionAttempt?.optionId ?? nbme.selectedOption) === option.id
            const state = reveal && !uncertain && option.id === question.answer ? 'correct' : reveal && !uncertain && chosen ? 'incorrect' : chosen ? 'selected' : ''
            return <label className={`mq-option mq-option--${state}`} key={option.id}><input type="radio" name={opportunity} checked={chosen} onChange={() => nbme.selectAnswer(option.id)}/><span className="mq-letter">{option.id}</span><span lang="en"><HighlightText text={columns ? columns.columnas.map((c, i) => `${c}: ${columns.filas[option.id][i]}`).join(' · ') : normalizarTexto(option.text)} source={source} region={`option:${option.id}`}/></span>{state === 'correct' && <small>Correct answer</small>}{state === 'incorrect' && <small>Your answer</small>}</label>
          })}</fieldset>{!submitted && !closed && <div className="mq-answer-actions"><Button type="submit" variant="primary" disabled={!canSubmitNbme}>Submit answer</Button></div>}
        </form>}
        {submitted && !reveal && <div className="mq-saved" role="status"><Icon name="check"/><div><strong>Answer saved</strong><p>Results appear when you end the block.</p></div></div>}
        {!submitted && closed && <p role="status">Not answered · no grade recorded.</p>}
        {grading && <p role="status">Answer saved · checking the response…</p>}{message && reveal && <p role="status">{message}</p>}
        <div className="mq-answer-actions"><Button disabled={grading || recovering} variant={submitted ? 'primary' : 'ghost'} onClick={next}>{block.cursor === block.entries.length - 1 ? closed ? 'Last question' : 'Finish block' : submitted ? 'Next question' : closed ? 'Next question' : 'Skip for now'}<Icon name="arrow"/></Button></div>
        <p className="mq-small mq-muted" role="status">{app.sincronizacion.mensaje} · {nbme.storageWarning ?? nbme.syncStatus.message}</p>
        <p className="mq-small mq-muted">{annotations.status} <Button onClick={() => void annotations.sync()}>Sync annotations</Button></p>
      </div>
      {labs && !reveal && <aside className="mq-labs-pane"><LabReference/></aside>}
      {reveal && <aside className="mq-explanation-pane" aria-label="Explanation"><div ref={feedback} tabIndex={-1} role="status" className={`mq-result ${uncertain ? '' : correct ? 'mq-result--correct' : 'mq-result--incorrect'}`}><Icon name={correct ? 'check' : 'close'}/><strong>{uncertain ? 'Answer pending review' : correct ? 'Correct' : 'Incorrect'}</strong></div>
        {uncertain && conceptAttempt?.respuestas_en_conflicto && <p>Different answers were saved on two devices. This item remains ungraded; use Practice again after ending the block.</p>}
        {uncertain && concept && result && !conceptAttempt?.respuestas_en_conflicto && usaTextoLibre(concept) && <Button disabled={grading} onClick={() => void submitConcept(result)}>Check pending answer</Button>}
        {(concept || question) && <Explanation source={concept ?? question!} highlightSource={source}/>}
        {question && questionAttempt && !questionAttempt.correct && !questionAttempt.conflict && <><Button aria-expanded={recovery} onClick={() => setRecovery(v => !v)}>Guided recovery</Button>{recovery && <RecuperacionTrasFallo pregunta={question} intento={questionAttempt} onActividad={setRecovering} onSiguiente={next}/>}</>}
        {labs && <LabReference/>}
      </aside>}
    </main>
    <dialog className="mq-dialog" ref={dialog} onCancel={() => setEndOpen(false)} onClose={() => setEndOpen(false)}><h2>End this block?</h2><p>{answered} of {block.entries.length} answered. Unanswered items remain ungraded.</p><div className="mq-inline"><Button onClick={() => setEndOpen(false)}>Keep studying</Button><Button variant="primary" onClick={() => { save(patchBlock(current.current, { completedAt: Date.now(), paused: true })); if (nbme.currentSession?.id === block.id) nbme.completeSession(); setEndOpen(false) }}>End and review</Button></div></dialog>
    {expanded && <Modal titulo="Question figure" onCerrar={() => setExpanded(null)} ancho={1100}><FigureViewer url={expanded.url} alt={expanded.alt}/></Modal>}
  </>
}
