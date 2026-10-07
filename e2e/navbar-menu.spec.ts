import { expect, test, type Page } from '@playwright/test'

const LUNES = new Date('2026-10-05T07:30:00-04:00')
const destinos = ['Biblioteca', 'Progreso', 'Ajustes y respaldo', 'Calidad del material', 'Plan diario clásico', 'Salir']
const menu = (page: Page) => page.locator('.navbar-menu')
const summary = (page: Page) => menu(page).locator('summary')
const panel = (page: Page) => menu(page).locator('.navbar-menu-panel')

async function abrir(page: Page) {
  const errores: string[] = []
  page.on('pageerror', error => errores.push(String(error)))
  // The real App uses only the existing synthetic providers. Block unexpected remote requests.
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await page.clock.install({ time: LUNES })
  await page.goto('/?escena=abierto')
  await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
  return errores
}

for (const width of [320, 390, 1280]) {
  test.describe(`Menú amplio a ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })

    test('mantiene destinos, alcance táctil y navegación sin iniciar una sesión', async ({ page }) => {
      const errores = await abrir(page)
      const progreso = await page.evaluate(() => JSON.stringify(window.__leerProgresoSintetico()))
      await summary(page).focus()
      await page.keyboard.press('Enter')
      await expect(menu(page)).toHaveAttribute('open', '')
      await expect(summary(page)).toHaveAttribute('aria-expanded', 'true')
      expect(await menu(page).locator('button').evaluateAll(buttons => buttons.map(b => b.getAttribute('aria-label')))).toEqual(destinos)
      const caja = await panel(page).boundingBox()
      expect(caja!.x).toBeGreaterThanOrEqual(0)
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      for (const boton of await panel(page).getByRole('button').all()) {
        expect((await boton.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      // Opening and reading navigation never touches stored attempts or the saved queue.
      expect(await page.evaluate(() => JSON.stringify(window.__leerProgresoSintetico()))).toBe(progreso)
      await menu(page).getByRole('button', { name: 'Progreso', exact: true }).click()
      await expect(page).toHaveURL(/#progreso$/)
      await expect(menu(page)).not.toHaveAttribute('open')
      await expect(page.getByRole('heading', { name: 'Progreso', exact: true })).toBeVisible()
      await summary(page).focus()
      await page.keyboard.press('ArrowDown')
      await expect(menu(page).getByRole('button', { name: 'Biblioteca', exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/#modulos$/)
      await expect(page.getByRole('group', { name: 'Tipo de contenido' })).toBeVisible()
      expect(await page.evaluate(() => JSON.stringify(window.__leerProgresoSintetico()))).toBe(progreso)
      await page.getByRole('button', { name: 'Hoy', exact: true }).click()
      await page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ }).click()
      await expect(page.locator('.session-focus')).toBeVisible()
      await expect(menu(page)).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: 'Tu respuesta', exact: true })).toBeVisible()
      expect(errores).toEqual([])
    })
  })
}

test.describe('Ratón y teclado', () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' })

  test('la intención al pasar abre sin robar foco; el puente y la pausa de salida permiten cruzarlo', async ({ page }) => {
    const errores = await abrir(page)
    const principal = page.getByRole('button', { name: 'Hoy', exact: true })
    await principal.focus()
    const progreso = await page.evaluate(() => JSON.stringify(window.__leerProgresoSintetico()))
    await summary(page).hover()
    await page.clock.runFor(160)
    await expect(menu(page)).toHaveAttribute('open', '')
    await expect(principal).toBeFocused()
    const entrada = await summary(page).boundingBox()
    const caja = await panel(page).boundingBox()
    // Cross the actual gap slowly, rather than jumping directly to a child.
    await page.mouse.move(entrada!.x + entrada!.width / 2, (entrada!.y + entrada!.height + caja!.y) / 2)
    await page.clock.runFor(250)
    await expect(menu(page)).toHaveAttribute('open', '')
    await panel(page).getByRole('button', { name: 'Biblioteca', exact: true }).hover()
    await page.clock.runFor(250)
    await expect(menu(page)).toHaveAttribute('open', '')
    await page.mouse.move(5, 880)
    await page.clock.runFor(90)
    await expect(menu(page)).toHaveAttribute('open', '')
    await page.clock.runFor(200)
    await expect(menu(page)).not.toHaveAttribute('open')
    expect(await page.evaluate(() => JSON.stringify(window.__leerProgresoSintetico()))).toBe(progreso)
    expect(errores).toEqual([])
  })

  test('un clic fija la vista previa y el siguiente cierra; Escape y el exterior también la cierran', async ({ page }) => {
    await abrir(page)
    await summary(page).hover()
    await page.clock.runFor(160)
    await expect(menu(page)).toHaveAttribute('open', '')
    await summary(page).click()
    await page.mouse.move(5, 880)
    await page.clock.runFor(300)
    await expect(menu(page)).toHaveAttribute('open', '')
    // Focus stays outside the menu: Escape must still dismiss a hover/pinned panel.
    await page.keyboard.press('Escape')
    await expect(menu(page)).not.toHaveAttribute('open')
    await expect(summary(page)).toBeFocused()
    await summary(page).press('Space')
    await expect(menu(page)).toHaveAttribute('open', '')
    await summary(page).press('Space')
    await expect(menu(page)).not.toHaveAttribute('open')
    await summary(page).press('Enter')
    await expect(menu(page)).toHaveAttribute('open', '')
    await page.getByRole('heading', { name: 'Hoy', exact: true }).click()
    await expect(menu(page)).not.toHaveAttribute('open')
    await summary(page).focus()
    await summary(page).press('ArrowDown')
    await expect(panel(page).getByRole('button', { name: 'Biblioteca', exact: true })).toBeFocused()
    // Real forward tab order reaches every destination, then leaves and dismisses the disclosure.
    for (const nombre of destinos.slice(1)) {
      await page.keyboard.press('Tab')
      await expect(panel(page).getByRole('button', { name: nombre, exact: true })).toBeFocused()
    }
    await page.keyboard.press('Tab')
    await expect(menu(page)).not.toHaveAttribute('open')
  })

  test('el movimiento reducido mantiene los controles visibles y elimina animaciones del panel y sus hijos', async ({ page }) => {
    await abrir(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await summary(page).focus()
    await summary(page).press('Enter')
    await expect(panel(page)).toBeVisible()
    const moviles = await panel(page).evaluate(el => [el, ...el.querySelectorAll('*')].filter(n => {
      const style = getComputedStyle(n)
      return style.animationName !== 'none' && style.animationDuration.split(',').some(t => parseFloat(t) > 0.01)
    }).length)
    expect(moviles).toBe(0)
    await expect(panel(page).getByRole('button', { name: 'Biblioteca', exact: true })).toBeVisible()
  })
})

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test.describe(`Menú táctil ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
    test('abre por toque y permite alcanzar todos los destinos en poco espacio', async ({ page }) => {
      await abrir(page)
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)
      await summary(page).tap()
      await expect(menu(page)).toHaveAttribute('open', '')
      const caja = await panel(page).boundingBox()
      expect(caja!.x).toBeGreaterThanOrEqual(0)
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(viewport.width)
      expect(caja!.y).toBeGreaterThanOrEqual(0)
      expect(caja!.y + caja!.height).toBeLessThanOrEqual(viewport.height + 1)
      for (const nombre of destinos) {
        const boton = panel(page).getByRole('button', { name: nombre, exact: true })
        await boton.scrollIntoViewIfNeeded()
        await expect(boton).toBeInViewport()
        expect((await boton.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      await panel(page).getByRole('button', { name: 'Progreso', exact: true }).tap()
      await expect(page).toHaveURL(/#progreso$/)
      await expect(menu(page)).not.toHaveAttribute('open')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  })
}
