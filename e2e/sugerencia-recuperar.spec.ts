import { expect, test, type Page } from '@playwright/test'

/** Miércoles 14 de octubre de 2026, 11:00 en Nueva York: techo de 20 cajas. El viernes 16 va vacío. */
const MIERCOLES = new Date('2026-10-14T15:00:00Z')
const VIERNES = new Date('2026-10-16T15:00:00Z')
const HILO = 'Son conceptos que fallaste esta semana y que aún se pueden afirmar.'

async function instalarRed(page: Page, opciones: { hilo?: { status: number; json: unknown } } = {}) {
  const hilos: Record<string, any>[] = []
  await page.route('**/api/**', async route => {
    const req = route.request()
    const ruta = new URL(req.url()).pathname
    if (ruta === '/api/ia/sesion') {
      hilos.push(req.postDataJSON())
      const r = opciones.hilo ?? { status: 200, json: { hilo: HILO, cached: false } }
      return route.fulfill({ status: r.status, json: r.json })
    }
    return route.fulfill({ status: 503, json: { disponible: false, error: 'Synthetic backend unavailable.' } })
  })
  return { hilos }
}
const tarjeta = (page: Page) => page.getByRole('region', { name: 'Para reforzar hoy', exact: true })
const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

for (const width of [390, 1280]) test.describe(`Para reforzar hoy a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })

  test('sale una vez al día con cinco ítems de lo que las cajas dejaron fuera, y al repasarlos no vuelve', async ({ page }) => {
    const { hilos } = await instalarRed(page)
    await page.clock.install({ time: MIERCOLES })
    await page.goto('/?escena=fragil&ia=1')

    await expect(tarjeta(page)).toBeVisible()
    await expect(tarjeta(page).getByRole('listitem')).toHaveCount(5)
    await expect(tarjeta(page)).toContainText('Opcional · una vez al día')
    await expect(tarjeta(page)).toContainText(HILO)
    await expect(tarjeta(page).getByText('Fallada esta semana')).toHaveCount(5)
    expect(hilos).toHaveLength(1)
    expect(hilos[0]).toMatchObject({ fase: 'hilo' })
    expect(hilos[0].items).toHaveLength(5)
    for (const i of hilos[0].items) expect(Object.keys(i).sort()).toEqual(['etiqueta', 'id', 'senales', 'tipo'])
    expect(await sinDesborde(page)).toBe(true)

    const antes = await page.evaluate(() => window.__leerProgresoSintetico().progreso)
    await tarjeta(page).getByRole('button', { name: 'Repasar estos 5', exact: true }).click()
    await expect(page.getByText('Para reforzar · hoy').first()).toBeVisible()
    // La sesión tiene exactamente los cinco ítems de la tarjeta (el subtítulo sólo se ve al reanudar).
    await expect(page.getByText('Paso 1 de 5')).toBeVisible()
    // Abrir la sesión no registra nada por sí solo.
    expect(await page.evaluate(() => window.__leerProgresoSintetico().progreso)).toEqual(antes)

    await page.reload()
    await expect(page.locator('.hoy')).toBeVisible()
    await expect(tarjeta(page)).toHaveCount(0)
    expect(hilos).toHaveLength(1)
  })

  test('«Hoy no» la cierra por hoy y sigue cerrada al recargar, sin volver a llamar a Claude', async ({ page }) => {
    const { hilos } = await instalarRed(page)
    await page.clock.install({ time: MIERCOLES })
    await page.goto('/?escena=fragil&ia=1')
    await expect(tarjeta(page)).toBeVisible()
    await tarjeta(page).getByRole('button', { name: 'Hoy no', exact: true }).click()
    await expect(tarjeta(page)).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.hoy')).toBeVisible()
    await expect(tarjeta(page)).toHaveCount(0)
    expect(hilos).toHaveLength(1)
  })

  test('si Claude no responde la tarjeta sale completa, sin la frase', async ({ page }) => {
    await instalarRed(page, { hilo: { status: 503, json: { error: 'Claude no está disponible.', codigo: 'proveedor' } } })
    await page.clock.install({ time: MIERCOLES })
    await page.goto('/?escena=fragil&ia=1')
    await expect(tarjeta(page)).toBeVisible()
    await expect(tarjeta(page).getByRole('listitem')).toHaveCount(5)
    await expect(tarjeta(page).locator('.sugerencia-hilo')).toHaveCount(0)
    await expect(tarjeta(page).getByRole('button', { name: 'Repasar estos 5', exact: true })).toBeEnabled()
  })

  test('el viernes no hay tarjeta ni se llama a Claude', async ({ page }) => {
    const { hilos } = await instalarRed(page)
    await page.clock.install({ time: VIERNES })
    await page.goto('/?escena=fragil&ia=1')
    await expect(page.locator('.hoy')).toBeVisible()
    await expect(tarjeta(page)).toHaveCount(0)
    expect(hilos).toHaveLength(0)
  })

  test('un historial sin fallos no muestra nada', async ({ page }) => {
    const { hilos } = await instalarRed(page)
    await page.clock.install({ time: MIERCOLES })
    await page.goto('/?escena=cerrado&ia=1')
    await expect(page.locator('.hoy')).toBeVisible()
    await expect(tarjeta(page)).toHaveCount(0)
    expect(hilos).toHaveLength(0)
  })
})
