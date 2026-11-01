interface SavedCopy<State> {
  state: State
  snapshot: { revision: number; generation: string } | null
  savedAt: number
}

interface RecoveredCopies<Copy> {
  saved: Copy | null
  /** Must be durably preserved before either active storage slot can be overwritten. */
  unversioned: Copy | null
}

/** Restore both durable copies without importing evidence from before an explicit reset. */
export function recoverSavedCopies<State, Copy extends SavedCopy<State>>(
  primary: Copy | null, backup: Copy | null, merge: (a: State, b: State) => State,
): RecoveredCopies<Copy> {
  if (!primary || !backup) return { saved: primary ?? backup, unversioned: null }
  // A missing snapshot cannot establish compatibility with a known generation,
  // even when its device timestamp is newer. It may predate a confirmed reset.
  if (primary.snapshot && !backup.snapshot) return { saved: primary, unversioned: backup }
  if (!primary.snapshot && backup.snapshot) return { saved: backup, unversioned: primary }
  const newer = primary.snapshot && backup.snapshot
    ? primary.snapshot.revision !== backup.snapshot.revision
      ? primary.snapshot.revision > backup.snapshot.revision ? primary : backup
      : primary.savedAt >= backup.savedAt ? primary : backup
    : primary.savedAt >= backup.savedAt ? primary : backup
  // Revisions are monotonic across resets. A stale tab may have a later wall clock,
  // so savedAt cannot decide which reset generation survives recovery.
  if (primary.snapshot && backup.snapshot && primary.snapshot.generation !== backup.snapshot.generation) return { saved: newer, unversioned: null }
  return { saved: { ...newer, state: merge(primary.state, backup.state), savedAt: Math.max(primary.savedAt, backup.savedAt) }, unversioned: null }
}
