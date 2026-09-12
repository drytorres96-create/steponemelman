import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MedicalImage, ScreenHeading, StudyHero } from '../components/Editorial'

let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('diseño médico abstracto', () => {
  it('conserva títulos y texto reales; el arte es decorativo y no contiene controles', async () => {
    await act(async () => root.render(<StudyHero />))
    expect(host.querySelector('h1')?.textContent).toContain('Tu estudio de hoy')
    const image = host.querySelector('img')!
    expect(image.alt).toBe('')
    expect(image.getAttribute('aria-hidden')).toBe('true')
    expect(image.getAttribute('loading')).toBe('eager')
    expect(image.width).toBe(1536)
    expect(image.height).toBe(1024)
    expect(host.querySelector('button')).toBeNull()
  })
  it('reserva el espacio y ofrece imágenes ligeras para diferentes pantallas', async () => {
    await act(async () => root.render(<MedicalImage scene="fluid" sizes="240px" />))
    const image = host.querySelector('img')!
    expect(image.getAttribute('loading')).toBe('lazy')
    expect(image.getAttribute('decoding')).toBe('async')
    expect(image.getAttribute('sizes')).toBe('240px')
    expect(image.getAttribute('srcset')).toBe('/images/v170/fluid-768.webp 768w, /images/v170/fluid-1536.webp 1536w')
  })
  it('mantiene el encabezado accesible y evita que el arte se interprete como material clínico', async () => {
    await act(async () => root.render(<ScreenHeading eyebrow="Biblioteca" title="Preguntas de aplicación" description="Descripción visible." />))
    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe('Preguntas de aplicación')
    expect(host.textContent).toContain('Descripción visible.')
    expect(host.querySelector('img')?.getAttribute('aria-hidden')).toBe('true')
  })
  it('solo publica los cuatro recursos abstractos y respeta el presupuesto de imagen', () => {
    const directory = resolve('public/images/v170')
    const files = readdirSync(directory).sort()
    expect(files).toEqual(['fluid-1536.webp', 'fluid-768.webp', 'membrane-1536.webp', 'membrane-768.webp'])
    let total = 0
    for (const name of files) {
      const file = resolve(directory, name)
      const size = statSync(file).size
      expect(size).toBeLessThan(name.includes('768') ? 24000 : 65000)
      expect(readFileSync(file).subarray(8, 12).toString()).toBe('WEBP')
      total += size
    }
    expect(total).toBeLessThan(150000)
  })
  it('mantiene contraste AA en texto, controles y estados sobre las superficies claras', () => {
    const css = readFileSync(resolve('src/editorial.css'), 'utf8')
    const colors = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/g)].map(m => [m[1], m[2]]))
    const luminance = (hex: string) => {
      const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
    }
    for (const surface of ['bg', 'panel']) {
      for (const text of ['texto', 'texto-2', 'texto-3', 'violeta', 'verde', 'ambar', 'rojo', 'cian']) {
        const ratio = (luminance(colors[surface]) + .05) / (luminance(colors[text]) + .05)
        expect(ratio, `${text} sobre ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
