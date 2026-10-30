import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { Button, Icon } from './components'
import { createSuaveAudio, type SuaveCue } from './suave-audio'

const Experience = createContext({ enabled: false, toggle: () => {}, activate: () => {}, play: (_cue: SuaveCue) => {} })

/** Decorative preferences live on this browser, independently of study/sync data. */
export function SuaveExperience({ children }: { children: ReactNode }) {
  const engine = useRef<ReturnType<typeof createSuaveAudio> | null>(null)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const controller = createSuaveAudio()
    engine.current = controller; setEnabled(controller.enabled)
    return () => { controller.dispose(); if (engine.current === controller) engine.current = null }
  }, [])
  const activate = useCallback(() => { engine.current?.activate() }, [])
  const play = useCallback((cue: SuaveCue) => { engine.current?.play(cue) }, [])
  const toggle = useCallback(() => {
    const controller = engine.current
    if (!controller) return
    const next = !controller.enabled
    controller.setEnabled(next); setEnabled(next)
    if (next) { controller.activate(); controller.play('select') }
  }, [])
  const value = useMemo(() => ({ enabled, toggle, activate, play }), [enabled, toggle, activate, play])
  return <Experience.Provider value={value}>{children}</Experience.Provider>
}

export const useSuaveExperience = () => useContext(Experience)

export function SoundToggle() {
  const { enabled, toggle } = useSuaveExperience()
  const label = enabled ? 'Mute soft sounds' : 'Enable soft sounds'
  return <Button className="mq-sound-toggle" aria-label={label} title={label} aria-pressed={enabled} data-suave-cue="none" onClick={toggle}>
    <Icon name={enabled ? 'sound' : 'muted'}/>
  </Button>
}

export function ExperienceSettings() {
  const { enabled, activate, play } = useSuaveExperience()
  return <section className="mq-card mq-experience-settings" aria-label="Interaction sounds">
    <div><h2>Soft sounds</h2><p className="mq-small mq-muted">Quiet feedback for choices, panels and completed blocks. Saved on this browser.</p></div>
    <div className="mq-inline"><SoundToggle/><span>{enabled ? 'On' : 'Off'}</span><Button disabled={!enabled} data-suave-cue="none" onClick={() => { activate(); play('complete') }}>Preview sound</Button></div>
  </section>
}

/** One delegated listener covers existing controls without altering their actions. */
export function useSuaveControls() {
  const { activate, play } = useSuaveExperience()
  const onClickCapture = () => activate()
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return
    const control = event.target.closest<HTMLElement>('button, summary, [role="tab"], [role="radio"], [data-suave-cue]')
    if (!control || !event.currentTarget.contains(control) || control.matches(':disabled, [aria-disabled="true"]')) return
    // Submission feedback belongs to the saved result, not the generic click.
    if (control.matches('.mq-concept-interaction .btn.principal')) return
    const cue = control.dataset.suaveCue
    if (cue === 'none') return
    if (cue && ['tap','select','open','close','success','review','complete'].includes(cue)) { play(cue as SuaveCue); return }
    if (control.hasAttribute('aria-expanded')) { play(control.getAttribute('aria-expanded') === 'true' ? 'close' : 'open'); return }
    if (control.getAttribute('aria-haspopup') === 'dialog') { play('open'); return }
    if (control.tagName === 'SUMMARY') { play(control.parentElement?.hasAttribute('open') ? 'close' : 'open'); return }
    play(control.hasAttribute('aria-pressed') || ['tab', 'radio'].includes(control.getAttribute('role') ?? '') ? 'select' : 'tap')
  }
  const onChange = (event: ChangeEvent<HTMLDivElement>) => {
    const target = event.target
    if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement && ['radio','checkbox'].includes(target.type)) {
      activate(); play('select')
    }
  }
  return { onClickCapture, onClick, onChange }
}

/** A soft reflection follows the mouse; no React renders or moving reading text. */
export function useSuaveReflection(root: RefObject<HTMLDivElement>, ready = true) {
  useEffect(() => {
    const surface = root.current
    if (!surface || !ready) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = matchMedia('(hover: hover) and (pointer: fine)')
    let active: HTMLElement | null = null, frame = 0, x = 0, y = 0
    const reset = () => {
      cancelAnimationFrame(frame); frame = 0
      active?.style.removeProperty('--mq-pointer-x'); active?.style.removeProperty('--mq-pointer-y')
      active = null
    }
    const move = (event: PointerEvent) => {
      if (reduced.matches || !pointer.matches || event.pointerType === 'touch' || document.hidden || !(event.target instanceof Element)) return
      const next = event.target.closest<HTMLElement>('.mq-dashboard .mq-card, .mq-button, .mq-chip, .mq-option')
      if (!next || !surface.contains(next) || next.matches(':disabled') || next.closest('fieldset:disabled')) { reset(); return }
      if (next !== active) { reset(); active = next }
      x = event.clientX; y = event.clientY
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0
        if (!active?.isConnected) { reset(); return }
        const box = active.getBoundingClientRect()
        if (!box.width || !box.height) return
        active.style.setProperty('--mq-pointer-x', `${Math.max(0, Math.min(100, (x - box.left) / box.width * 100)).toFixed(1)}%`)
        active.style.setProperty('--mq-pointer-y', `${Math.max(0, Math.min(100, (y - box.top) / box.height * 100)).toFixed(1)}%`)
      })
    }
    surface.addEventListener('pointermove', move, { passive: true })
    surface.addEventListener('pointerleave', reset)
    surface.addEventListener('focusin', reset)
    reduced.addEventListener('change', reset); pointer.addEventListener('change', reset)
    document.addEventListener('visibilitychange', reset); window.addEventListener('blur', reset)
    return () => {
      reset(); surface.removeEventListener('pointermove', move); surface.removeEventListener('pointerleave', reset)
      surface.removeEventListener('focusin', reset)
      reduced.removeEventListener('change', reset); pointer.removeEventListener('change', reset)
      document.removeEventListener('visibilitychange', reset); window.removeEventListener('blur', reset)
    }
  }, [root, ready])
}

/** Animate a reused question panel without remounting drafts, focus or timers. */
export function useQuestionTransition(panel: RefObject<HTMLElement>, opportunity: string) {
  const previous = useRef(opportunity)
  useEffect(() => {
    const changed = previous.current !== opportunity
    previous.current = opportunity
    const node = panel.current
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    if (!changed || reduced.matches || !node?.animate) return
    const animation = node.animate([{ opacity: .55, transform: 'translateX(6px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.23,1,.32,1)' })
    const stop = () => animation.cancel()
    reduced.addEventListener('change', stop)
    return () => { stop(); reduced.removeEventListener('change', stop) }
  }, [panel, opportunity])
}
