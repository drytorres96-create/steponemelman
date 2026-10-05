import { expect, test } from '@playwright/test'

const LUNES = new Date('2026-10-05T07:30:00-04:00')
for (const width of [390, 1280]) test.describe(`aprendizaje y diseño premium a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })

  test('Hoy explica la meta, conserva una sola acción principal y retira fotografías al estudiar', async ({ page }) => {
    await page.clock.install({ time: LUNES })
    await page.goto('/?escena=abierto')
    await expect(page.locator('.hoy-next-block')).toBeVisible()
    await expect(page.locator('.hoy-next-block')).toContainText('Tu objetivo de hoy:')
    await expect(page.locator('.hoy-next-block')).toContainText('quedan')
    await expect(page.locator('.hoy .btn.principal:visible')).toHaveCount(1)
    // La escena de 1s no basta para estimar cuánto tardará una persona real.
    await expect(page.locator('.hoy-next-block')).not.toContainText('min para responder')
    await page.locator('.hoy-next-block .btn.principal').click()
    await expect(page.getByRole('textbox', { name: 'Tu respuesta', exact: true })).toBeVisible()
    await expect(page.locator('.cinematic-backdrop, .scene-photo')).toHaveCount(0)
    await expect(page.locator('.session-step-label')).toContainText('Paso 1')
    const layout = await page.evaluate(() => ({ ancho: innerWidth, contenido: document.documentElement.scrollWidth }))
    expect(layout.contenido).toBeLessThanOrEqual(layout.ancho)
  })

  test('lo nuevo conserva el guion, muestra un final cercano y ofrece pausa al terminar el bloque', async ({ page }) => {
    await page.clock.install({ time: LUNES })
    await page.goto('/?escena=abierto')
    await page.getByRole('button', { name: /(Empezar|Seguir con) lo nuevo/ }).click()
    const pasos = page.locator('.session-step-label')
    await expect(pasos).toHaveText(/Bloque 1 .*Paso 1 de 4/)
    for (let n = 1; n <= 3; n++) {
      const respuesta = page.getByRole('textbox', { name: 'Tu respuesta', exact: true })
      await expect(respuesta).toBeFocused()
      await respuesta.fill('demostración')
      await respuesta.press('Enter')
      await expect(page.getByRole('button', { name: 'Siguiente pregunta', exact: true })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(pasos).toContainText(`Paso ${n + 1} de 4`)
    }
    await page.keyboard.press('c')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(pasos).toHaveText(/Bloque 2 .*Paso 1 de 4/)
    await expect(page.getByRole('textbox', { name: 'Tu respuesta', exact: true })).toBeVisible()
    await expect(page.locator('.session-block-pause')).toBeVisible()
    await expect(page.locator('.session-block-pause')).not.toHaveAttribute('open', '')
  })

  test('un concepto con dominio vencido entra en Hoy y Progreso distingue su mantenimiento', async ({ page }) => {
    await page.clock.install({ time: LUNES })
    await page.goto('/?escena=mantenimiento')
    await expect(page.getByText('Incluye mantenimiento de conceptos cuyo dominio ya demostraste.')).toBeVisible()
    await page.locator('.study-secondary-nav > summary').click()
    await page.getByRole('button', { name: 'Progreso', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Progreso', exact: true })).toBeVisible()
    await expect(page.locator('.premium-progress')).toContainText('Dominio demostrado')
    await expect(page.locator('.premium-progress')).toContainText('Mantenimiento al día')
    await expect(page.locator('.premium-progress')).toContainText('pendiente')
    const plan = page.locator('.hoy-desplegable').filter({ hasText: 'Mi semana y mi plan' })
    await expect(plan).not.toHaveAttribute('open', '')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('al completar el día hay un cierre explícito sin acción principal adicional', async ({ page }) => {
    await page.clock.install({ time: LUNES })
    await page.goto('/?escena=cerrado')
    await expect(page.getByRole('heading', { name: 'Puedes cerrar por hoy.', exact: true })).toBeVisible()
    await expect(page.locator('.hoy .btn.principal:visible')).toHaveCount(0)
    await expect(page.locator('.hoy-completion')).toContainText('Completaste')
    const movimiento = await page.locator('.hoy-completion').evaluate(el => getComputedStyle(el).animationDuration)
    expect(parseFloat(movimiento)).toBeLessThanOrEqual(0.01)
  })
})
