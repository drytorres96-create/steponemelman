export interface NbmeConceptLink {
  conceptId: string
  relation: 'tested' | 'foundation'
  confidence: number
  review: 'suggested' | 'reviewed'
}
export interface NbmeQuestionMeta {
  id: string
  revision: string
  form: '27' | '28' | '29'
  section: number
  item: number
  page: number
  systems: string[]
  disciplines: string[]
  topic: string
  objective: string | null
  status: 'ready' | 'blocked'
  reasons: string[]
  figureRequired: boolean
  conceptLinks: NbmeConceptLink[]
  taxonomy?: { method: string; confidence: number; review: 'suggested' | 'reviewed' }
}
export type NbmeContentBlock =
  | { type: 'paragraph' | 'prompt'; text: string }
  | { type: 'table'; caption?: string; headers: string[]; rows: string[][] }

export interface NbmeQuestionDisplay {
  stem: NbmeContentBlock[]
  options?: Record<string, NbmeContentBlock[]>
  objective?: NbmeContentBlock[]
  explanation?: NbmeContentBlock[]
}

export interface NbmeQuestion extends NbmeQuestionMeta {
  stem: string
  options: { id: string; text: string }[]
  answer: string | null
  explanation: string | null
  distractorExplanations?: Record<string, string>
  display?: NbmeQuestionDisplay
  figures: { assetId: string; alt: string }[]
  provenance: { sourceFile: string; sourceRecordId: string; notes: string[]; [key: string]: unknown }
}
export interface NbmeCatalog {
  schemaVersion: 1
  bankVersion: string
  total: number
  questions: NbmeQuestionMeta[]
}
export interface NbmeQuestionRef { id: string; revision: string }
export interface NbmeDraft { optionId: string | null; changedAt: number }
export interface NbmeSession {
  id: string
  title: string
  initial: NbmeQuestionRef[]
  startedAt: number
  paused: boolean
  controlChangedAt: number
  elapsedMs: number
  budgetMinutes: 10 | 20 | 30 | null
  continueUnlimited: boolean
  drafts: Record<string, NbmeDraft>
}
export interface NbmeAttempt {
  /** Stable opportunity key: sessionId:position. */
  id: string
  sessionId: string
  /** Stable ordinal: round * initial.length + original index. It can have gaps. */
  position: number
  questionId: string
  revision: string
  optionId: string
  correct: boolean
  submittedAt: number
  reviewedAt: number | null
  durationMs: number
  /** Conflicting submissions are retained conservatively and excluded from first-attempt scoring. */
  conflict?: boolean
}
export interface NbmeFilters {
  form: 'all' | '27' | '28' | '29'
  system: string
  discipline: string
  status: 'all' | 'unseen' | 'errors'
  quality: 'ready' | 'all' | 'blocked'
  size: 5 | 10 | 20
  budgetMinutes: 10 | 20 | 30 | null
}
export interface NbmeState {
  version: 1
  bankVersion: string
  sessions: Record<string, NbmeSession>
  attempts: Record<string, NbmeAttempt>
  activeSessionId: string | null
  activeChangedAt: number
  filters: NbmeFilters
  filtersChangedAt: number
}
export interface NbmeQueueItem extends NbmeQuestionRef { position: number; round: number }
export interface NbmeSessionView {
  queue: NbmeQueueItem[]
  index: number
  current: NbmeQueueItem | null
  attempt: NbmeAttempt | null
  phase: 'question' | 'feedback' | 'complete'
  initialCount: number
  firstAnswered: number
  firstCorrect: number
  firstConflicts: number
  retryCount: number
  pendingErrors: number
  /** Alias for pendingErrors; unanswered new questions do not count as errors. */
  unresolved: number
}
export interface NbmeQuestionProgress {
  questionId: string
  seen: boolean
  attempts: number
  firstCorrect: boolean | null
  firstSubmittedAt: number | null
  latestCorrect: boolean | null
  latestSubmittedAt: number | null
  pendingError: boolean
}
