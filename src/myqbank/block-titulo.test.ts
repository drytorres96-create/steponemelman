import { describe, expect, it } from 'vitest'
import { createBlock } from './blocks'

const entradas = [{ kind: 'nbme' as const, id: 'QA-1', revision: 'r1' }, { kind: 'nbme' as const, id: 'QA-2', revision: 'r1' }]

/** Una sesión pedida a Claude o sugerida por la plataforma conserva su nombre en la lista de bloques. */
describe('título de un bloque', () => {
  it('sin título, el de siempre', () => {
    expect(createBlock('b1', entradas, 'tutor', 100).title).toBe('2-item Tutor block')
    expect(createBlock('b2', entradas, 'test', 100).title).toBe('2-item Test block')
  })
  it('con título, el suyo; se recorta y un título vacío cae al de siempre', () => {
    expect(createBlock('b3', entradas, 'tutor', 100, undefined, 'Para reforzar · hoy').title).toBe('Para reforzar · hoy')
    expect(createBlock('b4', entradas, 'tutor', 100, undefined, '   Endocrino · falladas  ').title).toBe('Endocrino · falladas')
    expect(createBlock('b5', entradas, 'tutor', 100, undefined, 'x'.repeat(300)).title).toHaveLength(120)
    expect(createBlock('b6', entradas, 'tutor', 100, undefined, '   ').title).toBe('2-item Tutor block')
    expect(createBlock('b7', entradas, 'tutor', 100, undefined, '').title).toBe('2-item Tutor block')
  })
  it('el título no toca lo demás: modo, entradas, cursor y reintento', () => {
    const b = createBlock('b8', entradas, 'tutor', 100, 'origen', 'Mi sesión')
    expect(b).toMatchObject({ id: 'b8', mode: 'tutor', entries: entradas, cursor: 0, createdAt: 100, retryOf: 'origen', title: 'Mi sesión' })
  })
})
