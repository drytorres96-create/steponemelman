import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useAnnotations } from './AnnotationProvider'
import { anchorAnnotation, AnnotationZ, type Annotation } from './annotations'
import { crearUUID } from '../store/model'

export type HighlightSource = Pick<Annotation, 'material' | 'sourceId' | 'sourceRevision' | 'variantId' | 'editorialVersion'>
type Capture = (range: Range) => boolean
const C = createContext<(capture: Capture) => () => void>(() => () => {})
/** One selection can cross paragraphs or table cells. Each region keeps its own durable anchor. */
export function Highlighter({ children, selectionKey }: { children: ReactNode; selectionKey?: string }) {
  const captures = useRef(new Set<Capture>()), suppressClick = useRef(false)
  const register = useCallback((capture: Capture) => { captures.current.add(capture); return () => { captures.current.delete(capture) } }, [])
  useEffect(() => { suppressClick.current = false; window.getSelection()?.removeAllRanges() }, [selectionKey])
  const capture = (pointer: boolean) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return
    const range = selection.getRangeAt(0).cloneRange()
    let changed = false
    for (const apply of captures.current) changed = apply(range) || changed
    if (changed) { suppressClick.current = pointer; selection.removeAllRanges() }
  }
  return <C.Provider value={register}><div className="mq-highlight-scope" onPointerDownCapture={() => { suppressClick.current = false }} onPointerUp={() => capture(true)}
    onKeyUp={event => { if (event.key === 'Shift') capture(false) }}
    onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation() } }}>{children}</div></C.Provider>
}
/** Real mark elements, persistent exact anchors and keyboard removal in every medical text region. */
export function HighlightText({ text, source, region }: { text: string; source: HighlightSource; region: string }) {
  const root = useRef<HTMLSpanElement>(null), register = useContext(C), store = useAnnotations()
  const rows = store.rows.filter(r => !r.payload.deleted && r.payload.kind === 'highlight' && r.payload.material === source.material
    && r.payload.sourceId === source.sourceId && r.payload.sourceRevision === source.sourceRevision
    && r.payload.variantId === source.variantId && r.payload.editorialVersion === source.editorialVersion && r.payload.region === region)
  const ranges = rows.map(row => ({ row, range: anchorAnnotation(text, row.payload) })).filter(x => x.range !== null)
  const remove = (id: string, annotation: Annotation) => store.save(id, { ...annotation, changedAt: Date.now(), deleted: true })
  useEffect(() => register(range => {
    const node = root.current
    if (!store.ready || !node || !range.intersectsNode(node)) return false
    const offset = (container: Node, at: number, fallback: number) => {
      if (!node.contains(container)) return fallback
      const before = document.createRange(); before.selectNodeContents(node); before.setEnd(container, at); return before.toString().length
    }
    const start = offset(range.startContainer, range.startOffset, 0), end = offset(range.endContainer, range.endOffset, text.length)
    if (end <= start || !text.slice(start, end).trim() || end - start > 4000) return false
    const overlaps = ranges.filter(r => r.range!.start < end && r.range!.end > start)
    const operations: {id: string; payload: Annotation}[] = []
    const make = (a: number, b: number) => {
      if (b <= a || !text.slice(a, b).trim()) return
      for (let at = a; at < b; at += 4000) {
        const until = Math.min(b, at + 4000)
        operations.push({id: crearUUID(), payload: { ...source, region, kind: 'highlight', quote: text.slice(at, until), prefix: text.slice(Math.max(0, at - 40), at),
          suffix: text.slice(until, until + 40), start: at, end: until, changedAt: Date.now(), deleted: false }})
      }
    }
    let coveredTo = start
    for (const r of [...overlaps].sort((a, b) => a.range!.start - b.range!.start)) {
      if (r.range!.start <= coveredTo) coveredTo = Math.max(coveredTo, r.range!.end)
    }
    if (coveredTo >= end) {
      // Selecting a marked range again erases only that part, keeping the rest anchored.
      for (const r of overlaps) { make(r.range!.start, Math.min(start, r.range!.end)); make(Math.max(end, r.range!.start), r.range!.end) }
    } else make(Math.min(start, ...overlaps.map(r => r.range!.start)), Math.max(end, ...overlaps.map(r => r.range!.end)))
    if (operations.some(operation => !AnnotationZ.safeParse(operation.payload).success)) return false
    for (const r of overlaps) remove(r.row.id, r.row.payload)
    for (const operation of operations) store.save(operation.id, operation.payload)
    return true
  }), [register, store, text, source, region])
  const boundaries = [...new Set([0, text.length, ...ranges.flatMap(x => [x.range!.start, x.range!.end])])].sort((a, b) => a - b)
  // Merge adjacent marked fragments so their background has no seams between words.
  const segments: { start: number; end: number; marked: typeof ranges[number] | undefined }[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], end = boundaries[i + 1], marked = ranges.find(x => x.range!.start <= start && x.range!.end >= end)
    const previous = segments.at(-1)
    if (previous && previous.marked?.row.id === marked?.row.id) previous.end = end
    else segments.push({ start, end, marked })
  }
  return <span className="mq-highlight-text" ref={root}>{segments.map(({ start, end, marked }) => marked
    ? <mark key={start} tabIndex={0} role="button" aria-label={`Remove highlight: ${text.slice(start, end)}`}
      onClick={event => { event.preventDefault(); event.stopPropagation(); remove(marked.row.id, marked.row.payload) }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); remove(marked.row.id, marked.row.payload) } }}>{text.slice(start, end)}</mark>
    : <span key={start}>{text.slice(start, end)}</span>)}</span>
}
