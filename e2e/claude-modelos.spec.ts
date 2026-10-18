import { expect, test } from '@playwright/test'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
import { ordenDeProduccion } from './arnes/orden-produccion'

for (const width of [390, 1280]) test(`Sonnet only on request, without changing progress at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const questions = Array.from({ length: 5 }, (_, i) => ({ ...preguntaNbmeReal(`QA-NBME-${i + 1}`), systems: ['Renal'] }))
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/nbme/catalog') return route.fulfill({ json: { schemaVersion: 1, bankVersion: 'qa', total: 5, questions } })
    if (path === '/api/nbme/questions') return route.fulfill({ json: { questions } })
    if (path === '/api/ia/chat') {
      const body = route.request().postDataJSON()
      requests.push(body)
      return route.fulfill({ json: { respuesta: body.revisionSonnet
        ? 'Revisé el material sintético: alfa precede a beta y la explicación conserva esa relación.'
        : 'La explicación sintética conecta alfa con beta y conserva el contexto de esta pregunta.', cached: false } })
    }
    return route.fulfill({ status: 503, json: { error: 'Synthetic backend unavailable.' } })
  })
  await page.goto('/?workspace=myqbank&proveedor=nbme-real&escena=abierto&ia=1')
  await page.getByRole('button', { name: 'Start 5-question block', exact: true }).click()
  await page.getByText('Synthetic saved option C', { exact: true }).click()
  await page.getByRole('button', { name: 'Submit answer', exact: true }).click()
  await ordenDeProduccion(page)
  const tutor = page.getByRole('region', { name: 'Claude, tu tutor de esta pregunta', exact: true })
  const review = tutor.getByRole('button', { name: 'Revisar con Sonnet', exact: true })
  await expect(review).toHaveCount(0)
  expect(requests).toHaveLength(0)
  const attempts = await page.evaluate(() => window.__leerNbmeReal().attempts)
  await tutor.getByRole('button', { name: 'Mecanismo paso a paso', exact: true }).click()
  await expect(review).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0]).not.toHaveProperty('revisionSonnet')
  expect((await review.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  if (process.env.CLAUDE_MODELS_CAPTURE) await page.screenshot({ path: `${process.env.CLAUDE_MODELS_CAPTURE}/after-${width}.png`, fullPage: true })
  await review.focus()
  await page.keyboard.press('Enter')
  await expect(tutor).toContainText('Revisión con Sonnet')
  await expect(tutor).toContainText('Revisé el material sintético')
  await expect(review).toHaveCount(0)
  expect(requests).toHaveLength(2)
  expect(requests[1].revisionSonnet).toBe(true)
  expect(requests[1].historial).toHaveLength(2)
  const reviewed = tutor.getByText('Revisé el material sintético: alfa precede a beta y la explicación conserva esa relación.', { exact: true })
  await reviewed.scrollIntoViewIfNeeded()
  await expect(reviewed).toBeInViewport()
  if (process.env.CLAUDE_MODELS_CAPTURE) {
    await page.screenshot({ path: `${process.env.CLAUDE_MODELS_CAPTURE}/review-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click()
    await page.screenshot({ path: `${process.env.CLAUDE_MODELS_CAPTURE}/dark-${width}.png`, fullPage: true })
  }
  await tutor.getByRole('textbox', { name: 'Tu pregunta para Claude' }).fill('Explícame ahora la relación con gamma.')
  await tutor.getByRole('button', { name: 'Enviar pregunta', exact: true }).click()
  await expect(review).toBeVisible()
  expect(requests).toHaveLength(3)
  expect(requests[2]).not.toHaveProperty('revisionSonnet')
  expect(await page.evaluate(() => window.__leerNbmeReal().attempts)).toEqual(attempts)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (width > 960) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
})
