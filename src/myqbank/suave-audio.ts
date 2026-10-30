/** Quiet, optional feedback inspired by Suave's synthesized wood/glass sounds.
 * No audio context exists before an explicit user gesture. Preference restoration
 * only restores the switch; it never unlocks, queues or plays audio on its own.
 */
export type SuaveCue = 'tap' | 'select' | 'open' | 'close' | 'success' | 'review' | 'complete'

export const SUAVE_SOUND_KEY = 'myqbank-suave-sound-v1'

export interface SuaveAudio {
  readonly enabled: boolean
  setEnabled(enabled: boolean): void
  /** Call synchronously from a trusted click or keyboard action, never an effect. */
  activate(): void
  /** A direct action/result cue; not for hover, mounting, history restoration or timers. */
  play(cue: SuaveCue): void
  dispose(): void
}

interface Visibility {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

interface AudioOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  contextFactory?: () => AudioContext | null
  visibility?: Visibility | null
  now?: () => number
}

interface Note { frequency: number; end?: number; offset?: number; duration: number; strength?: number }
const NOTES: Record<SuaveCue, readonly Note[]> = {
  tap: [{ frequency: 330, end: 294, duration: .09 }],
  select: [{ frequency: 392, end: 440, duration: .12 }],
  open: [{ frequency: 294, end: 392, duration: .16 }],
  close: [{ frequency: 349, end: 262, duration: .14 }],
  success: [
    { frequency: 392, duration: .15 },
    { frequency: 494, offset: .055, duration: .17, strength: .8 },
  ],
  // A neutral lower interval for review, without a buzzer or an alarm.
  review: [{ frequency: 330, end: 294, duration: .18, strength: .75 }],
  complete: [
    { frequency: 392, duration: .22, strength: .8 },
    { frequency: 494, offset: .07, duration: .24, strength: .65 },
    { frequency: 587, offset: .14, duration: .28, strength: .5 },
  ],
}

function browserStorage(): AudioOptions['storage'] {
  try { return typeof window === 'undefined' ? null : window.localStorage }
  catch { return null }
}
function browserContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Context ? new Context() : null
}

export function createSuaveAudio(options: AudioOptions = {}): SuaveAudio {
  const storage = options.storage === undefined ? browserStorage() : options.storage
  const visibility = options.visibility === undefined ? (typeof document === 'undefined' ? null : document) : options.visibility
  const now = options.now ?? (() => performance.now())
  const createContext = options.contextFactory ?? browserContext
  let enabled = false
  try { enabled = storage?.getItem(SUAVE_SOUND_KEY) === 'on' } catch { /* Private/quota-limited storage remains optional. */ }

  let context: AudioContext | null = null
  let master: GainNode | null = null
  let armed = false
  let disposed = false
  let generation = 0
  let lastPlayed = -Infinity
  let resuming: Promise<void> | null = null
  let pending: { cue: SuaveCue; at: number; generation: number } | null = null
  const voices = new Set<{ oscillator: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }>()
  const available = () => enabled && !disposed && !visibility?.hidden

  function silence() {
    generation++
    pending = null
    const time = context?.currentTime ?? 0
    for (const voice of voices) {
      try {
        voice.gain.gain.cancelScheduledValues(time)
        voice.gain.gain.setTargetAtTime(0, time, .004)
        voice.oscillator.stop(time + .02)
      } catch { /* A completed oscillator may already have stopped. */ }
    }
  }

  function emit(cue: SuaveCue) {
    if (!available() || !armed || context?.state !== 'running' || !master) return
    const time = now()
    if (time - lastPlayed < 120) return
    lastPlayed = time
    try {
      for (const note of NOTES[cue]) {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const filter = context.createBiquadFilter()
        const voice = { oscillator, gain, filter }
        const start = context.currentTime + (note.offset ?? 0)
        const attack = .012
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(note.frequency, start)
        if (note.end) oscillator.frequency.exponentialRampToValueAtTime(note.end, start + note.duration * .7)
        filter.type = 'lowpass'
        filter.frequency.value = 1400
        filter.Q.value = .35
        gain.gain.setValueAtTime(.0001, start)
        gain.gain.exponentialRampToValueAtTime(.3 * (note.strength ?? 1), start + attack)
        gain.gain.exponentialRampToValueAtTime(.0001, start + attack + note.duration)
        oscillator.connect(filter)
        filter.connect(gain)
        gain.connect(master)
        oscillator.onended = () => {
          voices.delete(voice)
          try { oscillator.disconnect(); filter.disconnect(); gain.disconnect() } catch { /* Already disconnected. */ }
        }
        voices.add(voice)
        oscillator.start(start)
        oscillator.stop(start + attack + note.duration + .025)
      }
    } catch { silence() /* Audio failure must never block a study action. */ }
  }

  function onVisibility() { if (visibility?.hidden) silence() }
  visibility?.addEventListener('visibilitychange', onVisibility)

  return {
    get enabled() { return enabled },
    setEnabled(next) {
      if (disposed) return
      enabled = next
      try { storage?.setItem(SUAVE_SOUND_KEY, next ? 'on' : 'off') } catch { /* Still works for this tab. */ }
      if (!next) silence()
    },
    activate() {
      if (!available()) return
      // Where the browser exposes activation, fail closed for calls outside a gesture.
      if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) return
      armed = true
      try {
        if (!context) {
          context = createContext()
          if (!context) return
          master = context.createGain()
          master.gain.value = .12
          master.connect(context.destination)
        }
        if (context.state === 'closed') return
        if (context.state !== 'running' && !resuming) {
          const activation = generation
          resuming = context.resume().then(() => {
            const next = pending
            pending = null
            if (next && next.generation === activation && activation === generation && now() - next.at <= 400) emit(next.cue)
          }).catch(() => { pending = null }).finally(() => { resuming = null })
        }
      } catch { pending = null /* Unsupported/blocked WebAudio stays silent. */ }
    },
    play(cue) {
      if (!available() || !armed) return
      if (context?.state === 'running') emit(cue)
      else if (resuming) pending = { cue, at: now(), generation }
    },
    dispose() {
      if (disposed) return
      disposed = true
      armed = false
      silence()
      visibility?.removeEventListener('visibilitychange', onVisibility)
      for (const { oscillator, gain, filter } of voices) {
        try { oscillator.disconnect(); gain.disconnect(); filter.disconnect() } catch { /* Already disconnected. */ }
      }
      voices.clear()
      try { master?.disconnect() } catch { /* Already disconnected. */ }
      try { void context?.close().catch(() => {}) } catch { /* Closing an unavailable context is harmless. */ }
      context = null
      master = null
    },
  }
}
