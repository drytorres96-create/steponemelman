import { useEffect, useRef, useState } from 'react'
import { Button, Card, Icon, Rings, StateMessage, Tabs } from '../components'
import { availableSections, canReveal, type BlockMode, type ExplanationSection } from '../contracts'
import { questions, type DemoItem } from './fixtures'

export interface PreviewAnswer { value: string; correct: boolean }
export interface PreviewBlock { items: DemoItem[]; mode: BlockMode; answers: Record<string, PreviewAnswer>; drafts: Record<string, string>; position: number; flags: string[]; completed: boolean }
function SectionContent({ section }: { section: ExplanationSection }) {
  const [revealed, setRevealed] = useState(false)
  return <div lang="es" className="mq-explanation-content"><h3>{section.heading}</h3>
    {section.paragraphs?.map(text => <p key={text}>{text}</p>)}
    {section.bullets && <ul>{section.bullets.map(text => <li key={text}>{text}</li>)}</ul>}
    {section.drill && <><p>{section.drill.prompt}</p><Button aria-expanded={revealed} onClick={() => setRevealed(!revealed)}><span lang="en">{revealed ? 'Hide answer' : 'Reveal answer'}</span></Button>{revealed && <p className="mq-drill-answer">{section.drill.answer}</p>}</>}
  </div>
}
export default function Study({ block, setBlock, onPause }: {
  block: PreviewBlock; setBlock: (block: PreviewBlock) => void; onPause: () => void
}) {
  const item = block.items[block.position]
  const question = questions[item.template]
  const answer = block.answers[item.id]
  const [rail, setRail] = useState(true)
  const [sectionId, setSectionId] = useState('stem')
  const [endOpen, setEndOpen] = useState(false)
  const [exhibit, setExhibit] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const result = useRef<HTMLElement>(null)
  const reveal = canReveal(block.mode, !!answer, block.completed)
  const visibleSections = availableSections(question.sections)
  const section = visibleSections.find(s => s.id === sectionId) ?? visibleSections[0]
  const activeIndex = visibleSections.findIndex(s => s.id === section?.id)
  const answeredCount = Object.keys(block.answers).length
  const correctCount = Object.values(block.answers).filter(a => a.correct).length
  const value = answer?.value ?? block.drafts[item.id] ?? ''
  useEffect(() => { if (endOpen) dialog.current?.showModal(); else dialog.current?.close() }, [endOpen])
  function submit() {
    if (!value.trim() || answer || block.completed) return
    const correct = question.options ? value === question.answer : (question.accepts ?? [question.answer.toLowerCase()]).includes(value.trim().toLowerCase())
    setBlock({ ...block, answers: { ...block.answers, [item.id]: { value, correct } } })
    setSectionId(visibleSections[0]?.id ?? '')
    requestAnimationFrame(() => result.current?.focus())
  }
  function move(position: number) {
    setBlock({ ...block, position }); setSectionId(''); setExhibit(false)
  }
  return <>
    <div className="mq-study-tools"><div className="mq-inline"><Button aria-label={rail ? 'Hide question navigator' : 'Show question navigator'} aria-pressed={rail} onClick={() => setRail(!rail)}><Icon name="rail"/></Button><span className="mq-mode-label">{block.mode === 'tutor' ? 'Tutor' : 'Test'}</span><span className="mq-muted mq-small">{block.completed ? 'Block complete' : 'Sample block'}</span></div>
      <div className="mq-inline"><Button aria-label="Previous question" disabled={block.position === 0} onClick={() => move(block.position - 1)}><Icon name="back"/></Button><span className="mq-position">{block.position + 1} <span>/ {block.items.length}</span></span><Button aria-label="Next question" disabled={block.position >= block.items.length - 1} onClick={() => move(block.position + 1)}><Icon name="arrow"/></Button></div>
      <div className="mq-inline"><Button aria-pressed={block.flags.includes(item.id)} onClick={() => setBlock({ ...block, flags: block.flags.includes(item.id) ? block.flags.filter(id => id !== item.id) : [...block.flags, item.id] })}><Icon name="flag"/>Flag</Button><Button onClick={onPause}>Pause</Button><Button variant="danger" disabled={block.completed} onClick={() => setEndOpen(true)}>End block</Button></div>
    </div>
    <main id="mq-main" className={`mq-study ${rail ? '' : 'mq-study--no-rail'} ${reveal ? 'mq-study--revealed' : ''}`} tabIndex={-1}>
      {rail && <Card className="mq-rail" aria-label="Question navigator"><Rings used={answeredCount} total={block.items.length} correct={block.mode === 'test' && !block.completed ? null : correctCount} compact/>
        <span className="mq-small mq-muted">{block.mode === 'test' && !block.completed ? 'Answers saved' : 'Answered'}</span>
        <details className="mq-mobile-map"><summary>Question map</summary><p>Use the numbered buttons below to move through your block.</p></details>
        <div className="mq-question-grid">{block.items.map((entry, index) => {
          const response = block.answers[entry.id]
          const showResult = canReveal(block.mode, !!response, block.completed)
          const state = showResult ? response.correct ? 'correct' : 'incorrect' : response ? 'saved' : 'unanswered'
          return <button type="button" key={entry.id} className={`mq-question-number mq-question-number--${state}`} aria-current={index === block.position ? 'step' : undefined}
            aria-label={`Question ${index + 1}, ${state}${block.flags.includes(entry.id) ? ', flagged' : ''}`} onClick={() => move(index)}>{index + 1}{block.flags.includes(entry.id) && <span aria-hidden="true">⚑</span>}</button>
        })}</div>
        <p className="mq-small mq-muted">{block.mode === 'test' && !block.completed ? 'Results appear after the block ends.' : '✓ Correct · × Incorrect'}</p>
      </Card>}
      <div className="mq-question-pane">
        {block.completed && <div className="mq-complete" role="status"><strong>Block complete</strong><span>{correctCount} / {answeredCount} correct · {block.items.length - answeredCount} unanswered</span></div>}
        <Card className="mq-stem"><p lang="en">{question.stem}</p>
          {question.vitals && <><Button aria-expanded={exhibit} onClick={() => setExhibit(!exhibit)}><Icon name="labs"/>Vitals</Button>{exhibit && <dl className="mq-vitals">{question.vitals.map(([label, reading]) => <div key={label}><dt>{label}</dt><dd>{reading}</dd></div>)}</dl>}</>}
          <h1 lang="en">{question.prompt}</h1>
        </Card>
        <form className="mq-answer-form" onSubmit={event => { event.preventDefault(); submit() }}>
          {question.options ? <fieldset className="mq-options"><legend className="mq-sr-only">Choose your answer</legend>{question.options.map(option => {
            const state = reveal && option.id === question.answer ? 'correct' : reveal && option.id === answer.value ? 'incorrect' : value === option.id ? 'selected' : ''
            return <label key={option.id} className={`mq-option mq-option--${state}`}><input type="radio" name="answer" value={option.id} checked={value === option.id} disabled={!!answer || block.completed} onChange={() => setBlock({ ...block, drafts: { ...block.drafts, [item.id]: option.id } })}/><span className="mq-letter">{option.id}</span><span>{option.text}</span>{reveal && option.id === question.answer && <small>Correct answer</small>}{reveal && option.id === answer.value && option.id !== question.answer && <small>Your answer</small>}</label>
          })}</fieldset> : <label className="mq-free-answer">Your answer<input type="text" autoComplete="off" value={value} disabled={!!answer || block.completed} onChange={event => setBlock({ ...block, drafts: { ...block.drafts, [item.id]: event.target.value } })} placeholder={item.template === 'calculation' ? 'Enter a number' : 'Recall the key idea'}/></label>}
          <div className="mq-answer-actions">{!answer && !block.completed && <Button type="submit" variant="primary" disabled={!value.trim()}>Submit answer</Button>}{block.position < block.items.length - 1 && <Button variant={answer ? 'primary' : 'ghost'} onClick={() => move(block.position + 1)}>{answer ? 'Next question' : 'Skip for now'}<Icon name="arrow"/></Button>}{block.completed && <Button onClick={onPause}>Back to dashboard</Button>}</div>
        </form>
        {answer && !reveal && <section className="mq-saved" ref={result} tabIndex={-1} role="status"><Icon name="check"/><div><strong>Answer saved</strong><p>Your answer and explanation will be revealed when you end the block.</p></div></section>}
        {!answer && block.completed && <StateMessage state="empty" title="Not answered">This item has no graded answer. It is not counted as incorrect.</StateMessage>}
      </div>
      {reveal && <aside className="mq-explanation-pane" aria-label="Explanation"><section className={`mq-result ${answer.correct ? 'mq-result--correct' : 'mq-result--incorrect'}`} ref={result} role="status" tabIndex={-1}><Icon name={answer.correct ? 'check' : 'close'}/><div><strong>{answer.correct ? 'Correct' : 'Incorrect'} — {answer.correct ? 'you found the key.' : `the answer is ${question.answer}.`}</strong><p lang="es">{answer.correct ? 'Ahora conecta tu respuesta con la idea central.' : 'Revisa la pista que cambia la respuesta.'}</p></div></section>
        <Tabs label="Explanation sections" items={visibleSections} activeId={section?.id ?? ''} onChange={setSectionId}>
          <Card className="mq-explanation-card">{section && <SectionContent key={`${item.id}-${section.id}`} section={section}/>}{visibleSections.length > 1 && <div className="mq-section-nav"><Button aria-label="Previous section" disabled={activeIndex === 0} onClick={() => setSectionId(visibleSections[activeIndex - 1].id)}><Icon name="back"/>Back</Button><Button aria-label="Next section" disabled={activeIndex === visibleSections.length - 1} onClick={() => setSectionId(visibleSections[activeIndex + 1].id)}>Next<Icon name="arrow"/></Button></div>}</Card>
        </Tabs>
      </aside>}
    </main>
    <dialog ref={dialog} className="mq-dialog" onCancel={() => setEndOpen(false)} onClose={() => setEndOpen(false)}><h2>End this block?</h2><p>{answeredCount} of {block.items.length} answered. Unanswered items will remain ungraded.</p><div className="mq-inline"><Button onClick={() => setEndOpen(false)}>Keep studying</Button><Button variant="primary" onClick={() => { setBlock({ ...block, completed: true }); setEndOpen(false) }}>End and review</Button></div></dialog>
  </>
}
