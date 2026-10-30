import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ engines: [] as { disposed: boolean; enabled: boolean; activate: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setEnabled: (on: boolean) => void }[] }))
vi.mock('./suave-audio', () => ({
  createSuaveAudio() {
    const engine = {
      enabled: false, disposed: false,
      activate: vi.fn(() => { if (engine.disposed) throw Error('Disposed controller') }),
      play: vi.fn(),
      dispose: vi.fn(() => { engine.disposed = true }),
      setEnabled(on: boolean) { if (engine.disposed) throw Error('Disposed controller'); engine.enabled = on },
    }
    fake.engines.push(engine)
    return engine
  },
}))
import { SoundToggle, SuaveExperience } from './SuaveExperience'

it('keeps the sound switch usable through StrictMode replay and disposes every controller', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<StrictMode><SuaveExperience><SoundToggle/></SuaveExperience></StrictMode>))
    expect(fake.engines.length).toBeGreaterThan(1)
    expect(fake.engines.filter(engine => !engine.disposed)).toHaveLength(1)
    for (const engine of fake.engines) expect(engine.activate).not.toHaveBeenCalled()
    await act(async () => host.querySelector('button')!.click())
    expect(host.querySelector('button')!.getAttribute('aria-label')).toBe('Mute soft sounds')
    expect(fake.engines.at(-1)!.play).toHaveBeenCalledWith('select')
    await act(async () => host.querySelector('button')!.click())
    expect(host.querySelector('button')!.getAttribute('aria-label')).toBe('Enable soft sounds')
    expect(fake.engines.at(-1)!.play).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
  for (const engine of fake.engines) expect(engine.dispose).toHaveBeenCalledOnce()
})
