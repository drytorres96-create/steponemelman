import { expect, test, type Page } from '@playwright/test'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
import { ordenDeProduccion } from './arnes/orden-produccion'

const url = '/?workspace=myqbank&proveedor=nbme-real&escena=abierto'
async function fixture(page: Page) {
  const question = (id: string) => ({
    ...preguntaNbmeReal(id), systems: ['Renal'],
    explanation: 'Synthetic explanation of the saved option. '.repeat(150),
  })
  const questions = Array.from({ length: 10 }, (_, i) => question(`QA-NAV-${i + 1}`))
  // Explanation reads Supabase's editorial companion, not an /api/nbme endpoint.
  // Explicit authoritative absence in the synthetic Supabase harness enables the
  // original explanation fallback without a real data or AI request.
  await page.addInitScript(assets => { window.__qaEditorialAssets = assets },
    Object.fromEntries(questions.map(q => [`myqbank/explanations/v1/${q.id}/${q.revision}/base.json`, null])))
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/nbme/catalog') return route.fulfill({ json: { schemaVersion: 1, bankVersion: 'navigation-fixture', total: questions.length, questions } })
    if (path === '/api/nbme/questions') return route.fulfill({ json: {
      questions: (route.request().postDataJSON().refs as { id: string }[]).map(ref => question(ref.id)),
    } })
    return route.fulfill({ status: 503, json: { error: 'Synthetic backend only; no AI requests.' } })
  })
}

test('skip link focuses content without replacing the current route', async ({ page }) => {
  await fixture(page)
  await page.goto(url)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await skip.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('#mq-main')).toBeFocused()
  await expect(page).toHaveURL(/#settings$/)
})

test('desktop block options scroll without hiding the start action or blocking page progress', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await fixture(page)
  await page.goto(url)
  const start = page.getByRole('button', { name: 'Start 5-question block', exact: true })
  await expect(start).toBeEnabled()
  await ordenDeProduccion(page)
  await expect(start).toBeInViewport()
  await page.getByText('More filters', { exact: true }).click()
  const options = page.getByRole('region', { name: 'Block options', exact: true })
  expect(await options.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
  await options.focus()
  await page.keyboard.press('End')
  await expect.poll(() => options.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await expect(start).toBeInViewport()
  await page.getByText('Detailed progress and study plan', { exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByText('Detailed progress and study plan', { exact: true })).toBeInViewport()
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
})

for (const width of [390, 1280]) test(`answered question navigation resets reading position and focus at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await fixture(page)
  await page.goto(url)
  await page.getByRole('button', { name: 'Start 5-question block', exact: true }).click()
  for (const n of [1, 2]) {
    await expect(page.getByRole('heading', { name: `Question ${n}`, exact: true })).toBeFocused()
    await page.getByText('Synthetic saved option C', { exact: true }).click()
    await page.getByRole('button', { name: 'Submit answer', exact: true }).click()
    await expect(page.locator('.mq-result')).toHaveText('Correct')
    if (width < 961) await expect(page.locator('.mq-result')).toBeFocused()
    // Long source text is collapsed by default. Expand it so the test exercises
    // reading a long explanation rather than a short unavailable/loading state.
    await page.getByRole('button', { name: 'Read full explanation', exact: true }).click()
    await expect(page.locator('.mq-explanation-content')).toContainText('Synthetic explanation of the saved option.')
    if (n === 1) await page.locator('.mq-study-tools').getByRole('button', { name: 'Next question', exact: true }).click()
  }
  const explanation = page.getByRole('complementary', { name: 'Explanation', exact: true })
  if (width > 960) {
    expect(await explanation.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
    await explanation.focus()
    await page.keyboard.press('End')
    // End scrolls asynchronously in Chromium. Navigation must start after that
    // scroll reaches its destination, not while its next animation frame is pending.
    await expect.poll(() => explanation.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThanOrEqual(1)
  }
  await page.getByRole('button', { name: 'Previous question', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeInViewport()
  // The new source is loaded asynchronously; inspect the settled reading surface,
  // rather than the transient Loading explanation frame.
  await expect(explanation.getByRole('heading', { name: 'Original explanation', exact: true })).toBeVisible()
  await expect.poll(() => explanation.evaluate(el => el.scrollTop)).toBe(0)
  if (width > 960) await expect(explanation.locator('.mq-result')).toBeInViewport({ ratio: 1 })
  await expect.poll(() => page.getByRole('region', { name: 'Question and answer', exact: true }).evaluate(el => el.scrollTop)).toBe(0)
})

for (const width of [390, 1280]) test(`settings show all three sync states without horizontal overflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fixture(page)
  await page.goto(url)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await ordenDeProduccion(page)
  const sync = page.getByRole('region', { name: 'Sync status', exact: true })
  const rows = sync.locator('dl > div')
  await expect(rows).toHaveCount(3)
  const states = [
    ['Concept progress', 'Synced'],
    ['NBME progress', 'Synced'],
    ['Notes and highlights', 'Annotations synced'],
  ]
  for (const [index, [label, state]] of states.entries()) {
    await expect(rows.nth(index).locator('dt')).toHaveText(label)
    await expect(rows.nth(index).locator('dd')).toHaveText(state)
    await expect(rows.nth(index)).toBeInViewport()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await sync.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: `docs/myqbank-phases-2-4/audit-settings-${width}.png`, fullPage: true, animations: 'disabled' })
})
