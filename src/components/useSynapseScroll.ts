import { useEffect, type RefObject } from 'react'

/** Desplazamiento leve del fondo: no modifica el scroll ni el contenido de estudio. */
export function useSynapseScroll(ref: RefObject<HTMLDivElement>, quiet: boolean) {
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const reducedMotion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
    let frame: number | null = null

    const paused = () => quiet || reducedMotion?.matches || document.visibilityState === 'hidden'
    const cancelFrame = () => {
      if (frame === null) return
      window.cancelAnimationFrame(frame)
      frame = null
    }
    const paint = () => {
      frame = null
      const progress = paused() ? 0 : Math.min(900, Math.max(0, window.scrollY)) / 900
      element.style.setProperty('--synapse-scroll-y', `${-18 * progress}px`)
      element.style.setProperty('--synapse-scroll-scale', String(1 + .025 * progress))
    }
    const schedule = () => {
      if (paused() || frame !== null) return
      frame = window.requestAnimationFrame(paint)
    }
    const refresh = () => {
      cancelFrame()
      paint()
    }

    // Restaurar la posición actual al volver a la pestaña o habilitar movimiento.
    paint()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    document.addEventListener('visibilitychange', refresh)
    reducedMotion?.addEventListener?.('change', refresh)

    return () => {
      cancelFrame()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('visibilitychange', refresh)
      reducedMotion?.removeEventListener?.('change', refresh)
      element.style.removeProperty('--synapse-scroll-y')
      element.style.removeProperty('--synapse-scroll-scale')
    }
  }, [ref, quiet])
}
