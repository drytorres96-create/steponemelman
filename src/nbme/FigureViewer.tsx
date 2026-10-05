import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'

interface Point { x: number; y: number }
const bound = (zoom: number) => Math.min(4, Math.max(1, zoom))

/** Amplía el tamaño real de la imagen para conservar el desplazamiento nativo y por teclado. */
export function FigureViewer({ url, alt }: { url: string; alt: string }) {
  const [zoom, setZoom] = useState(1)
  const viewport = useRef<HTMLDivElement>(null)
  const points = useRef(new Map<number, Point>())
  const scale = useRef(1)
  const gesture = useRef<{ distance: number; zoom: number; content: Point } | null>(null)
  const pendingScroll = useRef<Point | null>(null)

  const scrollTo = (point: Point) => {
    if (!viewport.current) return
    viewport.current.scrollLeft = point.x
    viewport.current.scrollTop = point.y
  }

  useLayoutEffect(() => {
    scale.current = zoom
    if (pendingScroll.current && viewport.current) {
      scrollTo(pendingScroll.current)
      pendingScroll.current = null
    }
  }, [zoom])

  const updateZoom = (next: number, point: Point) => {
    if (next === scale.current) {
      scrollTo(point)
      pendingScroll.current = null
    } else {
      pendingScroll.current = point
      setZoom(next)
    }
  }

  const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (points.current.size === 2) {
      const [a, b] = [...points.current.values()]
      const center = midpoint(a, b), rect = event.currentTarget.getBoundingClientRect()
      gesture.current = {
        distance: Math.max(1, distance(a, b)), zoom: scale.current,
        content: { x: (event.currentTarget.scrollLeft + center.x - rect.left) / scale.current,
          y: (event.currentTarget.scrollTop + center.y - rect.top) / scale.current },
      }
    }
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const previous = points.current.get(event.pointerId)
    if (!previous) return
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (points.current.size === 2 && gesture.current) {
      const [a, b] = [...points.current.values()]
      const center = midpoint(a, b), rect = event.currentTarget.getBoundingClientRect()
      const next = bound(gesture.current.zoom * distance(a, b) / gesture.current.distance)
      updateZoom(next, { x: gesture.current.content.x * next - center.x + rect.left,
        y: gesture.current.content.y * next - center.y + rect.top })
    } else if (points.current.size === 1) {
      event.currentTarget.scrollLeft += previous.x - event.clientX
      event.currentTarget.scrollTop += previous.y - event.clientY
    }
  }
  const end = (event: PointerEvent<HTMLDivElement>) => {
    points.current.delete(event.pointerId)
    gesture.current = null
  }
  const changeZoom = (next: number) => {
    const element = viewport.current
    const value = bound(next)
    if (element) updateZoom(value, value === 1 ? { x: 0, y: 0 } : {
      x: (element.scrollLeft + element.clientWidth / 2) * value / zoom - element.clientWidth / 2,
      y: (element.scrollTop + element.clientHeight / 2) * value / zoom - element.clientHeight / 2,
    })
  }

  return <div className="nbme-figure-viewer">
    <div className="nbme-figure-controls" aria-label="Ampliación de la figura">
      <button type="button" className="btn pequeno" aria-label="Alejar figura" disabled={zoom <= 1} onClick={() => changeZoom(zoom - .5)}>−</button>
      <span role="status" aria-live="polite">{Math.round(zoom * 100)} %</span>
      <button type="button" className="btn pequeno" aria-label="Acercar figura" disabled={zoom >= 4} onClick={() => changeZoom(zoom + .5)}>+</button>
      <button type="button" className="btn pequeno" aria-label="Ajustar figura" onClick={() => changeZoom(1)}>Ajustar</button>
    </div>
    <p className="mini">Usa + y −, o pellizca para ampliar. Arrastra o desplázate para recorrer la figura.</p>
    <div ref={viewport} className="nbme-figure-scroll" role="region" aria-label="Figura ampliada" tabIndex={0}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <img className="nbme-image-expanded" style={{ width: `${zoom * 100}%` }} src={url} alt={alt} draggable={false} decoding="async" />
    </div>
  </div>
}
