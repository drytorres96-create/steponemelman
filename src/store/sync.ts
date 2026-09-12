import { combinarEstados, leerEstadoDesconocido, serializarEstable, type EstadoApp } from './model'

export interface CloudSnapshot {
  user_id?: string
  state: EstadoApp
  revision: number
  generation: string
  updated_at: string
}

export interface SyncReply {
  ok: boolean
  kind: 'saved' | 'conflict' | 'reset' | 'missing'
  row: CloudSnapshot | null
}

export interface SyncTransport {
  load(): Promise<CloudSnapshot | null>
  save(input: { state: EstadoApp; expectedRevision: number; generation: string | null }): Promise<SyncReply>
}

export interface SyncOutcome {
  kind: 'synced' | 'merged' | 'reset' | 'empty'
  snapshot: CloudSnapshot | null
}

export class SyncError extends Error {
  constructor(public readonly code: 'missing' | 'conflict' | 'invalid', message: string) {
    super(message)
    this.name = 'SyncError'
  }
}

export type CodigoSync = SyncError['code'] | 'sin_conexion' | 'red' | 'servidor' | 'desconocido'

/**
 * Un fallo, un motivo. Antes, quedarse sin cobertura y que el progreso no se guardara mostraban
 * el mismo texto, así que no había forma de distinguirlos desde el teléfono.
 */
export function diagnosticoSync(causa: unknown): { codigo: CodigoSync; mensaje: string } {
  if (causa instanceof SyncError) return { codigo: causa.code, mensaje: causa.message }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { codigo: 'sin_conexion', mensaje: 'Sin conexión. Tus cambios están guardados en este dispositivo.' }
  }
  const texto = causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa)
  if (/\b(5\d{2})\b|server|servidor/i.test(texto)) {
    return { codigo: 'servidor', mensaje: 'El servidor no pudo guardar ahora. Tus cambios están guardados aquí; vuelve a sincronizar.' }
  }
  if (/fetch|network|networkerror|timeout|abort|conexi/i.test(texto)) {
    return { codigo: 'red', mensaje: 'No se pudo contactar con el servidor. Tus cambios están guardados en este dispositivo.' }
  }
  return { codigo: 'desconocido', mensaje: 'Cambios en este dispositivo; falta sincronizar' }
}

interface Callbacks {
  /** Debe leer una referencia actual, no el estado capturado al iniciar la petición. */
  getLocal(): EstadoApp
  /** Debe actualizar también esa referencia de forma síncrona. */
  setLocal(state: EstadoApp): void
  onSnapshot?(snapshot: CloudSnapshot): void
}

/** Valida también los datos remotos y la copia local de su revisión. */
export function leerSnapshot(value: unknown): CloudSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const state = leerEstadoDesconocido(row.state)
  if (!state || !Number.isSafeInteger(row.revision) || (row.revision as number) < 1
    || typeof row.generation !== 'string' || !row.generation
    || typeof row.updated_at !== 'string'
    || (row.user_id !== undefined && typeof row.user_id !== 'string')) return null
  return { state, revision: row.revision as number, generation: row.generation, updated_at: row.updated_at,
    ...(row.user_id === undefined ? {} : { user_id: row.user_id as string }) }
}

/**
 * Cola de sincronización con compare-and-swap. El transporte autentica al usuario;
 * este motor sólo fusiona estados y conserva los cambios hechos durante la red.
 * El proveedor persiste snapshot junto al estado y bajo una clave por usuario.
 */
export class StudySyncEngine {
  private remote: CloudSnapshot | null
  private tail: Promise<unknown> = Promise.resolve()
  private flushing: Promise<SyncOutcome> | null = null
  private epoch = 0

  constructor(private transport: SyncTransport, private callbacks: Callbacks, initialSnapshot: CloudSnapshot | null = null) {
    this.remote = initialSnapshot === null ? null : this.validar(initialSnapshot)
  }

  get snapshot(): CloudSnapshot | null { return this.remote }

  private validar(row: CloudSnapshot): CloudSnapshot {
    const checked = leerSnapshot(row)
    if (!checked) throw new SyncError('invalid', 'El servidor devolvió un progreso inválido. La copia local sigue guardada.')
    return checked
  }

  private publicar(row: CloudSnapshot, state: EstadoApp): void {
    this.remote = row
    if (serializarEstable(state) !== serializarEstable(this.callbacks.getLocal())) this.callbacks.setLocal(state)
    this.callbacks.onSnapshot?.(row)
  }

  private encolar(operation: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
    const result = this.tail.then(operation)
    this.tail = result.catch(() => undefined)
    return result
  }

  /** Se llama con la fila que devuelve reset_study_state, incluso con una petición en curso. */
  acceptReset(snapshot: CloudSnapshot): SyncOutcome {
    const row = this.validar(snapshot)
    this.epoch++
    this.publicar(row, row.state)
    return { kind: 'reset', snapshot: row }
  }

  fetchAndMerge(): Promise<SyncOutcome> {
    return this.encolar(async () => {
      const epoch = this.epoch
      const response = await this.transport.load()
      if (epoch !== this.epoch) return { kind: 'reset', snapshot: this.remote }
      if (response === null) {
        if (this.remote) throw new SyncError('missing', 'El progreso remoto ya no existe. No se ha vuelto a crear con datos antiguos.')
        return { kind: 'empty', snapshot: null }
      }
      const row = this.validar(response)
      if (this.remote && this.remote.generation !== row.generation) return this.acceptReset(row)
      this.publicar(row, combinarEstados(this.callbacks.getLocal(), row.state))
      return { kind: 'merged', snapshot: row }
    })
  }

  flush(): Promise<SyncOutcome> {
    if (this.flushing) return this.flushing
    const result = this.encolar(() => this.guardar())
    this.flushing = result
    // Dos manejadores evitan crear una promesa rechazada sin observador mediante finally().
    void result.then(() => { if (this.flushing === result) this.flushing = null },
      () => { if (this.flushing === result) this.flushing = null })
    return result
  }

  private async guardar(): Promise<SyncOutcome> {
    const epoch = this.epoch
    for (let attempt = 0; attempt < 5; attempt++) {
      const base = this.remote
      const local = this.callbacks.getLocal()
      const candidate = combinarEstados(local, base?.state ?? local)
      const response = await this.transport.save({ state: candidate,
        expectedRevision: base?.revision ?? 0, generation: base?.generation ?? null })
      if (epoch !== this.epoch) return { kind: 'reset', snapshot: this.remote }
      if (response.kind === 'missing') {
        throw new SyncError('missing', 'El progreso remoto ya no existe. No se ha vuelto a crear con datos antiguos.')
      }
      if (!response.row) throw new SyncError('invalid', 'El servidor no devolvió la versión guardada del progreso.')
      const row = this.validar(response.row)
      if (response.kind === 'reset' || (base && base.generation !== row.generation)) return this.acceptReset(row)
      if (response.kind !== 'saved' && response.kind !== 'conflict') throw new SyncError('invalid', 'Respuesta de sincronización desconocida.')
      if ((response.kind === 'saved') !== response.ok) throw new SyncError('invalid', 'Respuesta de sincronización inconsistente.')
      // Leer ahora evita borrar un intento registrado mientras esperaba la petición.
      const merged = combinarEstados(this.callbacks.getLocal(), row.state)
      this.publicar(row, merged)
      if (response.kind === 'saved' && serializarEstable(merged) === serializarEstable(row.state)) {
        return { kind: 'synced', snapshot: row }
      }
    }
    throw new SyncError('conflict', 'Hay cambios simultáneos pendientes. El progreso local está guardado; vuelve a sincronizar.')
  }
}
