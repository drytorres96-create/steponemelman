import { useEffect, useState } from 'react'

const DURATION_MS = 560
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** A short decorative pass; the heading's accessible text never changes. */
export function SynapseHeading({ text, animate = true }: { text: string; animate?: boolean }) {
  const [frame, setFrame] = useState<{ source: string; glyphs: string } | null>(null)

  useEffect(() => {
    setFrame(null)
    const motion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    if (!animate || !text || motion?.matches || document.visibilityState === 'hidden'
      || typeof requestAnimationFrame !== 'function') return

    // Accented Spanish letters, spaces and punctuation remain readable throughout.
    const letters = Array.from(text.normalize('NFC'))
    const mutable = letters.flatMap((letter, index) => /^[a-z]$/i.test(letter) ? [index] : [])
    if (!mutable.length) return

    let ticket = 0
    let started: number | null = null
    let lastStep = -1
    let finished = false
    const settle = () => {
      finished = true
      cancelAnimationFrame(ticket)
      setFrame(null)
    }
    const preferenceChanged = () => { if (motion?.matches) settle() }
    const visibilityChanged = () => { if (document.visibilityState === 'hidden') settle() }
    const tick = (now: number) => {
      if (finished) return
      if (motion?.matches || document.visibilityState === 'hidden') { settle(); return }
      started ??= now
      const elapsed = now - started
      if (elapsed >= DURATION_MS) { settle(); return }
      const step = Math.floor(elapsed / 45)
      if (step !== lastStep) {
        lastStep = step
        const cursor = Math.floor(elapsed / DURATION_MS * mutable.length)
        const glyphs = [...letters]
        // Only two letters move at once, leaving the rest of the title intact.
        mutable.slice(cursor, cursor + 2).forEach((index, offset) => {
          const glyph = GLYPHS[(step * 7 + index + offset + 3) % GLYPHS.length]
          glyphs[index] = letters[index] === letters[index].toLowerCase() ? glyph.toLowerCase() : glyph
        })
        setFrame({ source: text, glyphs: glyphs.join('') })
      }
      ticket = requestAnimationFrame(tick)
    }

    motion?.addEventListener('change', preferenceChanged)
    document.addEventListener('visibilitychange', visibilityChanged)
    ticket = requestAnimationFrame(tick)
    return () => {
      finished = true
      cancelAnimationFrame(ticket)
      motion?.removeEventListener('change', preferenceChanged)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [text, animate])

  const glyphs = animate && frame?.source === text ? frame.glyphs : null
  return <span className="synapse-heading" data-animating={glyphs !== null ? 'true' : undefined}
    style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
    {glyphs !== null && <span className="synapse-heading-glyphs" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{glyphs}</span>}
    <span className="synapse-heading-text" style={{ opacity: glyphs === null ? 1 : 0 }}>{text}</span>
  </span>
}
