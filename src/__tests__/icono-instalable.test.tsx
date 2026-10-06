// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Brand } from '../components/Editorial'

const raiz = process.cwd()
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), 'utf8')
const html = new DOMParser().parseFromString(leer('index.html'), 'text/html')
const manifest = JSON.parse(leer('public/manifest.webmanifest'))
const geometria = (e: Element) => [e.tagName.toLowerCase(), ...['cx', 'cy', 'r', 'rx', 'ry', 'transform', 'stroke-width'].map(a => e.getAttribute(a))]

describe('icono de Melman al añadir la web a Inicio', () => {
  it('usa el símbolo de la cabecera con fondo opaco y deja a iOS aplicar su máscara', () => {
    const icono = new DOMParser().parseFromString(leer('public/brand-icon-v127.svg'), 'image/svg+xml')
    const marca = new DOMParser().parseFromString(renderToStaticMarkup(<Brand />), 'text/html')
    expect([...icono.querySelectorAll('g > *')].map(geometria)).toEqual([...marca.querySelectorAll('.brand-mark svg > *')].map(geometria))
    expect(icono.querySelector('rect')?.getAttribute('fill')).toBe(manifest.background_color)
    expect(icono.querySelector('rect')?.getAttribute('rx')).toBeNull()
    // Símbolo a 8x centrado en 512; su envolvente cabe en el círculo seguro de una máscara.
    expect(icono.querySelector('g')?.getAttribute('transform')).toBe('translate(96 96) scale(8)')
    expect(8 * Math.max(19.5, Math.hypot(14, -10) + 2)).toBeLessThan(512 * 0.4)
  })

  it('Safari referencia un PNG real de 180px y el nombre visible de la aplicación', () => {
    const touch = html.querySelector('link[rel="apple-touch-icon"]')!
    expect(touch.getAttribute('sizes')).toBe('180x180')
    expect(html.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe('Melman')
    expect(html.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content')).toBe('yes')
    const png = readFileSync(resolve(raiz, 'public', touch.getAttribute('href')!.slice(1)))
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180])
    expect(png[25]).toBe(2) // RGB sin canal alfa: evita fondos negros o transparentes en iOS.
    expect(readFileSync(resolve(raiz, 'public/apple-touch-icon.png'))).toEqual(png)
  })

  it('el manifiesto conserva identidad, alcance y acceso directo y ofrece tamaños reales con máscara', () => {
    expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', short_name: 'Melman', display: 'standalone' })
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true)
    for (const icon of manifest.icons) {
      const png = readFileSync(resolve(raiz, 'public', icon.src.slice(1)))
      const esperado = icon.sizes.split('x').map(Number)
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(esperado)
      expect(png[25]).toBe(2)
    }
    expect(html.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(manifest.theme_color)
    const headers = leer('public/_headers')
    expect(headers).toContain('/manifest.webmanifest\n  Cache-Control: public, max-age=0, must-revalidate')
    expect(headers).toContain('/brand-v127-180.png\n  Cache-Control: public, max-age=31536000, immutable')
  })
})
