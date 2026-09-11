import { emptyNbmeState, mergeNbmeStates, parseNbmeState } from './model'
import type { NbmeState } from './types'

export interface NbmeSnapshot {
  user_id?: string
  state: NbmeState
  revision: number
  generation: string
  updated_at: string
}
export interface NbmeSyncReply {
  ok: boolean
  kind: 'saved' | 'conflict' | 'reset' | 'missing'
  row: NbmeSnapshot | null
}
export interface NbmeSyncTransport {
  load(): Promise<NbmeSnapshot | null>
  save(input: { state: NbmeState; expectedRevision: number; generation: string | null }): Promise<NbmeSyncReply>
}
export function stableNbmeJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current
    return Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
  })
}
export function parseNbmeSnapshot(value: unknown): NbmeSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const state = parseNbmeState(row.state)
  if (!state || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1
    || typeof row.generation !== 'string' || !row.generation
    || typeof row.updated_at !== 'string'
    || (row.user_id !== undefined && typeof row.user_id !== 'string')) return null
  return { state, revision: Number(row.revision), generation: row.generation, updated_at: row.updated_at,
    ...(row.user_id === undefined ? {} : { user_id: row.user_id as string }) }
}

/** CAS synchronization is independent of the older conceptual study_state format. */
export class NbmeSyncEngine {
  private remote: NbmeSnapshot | null
  private tail: Promise<unknown> = Promise.resolve()
  private flushing: Promise<void> | null = null
  constructor(private transport: NbmeSyncTransport,
    private callbacks: { getLocal(): NbmeState; setLocal(state: NbmeState): void; onSnapshot?(row: NbmeSnapshot): void },
    initial: NbmeSnapshot | null = null) {
    this.remote = initial === null ? null : this.validate(initial)
  }
  get snapshot(): NbmeSnapshot | null { return this.remote }
  private validate(value: unknown): NbmeSnapshot {
    const row = parseNbmeSnapshot(value)
    if (!row) throw new Error('El progreso de preguntas recibido no es válido.')
    return row
  }
  private publish(row: NbmeSnapshot, merged: NbmeState): void {
    this.remote = row
    if (stableNbmeJson(merged) !== stableNbmeJson(this.callbacks.getLocal())) this.callbacks.setLocal(merged)
    this.callbacks.onSnapshot?.(row)
  }
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.tail.then(operation)
    this.tail = result.catch(() => undefined)
    return result
  }
  fetchAndMerge(): Promise<void> {
    return this.enqueue(async () => {
      const response = await this.transport.load()
      if (response === null) {
        if (this.remote) throw new Error('El progreso remoto ya no existe; no se recreó con una copia antigua.')
        return
      }
      const row = this.validate(response)
      // A different generation represents an explicit server-side reset.
      const reset = this.remote !== null && this.remote.generation !== row.generation
      this.publish(row, reset ? row.state : mergeNbmeStates(this.callbacks.getLocal(), row.state))
    })
  }
  flush(): Promise<void> {
    if (this.flushing) return this.flushing
    const result = this.enqueue(async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const base = this.remote
        const local = this.callbacks.getLocal()
        const candidate = mergeNbmeStates(local, base?.state ?? emptyNbmeState(local.bankVersion))
        if (base && stableNbmeJson(candidate) === stableNbmeJson(base.state)) return
        const response = await this.transport.save({ state: candidate,
          expectedRevision: base?.revision ?? 0, generation: base?.generation ?? null })
        if (response.kind === 'missing') throw new Error('El progreso remoto ya no existe; no se recreó con una copia antigua.')
        const row = this.validate(response.row)
        if (response.kind === 'reset' || (base && row.generation !== base.generation)) {
          this.publish(row, row.state)
          return
        }
        if (!['saved', 'conflict'].includes(response.kind) || response.ok !== (response.kind === 'saved')) {
          throw new Error('La respuesta de sincronización no es válida.')
        }
        // Read after the request: an answer may have been submitted while the network was busy.
        const merged = mergeNbmeStates(this.callbacks.getLocal(), row.state)
        this.publish(row, merged)
        if (response.kind === 'saved' && stableNbmeJson(merged) === stableNbmeJson(row.state)) return
      }
      throw new Error('Hay cambios simultáneos pendientes. Vuelve a sincronizar.')
    })
    this.flushing = result
    void result.then(() => { if (this.flushing === result) this.flushing = null },
      () => { if (this.flushing === result) this.flushing = null })
    return result
  }
}
