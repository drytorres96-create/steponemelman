import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { leer, escribir } from '../store/db'
import { AnnotationZ, canonicalAnnotation, mergeAnnotation, type Annotation, type AnnotationRecord } from './annotations'

const RowZ = z.object({ id: z.string().uuid(), user_id: z.string(), payload: AnnotationZ, revision: z.number().int().positive() })
const SavedZ = z.object({ userId: z.string(), rows: z.array(z.object({ id: z.string().uuid(), payload: AnnotationZ, revision: z.number().int().nonnegative(), dirty: z.boolean() })) })
type Context = { rows: AnnotationRecord[]; ready: boolean; status: string; save: (id: string, annotation: Annotation) => void; sync: () => Promise<void>; restore: (input: unknown) => string }
const C = createContext<Context | null>(null)
export function AnnotationProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const key = `myqbank-annotations:${userId}`
  const [rows, setRows] = useState<AnnotationRecord[]>([])
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Loading annotations…')
  const actual = useRef<AnnotationRecord[]>([]), alive = useRef(false), loaded = useRef(false), busy = useRef(false)
  const epoch = useRef(0), localFailed = useRef(false)
  const writes = useRef(Promise.resolve()), saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const persist = useCallback(() => {
    const saved = { userId, rows: actual.current }
    let backup = true
    try { localStorage.setItem(key, JSON.stringify(saved)) } catch { backup = false }
    writes.current = writes.current.catch(() => undefined).then(() => escribir(key, saved, { estricto: true }))
    void writes.current.then(() => { localFailed.current = false }).catch(() => { localFailed.current = !backup; if (alive.current) setStatus(backup ? 'Local backup saved; sync is pending.' : 'Could not save annotations. Keep this window open and retry.') })
  }, [key, userId])
  const publish = useCallback((next: AnnotationRecord[]) => { actual.current = next; if (alive.current) setRows(next); persist() }, [persist])
  const sync = useCallback(async () => {
    if (!alive.current || !loaded.current || busy.current) return
    if (!navigator.onLine) { setStatus(localFailed.current ? 'Local storage unavailable · keep this window open' : 'Saved on this device · offline'); return }
    const generation = epoch.current
    const valid = () => alive.current && generation === epoch.current
    busy.current = true
    setStatus('Syncing annotations…')
    try {
      // Pagination includes tombstones; an old device must learn about deletions.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('myqbank_annotations').select('id,user_id,payload,revision').eq('user_id', userId).order('id').range(offset, offset + 499)
        if (!valid()) return
        if (error) throw error
        const remote = z.array(RowZ).parse(data)
        if (remote.some(r => r.user_id !== userId)) throw new Error('Account mismatch')
        const next = new Map(actual.current.map(r => [r.id, r]))
        for (const row of remote) {
          const local = next.get(row.id)
          const payload = local?.dirty ? mergeAnnotation(local.payload, row.payload) : row.payload
          next.set(row.id, { id: row.id, payload, revision: row.revision, dirty: canonicalAnnotation(payload) !== canonicalAnnotation(row.payload) })
        }
        publish([...next.values()])
        if (remote.length < 500) break
      }
      // Bounded CAS retries; unsent operations stay in the durable local queue.
      for (let pass = 0; pass < 3; pass++) {
        const pending = actual.current.filter(r => r.dirty)
        if (!pending.length) break
        for (const operation of pending) {
          const { data, error } = await supabase.rpc('sync_myqbank_annotation', { p_id: operation.id, p_payload: operation.payload, p_expected_revision: operation.revision })
          if (!valid()) return
          if (error) throw error
          const response = z.object({ ok: z.boolean(), row: RowZ.nullable() }).parse(data)
          if (!response.row || response.row.user_id !== userId || response.row.id !== operation.id) throw new Error('Annotation access changed')
          const row = response.row
          publish(actual.current.map(local => {
            if (local.id !== row.id) return local
            const payload = mergeAnnotation(local.payload, row.payload)
            return { ...local, payload, revision: row.revision, dirty: canonicalAnnotation(payload) !== canonicalAnnotation(row.payload) }
          }))
        }
      }
      setStatus(actual.current.some(r => r.dirty) ? 'Changes pending · retry sync' : 'Annotations synced')
    } catch { if (valid()) setStatus(localFailed.current ? 'Could not save annotations · keep this window open and retry' : 'Saved on this device · retry sync') }
    finally { if (valid()) busy.current = false }
  }, [publish, userId])
  useEffect(() => {
    alive.current = true
    epoch.current++; busy.current = false
    let cancelled = false
    void (async () => {
      const sources: unknown[] = []
      try { sources.push(await leer(key, { estricto: true })) } catch { /* backup below */ }
      try { sources.push(JSON.parse(localStorage.getItem(key) ?? 'null')) } catch { /* keep cloud recovery available */ }
      if (cancelled) return
      const next = new Map<string, AnnotationRecord>()
      for (const source of sources) {
        const saved = SavedZ.safeParse(source)
        if (!saved.success || saved.data.userId !== userId) continue
        for (const row of saved.data.rows) {
          const previous = next.get(row.id)
          next.set(row.id, previous ? { ...row, payload: mergeAnnotation(previous.payload, row.payload),
            revision: Math.max(previous.revision, row.revision), dirty: previous.dirty || row.dirty } : row)
        }
      }
      actual.current = [...next.values()]; setRows(actual.current); loaded.current = true; setReady(true)
      await sync()
    })()
    const activate = () => { void sync() }
    window.addEventListener('online', activate); window.addEventListener('focus', activate)
    const interval = setInterval(activate, 30000)
    return () => { cancelled = true; alive.current = false; loaded.current = false; epoch.current++; clearInterval(interval); clearTimeout(saveTimer.current)
      window.removeEventListener('online', activate); window.removeEventListener('focus', activate) }
  }, [key, userId, sync])
  const save = (id: string, input: Annotation) => {
    if (!loaded.current) return
    const payload = AnnotationZ.parse(input), previous = actual.current.find(r => r.id === id)
    const record = { id, payload: previous ? mergeAnnotation(previous.payload, payload) : payload, revision: previous?.revision ?? 0, dirty: true }
    publish([...actual.current.filter(r => r.id !== id), record]); setStatus('Saved on this device · sync pending')
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => { void sync() }, 650)
  }
  const restore = (input: unknown): string => {
    if (input === undefined) return ''
    const backup = SavedZ.safeParse(input)
    if (!loaded.current || !backup.success || backup.data.userId !== userId) return 'Annotations were not imported: the backup must belong to this account.'
    const next = new Map(actual.current.map(r => [r.id, r]))
    for (const row of backup.data.rows) {
      const previous = next.get(row.id)
      next.set(row.id, { id: row.id, payload: previous ? mergeAnnotation(previous.payload, row.payload) : row.payload, revision: previous?.revision ?? 0, dirty: true })
    }
    publish([...next.values()]); void sync()
    return `${backup.data.rows.length} annotations restored; deletions are preserved.`
  }
  return <C.Provider value={{ rows, ready, status, save, sync, restore }}>{children}</C.Provider>
}
export function useAnnotations() { const value = useContext(C); if (!value) throw new Error('Annotations require an account'); return value }
