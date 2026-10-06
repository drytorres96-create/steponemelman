import { expect, test, type Page } from '@playwright/test'
import { catalogoNbmeReal, estadoNbmeReal, NBME_REAL_SESSION, preguntaNbmeReal } from './arnes/nbme-real-fixture'
import type { NbmeQuestionRef } from '../src/nbme/types'

async function abrirConProveedorReal(page: Page, errorVersion = false) {
  const solicitudes: NbmeQuestionRef[][] = []
  let versionAusente = errorVersion
  await page.clock.install({ time: new Date('2026-10-05T11:30:00Z') })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/nbme/catalog') return route.fulfill({ json: catalogoNbmeReal() })
    if (path === '/api/nbme/questions') {
      const refs = route.request().postDataJSON().refs as NbmeQuestionRef[]
      solicitudes.push(refs)
      if (versionAusente) return route.fulfill({ status: 409, json: { error: 'Synthetic exact version unavailable.' } })
      return route.fulfill({ json: { questions: refs.map(ref => preguntaNbmeReal(ref.id, ref.revision)) } })
    }
    // AI and every other backend are synthetic too; no request reaches a live service.
    return route.fulfill({ status: 503, json: { disponible: false, error: 'Synthetic backend unavailable.' } })
  })
  await page.goto('/?escena=atraso&proveedor=nbme-real#progreso')
  await expect.poll(() => page.evaluate(() => window.__leerNbmeReal?.().sessions)).toHaveProperty(NBME_REAL_SESSION)
  await page.getByText('Ponerme al día con la meta', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retomar mi sesión pendiente' })).toBeEnabled()
  return { solicitudes, restaurarVersion: () => { versionAusente = false } }
}

for (const width of [390, 1280]) test.describe(`revisión histórica con proveedor NBME real a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
  test('retoma feedback y termina el mismo bloque conservando letras, revisiones y primer resultado', async ({ page }) => {
    const { solicitudes } = await abrirConProveedorReal(page)
    const antes = await page.evaluate(() => window.__leerNbmeReal())
    expect(antes.sessions[NBME_REAL_SESSION].initial).toEqual(estadoNbmeReal().sessions[NBME_REAL_SESSION].initial)
    await page.getByRole('button', { name: 'Retomar mi sesión pendiente' }).click()
    await expect(page.locator('.app')).toHaveAttribute('data-view', 'preguntas')
    await expect(page.locator('.nbme-feedback')).toContainText('Vamos a repasarla')
    await expect(page.locator('.nbme-player')).toContainText('Hay una revisión publicada posterior')
    await expect(page.locator('.nbme-option.selected')).toContainText('Synthetic saved option B')
    const retomada = await page.evaluate(() => window.__leerNbmeReal())
    expect(retomada.activeSessionId).toBe(NBME_REAL_SESSION)
    expect(Object.keys(retomada.sessions)).toEqual([NBME_REAL_SESSION])
    expect(retomada.sessions[NBME_REAL_SESSION].initial).toEqual(antes.sessions[NBME_REAL_SESSION].initial)
    expect(retomada.attempts).toEqual(antes.attempts)
    expect(solicitudes.flat().filter(ref => ref.id === 'Q3')).toEqual([{ id: 'Q3', revision: 'synthetic-r1' }])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pregunta 2 de 2', exact: true })).toBeVisible()
    await expect(page.locator('.nbme-stem')).toContainText('Synthetic saved question Q4')
    await page.getByRole('radio', { name: /C\. Synthetic saved option C/ }).check()
    await page.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Respuesta correcta', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Vuelve a intentarlo', exact: true })).toBeVisible()
    await expect(page.locator('.nbme-stem')).toContainText('Synthetic saved question Q3')
    await page.getByRole('radio', { name: /C\. Synthetic saved option C/ }).check()
    await page.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Práctica completada', exact: true })).toBeVisible()
    await expect(page.locator('.nbme-counts')).toContainText('1/2')
    const terminada = await page.evaluate(() => window.__leerNbmeReal())
    expect(Object.keys(terminada.sessions)).toEqual([NBME_REAL_SESSION])
    expect(terminada.sessions[NBME_REAL_SESSION].initial).toEqual(antes.sessions[NBME_REAL_SESSION].initial)
    expect(terminada.attempts[`${NBME_REAL_SESSION}:0`]).toEqual({ ...antes.attempts[`${NBME_REAL_SESSION}:0`], reviewedAt: expect.any(Number) })
    expect(terminada.attempts[`${NBME_REAL_SESSION}:0`]).toMatchObject({ optionId: 'B', correct: false, revision: 'synthetic-r1' })
    expect(terminada.attempts[`${NBME_REAL_SESSION}:2`]).toMatchObject({ optionId: 'C', correct: true, revision: 'synthetic-r1' })
    expect(Object.keys(terminada.attempts)).toHaveLength(3)
  })
})

test('un asset histórico ausente conserva el bloque y permite reintentar sin crear otro', async ({ page }) => {
  const { solicitudes, restaurarVersion } = await abrirConProveedorReal(page, true)
  const antes = await page.evaluate(() => window.__leerNbmeReal())
  await page.getByRole('button', { name: 'Retomar mi sesión pendiente' }).click()
  const panel = page.locator('.recuperacion-meta')
  await expect(panel.getByRole('alert')).toContainText('No está disponible la versión')
  await expect(panel.getByRole('alert')).toBeInViewport()
  await expect(page.locator('.app')).toHaveAttribute('data-view', 'progreso')
  const fallida = await page.evaluate(() => window.__leerNbmeReal())
  expect(fallida.sessions).toEqual(antes.sessions)
  expect(fallida.attempts).toEqual(antes.attempts)
  expect(fallida.discarded).toEqual({})
  expect(solicitudes).toHaveLength(1)
  restaurarVersion()
  await page.getByRole('button', { name: 'Retomar mi sesión pendiente' }).click()
  await expect(page.locator('.app')).toHaveAttribute('data-view', 'preguntas')
  await expect(page.locator('.nbme-feedback')).toContainText('Vamos a repasarla')
  const recuperada = await page.evaluate(() => window.__leerNbmeReal())
  expect(Object.keys(recuperada.sessions)).toEqual([NBME_REAL_SESSION])
  expect(recuperada.attempts).toEqual(antes.attempts)
})
