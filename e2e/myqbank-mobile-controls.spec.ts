import { expect, test, type Page } from '@playwright/test'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
import { ordenDeProduccion } from './arnes/orden-produccion'

async function syntheticBank(page: Page) {
  const questions = Array.from({ length: 12 }, (_, i) => ({ ...preguntaNbmeReal(`QA-${i}`), systems: ['Renal'] }))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/nbme/catalog') return route.fulfill({ json: { schemaVersion: 1, bankVersion: 'synthetic', total: questions.length, questions } })
    if (path === '/api/nbme/questions') {
      const refs = route.request().postDataJSON().refs as { id: string; revision: string }[]
      return route.fulfill({ json: { questions: refs.map(ref => ({ ...preguntaNbmeReal(ref.id, ref.revision), systems: ['Renal'] })) } })
    }
    return route.fulfill({ status: 503, json: { disponible: false } })
  })
}

test('mobile study actions stay on one row with usable touch targets', async ({ page }) => {
  await syntheticBank(page)
  await page.goto('/?workspace=myqbank&proveedor=nbme-real&escena=abierto')
  await page.getByRole('button', { name: 'Start 5-question block' }).click()
  await expect(page.locator('.mq-study-tools')).toBeVisible()
  await ordenDeProduccion(page)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const actions = page.locator('.mq-study-tools > :last-child button')
    const boxes = await actions.evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect()
      return { top: box.top, width: box.width, height: box.height, scrollWidth: button.scrollWidth, clientWidth: button.clientWidth }
    }))
    expect(boxes).toHaveLength(4)
    expect(Math.max(...boxes.map(box => box.top)) - Math.min(...boxes.map(box => box.top))).toBeLessThanOrEqual(1)
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.getByRole('button', { name: 'Labs', exact: true }).click()
    await expect(page.getByLabel('Lab reference', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Labs', exact: true }).click()
    await expect(page.getByLabel('Lab reference', { exact: true })).toHaveCount(0)
  }
})
