import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SynapseHeading } from './SynapseHeading'

let host: HTMLDivElement, root: Root
let frames: Map<number, FrameRequestCallback>, nextFrame: number
let reduced: boolean, visibility: DocumentVisibilityState
let motion: MediaQueryList
let listeners: Set<() => void>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  frames = new Map(); nextFrame = 0; reduced = false; visibility = 'visible'; listeners = new Set()
  motion = {
    get matches() { return reduced },
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
  } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn(() => motion))
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const ticket = ++nextFrame; frames.set(ticket, callback); return ticket
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((ticket: number) => frames.delete(ticket)))
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

async function paint(now: number) {
  await act(async () => {
    const scheduled = [...frames.values()]; frames.clear()
    scheduled.forEach(callback => callback(now))
  })
}

const staticText = () => host.querySelector('.synapse-heading-text') as HTMLSpanElement
const decoration = () => host.querySelector('.synapse-heading-glyphs')

describe('SynapseHeading', () => {
  it('renders readable, static accessible text immediately and preserves accented letters during the brief effect', async () => {
    const text = 'Tu día, práctica y acción: ñ á é í ó ú ü.'
    await act(async () => root.render(<h1><SynapseHeading text={text} /></h1>))
    expect(host.querySelector('h1')?.textContent).toBe(text)
    expect(staticText().style.opacity).toBe('1')
    expect(decoration()).toBeNull()
    await paint(0)
    expect(decoration()?.getAttribute('aria-hidden')).toBe('true')
    expect(staticText().textContent).toBe(text)
    expect(staticText().hasAttribute('aria-hidden')).toBe(false)
    expect(host.querySelector('[aria-live]')).toBeNull()
    const shown = Array.from(decoration()!.textContent!)
    Array.from(text).forEach((letter, index) => {
      if (!/^[a-z]$/i.test(letter)) expect(shown[index]).toBe(letter)
    })
    await paint(560)
    expect(decoration()).toBeNull()
    expect(staticText().style.opacity).toBe('1')
    expect(host.querySelector('h1')?.textContent).toBe(text)
    expect(frames.size).toBe(0)
  })

  it.each(['reduced motion', 'hidden document', 'disabled animation'])(
    'keeps the title static for %s', async reason => {
      reduced = reason === 'reduced motion'
      visibility = reason === 'hidden document' ? 'hidden' : 'visible'
      await act(async () => root.render(<SynapseHeading text="Un concepto a la vez." animate={reason !== 'disabled animation'} />))
      expect(staticText().textContent).toBe('Un concepto a la vez.')
      expect(staticText().style.opacity).toBe('1')
      expect(decoration()).toBeNull()
      expect(frames.size).toBe(0)
    },
  )

  it('settles immediately when reduced motion is enabled, without replaying when the preference changes back', async () => {
    await act(async () => root.render(<SynapseHeading text="Tu estudio de hoy." />))
    await paint(0)
    expect(decoration()).not.toBeNull()
    await act(async () => { reduced = true; listeners.forEach(listener => listener()) })
    expect(decoration()).toBeNull()
    expect(staticText().style.opacity).toBe('1')
    expect(frames.size).toBe(0)
    await act(async () => { reduced = false; listeners.forEach(listener => listener()) })
    expect(frames.size).toBe(0)
  })

  it('settles when the document is hidden and releases animation and listeners on unmount', async () => {
    const removeVisibility = vi.spyOn(document, 'removeEventListener')
    await act(async () => root.render(<SynapseHeading text="Tu estudio de hoy." />))
    await paint(0)
    await act(async () => {
      visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(decoration()).toBeNull()
    expect(frames.size).toBe(0)
    await act(async () => root.render(null))
    expect(listeners.size).toBe(0)
    expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('cancels an active frame on unmount and never paints a stale title after its text changes', async () => {
    await act(async () => root.render(<SynapseHeading text="Primer título" />))
    await paint(0)
    await act(async () => root.render(<SynapseHeading text="Título siguiente" />))
    expect(host.textContent).toBe('Título siguiente')
    expect(frames.size).toBe(1)
    await paint(0)
    const queued = [...frames.values()]
    await act(async () => root.render(null))
    expect(frames.size).toBe(0)
    expect(listeners.size).toBe(0)
    await act(async () => queued.forEach(callback => callback(50)))
    expect(host.textContent).toBe('')
    expect(frames.size).toBe(0)
  })
})
