interface SavedCopy<State> {
  state: State
  snapshot: { revision: number; generation: string } | null
  savedAt: number
}

/** Restore both durable copies without importing evidence from before an explicit reset. */
export function recoverSavedCopies<State, Copy extends SavedCopy<State>>(
  primary: Copy | null, backup: Copy | null, merge: (a: State, b: State) => State,
): Copy | null {
  if (!primary || !backup) return primary ?? backup
  const newer = primary.snapshot && backup.snapshot
    ? primary.snapshot.revision !== backup.snapshot.revision
      ? primary.snapshot.revision > backup.snapshot.revision ? primary : backup
      : primary.savedAt >= backup.savedAt ? primary : backup
    : primary.snapshot ? primary : backup.snapshot ? backup : primary.savedAt >= backup.savedAt ? primary : backup
  // Revisions are monotonic across resets. A stale tab may have a later wall clock,
  // so savedAt cannot decide which reset generation survives recovery.
  if (primary.snapshot && backup.snapshot && primary.snapshot.generation !== backup.snapshot.generation) return newer
  return { ...newer, state: merge(primary.state, backup.state), savedAt: Math.max(primary.savedAt, backup.savedAt) }
}
