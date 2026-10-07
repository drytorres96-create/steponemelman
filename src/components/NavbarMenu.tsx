import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type CSSProperties } from 'react'
import { NavigationIcon } from './Editorial'
import '../navbar-menu.css'

type Destination = { id: string; txt: string }
type Props = {
  active: string
  items: readonly Destination[]
  onNavigate: (id: string) => void
  onSignOut: () => void | Promise<void>
}
const DESCRIPTIONS: Record<string, string> = {
  modulos: 'Conceptos, preguntas y viñetas.',
  progreso: 'Una mirada a lo que has aprendido.',
  ajustes: 'Preferencias y datos guardados.',
  auditoria: 'Estado y revisión del contenido.',
  inicio: 'Tu planificación de siempre.',
}
const PHOTOS: Record<string, string> = {
  modulos: '/images/cinematic/ribbons-mobile.webp',
  progreso: '/images/cinematic/forest-mobile.webp',
}

/** A secondary disclosure, not a study shortcut: opening it never loads a session. */
export function NavbarMenu({ active, items, onNavigate, onSignOut }: Props) {
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const opening = useRef<number | null>(null)
  const closing = useRef<number | null>(null)
  const pinned = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()

  const clearTimers = useCallback(() => {
    if (opening.current !== null) window.clearTimeout(opening.current)
    if (closing.current !== null) window.clearTimeout(closing.current)
    opening.current = closing.current = null
  }, [])
  const fitPanel = useCallback(() => {
    const box = summary.current?.getBoundingClientRect()
    if (box && details.current) {
      details.current.style.setProperty('--navbar-room', Math.max(60, window.innerHeight - box.bottom - 12) + 'px')
    }
  }, [])
  const show = useCallback((explicit: boolean) => {
    clearTimers()
    if (!details.current) return
    pinned.current = explicit
    fitPanel()
    details.current.open = true
    setIsOpen(true)
  }, [clearTimers, fitPanel])
  const close = useCallback((returnFocus = false) => {
    clearTimers()
    pinned.current = false
    if (details.current) details.current.open = false
    setIsOpen(false)
    if (returnFocus) summary.current?.focus({ preventScroll: true })
  }, [clearTimers])

  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !details.current?.contains(event.target)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.current?.open && !event.defaultPrevented) {
        event.preventDefault()
        close(true)
      }
    }
    const hide = () => { if (document.hidden) close() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    document.addEventListener('visibilitychange', hide)
    return () => {
      clearTimers()
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [clearTimers, close])
  useEffect(() => { close() }, [active, close])
  useEffect(() => {
    if (!isOpen) return
    let frame = 0
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; fitPanel() })
    }
    fitPanel()
    window.addEventListener('resize', schedule, { passive: true })
    window.addEventListener('scroll', schedule, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule)
    }
  }, [isOpen, fitPanel])

  const enter = (event: PointerEvent<HTMLDetailsElement>) => {
    if (closing.current !== null) window.clearTimeout(closing.current)
    closing.current = null
    if (event.pointerType !== 'mouse' || details.current?.open ||
      typeof matchMedia !== 'function' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (opening.current !== null) window.clearTimeout(opening.current)
    opening.current = window.setTimeout(() => {
      opening.current = null
      if (!document.hidden && matchMedia('(hover: hover) and (pointer: fine)').matches) show(false)
    }, 120)
  }
  const leave = () => {
    if (opening.current !== null) window.clearTimeout(opening.current)
    opening.current = null
    if (pinned.current || details.current?.contains(document.activeElement)) return
    if (closing.current !== null) window.clearTimeout(closing.current)
    closing.current = window.setTimeout(() => { closing.current = null; close() }, 180)
  }
  const choose = (id: string) => { close(); onNavigate(id) }
  const featured = items.filter(item => item.id in PHOTOS)
  const utilities = items.filter(item => !(item.id in PHOTOS))

  return <details ref={details} className="menu-cuenta study-secondary-nav navbar-menu"
    onPointerEnter={enter} onPointerLeave={leave}
    onToggle={event => setIsOpen(event.currentTarget.open)}
    onFocus={() => {
      if (closing.current !== null) window.clearTimeout(closing.current)
      closing.current = null
    }}
    onBlur={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) close()
    }}>
    <summary ref={summary} aria-label="Biblioteca, progreso y cuenta" aria-expanded={isOpen} aria-controls={panelId}
      onClick={event => {
        event.preventDefault()
        if (!details.current?.open || !pinned.current) show(true)
        else close()
      }}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown') return
        event.preventDefault()
        show(true)
        details.current?.querySelector<HTMLButtonElement>('.navbar-menu-panel button')?.focus()
      }}>
      <span className="synapse-menu-icon" aria-hidden="true"><span /><span /><span /></span>
      <span>Biblioteca, progreso y cuenta</span>
    </summary>
    <div className="menu-cuenta-opciones navbar-menu-panel" id={panelId}>
      <div className="navbar-menu-heading"><p>Mi espacio</p><span>Accesos de estudio</span></div>
      <div className="navbar-menu-featured">
        {featured.map((item, index) => <button type="button" className="navbar-menu-card" key={item.id}
          aria-label={item.txt} aria-describedby={panelId + '-' + item.id}
          aria-current={active === item.id ? 'page' : undefined}
          style={{ '--navbar-order': index } as CSSProperties} onClick={() => choose(item.id)}>
          <span className="navbar-menu-photo" aria-hidden="true"><img src={PHOTOS[item.id]} alt="" loading="lazy" decoding="async" width="320" height="160" draggable={false} /></span>
          <span className="navbar-menu-copy"><strong>{item.txt}</strong><span id={panelId + '-' + item.id}>{DESCRIPTIONS[item.id]}</span></span>
          <NavigationIcon name="arrow" />
        </button>)}
      </div>
      <div className="navbar-menu-utilities">
        {utilities.map((item, index) => <button type="button" className="navbar-menu-link" key={item.id}
          aria-label={item.txt} aria-describedby={panelId + '-' + item.id}
          aria-current={active === item.id ? 'page' : undefined}
          style={{ '--navbar-order': index + featured.length } as CSSProperties} onClick={() => choose(item.id)}>
          <span><strong>{item.txt}</strong><span id={panelId + '-' + item.id}>{DESCRIPTIONS[item.id]}</span></span>
          <NavigationIcon name="arrow" />
        </button>)}
      </div>
      <div className="navbar-menu-footer"><span>Step One · Melman</span>
        <button type="button" className="navbar-menu-exit" aria-label="Salir" onClick={() => { close(); void onSignOut() }}>Salir</button>
      </div>
    </div>
  </details>
}
