import type { NbmeAttempt, NbmeDiscarded, NbmeFilters, NbmeQuestion, NbmeQuestionProgress, NbmeQuestionRef, NbmeSession, NbmeSessionView, NbmeState } from './types'

// 20 minutos por defecto: los conceptos ya estaban protegidos con un presupuesto y el banco no,
// así que una sesión de preguntas podía crecer sin corte natural.
export const DEFAULT_NBME_FILTERS: NbmeFilters = { form: 'all', system: '', discipline: '', status: 'all', quality: 'ready', size: 10, budgetMinutes: 20 }
export function emptyNbmeState(bankVersion = '1.0.0'): NbmeState {
  return { version: 1, bankVersion, discarded: {}, sessions: {}, attempts: {}, activeSessionId: null, activeChangedAt: 0,
    filters: { ...DEFAULT_NBME_FILTERS }, filtersChangedAt: 0 }
}
/** Cuántas lápidas se conservan: las más recientes bastan para no resucitar nada vivo. */
export const MAX_LAPIDAS = 200
function podarLapidas(discarded: NbmeDiscarded): NbmeDiscarded {
  const entradas = Object.entries(discarded)
  if (entradas.length <= MAX_LAPIDAS) return discarded
  return Object.fromEntries(entradas.sort((a, b) => b[1] - a[1]).slice(0, MAX_LAPIDAS))
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER
const int = (v: unknown): v is number => num(v) && Number.isInteger(v)
const text = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.length <= max
const id = (v: unknown): v is string => text(v, 512) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v)
  && v !== 'prototype' && !Object.hasOwn(Object.prototype, v)
const budget = (v: unknown): v is 10 | 20 | 30 | null => v === null || v === 10 || v === 20 || v === 30
const key = (sid: string, position: number) => `${sid}:${position}`
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : object(v) ? `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v) ?? 'null'
const choose = <T,>(a: T, b: T, ta: number, tb: number): T => ta > tb ? a : ta < tb ? b : stable(a) >= stable(b) ? a : b
function parseFilters(v: unknown): NbmeFilters | null {
  if (!object(v) || !['all', '27', '28', '29'].includes(String(v.form)) || !text(v.system, 100) || !text(v.discipline, 100)
    || !['all', 'unseen', 'errors'].includes(String(v.status)) || !['ready', 'all', 'blocked'].includes(String(v.quality ?? 'ready'))
    || ![5, 10, 20].includes(v.size as number) || !budget(v.budgetMinutes)) return null
  return { form: v.form as NbmeFilters['form'], system: v.system, discipline: v.discipline, status: v.status as NbmeFilters['status'],
    quality: (v.quality ?? 'ready') as NbmeFilters['quality'], size: v.size as NbmeFilters['size'], budgetMinutes: v.budgetMinutes }
}
function validRef(v: unknown): v is NbmeQuestionRef { return object(v) && id(v.id) && id(v.revision) }
function parseSession(v: unknown, sessionId: string): NbmeSession | null {
  if (!object(v) || v.id !== sessionId || !id(v.id) || !text(v.title, 300) || !num(v.startedAt) || !num(v.controlChangedAt)
    || typeof v.paused !== 'boolean' || !num(v.elapsedMs) || !budget(v.budgetMinutes) || typeof v.continueUnlimited !== 'boolean'
    || !Array.isArray(v.initial) || v.initial.length < 1 || v.initial.length > 20 || !v.initial.every(validRef)
    || new Set(v.initial.map(r => r.id)).size !== v.initial.length || !object(v.drafts)) return null
  const drafts: NbmeSession['drafts'] = {}
  for (const [pos, d] of Object.entries(v.drafts)) {
    if (!/^\d{1,6}$/.test(pos) || !object(d) || !(d.optionId === null || id(d.optionId)) || !num(d.changedAt)) return null
    drafts[pos] = { optionId: d.optionId, changedAt: d.changedAt }
  }
  return { id: sessionId, title: v.title, initial: v.initial.map(r => ({ id: r.id, revision: r.revision })), startedAt: v.startedAt,
    controlChangedAt: v.controlChangedAt, paused: v.paused, elapsedMs: v.elapsedMs, budgetMinutes: v.budgetMinutes,
    continueUnlimited: v.continueUnlimited, drafts }
}
/** Independent state parser: no NBME fields are inserted into conceptual study_state. */
export function parseNbmeState(value: unknown): NbmeState | null {
  if (!object(value) || value.version !== 1 || !id(value.bankVersion) || !object(value.sessions) || !object(value.attempts)
    || !num(value.activeChangedAt) || !(value.activeSessionId === null || id(value.activeSessionId))
    || Object.keys(value.sessions).length > 20000 || Object.keys(value.attempts).length > 100000) return null
  const out = emptyNbmeState(value.bankVersion)
  out.activeSessionId = value.activeSessionId
  out.activeChangedAt = value.activeChangedAt
  const filters = value.filters === undefined ? DEFAULT_NBME_FILTERS : parseFilters(value.filters)
  if (!filters || (value.filtersChangedAt !== undefined && !num(value.filtersChangedAt))) return null
  out.filters = { ...filters }; out.filtersChangedAt = value.filtersChangedAt as number | undefined ?? 0
  if (value.discarded !== undefined) {
    if (!object(value.discarded) || Object.keys(value.discarded).length > MAX_LAPIDAS * 4) return null
    for (const [sid, cuando] of Object.entries(value.discarded)) {
      if (!id(sid) || !num(cuando)) return null
      out.discarded[sid] = cuando
    }
  }
  for (const [sid, raw] of Object.entries(value.sessions)) {
    if (out.discarded[sid]) continue   // una lápida gana sobre la sesión que la acompañe

    if (!id(sid)) return null
    const session = parseSession(raw, sid)
    if (!session) return null
    out.sessions[sid] = session
  }
  if (out.activeSessionId !== null && !out.sessions[out.activeSessionId]) return null
  for (const [aid, raw] of Object.entries(value.attempts)) {
    if (!id(aid) || !object(raw) || raw.id !== aid || !id(raw.sessionId) || !int(raw.position) || raw.position > 100000
      || aid !== key(raw.sessionId, raw.position) || !id(raw.questionId) || !id(raw.revision) || !id(raw.optionId)
      || typeof raw.correct !== 'boolean' || !num(raw.submittedAt) || !num(raw.durationMs)
      || !(raw.reviewedAt === null || num(raw.reviewedAt) && raw.reviewedAt >= raw.submittedAt)
      || (raw.conflict !== undefined && typeof raw.conflict !== 'boolean')) return null
    const session = out.sessions[raw.sessionId]
    const original = session?.initial[raw.position % session.initial.length]
    if (!original || original.id !== raw.questionId || original.revision !== raw.revision) return null
    out.attempts[aid] = { id: aid, sessionId: raw.sessionId, position: raw.position, questionId: raw.questionId,
      revision: raw.revision, optionId: raw.optionId, correct: raw.correct, submittedAt: raw.submittedAt,
      reviewedAt: raw.reviewedAt, durationMs: raw.durationMs, ...(raw.conflict ? { conflict: true } : {}) }
  }
  return out
}
function mergeAttempt(a: NbmeAttempt, b: NbmeAttempt): NbmeAttempt {
  if (a.sessionId !== b.sessionId || a.position !== b.position || a.questionId !== b.questionId || a.revision !== b.revision) throw new Error('Incompatible question history')
  const conflict = a.conflict || b.conflict || a.optionId !== b.optionId || a.correct !== b.correct
  // Preserve the first submission. Later retries have distinct opportunity IDs.
  const signature = (v: NbmeAttempt) => stable([v.optionId, v.correct, v.questionId, v.revision])
  const first = a.submittedAt < b.submittedAt ? a : a.submittedAt > b.submittedAt ? b : signature(a) >= signature(b) ? a : b
  const reviewed = Math.max(a.reviewedAt ?? 0, b.reviewedAt ?? 0)
  return { ...first, durationMs: Math.max(a.durationMs, b.durationMs), reviewedAt: reviewed ? Math.max(reviewed, first.submittedAt) : null,
    ...(conflict ? { conflict: true } : {}) }
}
export function mergeNbmeStates(a: NbmeState, b: NbmeState): NbmeState {
  const out = emptyNbmeState(a.bankVersion >= b.bankVersion ? a.bankVersion : b.bankVersion)
  // Las lápidas se unen ANTES que las sesiones: la unión pura resucitaba lo descartado en el
  // siguiente sync, así que el botón «Descartar» no descartaba nada de forma duradera.
  for (const sid of new Set([...Object.keys(a.discarded), ...Object.keys(b.discarded)])) {
    out.discarded[sid] = Math.max(a.discarded[sid] ?? 0, b.discarded[sid] ?? 0)
  }
  out.discarded = podarLapidas(out.discarded)
  for (const sid of [...new Set([...Object.keys(a.sessions), ...Object.keys(b.sessions)])].sort()) {
    if (out.discarded[sid]) continue
    const x = a.sessions[sid], y = b.sessions[sid]
    if (!x || !y) { out.sessions[sid] = x ?? y; continue }
    if (stable(x.initial) !== stable(y.initial) || x.startedAt !== y.startedAt || x.budgetMinutes !== y.budgetMinutes) throw new Error('Incompatible session identity')
    const primary = x.controlChangedAt > y.controlChangedAt ? x : x.controlChangedAt < y.controlChangedAt ? y : x.paused ? x : y
    const drafts: NbmeSession['drafts'] = {}
    for (const pos of new Set([...Object.keys(x.drafts), ...Object.keys(y.drafts)])) {
      const dx = x.drafts[pos], dy = y.drafts[pos]
      drafts[pos] = !dx || !dy ? dx ?? dy : choose(dx, dy, dx.changedAt, dy.changedAt)
    }
    out.sessions[sid] = { ...primary, elapsedMs: Math.max(x.elapsedMs, y.elapsedMs), continueUnlimited: x.continueUnlimited || y.continueUnlimited, drafts }
  }
  for (const aid of [...new Set([...Object.keys(a.attempts), ...Object.keys(b.attempts)])].sort()) {
    const x = a.attempts[aid], y = b.attempts[aid]
    const intento = x && y ? mergeAttempt(x, y) : x ?? y
    if (out.discarded[intento.sessionId]) continue
    out.attempts[aid] = intento
  }
  out.activeChangedAt = Math.max(a.activeChangedAt, b.activeChangedAt)
  const activo = a.activeChangedAt === b.activeChangedAt && (a.activeSessionId === null || b.activeSessionId === null)
    ? null : choose(a.activeSessionId, b.activeSessionId, a.activeChangedAt, b.activeChangedAt)
  out.activeSessionId = activo && out.discarded[activo] ? null : activo
  out.filters = choose(a.filters, b.filters, a.filtersChangedAt, b.filtersChangedAt)
  out.filtersChangedAt = Math.max(a.filtersChangedAt, b.filtersChangedAt)
  return out
}
/** Reconstructs exact retries without merging mutable queue arrays from two devices. */
export function deriveNbmeSession(state: NbmeState, sessionId: string): NbmeSessionView | null {
  const session = state.sessions[sessionId]
  if (!session) return null
  const n = session.initial.length
  const queue = session.initial.map((r, position) => ({ ...r, position, round: 0 }))
  let firstPending = -1, firstAnswered = 0, firstCorrect = 0, firstConflicts = 0, retryCount = 0
  for (let i = 0; i < queue.length; i++) {
    const ref = queue[i], a = state.attempts[key(sessionId, ref.position)]
    if (a && (!a.correct || a.conflict)) queue.push({ id: ref.id, revision: ref.revision, position: ref.position + n, round: ref.round + 1 })
    if (a && ref.round === 0) { firstAnswered++; if (a.conflict) firstConflicts++; else if (a.correct) firstCorrect++ }
    if (a && ref.round > 0) retryCount++
    if (firstPending < 0 && (!a || a.reviewedAt === null)) firstPending = i
  }
  const index = firstPending < 0 ? queue.length : firstPending
  const current = queue[index] ?? null
  const attempt = current ? state.attempts[key(sessionId, current.position)] ?? null : null
  const latest = new Map<string, NbmeAttempt>()
  for (const a of Object.values(state.attempts)) if (a.sessionId === sessionId) {
    const prior = latest.get(a.questionId)
    if (!prior || a.position > prior.position) latest.set(a.questionId, a)
  }
  const pendingErrors = [...latest.values()].filter(a => !a.correct || a.conflict).length
  return { queue, index, current, attempt, phase: !current ? 'complete' : attempt ? 'feedback' : 'question',
    initialCount: n, firstAnswered, firstCorrect, firstConflicts, retryCount, pendingErrors, unresolved: pendingErrors }
}
function requireSession(state: NbmeState, sid: string) {
  const s = state.sessions[sid]; if (!s) throw new Error('Sesión de preguntas no disponible.'); return s
}
export function startNbmeSession(state: NbmeState, input: { id: string; title: string; refs: NbmeQuestionRef[]; budgetMinutes?: 10 | 20 | 30 | null }, now = Date.now()): NbmeState {
  if (!id(input.id) || state.sessions[input.id] || !text(input.title, 300) || !num(now) || !budget(input.budgetMinutes ?? null)
    || input.refs.length < 1 || input.refs.length > 20 || !input.refs.every(validRef) || new Set(input.refs.map(r => r.id)).size !== input.refs.length) throw new Error('Selección de preguntas no válida.')
  const session: NbmeSession = { id: input.id, title: input.title, initial: input.refs.map(r => ({ id: r.id, revision: r.revision })), startedAt: now,
    paused: false, controlChangedAt: now, elapsedMs: 0, budgetMinutes: input.budgetMinutes ?? null, continueUnlimited: false, drafts: {} }
  return { ...state, sessions: { ...state.sessions, [session.id]: session }, activeSessionId: session.id, activeChangedAt: now }
}
export function activateNbmeSession(state: NbmeState, sid: string, now = Date.now()): NbmeState {
  requireSession(state, sid)
  if (deriveNbmeSession(state, sid)?.phase === 'complete') return state
  return { ...updateNbmeSession(state, sid, { paused: false }, now), activeSessionId: sid, activeChangedAt: now }
}
export function updateNbmeSession(state: NbmeState, sid: string, patch: { paused?: boolean; elapsedMs?: number; continueUnlimited?: boolean }, now = Date.now()): NbmeState {
  const session = requireSession(state, sid)
  if (!num(now) || (patch.elapsedMs !== undefined && !num(patch.elapsedMs))) throw new Error('Tiempo de sesión no válido.')
  const hasControl = patch.paused !== undefined || patch.continueUnlimited !== undefined
  return { ...state, sessions: { ...state.sessions, [sid]: { ...session, ...patch,
    elapsedMs: Math.max(session.elapsedMs, patch.elapsedMs ?? 0), continueUnlimited: session.continueUnlimited || patch.continueUnlimited === true,
    controlChangedAt: hasControl ? Math.max(now, session.controlChangedAt) : session.controlChangedAt } } }
}
export function setNbmeDraft(state: NbmeState, sid: string, position: number, optionId: string | null, now = Date.now()): NbmeState {
  const s = requireSession(state, sid), view = deriveNbmeSession(state, sid)
  if (!int(position) || !num(now) || !(optionId === null || id(optionId))) throw new Error('Opción no válida.')
  if (view?.phase !== 'question' || view.current?.position !== position) return state
  return { ...state, sessions: { ...state.sessions, [sid]: { ...s, drafts: { ...s.drafts, [position]: { optionId, changedAt: now } } } } }
}
export function submitNbmeAnswer(state: NbmeState, sid: string, position: number, question: NbmeQuestion, optionId: string, durationMs: number, now = Date.now()): NbmeState {
  requireSession(state, sid)
  if (state.attempts[key(sid, position)]) return state
  const view = deriveNbmeSession(state, sid)
  if (view?.phase !== 'question' || view.current?.position !== position || view.current.id !== question.id || view.current.revision !== question.revision)
    throw new Error('La sesión cambió en otro dispositivo. Revisa la pregunta actual.')
  if (question.status !== 'ready' || !question.answer || question.options.length < 2 || !question.options.some(o => o.id === question.answer)
    || !question.options.some(o => o.id === optionId) || new Set(question.options.map(o => o.id)).size !== question.options.length
    || question.figureRequired && !question.figures.length || !num(durationMs) || !num(now)) throw new Error('La pregunta no tiene una clave utilizable.')
  const attempt: NbmeAttempt = { id: key(sid, position), sessionId: sid, position, questionId: question.id, revision: question.revision,
    optionId, correct: optionId === question.answer, submittedAt: now, reviewedAt: null, durationMs }
  return { ...state, attempts: { ...state.attempts, [attempt.id]: attempt } }
}
export function reviewNbmeAnswer(state: NbmeState, sid: string, position: number, now = Date.now()): NbmeState {
  requireSession(state, sid)
  const aid = key(sid, position), a = state.attempts[aid]
  if (!a || a.reviewedAt !== null) return state
  if (!num(now)) throw new Error('Fecha no válida.')
  const next = { ...state, attempts: { ...state.attempts, [aid]: { ...a, reviewedAt: Math.max(now, a.submittedAt) } } }
  if (deriveNbmeSession(next, sid)?.phase === 'complete' && next.activeSessionId === sid)
    return { ...next, activeSessionId: null, activeChangedAt: Math.max(now, next.activeChangedAt) }
  return next
}
/**
 * Descarta un bloque y sus intentos.
 *
 * Sin esto, una sesión fijada a una pregunta retirada del banco quedaba irreanudable y también
 * imborrable: pasaba a ser la tarjeta «Retoma donde lo dejaste» y su botón fallaba siempre. Los
 * intentos se borran con ella a propósito: `parseNbmeState` exige que cada intento mapee a la
 * posición de su propia sesión, así que dejarlos huérfanos invalidaría el estado completo.
 */
export function discardNbmeSession(state: NbmeState, sid: string, now = Date.now()): NbmeState {
  if (!state.sessions[sid]) return state   // nada que descartar: no se deja lápida por nada
  const sessions = { ...state.sessions }
  delete sessions[sid]
  const attempts = Object.fromEntries(Object.entries(state.attempts).filter(([, a]) => a.sessionId !== sid))
  const activo = state.activeSessionId === sid
  return { ...state, sessions, attempts,
    discarded: podarLapidas({ ...state.discarded, [sid]: now }),
    activeSessionId: activo ? null : state.activeSessionId,
    activeChangedAt: activo ? now : state.activeChangedAt }
}

/** Cuántos intentos se perderían al descartar: la interfaz lo dice antes de preguntar. */
export function countNbmeSessionAttempts(state: NbmeState, sid: string): number {
  return Object.values(state.attempts).filter(a => a.sessionId === sid).length
}

/**
 * Sella la versión del banco en el estado. Era un campo decorativo: se guardaba y se mezclaba por
 * máximo lexicográfico, pero nunca se comparaba con el catálogo, así que no servía de clave de
 * invalidación para nada.
 */
export function setNbmeBankVersion(state: NbmeState, bankVersion: string): NbmeState {
  return state.bankVersion === bankVersion ? state : { ...state, bankVersion }
}

export function updateNbmeFilters(state: NbmeState, patch: Partial<NbmeFilters>, now = Date.now()): NbmeState {
  const filters = parseFilters({ ...state.filters, ...patch })
  if (!filters || !num(now)) throw new Error('Filtros no válidos.')
  return { ...state, filters, filtersChangedAt: Math.max(now, state.filtersChangedAt) }
}
export function questionProgress(state: NbmeState, qid: string): NbmeQuestionProgress {
  const attempts = Object.values(state.attempts).filter(a => a.questionId === qid)
    .sort((a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id))
  const first = attempts[0], last = attempts.at(-1)
  return { questionId: qid, seen: !!first, attempts: attempts.length,
    firstCorrect: !first || first.conflict ? null : first.correct, firstSubmittedAt: first?.submittedAt ?? null,
    latestCorrect: !last || last.conflict ? null : last.correct, latestSubmittedAt: last?.submittedAt ?? null,
    pendingError: !!last && (!last.correct || last.conflict === true) }
}
export function summarizeNbmeState(state: NbmeState) {
  const qs = [...new Set(Object.values(state.attempts).map(a => a.questionId))].map(id => questionProgress(state, id))
  return { seen: qs.length, totalAttempts: Object.keys(state.attempts).length,
    firstCorrect: qs.filter(p => p.firstCorrect === true).length, firstEvaluated: qs.filter(p => p.firstCorrect !== null).length,
    firstConflicts: qs.filter(p => p.firstCorrect === null).length, pendingErrors: qs.filter(p => p.pendingError).length,
    completedSessions: Object.keys(state.sessions).filter(id => deriveNbmeSession(state, id)?.phase === 'complete').length,
    elapsedMs: Object.values(state.sessions).reduce((sum, s) => sum + s.elapsedMs, 0) }
}
