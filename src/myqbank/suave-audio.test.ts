import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSuaveAudio, SUAVE_SOUND_KEY, type SuaveAudio } from './suave-audio'

function parameter() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() }
}
function fakeAudio(initial: AudioContextState = 'running') {
  const oscillators: Array<{ type: string; frequency: ReturnType<typeof parameter>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = []
  const gains: Array<{ gain: ReturnType<typeof parameter>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []
  const audio = {
    state: initial, currentTime: 5, destination: {},
    resume: vi.fn(async () => { audio.state = 'running' }),
    close: vi.fn(async () => { audio.state = 'closed' }),
    createGain: vi.fn(() => {
      const gain = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }
      gains.push(gain)
      return gain
    }),
    createOscillator: vi.fn(() => {
      const oscillator = { type: '', frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null }
      oscillators.push(oscillator)
      return oscillator
    }),
    createBiquadFilter: vi.fn(() => ({ type: '', frequency: parameter(), Q: parameter(), connect: vi.fn(), disconnect: vi.fn() })),
  }
  return { audio, context: audio as unknown as AudioContext, oscillators, gains }
}

class Visibility extends EventTarget {
  hidden = false
  hide() { this.hidden = true; this.dispatchEvent(new Event('visibilitychange')) }
  show() { this.hidden = false; this.dispatchEvent(new Event('visibilitychange')) }
}

const controllers: SuaveAudio[] = []
const activationDescriptor = Object.getOwnPropertyDescriptor(navigator, 'userActivation')
function setup({ stored = null, state = 'running' }: { stored?: string | null; state?: AudioContextState } = {}) {
  const fake = fakeAudio(state)
  const visibility = new Visibility()
  const storage = { getItem: vi.fn(() => stored), setItem: vi.fn() }
  const factory = vi.fn(() => fake.context)
  let time = 0
  const sound = createSuaveAudio({ storage, visibility, contextFactory: factory, now: () => time })
  controllers.push(sound)
  return { ...fake, sound, visibility, storage, factory, advance: (ms: number) => { time += ms } }
}
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.dispose())
  if (activationDescriptor) Object.defineProperty(navigator, 'userActivation', activationDescriptor)
  else Reflect.deleteProperty(navigator, 'userActivation')
})

describe('optional Suave audio', () => {
  it('starts off and does not allocate WebAudio for loading, muted gestures or restored preferences', () => {
    const off = setup()
    expect(off.sound.enabled).toBe(false)
    off.sound.activate()
    off.sound.play('tap')
    expect(off.factory).not.toHaveBeenCalled()

    const restored = setup({ stored: 'on' })
    expect(restored.sound.enabled).toBe(true)
    restored.sound.play('complete')
    expect(restored.factory).not.toHaveBeenCalled()
    restored.sound.activate()
    expect(restored.factory).toHaveBeenCalledOnce()
    expect(restored.oscillators).toHaveLength(0)
    restored.sound.play('tap')
    expect(restored.oscillators).toHaveLength(1)
  })

  it('persists only the separate opt-in and rate-limits repeated action cues', () => {
    const s = setup()
    s.sound.setEnabled(true)
    expect(s.storage.setItem).toHaveBeenCalledWith(SUAVE_SOUND_KEY, 'on')
    expect(s.factory).not.toHaveBeenCalled()
    s.sound.activate()
    s.sound.play('select')
    s.sound.play('select')
    s.advance(80)
    s.sound.play('select')
    expect(s.oscillators).toHaveLength(1)
    s.advance(80)
    s.sound.play('select')
    expect(s.oscillators).toHaveLength(2)
    expect(s.gains[0].gain.value).toBeLessThanOrEqual(.12)
  })

  it('muting stops scheduled notes and blocks subsequent cues', () => {
    const s = setup({ stored: 'on' })
    s.sound.activate()
    s.sound.play('complete')
    const notes = s.oscillators.length
    expect(notes).toBeGreaterThan(1)
    s.sound.setEnabled(false)
    expect(s.storage.setItem).toHaveBeenLastCalledWith(SUAVE_SOUND_KEY, 'off')
    for (const oscillator of s.oscillators) expect(oscillator.stop).toHaveBeenLastCalledWith(s.audio.currentTime + .02)
    for (const gain of s.gains.slice(1)) expect(gain.gain.cancelScheduledValues).toHaveBeenCalled()
    s.advance(1000)
    s.sound.play('success')
    expect(s.oscillators).toHaveLength(notes)
  })

  it('supports a local session when reading or writing the preference is blocked', () => {
    const fake = fakeAudio()
    const sound = createSuaveAudio({
      storage: { getItem() { throw new Error('Storage blocked') }, setItem() { throw new Error('Quota') } },
      visibility: null, contextFactory: () => fake.context,
    })
    controllers.push(sound)
    expect(sound.enabled).toBe(false)
    expect(() => { sound.setEnabled(true); sound.activate(); sound.play('tap') }).not.toThrow()
    expect(sound.enabled).toBe(true)
    expect(fake.oscillators).toHaveLength(1)
  })

  it('fails silently if AudioContext is unavailable or construction is blocked', () => {
    for (const contextFactory of [() => null, () => { throw new Error('WebAudio unavailable') }]) {
      const sound = createSuaveAudio({ storage: null, visibility: null, contextFactory })
      controllers.push(sound)
      expect(() => { sound.setEnabled(true); sound.activate(); sound.play('open'); sound.dispose() }).not.toThrow()
    }
  })

  it('will not allocate a context outside a user gesture when activation is exposed', () => {
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false } })
    const s = setup({ stored: 'on' })
    s.sound.activate()
    s.sound.play('tap')
    expect(s.factory).not.toHaveBeenCalled()
  })

  it('plays only the immediate cue after a prompt resume and never a backlog', async () => {
    const s = setup({ stored: 'on', state: 'suspended' })
    let resume!: () => void
    s.audio.resume.mockImplementation(() => new Promise<void>(resolve => { resume = () => { s.audio.state = 'running'; resolve() } }))
    s.sound.activate()
    s.sound.play('tap')
    s.sound.play('select')
    expect(s.oscillators).toHaveLength(0)
    resume()
    await Promise.resolve()
    expect(s.oscillators).toHaveLength(1)
  })

  it.each(['mute', 'hide', 'dispose', 'late'] as const)('drops a pending cue after %s while resume is outstanding', async action => {
    const s = setup({ stored: 'on', state: 'suspended' })
    let resume!: () => void
    s.audio.resume.mockImplementation(() => new Promise<void>(resolve => { resume = () => { s.audio.state = 'running'; resolve() } }))
    s.sound.activate()
    s.sound.play('success')
    if (action === 'mute') s.sound.setEnabled(false)
    if (action === 'hide') s.visibility.hide()
    if (action === 'dispose') s.sound.dispose()
    if (action === 'late') s.advance(500)
    resume()
    await Promise.resolve()
    expect(s.oscillators).toHaveLength(0)
  })

  it('handles a rejected resume without unhandled failures or delayed playback', async () => {
    const s = setup({ stored: 'on', state: 'suspended' })
    s.audio.resume.mockRejectedValue(new Error('Autoplay blocked'))
    s.sound.activate()
    s.sound.play('open')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(s.oscillators).toHaveLength(0)
    s.sound.play('tap')
    expect(s.oscillators).toHaveLength(0)
  })

  it('silences the hidden tab, does not replay when visible and releases resources on disposal', () => {
    const s = setup({ stored: 'on' })
    s.visibility.hide()
    s.sound.activate()
    s.sound.play('tap')
    expect(s.factory).not.toHaveBeenCalled()
    s.visibility.show()
    s.sound.activate()
    s.sound.play('tap')
    expect(s.oscillators).toHaveLength(1)
    s.visibility.hide()
    expect(s.oscillators[0].stop).toHaveBeenLastCalledWith(s.audio.currentTime + .02)
    s.advance(1000)
    s.sound.play('tap')
    s.visibility.show()
    expect(s.oscillators).toHaveLength(1)
    s.sound.dispose()
    expect(s.audio.close).toHaveBeenCalledOnce()
    expect(s.oscillators[0].disconnect).toHaveBeenCalled()
    s.sound.setEnabled(true)
    s.sound.activate()
    s.sound.play('tap')
    s.visibility.hide()
    expect(s.audio.close).toHaveBeenCalledOnce()
    expect(s.oscillators).toHaveLength(1)
  })
})
