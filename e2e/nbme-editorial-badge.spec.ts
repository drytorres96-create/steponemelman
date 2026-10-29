import { expect, test, type Page } from '@playwright/test'
import { catalogoNbmeReal, preguntaNbmeReal } from './arnes/nbme-real-fixture'

const label = 'Variante editorial · revisada por IA'
const marker = { authorRunId: 'synthetic-private-author', originalRevision: 'synthetic-r1',
  originalSourceHash: 'synthetic-original-hash', change: 'Synthetic source change', status: 'approved', reviewKind: 'ai' }

async function myqbankSources(page: Page) {
  const questions = Array.from({ length: 5 }, (_, i) => {
    const question = { ...preguntaNbmeReal(`QA-BADGE-${i + 1}`), systems: ['Renal'] }
    return i === 1 ? { ...question, provenance: { ...question.provenance, editorialDerivedEvaluation: marker } }
      : i === 2 ? { ...question, revision: 'synthetic-editorial20261029r2', provenance: { ...question.provenance, editorialDerivedEvaluation: { ...marker, status: 'not_approved_not_for_publication' } } } : question
  })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/catalog')) return route.fulfill({ json: { schemaVersion: 1, bankVersion: 'synthetic-badge', total: questions.length, questions } })
    if (path.endsWith('/questions')) return route.fulfill({ json: { questions: route.request().postDataJSON().refs.map((ref: { id: string }) => questions.find(q => q.id === ref.id)) } })
    return route.fulfill({ status: 503, json: { error: 'Synthetic backend only.' } })
  })
  await page.goto('/?workspace=myqbank&proveedor=nbme-real&escena=abierto')
  await page.getByRole('button', { name: 'Start 5-question block' }).click()
}

async function legacySources(page: Page) {
  await page.clock.install({ time: new Date('2026-10-26T11:30:00Z') })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/catalog')) return route.fulfill({ json: catalogoNbmeReal() })
    if (path.endsWith('/questions')) return route.fulfill({ json: { questions: route.request().postDataJSON().refs.map((ref: { id: string; revision: string }) => {
      const question = preguntaNbmeReal(ref.id, ref.revision)
      return ref.id === 'Q4' ? { ...question, provenance: { ...question.provenance, editorialDerivedEvaluation: marker } } : question
    }) } })
    return route.fulfill({ status: 503, json: { error: 'Synthetic backend only.' } })
  })
  await page.goto('/?escena=atraso&proveedor=nbme-real#progreso')
  await page.getByText('Ponerme al día con la meta', { exact: true }).click()
  await page.getByRole('button', { name: 'Retomar mi sesión pendiente' }).click()
  await expect(page.locator('.nbme-question')).toBeVisible()
}

for (const width of [390, 1280]) test.describe(`editorial NBME disclosure at ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })

  test('MyQBank labels derived sources before answering and removes the label on originals', async ({ page }, testInfo) => {
    await myqbankSources(page)
    await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible()
    await expect(page.getByText(label, { exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`myqbank-original-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Next question', exact: true }).click()
    const badge = page.getByText(label, { exact: true })
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('lang', 'es')
    await expect(page.getByText('synthetic-private-author')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`myqbank-editorial-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Next question', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Question 3', exact: true })).toBeVisible()
    await expect(badge).toHaveCount(0)
    await page.getByRole('button', { name: 'Next question', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Question 4', exact: true })).toBeVisible()
    await expect(badge).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('legacy NBME discloses the source while preserving saved attempts and provenance', async ({ page }, testInfo) => {
    await legacySources(page)
    await expect(page.getByText(label, { exact: true })).toHaveCount(0)
    const attempts = await page.evaluate(() => window.__leerNbmeReal().attempts)
    await page.screenshot({ path: testInfo.outputPath(`legacy-original-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    const badge = page.getByText(label, { exact: true })
    await expect(page.getByRole('heading', { name: 'Pregunta 2 de 2', exact: true })).toBeVisible()
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('lang', 'es')
    await expect(page.getByText('synthetic-private-author')).toHaveCount(0)
    const after = await page.evaluate(() => window.__leerNbmeReal().attempts)
    expect(Object.keys(after)).toEqual(Object.keys(attempts))
    expect(after[Object.keys(attempts)[0]]).toMatchObject({ optionId: 'B', correct: false, revision: 'synthetic-r1' })
    await page.screenshot({ path: testInfo.outputPath(`legacy-editorial-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
})
