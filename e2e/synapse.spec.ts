import { expect, test } from '@playwright/test'

const LUNES = new Date('2026-10-05T07:30:00-04:00')

for (const width of [320, 390, 1280]) {
  test.describe(`Synapse en Melman a ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })

    test('el menú conserva destinos, teclado y controles sin desbordamientos', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.clock.install({ time: LUNES })
      await page.goto('/?escena=abierto')
      await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
      await expect(page.locator('.synapse-heading-glyphs')).toHaveCount(0)
      const marcaCompleta = await page.locator('.editorial-brand').evaluate(el => {
        const texto = el.querySelector('.brand-wordmark')!
        return texto.getBoundingClientRect().right <= el.getBoundingClientRect().right && el.scrollWidth <= el.clientWidth
      })
      expect(marcaCompleta).toBe(true)
      const menu = page.locator('.menu-cuenta')
      const summary = menu.locator('summary')
      await summary.focus()
      await page.keyboard.press('Enter')
      await expect(menu).toHaveAttribute('open', '')
      await page.keyboard.press('Escape')
      await expect(menu).not.toHaveAttribute('open')
      await expect(summary).toBeFocused()
      await summary.click()
      await menu.getByRole('button', { name: 'Progreso', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Progreso', exact: true })).toBeVisible()
      await expect(menu).not.toHaveAttribute('open')
      await expect(page.locator('.premium-progress-card')).toHaveCount(3)
      for (const card of await page.locator('.premium-progress-card').all()) {
        const bounds = await card.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Hoy', exact: true }).click()
      const empezar = page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ })
      await expect(empezar).toBeEnabled()
      expect((await empezar.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await empezar.click()
      await expect(page.locator('.session-focus')).toBeVisible()
      await expect(page.locator('.synapse-workspace, .cinematic-backdrop, .synapse-heading-glyphs')).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: 'Tu respuesta', exact: true })).toBeVisible()
    })
  })
}

test('el movimiento es breve, responde a la preferencia y no depende de las imágenes', async ({ page }) => {
  await page.clock.install({ time: LUNES })
  await page.route('**/images/cinematic/**', route => route.abort())
  await page.goto('/?escena=abierto')
  const titulo = page.getByRole('heading', { name: 'Hoy', exact: true })
  await expect(titulo).toBeVisible()
  await expect(page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ })).toBeEnabled()
  await page.clock.runFor(900)
  await expect(page.locator('.synapse-heading-glyphs')).toHaveCount(0)
  await page.evaluate(() => scrollTo(0, 600))
  const fondo = page.locator('.cinematic-backdrop')
  await expect.poll(() => fondo.evaluate(el => parseFloat((el as HTMLElement).style.getPropertyValue('--synapse-scroll-y')))).toBeLessThan(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => fondo.evaluate(el => (el as HTMLElement).style.getPropertyValue('--synapse-scroll-y'))).toBe('0px')
  await expect(fondo.locator('.cine-escena[data-activa="true"]')).toHaveCSS('transform', 'none')
  await page.evaluate(() => scrollTo(0, 0))
  await expect(titulo).toBeVisible()
  await expect(page.locator('.hoy-next-block')).toHaveCSS('opacity', '1')
})
