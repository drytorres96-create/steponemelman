import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Existing synthetic scene only: no account data or copied clinical material.
const AHORA = new Date('2026-10-07T20:33:24Z')
for (const width of [390, 1280]) test.describe(`captura de meta día 13 a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
  test('conserva la referencia de meta y el orden de Hoy', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install({ time: AHORA })
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Synthetic backend unavailable.' } })
      return route.continue()
    })
    const etapa = process.env.NBME_CAPTURE_META === 'antes' ? 'antes' : 'despues'
    const destino = path.resolve('docs/flujo-recuperacion-nbme', etapa)
    await mkdir(destino, { recursive: true })
    await page.goto('/?escena=meta#progreso')
    const meta = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Meta de 60 días: 510 conceptos y 255 preguntas', exact: true }) })
    await expect(meta).toContainText('Día 13 de 60')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (etapa === 'despues') {
      const preguntas = meta.locator('.meta-serie').filter({ has: page.getByText('Preguntas NBME respondidas', { exact: true }) })
      await expect(preguntas.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '46 de 255; la línea va por 52')
      await expect(preguntas.locator('.meta-distancia')).toHaveText('Para alcanzar la línea: 6. Para superarla: 7. Para completar la meta: 209.')
      await expect(meta).toContainText('La proyección sale el 9 oct')
    }
    await expect(page.locator('.synapse-heading[data-animating="true"]')).toHaveCount(0)
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.screenshot({ path: path.join(destino, `meta-dia13-${width}.png`), fullPage: true })
    const evidencia = { fixture: 'escena=meta, synthetic concept IDs and attempts', ahora: AHORA.toISOString(), width,
      texto: await meta.innerText(), barras: await meta.getByRole('progressbar').evaluateAll(barras => barras.map(b => ({
        nombre: b.getAttribute('aria-label'), valor: b.getAttribute('aria-valuenow'), max: b.getAttribute('aria-valuemax'), texto: b.getAttribute('aria-valuetext'),
      }))) }
    await writeFile(path.join(destino, `meta-dia13-${width}.json`), JSON.stringify(evidencia, null, 2) + '\n')
    await page.getByRole('button', { name: 'Hoy', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
    await expect(page.locator('.synapse-heading[data-animating="true"]')).toHaveCount(0)
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const anillo = page.locator('.anillo-doble')
    await expect(anillo).toHaveAttribute('aria-label', /Tema de la semana, dominio demostrado: 1 de 14/)
    const geometria = await anillo.evaluate(elemento => {
      const arcos = [...elemento.querySelectorAll('svg > g')].map(g => {
        const circles = g.querySelectorAll('circle')
        return { pista: parseFloat(circles[0].getAttribute('stroke-dasharray')!), avance: parseFloat(circles[1].getAttribute('stroke-dasharray')!) }
      })
      const pista = arcos.reduce((n, arco) => n + arco.pista, 0)
      return { etiqueta: elemento.getAttribute('aria-label'), arcos, fraccion: arcos.reduce((n, arco) => n + arco.avance, 0) / pista }
    })
    if (etapa === 'despues') expect(geometria.fraccion).toBeCloseTo(1 / 14, 10)
    await writeFile(path.join(destino, `hoy-circulos-${width}.json`), JSON.stringify(geometria, null, 2) + '\n')
    await page.screenshot({ path: path.join(destino, `hoy-circulos-${width}.png`), fullPage: true })
  })
})
