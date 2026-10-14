import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAnnotations } from './AnnotationProvider'
import { anchorAnnotation, type Annotation } from './annotations'
import { crearUUID } from '../store/model'
import { Button } from './components'

export type HighlightSource = Pick<Annotation, 'material' | 'sourceId' | 'sourceRevision' | 'variantId' | 'editorialVersion'>
const C = createContext<(value: { annotation: Annotation; id?: string } | null) => void>(() => {})
export function Highlighter({ children, selectionKey }: { children: ReactNode; selectionKey?: string }) {
  const store = useAnnotations(), [selection, setSelection] = useState<{ annotation: Annotation; id?: string } | null>(null)
  useEffect(() => { setSelection(null) }, [selectionKey])
  return <C.Provider value={setSelection}>{children}{selection && <div className="mq-highlight-toolbar" role="region" aria-label="Text selection">
    <span>{selection.annotation.quote.slice(0, 75)}{selection.annotation.quote.length > 75 ? '…' : ''}</span>
    <Button variant="primary" disabled={!store.ready} onClick={() => {
      store.save(selection.id ?? crearUUID(), { ...selection.annotation, deleted: !!selection.id, changedAt: Date.now() })
      setSelection(null); window.getSelection()?.removeAllRanges()
    }}>{selection.id ? 'Remove highlight' : 'Highlight selection'}</Button><Button onClick={() => setSelection(null)}>Cancel</Button>
  </div>}</C.Provider>
}
/** Real mark elements work with keyboard, touch, Firefox and browsers without CSS Highlights. */
export function HighlightText({ text, source, region }: { text: string; source: HighlightSource; region: string }) {
  const root = useRef<HTMLSpanElement>(null), select = useContext(C), store = useAnnotations()
  const rows = store.rows.filter(r => !r.payload.deleted && r.payload.kind === 'highlight' && r.payload.material === source.material
    && r.payload.sourceId === source.sourceId && r.payload.sourceRevision === source.sourceRevision
    && r.payload.variantId === source.variantId && r.payload.editorialVersion === source.editorialVersion && r.payload.region === region)
  const ranges = rows.map(row => ({ row, range: anchorAnnotation(text, row.payload) })).filter(x => x.range !== null)
  const boundaries = [...new Set([0, text.length, ...ranges.flatMap(x => [x.range!.start, x.range!.end])])].sort((a, b) => a - b)
  const capture = () => {
    const selection = window.getSelection()
    if (!root.current || !selection || selection.isCollapsed || !selection.rangeCount) return
    const range = selection.getRangeAt(0)
    if (!root.current.contains(range.startContainer) || !root.current.contains(range.endContainer)) return
    const before = range.cloneRange(); before.selectNodeContents(root.current); before.setEnd(range.startContainer, range.startOffset)
    const start = before.toString().length, quote = range.toString()
    if (!quote.trim() || quote.length > 4000 || text.slice(start, start + quote.length) !== quote) return
    select({ annotation: { ...source, region, kind: 'highlight', quote, prefix: text.slice(Math.max(0, start - 40), start),
      suffix: text.slice(start + quote.length, start + quote.length + 40), start, end: start + quote.length, changedAt: Date.now(), deleted: false } })
  }
  return <span className="mq-highlight-text" ref={root} onPointerUp={capture} onKeyUp={capture} onClickCapture={event => {
    const selected = window.getSelection()
    if (selected && !selected.isCollapsed && root.current?.contains(selected.anchorNode)) { event.preventDefault(); event.stopPropagation(); capture() }
  }}>{boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1], marked = ranges.find(x => x.range!.start <= start && x.range!.end >= end)
    return marked ? <mark key={start} tabIndex={0} role="button" aria-label={`Remove highlight: ${text.slice(start, end)}`}
      onClick={e => { e.preventDefault(); e.stopPropagation(); select({ id: marked.row.id, annotation: marked.row.payload }) }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); select({ id: marked.row.id, annotation: marked.row.payload }) } }}>{text.slice(start, end)}</mark> : <span key={start}>{text.slice(start, end)}</span>
  })}</span>
}
