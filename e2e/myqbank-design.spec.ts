import { expect, test } from '@playwright/test'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
import { ordenDeProduccion } from './arnes/orden-produccion'

// A realistic number of systems catches cramped filters that a one-system fixture hides.
const systems = ['Cardiovascular', 'Endocrino', 'Gastrointestinal', 'Hematológico y oncológico',
  'Multisistémico', 'Musculoesquelético', 'Neurológico', 'Renal', 'Reproductivo', 'Respiratorio']
const questions = Array.from({ length: 40 }, (_, i) => ({ ...preguntaNbmeReal(`DESIGN-${i}`), systems: [systems[i % systems.length]] }))

for (const width of [320, 390, 768, 1024, 1280, 1920]) test(`dashboard controls remain usable at ${width}px in both themes`, async ({ page }) => {
  const height = width === 320 ? 568 : 900
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/**', route => new URL(route.request().url()).pathname === '/api/nbme/catalog'
    ? route.fulfill({ json: { schemaVersion: 1, bankVersion: 'design-fixture', total: questions.length, questions } })
    : route.fulfill({ status: 503, json: { error: 'Synthetic backend unavailable.' } }))
  await page.goto('/?workspace=myqbank&proveedor=nbme-real&escena=abierto')
  await expect(page.getByRole('button', { name: 'Start 5-question block', exact: true })).toBeEnabled()
  await ordenDeProduccion(page)
  for (const theme of ['light', 'dark']) {
    if (await page.locator('.mq-workspace').getAttribute('data-theme') !== theme)
      await page.getByRole('button', { name: /Switch to .* theme/ }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const controls = page.locator('.mq-header button, .mq-count-presets button')
    for (const control of await controls.all()) {
      const box = (await control.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
    // The header stays in one row, and every preset has its own reachable target.
    const headerBoxes = await page.locator('.mq-header button').evaluateAll(els => els.map(e => e.getBoundingClientRect().y))
    expect(Math.max(...headerBoxes) - Math.min(...headerBoxes)).toBeLessThan(2)
    const presets = await page.locator('.mq-count-presets button').evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }
    }))
    for (let i = 1; i < presets.length; i++) {
      expect(presets[i].top).toBe(presets[0].top)
      expect(presets[i].left).toBeGreaterThan(presets[i - 1].right)
    }
    const cards = await page.locator('.mq-dashboard :is(.mq-resume,.mq-claude,.mq-activity,.mq-builder,.mq-systems,.mq-overall)').evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }))
    for (const [i, a] of cards.entries()) for (const b of cards.slice(i + 1))
      expect(a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1).toBe(false)
    await page.getByText('More filters', { exact: true }).click()
    await page.getByLabel('Search concepts or ID', { exact: true }).fill('DESIGN-1')
    await expect(page.getByRole('button', { name: 'Start 5-question block', exact: true })).toBeEnabled()
    await page.getByLabel('Search concepts or ID', { exact: true }).fill('')
    await page.getByText('More filters', { exact: true }).click()
    const animations = await page.locator('.mq-resume,.mq-builder,.mq-activity').evaluateAll(els => els.map(e => getComputedStyle(e).animationName))
    expect(animations.every(a => a === 'none')).toBe(true)
    if (process.env.DESIGN_CAPTURE) await page.screenshot({ path: `${process.env.DESIGN_CAPTURE}/dashboard-${width}-${theme}.png`, fullPage: true })
  }
  // Keyboard access and the dialog focus return must survive the visual reorganization.
  const open = page.getByRole('button', { name: 'Open chat', exact: true })
  await open.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(open).toBeFocused()
  expect(await open.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none')
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Pídele a Claude una sesión', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Lo que quieres estudiar', { exact: true })).toBeFocused()
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(height)
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  if (process.env.DESIGN_CAPTURE) await page.screenshot({ path: `${process.env.DESIGN_CAPTURE}/claude-${width}.png` })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Continue chat', exact: true })).toBeFocused()
})
