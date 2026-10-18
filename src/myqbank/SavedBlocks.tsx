import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './components'
import type { StudyBlock } from './blocks'

/** Removing a row preserves its history. Confirmation makes ending an unfinished block explicit. */
export function SavedBlocks({ blocks, busy, onResume, onRemove }: {
  blocks: StudyBlock[]; busy: boolean; onResume: (block: StudyBlock) => Promise<void>; onRemove: (id: string) => boolean
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const selected = blocks.find(b => b.id === selectedId)
  const dialog = useRef<HTMLDialogElement>(null)
  const summary = useRef<HTMLElement>(null)
  const title = useId()
  const description = useId()
  useEffect(() => {
    const element = dialog.current
    if (selected && !element?.open) element?.showModal()
    else if (!selected && element?.open) element.close()
  }, [selected])
  const remove = () => {
    if (!selected || busy) return
    if (!onRemove(selected.id)) { setError('Could not remove this block yet. Wait for saved progress to load and retry.'); return }
    setMessage('Block removed. Saved answers and progress are kept.')
    setSelectedId(null)
    dialog.current?.close()
    summary.current?.focus()
  }
  return <>
    <details className="mq-saved-blocks"><summary ref={summary}>Saved blocks</summary>
      <ul className="mq-block-history">{blocks.map(b => <li className="mq-block-row" key={b.id}>
        <Button className="mq-block-open" disabled={busy} aria-label={`${b.title} · ${b.completedAt === undefined ? 'Resume' : 'Review'}`} onClick={() => void onResume(b)}>
          <span>{b.title}</span><small>{b.completedAt === undefined ? 'Resume' : 'Review'} · {new Date(b.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
        </Button>
        <Button variant="danger" disabled={busy} aria-label={`Remove ${b.title}`} onClick={() => { setError(''); setSelectedId(b.id) }}>Remove</Button>
      </li>)}</ul>
      {!blocks.length && <p>No saved blocks.</p>}
    </details>
    {message && <p className="mq-small" role="status">{message}</p>}
    <dialog className="mq-dialog mq-remove-block" ref={dialog} aria-labelledby={title} aria-describedby={description}
      onCancel={() => setSelectedId(null)} onClose={() => setSelectedId(null)}>
      <h2 id={title}>Remove saved block?</h2>
      <p>{selected?.title}</p>
      <p id={description}>This ends the block and removes it from this list. Saved answers and progress are kept. Unanswered items remain ungraded.</p>
      {error && <p role="alert">{error}</p>}
      <div className="mq-inline"><Button autoFocus onClick={() => setSelectedId(null)}>Keep block</Button><Button variant="danger" disabled={busy} onClick={remove}>Remove block</Button></div>
    </dialog>
  </>
}
