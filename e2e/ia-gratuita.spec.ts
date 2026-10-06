import { expect, test } from '@playwright/test'

const LUNES = new Date('2026-10-05T11:30:00Z')
for (const width of [390, 1280]) test.describe(`IA gratuita a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
  test('el chat usa la pregunta respondida, conserva la cita y permite continuar', async ({ page }) => {
    const consultas: Record<string, unknown>[] = []
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      const body = url.pathname === '/api/ia/estado'
        ? { presupuesto: 8500, restantes: 8500, gastadas: 0, llamadas: 0, activa: true, presupuestoUsuario: 7650, restantesUsuario: 7650 }
        : url.pathname === '/api/calificar' ? { veredicto: 'incorrecta', motivo: 'No es la respuesta sintética.' }
        : { respuesta: 'Tu respuesta beta no corresponde al elemento de demostración.', apoyo: 'material', evidencia: 'Sin material clínico', patron: 'Distingue el dato decisivo.' }
      if (url.pathname === '/api/preguntar') consultas.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.clock.install({ time: LUNES })
    await page.goto('/?escena=abierto&ia=1')
    await expect(page.locator('.medidor-detalle')).toContainText('100 % disponible')
    await page.locator('.hoy-next-block .btn.principal').click()
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).fill('beta')
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).press('Enter')
    await page.locator('.retro-mas > summary').click()
    await page.getByText('Preguntar sobre esta pregunta', { exact: true }).click()
    expect(consultas).toHaveLength(0)
    await page.getByRole('button', { name: 'Explícame el mecanismo paso a paso', exact: true }).click()
    await expect(page.locator('.chat-apoyo')).toHaveText(/Cita localizada/)
    await page.getByText('Ver el fragmento citado', { exact: true }).click()
    await expect(page.locator('.chat blockquote')).toHaveText('Sin material clínico')
    expect(consultas).toHaveLength(1)
    expect(consultas[0]).toMatchObject({ historial: [], presentacion: { answer: 'beta', formatVersion: 3, retry: false } })
    await expect(page.getByRole('button', { name: 'Siguiente pregunta', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
})
