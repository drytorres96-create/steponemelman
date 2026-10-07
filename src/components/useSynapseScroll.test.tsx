import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSynapseScroll } from './useSynapseScroll'

let host: HTMLDivElement
let root: Root | null
let frames: Map<number, FrameRequestCallback>
let nextFrame: number
let reduced: boolean
let visibility: DocumentVisibilityState
let motionListeners: Set<() => void>

function Backdrop({ quiet = false }: { quiet?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useSynapseScroll(ref, quiet)
  return <div ref={ref} />
}

function backdrop() { return host.firstElementChild as HTMLDivElement }
function offset() { return backdrop().style.getPropertyValue('--synapse-scroll-y') }
function scale() { return backdrop().style.getPropertyValue('--synapse-scroll-scale') }
function scrollTo(y: number) {
  vi.stubGlobal('scrollY', y)
  window.dispatchEvent(new Event('scroll'))
}
function flushFrame() {
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(0)
}
function setReduced(value: boolean) {
  reduced = value
  for (const listener of motionListeners) listener()
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  frames = new Map()
  nextFrame = 0
  reduced = false
  visibility = 'visible'
  motionListeners = new Set()
  vi.stubGlobal('scrollY', 0)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)))
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return reduced },
    addEventListener: (_event: string, listener: () => void) => motionListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => motionListeners.delete(listener),
  })))
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fondo Synapse con scroll acotado', () => {
  it('agrupa los eventos en un solo cuadro y no mantiene un bucle de animación', async () => {
    await act(async () => root!.render(<Backdrop />))
    expect(offset()).toBe('0px')
    expect(frames.size).toBe(0)
    scrollTo(100)
    scrollTo(450)
    window.dispatchEvent(new Event('resize'))
    expect(frames.size).toBe(1)
    expect(offset()).toBe('0px')
    flushFrame()
    expect(offset()).toBe('-9px')
    expect(scale()).toBe('1.0125')
    expect(frames.size).toBe(0)
  })

  it('acota la posición absoluta y restablece el fondo al regresar arriba', async () => {
    vi.stubGlobal('scrollY', 1800)
    await act(async () => root!.render(<Backdrop />))
    expect(offset()).toBe('-18px')
    expect(scale()).toBe('1.025')
    scrollTo(-80)
    flushFrame()
    expect(offset()).toBe('0px')
    expect(scale()).toBe('1')
    scrollTo(225)
    flushFrame()
    expect(offset()).toBe('-4.5px')
  })

  it('responde a cambios de movimiento reducido y cancela cuadros pendientes', async () => {
    await act(async () => root!.render(<Backdrop />))
    scrollTo(900)
    setReduced(true)
    expect(frames.size).toBe(0)
    expect(offset()).toBe('0px')
    expect(scale()).toBe('1')
    scrollTo(450)
    expect(frames.size).toBe(0)
    setReduced(false)
    expect(offset()).toBe('-9px')
    expect(frames.size).toBe(0)
  })

  it('empieza quieto si el sistema solicita movimiento reducido', async () => {
    reduced = true
    vi.stubGlobal('scrollY', 900)
    await act(async () => root!.render(<Backdrop />))
    expect(offset()).toBe('0px')
    expect(scale()).toBe('1')
    window.dispatchEvent(new Event('resize'))
    expect(frames.size).toBe(0)
  })

  it('suspende el desplazamiento en quiet y recupera la posición al salir', async () => {
    await act(async () => root!.render(<Backdrop />))
    scrollTo(900)
    await act(async () => root!.render(<Backdrop quiet />))
    expect(frames.size).toBe(0)
    expect(offset()).toBe('0px')
    expect(scale()).toBe('1')
    scrollTo(450)
    expect(frames.size).toBe(0)
    await act(async () => root!.render(<Backdrop />))
    expect(offset()).toBe('-9px')
  })

  it('restablece el fondo al ocultar la pestaña y retoma la posición al volver', async () => {
    await act(async () => root!.render(<Backdrop />))
    scrollTo(900)
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    expect(offset()).toBe('0px')
    expect(scale()).toBe('1')
    scrollTo(450)
    expect(frames.size).toBe(0)
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(offset()).toBe('-9px')
  })

  it('elimina los estilos, los eventos y el cuadro pendiente al desmontar', async () => {
    await act(async () => root!.render(<Backdrop />))
    const element = backdrop()
    scrollTo(900)
    flushFrame()
    scrollTo(450)
    expect(frames.size).toBe(1)
    await act(async () => root!.unmount())
    root = null
    expect(frames.size).toBe(0)
    expect(motionListeners.size).toBe(0)
    expect(element.style.getPropertyValue('--synapse-scroll-y')).toBe('')
    expect(element.style.getPropertyValue('--synapse-scroll-scale')).toBe('')
    scrollTo(900)
    window.dispatchEvent(new Event('resize'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    expect(element.style.getPropertyValue('--synapse-scroll-y')).toBe('')
  })
})
