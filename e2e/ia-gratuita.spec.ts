import { expect, test } from '@playwright/test'

const LUNES = new Date('2026-10-05T11:30:00Z')
const correccion = { observado: 'Elegiste beta.', confusion: 'Puede que hayas confundido el dato solicitado.', clave: 'Se pide demostración.', evitar: 'Compara el dato solicitado con tu elección.', evidencia: 'Sin material clínico' }
for (const width of [390, 1280]) test.describe(`IA gratuita a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
  test('el chat usa la pregunta respondida, conserva la cita y permite continuar', async ({ page }) => {
    const consultas: Record<string, unknown>[] = []
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      const body = url.pathname === '/api/ia/estado'
        ? { presupuesto: 8500, restantes: 8500, gastadas: 0, llamadas: 0, activa: true, presupuestoUsuario: 7650, restantesUsuario: 7650 }
        : url.pathname === '/api/calificar' ? { veredicto: 'incorrecta', motivo: 'No es la respuesta sintética.' }
        : url.pathname === '/api/ia/error' ? correccion
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
    expect((await page.getByRole('button', { name: 'Explícame el mecanismo paso a paso', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(consultas).toHaveLength(1)
    expect(consultas[0]).toMatchObject({ historial: [], presentacion: { answer: 'beta', formatVersion: 3, retry: false } })
    await expect(page.getByRole('button', { name: 'Siguiente pregunta', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('un fallo genera una corrección individual y el razonamiento sólo se analiza al enviarlo', async ({ page }) => {
    const consultas: Record<string, unknown>[] = []
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/ia/error') consultas.push(route.request().postDataJSON())
      const body = path === '/api/ia/estado' ? { presupuesto: 8500, restantes: 8500, activa: true }
        : path === '/api/calificar' ? { veredicto: 'incorrecta', motivo: 'Beta no corresponde.' } : correccion
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.clock.install({ time: LUNES })
    await page.goto('/?escena=abierto&ia=1')
    await page.locator('.hoy-next-block .btn.principal').click()
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).fill('beta')
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).press('Enter')
    await expect(page.locator('.correccion-error-ia')).toContainText('Posible confusión:')
    expect(consultas).toHaveLength(1)
    await page.getByText('Así lo razoné · opcional', { exact: true }).click()
    await page.getByLabel('¿Qué dato te llevó a esa respuesta?').fill('Elegí beta por el segundo dato.')
    expect(consultas).toHaveLength(1)
    await page.getByRole('button', { name: 'Revisar mi razonamiento', exact: true }).click()
    await expect(page.locator('.correccion-error-ia')).toContainText('Revisión de tu razonamiento:')
    expect(consultas).toHaveLength(2)
    expect(consultas[1]).toMatchObject({ razonamiento: 'Elegí beta por el segundo dato.', presentacion: { answer: 'beta' } })
    await expect(page.getByRole('button', { name: 'Siguiente pregunta', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('un fallo de opciones NBME usa su letra y revisión y una cuota agotada permite continuar', async ({ page }) => {
    const { NBME_REAL_TOKEN } = await import('./arnes/nbme-real-fixture')
    const consultas: { cuerpo: Record<string, unknown>; autorizacion: string | undefined }[] = []
    const correccionesAutomaticas: Record<string, unknown>[] = []
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/ia/recuperacion-nbme') consultas.push({ cuerpo: route.request().postDataJSON(),
        autorizacion: route.request().headers()['authorization'] })
      if (path === '/api/ia/error') correccionesAutomaticas.push(route.request().postDataJSON())
      const body = path === '/api/ia/estado' ? { presupuesto: 8500, restantes: 0, activa: true }
        : path === '/api/calificar' ? { veredicto: 'correcta', motivo: 'Es demostración.' } : { error: 'La parte gratuita de hoy se agotó.' }
      await route.fulfill({ status: path === '/api/ia/recuperacion-nbme' ? 429 : 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.clock.install({ time: LUNES })
    await page.goto('/?escena=abierto&ia=1')
    await page.getByRole('button', { name: /(Empezar|Seguir con) lo nuevo/ }).click()
    for (let n = 0; n < 3; n++) {
      await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).fill('demostración')
      await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).press('Enter')
      await page.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
    }
    await page.locator('.nbme-question').waitFor()
    await page.keyboard.press('a'); await page.keyboard.press('Enter')
    const panel = page.getByRole('region', { name: 'Recuperación del error NBME', exact: true })
    await expect(panel.getByRole('button', { name: 'Practicar este error con IA', exact: true })).toBeVisible()
    expect(consultas).toHaveLength(0)
    expect(correccionesAutomaticas).toHaveLength(0)
    const antes = await page.evaluate(() => window.__leerNbmeSintetico())
    const intento = (Object.values(antes.attempts) as import('../src/nbme/types').NbmeAttempt[])
      .find(a => a.sessionId === antes.activeSessionId && a.reviewedAt === null)!
    expect(intento).toMatchObject({ optionId: 'A', revision: 'r1', correct: false })
    await panel.getByRole('button', { name: 'Practicar este error con IA', exact: true }).click()
    await expect(panel).toContainText('La parte gratuita de hoy se agotó.')
    expect(consultas).toHaveLength(1)
    expect(consultas[0]).toEqual({ cuerpo: { questionId: intento.questionId, optionId: intento.optionId, revision: intento.revision },
      autorizacion: `Bearer ${NBME_REAL_TOKEN}` })
    expect(correccionesAutomaticas).toHaveLength(0)
    const despues = await page.evaluate(() => window.__leerNbmeSintetico())
    expect(despues.activeSessionId).toBe(antes.activeSessionId)
    expect(Object.keys(despues.sessions)).toEqual(Object.keys(antes.sessions))
    expect(despues.attempts).toEqual(antes.attempts)
    const continuar = page.locator('.nbme-feedback').getByRole('button', { name: 'Continuar', exact: true })
    await expect(continuar).toBeVisible()
    await expect(continuar).toBeEnabled()
    await continuar.click()
    await expect.poll(() => page.evaluate(id => window.__leerNbmeSintetico().attempts[id].reviewedAt, intento.id)).not.toBeNull()
    expect(consultas).toHaveLength(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
})
