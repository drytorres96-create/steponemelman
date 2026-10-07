import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const AHORA = new Date('2026-10-05T11:30:00Z')
const etapa = process.env.HOY_CAPTURE === 'despues' ? 'despues' : 'antes'
const carpeta = path.resolve('docs/simplificacion-hoy-corpus', etapa)
async function guardar(page: Page, nombre: string, quitarFoco = true) {
  await expect(page.locator('.synapse-heading[data-animating="true"]')).toHaveCount(0)
  await page.evaluate(neutro => { if (neutro && document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) }, quitarFoco)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: path.join(carpeta, nombre), fullPage: true })
}
for (const width of [390, 1280]) test.describe(`capturas de simplificación a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 } })
  test('documenta Hoy, navegación, ajustes, biblioteca y progreso sin escribir datos', async ({ page }) => {
    await mkdir(carpeta, { recursive: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install({ time: AHORA })
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Synthetic backend unavailable.' } })
      return route.continue()
    })
    await page.goto('/?escena=abierto#hoy')
    await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
    const inicial = await page.evaluate(() => ({ estudio: window.__leerProgresoSintetico(), nbme: window.__leerNbmeSintetico() }))
    await guardar(page, `hoy-${width}.png`)
    await page.locator('.navbar-menu summary').click()
    await expect(page.locator('.navbar-menu')).toHaveAttribute('open', '')
    const destinos = await page.locator('.navbar-menu button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))
    if (etapa === 'despues') expect(destinos).toEqual(['Biblioteca', 'Progreso', 'Ajustes y respaldo', 'Salir'])
    await guardar(page, `navegacion-${width}.png`, false)
    await page.goto('/?escena=abierto#ajustes')
    await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible()
    await guardar(page, `ajustes-faq-${width}.png`)
    if (etapa === 'despues') {
      const faq = page.getByRole('region', { name: 'Preguntas frecuentes', exact: true })
      await expect(faq.locator('details')).toHaveCount(13)
      await expect(faq.locator('details[open]')).toHaveCount(0)
      for (const pregunta of ['¿Qué necesito para demostrar dominio?', '¿Qué hace avanzar las líneas de la meta?', '¿Qué muestran los círculos?']) {
        await faq.locator('summary').filter({ hasText: pregunta }).click()
      }
      await guardar(page, `faq-expandida-${width}.png`)
      await page.getByText('Índice del material', { exact: true }).click()
      await expect(page.getByRole('table').first()).toBeVisible()
      await guardar(page, `indice-material-${width}.png`)
    }
    await page.goto('/?escena=abierto#modulos')
    await expect(page.getByRole('group', { name: 'Tipo de contenido', exact: true })).toBeVisible()
    const tipos = await page.getByRole('group', { name: 'Tipo de contenido', exact: true }).getByRole('button').allTextContents()
    if (etapa === 'despues') expect(tipos.map(s => s.trim())).toEqual(['Conceptos', 'Preguntas'])
    await guardar(page, `biblioteca-${width}.png`)
    await page.goto('/?escena=abierto#progreso')
    await expect(page.getByRole('heading', { name: 'Progreso', exact: true })).toBeVisible()
    await guardar(page, `progreso-${width}.png`)
    if (etapa === 'despues') {
      await page.goto('/?escena=abierto#vinetas')
      await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
      await guardar(page, `destino-retirado-${width}.png`)
    }
    const final = await page.evaluate(() => ({ estudio: window.__leerProgresoSintetico(), nbme: window.__leerNbmeSintetico() }))
    expect(final.estudio.progreso).toEqual(inicial.estudio.progreso)
    expect(final.nbme.attempts).toEqual(inicial.nbme.attempts)
    await writeFile(path.join(carpeta, `evidencia-${width}.json`), JSON.stringify({ fixture: 'Existing synthetic abierto scene; no clinical content or real account', width, ahora: AHORA.toISOString(), destinos, tipos }, null, 2) + '\n')
  })
})
