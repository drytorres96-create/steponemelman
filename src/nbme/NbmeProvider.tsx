import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { leer, escribir } from '../store/db'
import { apartarCopia } from '../store/apartar'
import { crearUUID } from '../store/model'
import { createNbmeApi, parseNbmeCatalog, parseNbmeQuestion, questionRefKey, NbmeAccessError } from './api'
import { preguntaConLecturasDudosas } from './texto'
import { emptyNbmeState, parseNbmeState, mergeNbmeStates, startNbmeSession, setNbmeDraft,
  submitNbmeAnswer, reviewNbmeAnswer, updateNbmeSession, activateNbmeSession, deriveNbmeSession, updateNbmeFilters,
  discardNbmeSession, countNbmeSessionAttempts, setNbmeBankVersion } from './model'
import { NbmeSyncEngine, parseNbmeSnapshot, stableNbmeJson, type NbmeSnapshot, type NbmeSyncReply } from './sync'
import type { NbmeAttempt, NbmeCatalog, NbmeFilters, NbmeQuestion, NbmeQuestionRef, NbmeSession,
  NbmeSessionView, NbmeState } from './types'

export interface NbmeSyncStatus {
  state: 'initializing' | 'pending' | 'syncing' | 'synced' | 'offline' | 'error'
  message: string
  lastSyncedAt: number | null
}
interface NbmeContextValue {
  catalog: NbmeCatalog | null
  state: NbmeState
  currentSession: NbmeSession | null
  sessionView: NbmeSessionView | null
  currentQuestion: NbmeQuestion | null
  sessionQuestions: NbmeQuestion[]
  selectedOption: string | null
  currentFeedback: NbmeAttempt | null
  filters: NbmeFilters
  loading: boolean
  questionLoading: boolean
  busy: boolean
  elapsedMs: number
  budgetReached: boolean
  error: string | null
  storageWarning: string | null
  /** Aviso de arranque que no depende de guardar: la copia local estaba dañada y se apartó. */
  localNotice: string | null
  dismissLocalNotice(): void
  syncStatus: NbmeSyncStatus
  /**
   * `reuseRecentCatalog` evita volver a pedir el catálogo (~180 KB) si esta pestaña lo
   * trajo de la red hace menos de diez minutos: las cajas abren una sesión por
   * pregunta y no tienen que esperar una descarga entera entre una y la siguiente.
   */
  startSession(refs: NbmeQuestionRef[], options?: { title?: string; budgetMinutes?: 10 | 20 | 30 | null; reuseRecentCatalog?: boolean }): Promise<boolean>
  selectAnswer(optionId: string): void
  checkAnswer(): void
  nextQuestion(): void
  pauseSession(): void
  resumeSession(id: string): Promise<boolean>
  /** Salida siempre disponible para un bloque que ya no puede terminarse. */
  discardSession(id: string): boolean
  attemptsInSession(id: string): number
  continueSession(): void
  continueWithoutBudget(): void
  setFilters(filters: Partial<NbmeFilters>): void
  syncNow(): Promise<boolean>
  reloadCatalog(): Promise<void>
  /** true cuando el catálogo mostrado viene de la copia local y aún no se ha refrescado. */
  catalogStale: boolean
  retryQuestionLoad(): Promise<void>
  loadFigure(assetId: string, signal?: AbortSignal): Promise<Blob>
}
const NbmeContext = createContext<NbmeContextValue | null>(null)
/** Cuánto vale un catálogo recién traído de la red para quien pide reutilizarlo. */
const RECENT_CATALOG_MS = 10 * 60_000
interface SavedState { userId: string; state: NbmeState; snapshot: NbmeSnapshot | null; savedAt: number }
function parseSavedState(value: unknown, userId: string): SavedState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const state = parseNbmeState(row.state)
  const snapshot = row.snapshot === null ? null : parseNbmeSnapshot(row.snapshot)
  if (row.userId !== userId || !state || !Number.isFinite(row.savedAt) || Number(row.savedAt) < 0
    || (row.snapshot !== null && !snapshot) || (snapshot?.user_id && snapshot.user_id !== userId)) return null
  return { userId, state, snapshot, savedAt: Number(row.savedAt) }
}
function userError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Mount with a key equal to userId, inside the verified AuthGate. */
export function NbmeProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const api = useMemo(() => createNbmeApi(userId), [userId])
  const key = `nbme-state:${userId}`
  const [state, setState] = useState<NbmeState>(() => emptyNbmeState())
  const [catalog, setCatalog] = useState<NbmeCatalog | null>(null)
  const currentCatalog = useRef<NbmeCatalog | null>(null)
  currentCatalog.current = catalog
  const [loading, setLoading] = useState(true)
  const [questionLoading, setQuestionLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState<string | null>(null)
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<NbmeSyncStatus>({ state: 'initializing', message: 'Preparando tus preguntas…', lastSyncedAt: null })
  const [change, setChange] = useState(0)
  const [contentChange, setContentChange] = useState(0)
  const [shownSessionId, setShownSessionId] = useState<string | null>(null)
  const [catalogStale, setCatalogStale] = useState(false)
  const [elapsedNow, setElapsedNow] = useState(0)
  const actual = useRef(state)
  const mounted = useRef(false)
  const engineRef = useRef<NbmeSyncEngine | null>(null)
  const writes = useRef(Promise.resolve())
  const syncing = useRef<{ engine: NbmeSyncEngine; promise: Promise<boolean> } | null>(null)
  const questions = useRef(new Map<string, NbmeQuestion>())
  const controllers = useRef(new Set<AbortController>())
  const loadingContent = useRef<Promise<void> | null>(null)
  const actionLock = useRef(false)
  const engagedSession = useRef<string | null>(null)
  const clock = useRef({ sessionId: null as string | null, position: null as number | null,
    tickAt: Date.now(), pendingMs: 0, questionMs: 0, running: false, answering: false })
  const aliveEpoch = useRef(0)
  const accessDenied = useRef(false)
  /** Cuándo llegó de la red el catálogo actual; `null` mientras sólo hay copia local. */
  const catalogFetchedAt = useRef<number | null>(null)

  const denyAccess = useCallback((failure: unknown) => {
    if (!(failure instanceof NbmeAccessError)) return
    accessDenied.current = true
    engagedSession.current = null
    catalogFetchedAt.current = null
    questions.current.clear()
    setCatalog(null)
    setContentChange(n => n + 1)
    setError(failure.message)
  }, [])

  const persist = useCallback((): Promise<void> => {
    const record: SavedState = { userId, state: actual.current, snapshot: engineRef.current?.snapshot ?? null, savedAt: Date.now() }
    let backupFailed = false
    try { localStorage.setItem(`step1-backup:${key}`, JSON.stringify(record)) }
    catch { backupFailed = true }
    const epoch = aliveEpoch.current
    const result = writes.current.catch(() => undefined).then(() => escribir(key, record, { estricto: true }))
    writes.current = result
    void result.then(() => {
      if (mounted.current && epoch === aliveEpoch.current) setStorageWarning(backupFailed
        ? 'El respaldo rápido no está disponible. La copia local principal se guardó; sincroniza antes de cerrar.' : null)
    }, () => {
      if (mounted.current && epoch === aliveEpoch.current) setStorageWarning(backupFailed
        ? 'No se pudo guardar en este dispositivo. Mantén la página abierta y pulsa Sincronizar.'
        : 'La copia local principal no pudo guardarse. Se conserva el respaldo rápido; sincroniza antes de cerrar.')
    })
    return result
  }, [key, userId])
  const replace = useCallback((next: NbmeState) => {
    if (!mounted.current) return
    actual.current = next
    setState(next)
    void persist().catch(() => undefined)
  }, [persist])
  const edit = useCallback((transform: (previous: NbmeState) => NbmeState) => {
    if (!mounted.current || !engineRef.current) return
    const next = transform(actual.current)
    if (stableNbmeJson(next) === stableNbmeJson(actual.current)) return
    replace(next)
    setChange(n => n + 1)
    setSyncStatus(previous => ({ ...previous, state: navigator.onLine ? 'pending' : 'offline',
      message: navigator.onLine ? 'Guardando cambios…' : 'Sin conexión; falta sincronizar los cambios de este dispositivo.' }))
  }, [replace])
  const tickTime = useCallback(() => {
    const now = Date.now()
    const id = actual.current.activeSessionId
    const session = id ? actual.current.sessions[id] : null
    const view = id ? deriveNbmeSession(actual.current, id) : null
    if (clock.current.sessionId !== id) {
      clock.current = { sessionId: id, position: view?.current?.position ?? null, tickAt: now,
        pendingMs: 0, questionMs: 0, running: false, answering: false }
    }
    const current = clock.current
    const delta = Math.max(0, Math.min(now - current.tickAt, 5_000))
    if (current.running) current.pendingMs += delta
    if (current.answering) current.questionMs += delta
    if (current.position !== (view?.current?.position ?? null)) {
      current.position = view?.current?.position ?? null
      current.questionMs = 0
    }
    current.tickAt = now
    current.running = !!session && id === engagedSession.current && !session.paused
      && document.visibilityState === 'visible' && view?.phase !== 'complete'
    current.answering = current.running && view?.phase === 'question'
    if (mounted.current) setElapsedNow((session?.elapsedMs ?? 0) + current.pendingMs)
  }, [])
  const flushTime = useCallback(() => {
    tickTime()
    const current = clock.current
    if (!current.sessionId || !current.pendingMs) return
    const id = current.sessionId
    const delta = current.pendingMs
    current.pendingMs = 0
    edit(previous => previous.sessions[id] ? updateNbmeSession(previous, id, { elapsedMs: previous.sessions[id].elapsedMs + delta }) : previous)
  }, [edit, tickTime])
  const syncNow = useCallback((): Promise<boolean> => {
    const engine = engineRef.current
    if (!engine || !mounted.current) return Promise.resolve(false)
    if (syncing.current?.engine === engine) return syncing.current.promise
    if (!navigator.onLine) {
      setSyncStatus(previous => ({ ...previous, state: 'offline', message: 'Sin conexión; falta sincronizar los cambios de este dispositivo.' }))
      return Promise.resolve(false)
    }
    const isCurrent = () => mounted.current && engineRef.current === engine
    const promise = (async () => {
      setSyncStatus(previous => ({ ...previous, state: 'syncing', message: 'Sincronizando preguntas…' }))
      try {
        await engine.fetchAndMerge()
        if (!isCurrent()) return false
        await engine.flush()
        if (!isCurrent()) return false
        // Cloud success is useful even if this browser has no persistent storage.
        await persist().catch(() => undefined)
        if (!isCurrent()) return false
        if (stableNbmeJson(actual.current) !== stableNbmeJson(engine.snapshot?.state)) {
          setSyncStatus(previous => ({ ...previous, state: 'pending', message: 'Guardando los cambios más recientes…' }))
          setChange(n => n + 1)
          return false
        }
        setSyncStatus({ state: 'synced', message: 'Preguntas sincronizadas', lastSyncedAt: Date.now() })
        return true
      } catch {
        if (isCurrent()) setSyncStatus(previous => ({ ...previous, state: navigator.onLine ? 'error' : 'offline',
          message: 'Falta sincronizar las preguntas. Mantén la página abierta y vuelve a intentar.' }))
        return false
      }
    })()
    syncing.current = { engine, promise }
    void promise.then(() => { if (syncing.current?.promise === promise) syncing.current = null })
    return promise
  }, [persist])

  const reloadCatalog = useCallback(async (): Promise<void> => {
    const epoch = aliveEpoch.current
    const controller = new AbortController()
    controllers.current.add(controller)
    try {
      const next = await api.catalog(controller.signal)
      if (!mounted.current || epoch !== aliveEpoch.current) return
      accessDenied.current = false
      catalogFetchedAt.current = Date.now()
      setCatalog(next)
      setCatalogStale(false)
      // La versión del banco pasa al estado: es la clave con la que se detecta una corrección.
      edit(previous => setNbmeBankVersion(previous, next.bankVersion))
      setError(null)
      await escribir(`nbme-catalog:${userId}`, { userId, catalog: next }, { estricto: true }).catch(() => undefined)
    } catch (failure) {
      if (mounted.current && epoch === aliveEpoch.current && !controller.signal.aborted) {
        denyAccess(failure)
        setError(userError(failure, 'No se pudo cargar el catálogo de preguntas.'))
      }
    } finally { controllers.current.delete(controller) }
  }, [api, userId, denyAccess, edit])

  const ensureQuestions = useCallback(async (refs: NbmeQuestionRef[]): Promise<void> => {
    if (accessDenied.current) throw new NbmeAccessError(403, 'Vuelve a comprobar el acceso al banco antes de continuar.')
    const epoch = aliveEpoch.current
    const isCurrent = () => mounted.current && epoch === aliveEpoch.current
    const missing = refs.filter(ref => !questions.current.has(questionRefKey(ref)))
    if (!missing.length) return
    await Promise.all(missing.map(async ref => {
      const value = await leer<unknown>(`nbme-question:${userId}:${questionRefKey(ref)}`)
      if (!value || typeof value !== 'object' || !('userId' in value) || value.userId !== userId || !('question' in value)) return
      const question = parseNbmeQuestion(value.question)
      if (question && questionRefKey(question) === questionRefKey(ref) && isCurrent()) questions.current.set(questionRefKey(ref), question)
    }))
    if (!isCurrent()) return
    const remaining = refs.filter(ref => !questions.current.has(questionRefKey(ref)))
    if (remaining.length) {
      const controller = new AbortController()
      controllers.current.add(controller)
      try {
        const received = await api.questions(remaining, controller.signal)
        if (!isCurrent()) return
        for (const question of received) questions.current.set(questionRefKey(question), question)
        // Content cache is optional; progress persistence has its own strict error handling.
        await Promise.all(received.map(question => escribir(`nbme-question:${userId}:${questionRefKey(question)}`, { userId, question }, { estricto: true }).catch(() => undefined)))
      } catch (failure) { if (isCurrent()) denyAccess(failure); throw failure }
      finally { controllers.current.delete(controller) }
    }
    if (isCurrent()) setContentChange(n => n + 1)
  }, [api, userId, denyAccess])

  useEffect(() => {
    mounted.current = true
    const epoch = ++aliveEpoch.current
    let stopped = false
    engineRef.current = null
    accessDenied.current = false
    engagedSession.current = null
    catalogFetchedAt.current = null
    actual.current = emptyNbmeState()
    setState(actual.current)
    setCatalog(null)
    setShownSessionId(null)
    setLocalNotice(null)
    setLoading(true)
    questions.current.clear()
    const isCurrent = () => !stopped && mounted.current && epoch === aliveEpoch.current
    void (async () => {
      let stored: unknown = null
      let backup: unknown = null
      let readFailure = false
      let corruptBackup = false
      try { stored = await leer<unknown>(key, { estricto: true }) } catch { readFailure = true }
      let rawBackup: string | null = null
      try { rawBackup = localStorage.getItem(`step1-backup:${key}`) } catch { readFailure = true }
      try { backup = JSON.parse(rawBackup || 'null') } catch { corruptBackup = true }
      const principal = parseSavedState(stored, userId)
      const fallback = parseSavedState(backup, userId)
      // Como en el progreso de conceptos: una copia ilegible se aparta entera y las preguntas
      // se recuperan de la cuenta, en vez de dejar el banco bloqueado.
      const discarded = !principal && !fallback && (corruptBackup || stored !== null || backup !== null)
      if (discarded && !await apartarCopia(key, `step1-backup:${key}`, { copia: stored, respaldo: corruptBackup ? rawBackup : backup })) {
        throw new Error('La copia local de preguntas no es válida y no pudo apartarse.')
      }
      const saved = principal && fallback ? (principal.savedAt >= fallback.savedAt ? principal : fallback) : principal ?? fallback
      if (!isCurrent()) return
      if (discarded) setLocalNotice('La copia de preguntas NBME de este dispositivo estaba dañada. Se apartó sin borrarla y tus preguntas se recuperaron de tu cuenta.')
      if (readFailure) setStorageWarning('No se pudo leer uno de los respaldos locales. Sincroniza para recuperar el progreso de tu cuenta.')
      actual.current = principal && fallback ? mergeNbmeStates(principal.state, fallback.state) : saved?.state ?? emptyNbmeState()
      setState(actual.current)
      let engine: NbmeSyncEngine
      const check = () => { if (!isCurrent() || engineRef.current !== engine) throw new Error('La cuenta ya no está activa.') }
      engine = new NbmeSyncEngine({
        load: async () => {
          check()
          const { data, error: failure } = await supabase.from('nbme_state').select('*').eq('user_id', userId).maybeSingle()
          check()
          if (failure) throw failure
          if (!data) return null
          const snapshot = parseNbmeSnapshot(data)
          if (!snapshot || snapshot.user_id !== userId) throw new Error('El progreso remoto no es válido.')
          return snapshot
        },
        peek: async () => {
          check()
          const { data, error: failure } = await supabase.from('nbme_state').select('revision, generation').eq('user_id', userId).maybeSingle()
          check()
          if (failure) throw failure
          return data && Number.isSafeInteger(data.revision) && typeof data.generation === 'string'
            ? { revision: data.revision as number, generation: data.generation } : null
        },
        save: async ({ state: candidate, expectedRevision, generation }) => {
          check()
          const { data, error: failure } = await supabase.rpc('sync_nbme_state', { p_state: candidate,
            p_expected_revision: expectedRevision, p_generation: generation })
          check()
          if (failure) throw failure
          const reply = data as NbmeSyncReply
          if (!reply || (reply.row && reply.row.user_id !== userId)) throw new Error('La respuesta de guardado no corresponde a esta cuenta.')
          return reply
        },
      }, { getLocal: () => actual.current, setLocal: next => { if (isCurrent()) replace(next) },
        onSnapshot: () => { if (isCurrent()) void persist().catch(() => undefined) } }, saved?.snapshot ?? null)
      engineRef.current = engine
      const cachedCatalog = await leer<unknown>(`nbme-catalog:${userId}`)
      if (!isCurrent()) return
      let desdeCache = false
      if (cachedCatalog && typeof cachedCatalog === 'object' && 'userId' in cachedCatalog && cachedCatalog.userId === userId && 'catalog' in cachedCatalog) {
        const previo = parseNbmeCatalog(cachedCatalog.catalog)
        setCatalog(previo)
        desdeCache = !!previo
      }
      setCatalogStale(desdeCache)
      setLoading(false)
      // El catálogo pesa ~180 KB y se pedía en cada arranque, aunque fuera a estudiar conceptos.
      // Con copia local se refresca al abrir «Preguntas»; sin ella hace falta ahora, pero no
      // bloquea la sincronización del progreso.
      await syncNow()
      if (!desdeCache) void reloadCatalog()
    })().catch(failure => {
      if (isCurrent()) { setError(userError(failure, 'No se pudo preparar tu banco de preguntas.')); setLoading(false) }
    })
    return () => {
      stopped = true
      mounted.current = false
      ++aliveEpoch.current
      engineRef.current = null
      syncing.current = null
      controllers.current.forEach(controller => controller.abort())
      controllers.current.clear()
      questions.current.clear()
      loadingContent.current = null
    }
  }, [key, userId, reloadCatalog, replace, persist, syncNow])

  const displaySessionId = state.activeSessionId ?? shownSessionId
  const currentSession = displaySessionId ? state.sessions[displaySessionId] ?? null : null
  const sessionView = useMemo(() => displaySessionId ? deriveNbmeSession(state, displaySessionId) : null, [state, displaySessionId])
  const currentRef = sessionView?.current ?? null
  const currentKey = currentRef ? questionRefKey(currentRef) : null
  const currentQuestion = currentKey ? questions.current.get(currentKey) ?? null : null
  const currentPosition = currentRef?.position ?? null
  const selectedOption = sessionView?.attempt?.optionId ?? (currentSession && currentPosition !== null ? currentSession.drafts[String(currentPosition)]?.optionId ?? null : null)

  const retryQuestionLoad = useCallback(async (): Promise<void> => {
    const sessionId = actual.current.activeSessionId
    const session = sessionId ? actual.current.sessions[sessionId] : null
    if (!session) return
    if (loadingContent.current) return loadingContent.current
    const epoch = aliveEpoch.current
    setQuestionLoading(true)
    const operation = (async () => {
      try {
        await ensureQuestions(session.initial)
        if (mounted.current && epoch === aliveEpoch.current) setError(null)
      } catch (failure) {
        if (mounted.current && epoch === aliveEpoch.current) setError(userError(failure, 'No se pudieron recuperar las preguntas de tu sesión.'))
      } finally {
        if (mounted.current && epoch === aliveEpoch.current) setQuestionLoading(false)
      }
    })()
    loadingContent.current = operation
    void operation.then(() => { if (loadingContent.current === operation) loadingContent.current = null })
    return operation
  }, [ensureQuestions])
  useEffect(() => {
    if (!loading && currentSession && !currentQuestion && sessionView?.phase !== 'complete') void retryQuestionLoad()
  }, [loading, currentSession?.id, currentKey, currentQuestion, sessionView?.phase, retryQuestionLoad])
  useEffect(() => { if (state.activeSessionId) setShownSessionId(state.activeSessionId) }, [state.activeSessionId])
  useEffect(() => {
    const tick = setInterval(tickTime, 1_000)
    const flush = setInterval(flushTime, 15_000)
    const visibility = () => { flushTime(); tickTime() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', flushTime)
    return () => {
      clearInterval(tick)
      clearInterval(flush)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', flushTime)
    }
  }, [tickTime, flushTime])
  useEffect(() => {
    if (loading || !change) return
    const timer = setTimeout(() => { void syncNow() }, 650)
    return () => clearTimeout(timer)
  }, [loading, change, syncNow])
  useEffect(() => {
    const activate = () => { if (document.visibilityState === 'visible') void syncNow() }
    const persistOnExit = () => { if (engineRef.current) void persist().catch(() => undefined) }
    window.addEventListener('online', activate)
    window.addEventListener('focus', activate)
    document.addEventListener('visibilitychange', activate)
    window.addEventListener('pagehide', persistOnExit)
    const interval = setInterval(activate, 30_000)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', activate)
      window.removeEventListener('focus', activate)
      document.removeEventListener('visibilitychange', activate)
      window.removeEventListener('pagehide', persistOnExit)
    }
  }, [persist, syncNow])

  const startSession = useCallback(async (refs: NbmeQuestionRef[], options: { title?: string; budgetMinutes?: 10 | 20 | 30 | null; reuseRecentCatalog?: boolean } = {}): Promise<boolean> => {
    if (actionLock.current || !engineRef.current || !catalog) return false
    if (!refs.length || refs.length > 20 || new Set(refs.map(questionRefKey)).size !== refs.length
      || refs.some(ref => !catalog.questions.some(q => q.status === 'ready' && questionRefKey(q) === questionRefKey(ref)))) {
      setError('Selecciona entre una y veinte preguntas disponibles para estudiar.')
      return false
    }
    actionLock.current = true
    setBusy(true)
    const epoch = aliveEpoch.current
    try {
      const reciente = !!options.reuseRecentCatalog && catalogFetchedAt.current !== null
        && Date.now() - catalogFetchedAt.current < RECENT_CATALOG_MS
      if (navigator.onLine && !reciente) {
        const fresh = await api.catalog()
        if (!mounted.current || epoch !== aliveEpoch.current) return false
        accessDenied.current = false
        catalogFetchedAt.current = Date.now()
        setCatalog(fresh)
        if (refs.some(ref => !fresh.questions.some(q => q.status === 'ready' && questionRefKey(q) === questionRefKey(ref)))) {
          throw new Error('El banco se ha actualizado. Revisa tu selección e inicia el bloque de nuevo.')
        }
      }
      await ensureQuestions(refs)
      if (!mounted.current || epoch !== aliveEpoch.current) return false
      const id = crearUUID()
      flushTime()
      edit(previous => startNbmeSession(previous, { id, title: options.title || 'Preguntas de aplicación', refs,
        budgetMinutes: options.budgetMinutes ?? null }))
      setShownSessionId(id)
      engagedSession.current = id
      tickTime()
      setError(null)
      return true
    } catch (failure) {
      if (mounted.current && epoch === aliveEpoch.current) denyAccess(failure)
      if (mounted.current && epoch === aliveEpoch.current) setError(userError(failure, 'No se pudo iniciar el bloque.'))
      return false
    } finally {
      actionLock.current = false
      if (mounted.current && epoch === aliveEpoch.current) setBusy(false)
    }
  }, [catalog, edit, ensureQuestions, flushTime, tickTime, api, denyAccess])
  const resumeSession = useCallback(async (id: string): Promise<boolean> => {
    if (actionLock.current || !engineRef.current) return false
    const session = actual.current.sessions[id]
    if (!session) return false
    actionLock.current = true
    setBusy(true)
    const epoch = aliveEpoch.current
    try {
      if (navigator.onLine) {
        const fresh = await api.catalog()
        if (!mounted.current || epoch !== aliveEpoch.current) return false
        accessDenied.current = false
        setCatalog(fresh)
        // Comparar sólo el id dejaba reanudar un bloque fijado a una revisión anterior y
        // calificarlo contra el contenido sin corregir.
        const vigente = new Map(fresh.questions.map(q => [q.id, q]))
        const retiradas = session.initial.filter(ref => vigente.get(ref.id)?.status !== 'ready')
        const corregidas = session.initial.filter(ref => {
          const q = vigente.get(ref.id)
          return q?.status === 'ready' && q.revision !== ref.revision
        })
        if (retiradas.length) {
          throw new Error(`${retiradas.length === 1 ? 'Una pregunta' : `${retiradas.length} preguntas`} de este bloque se retiraron del banco, así que no puede terminarse. Puedes descartarlo desde la biblioteca; tu progreso del resto se conserva.`)
        }
        if (corregidas.length) {
          throw new Error(`${corregidas.length === 1 ? 'Una pregunta' : `${corregidas.length} preguntas`} de este bloque se corrigieron después de que lo empezaras. No se califica contra la versión antigua: descarta el bloque y empieza uno nuevo.`)
        }
      }
      await ensureQuestions(session.initial)
      if (!mounted.current || epoch !== aliveEpoch.current) return false
      flushTime()
      edit(previous => updateNbmeSession(activateNbmeSession(previous, id), id, { paused: false }))
      setShownSessionId(id)
      engagedSession.current = id
      tickTime()
      setError(null)
      return true
    } catch (failure) {
      if (mounted.current && epoch === aliveEpoch.current) denyAccess(failure)
      if (mounted.current && epoch === aliveEpoch.current) setError(userError(failure, 'No se pudo continuar el bloque.'))
      return false
    } finally {
      actionLock.current = false
      if (mounted.current && epoch === aliveEpoch.current) setBusy(false)
    }
  }, [edit, ensureQuestions, flushTime, tickTime, api, denyAccess])
  const selectAnswer = useCallback((optionId: string) => {
    if (accessDenied.current) return
    const id = actual.current.activeSessionId
    const view = id ? deriveNbmeSession(actual.current, id) : null
    const question = view?.current ? questions.current.get(questionRefKey(view.current)) : null
    if (!id || !view?.current || view.phase !== 'question' || actual.current.sessions[id].paused
      || !question?.options.some(option => option.id === optionId)) return
    edit(previous => setNbmeDraft(previous, id, view.current!.position, optionId))
  }, [edit])
  const checkAnswer = useCallback(() => {
    if (accessDenied.current) return
    const id = actual.current.activeSessionId
    const view = id ? deriveNbmeSession(actual.current, id) : null
    const question = view?.current ? questions.current.get(questionRefKey(view.current)) : null
    if (!id || !view?.current || view.phase !== 'question' || !question || actual.current.sessions[id].paused) return
    if (preguntaConLecturasDudosas(question)
      || !currentCatalog.current?.questions.some(q => q.id === question.id && q.status === 'ready')) {
      setError('Esta pregunta necesita revisión de la fuente. Tu sesión y tus respuestas anteriores siguen guardadas.')
      return
    }
    const optionId = actual.current.sessions[id].drafts[String(view.current.position)]?.optionId
    if (!optionId) return
    flushTime()
    const durationMs = Math.max(0, Math.min(clock.current.questionMs, 3_600_000))
    edit(previous => submitNbmeAnswer(previous, id, view.current!.position, question, optionId, durationMs))
    tickTime()
  }, [edit, flushTime, tickTime])
  const nextQuestion = useCallback(() => {
    if (accessDenied.current) return
    const id = actual.current.activeSessionId
    const view = id ? deriveNbmeSession(actual.current, id) : null
    if (!id || !view?.current || view.phase !== 'feedback' || actual.current.sessions[id].paused) return
    flushTime()
    edit(previous => reviewNbmeAnswer(previous, id, view.current!.position))
    tickTime()
  }, [edit, flushTime, tickTime])
  const pauseSession = useCallback(() => {
    flushTime()
    const id = actual.current.activeSessionId
    if (id) edit(previous => updateNbmeSession(previous, id, { paused: true }))
    engagedSession.current = null
    tickTime()
    void syncNow()
  }, [edit, syncNow, flushTime, tickTime])
  const continueSession = useCallback(() => {
    const id = actual.current.activeSessionId
    if (id) edit(previous => updateNbmeSession(previous, id, { continueUnlimited: true, paused: false }))
  }, [edit])
  const setFilters = useCallback((filters: Partial<NbmeFilters>) => edit(previous => updateNbmeFilters(previous, filters)), [edit])
  const loadFigure = useCallback((assetId: string, signal?: AbortSignal) => api.figure(assetId, signal), [api])
  const sessionQuestions = useMemo(() => currentSession?.initial.map(ref => questions.current.get(questionRefKey(ref)))
    .filter((q): q is NbmeQuestion => Boolean(q)) ?? [], [currentSession, contentChange])
  const elapsedMs = currentSession ? Math.max(currentSession.elapsedMs, elapsedNow) : 0
  const budgetReached = !!currentSession?.budgetMinutes && !currentSession.continueUnlimited
    && elapsedMs >= currentSession.budgetMinutes * 60_000
  const discardSession = useCallback((id: string): boolean => {
    if (!engineRef.current || !actual.current.sessions[id]) return false
    if (shownSessionId === id) setShownSessionId(null)
    if (engagedSession.current === id) engagedSession.current = null
    edit(previous => discardNbmeSession(previous, id))
    setError(null)
    return true
  }, [edit, shownSessionId])
  const attemptsInSession = useCallback((id: string) => countNbmeSessionAttempts(actual.current, id), [])

  const value: NbmeContextValue = { catalog, state, currentSession, sessionView, currentQuestion, sessionQuestions,
    selectedOption, currentFeedback: sessionView?.attempt ?? null, filters: state.filters, loading, questionLoading, busy,
    elapsedMs, budgetReached, error: error ?? storageWarning, storageWarning, syncStatus, catalogStale,
    localNotice, dismissLocalNotice: () => setLocalNotice(null),
    startSession, selectAnswer, checkAnswer, nextQuestion,
    pauseSession, resumeSession, discardSession, attemptsInSession, continueSession,
    continueWithoutBudget: continueSession, setFilters, syncNow, reloadCatalog, retryQuestionLoad, loadFigure }
  return <NbmeContext.Provider value={value}>{children}</NbmeContext.Provider>
}
export function useNbme(): NbmeContextValue {
  const value = useContext(NbmeContext)
  if (!value) throw new Error('useNbme debe usarse dentro de NbmeProvider')
  return value
}
