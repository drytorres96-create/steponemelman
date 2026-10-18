import { expect, test } from '@playwright/test'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
import { ordenDeProduccion } from './arnes/orden-produccion'

const exercises = [
  { tipo: 'completar', enunciado: 'El segundo símbolo sintético es ____.', respuesta: 'beta', aceptadas: [], explicacion: 'Beta sigue a alfa.' },
  { tipo: 'verdadero_falso', enunciado: 'Alfa es el primer símbolo sintético.', verdadero: true, explicacion: 'Alfa abre la serie.' },
  { tipo: 'opcion_unica', enunciado: 'Elige el último símbolo sintético.', opciones: ['Alfa', 'Beta', 'Gamma'], correcta: 'Gamma', explicacion: 'Gamma cierra la serie.' },
]

for (const width of [390, 961, 1024, 1280, 1920]) test(`Claude uses the study width and keeps the conversation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const questions = Array.from({ length: 5 }, (_, i) => ({ ...preguntaNbmeReal(`QA-NBME-${i + 1}`), systems: ['Renal'] }))
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/nbme/catalog') return route.fulfill({ json: { schemaVersion: 1, bankVersion: 'qa', total: 5, questions } })
    if (path === '/api/nbme/questions') return route.fulfill({ json: { questions } })
    if (path === '/api/ia/chat') return route.fulfill({ json: route.request().postDataJSON().accion === 'practica'
      ? { ejercicios: exercises, cached: false }
      : { respuesta: 'La explicación sintética conecta alfa con beta y conserva el contexto de esta pregunta.', cached: false } })
    return route.fulfill({ status: 503, json: { error: 'Synthetic backend unavailable.' } })
  })
  await page.goto('/?workspace=myqbank&proveedor=nbme-real&escena=abierto&ia=1')
  await page.getByRole('button', { name: 'Start 5-question block', exact: true }).click()
  await page.getByText('Synthetic saved option C', { exact: true }).click()
  await page.getByRole('button', { name: 'Submit answer', exact: true }).click()
  await ordenDeProduccion(page)
  const tutor = page.getByRole('region', { name: 'Claude, tu tutor de esta pregunta', exact: true })
  await tutor.getByRole('button', { name: 'Mecanismo paso a paso', exact: true }).click()
  await expect(tutor).toContainText('La explicación sintética conecta alfa con beta')
  const stored = await page.evaluate(() => window.__leerNbmeReal().attempts)
  if (process.env.CLAUDE_SPACE_CAPTURE) await page.screenshot({ path: `${process.env.CLAUDE_SPACE_CAPTURE}/study-${width}.png`, fullPage: true })
  if (width > 960) {
    const box = await tutor.boundingBox()
    expect(box!.width).toBeGreaterThan(width * .48)
    expect(width - box!.x - box!.width).toBeLessThan(45)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  }
  const size = tutor.getByRole('button', { name: /Reducir el chat|Ampliar el chat/ })
  await size.click()
  await expect(tutor).toContainText('La explicación sintética conecta alfa con beta')
  await size.click()
  await tutor.getByRole('button', { name: 'Recuperación activa', exact: true }).click()
  const exercise = tutor.getByRole('group', { name: 'Recuperación activa, ejercicio 1 de 3', exact: true })
  await exercise.getByRole('textbox', { name: 'Palabra que completa la frase', exact: true }).fill('beta')
  await size.click()
  await expect(exercise.getByRole('textbox')).toHaveValue('beta')
  await size.click()
  await exercise.getByRole('button', { name: 'Comprobar', exact: true }).click()
  await expect(exercise.locator('.tutor-resultado')).toBeVisible()
  if (process.env.CLAUDE_SPACE_CAPTURE) {
    await page.screenshot({ path: `${process.env.CLAUDE_SPACE_CAPTURE}/practice-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click()
    await page.screenshot({ path: `${process.env.CLAUDE_SPACE_CAPTURE}/dark-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Toggle question navigator', exact: true }).click()
  await expect(page.locator('.mq-study')).toHaveClass(/mq-study--no-rail/)
  await expect(tutor).toContainText('La explicación sintética conecta alfa con beta')
  if (width > 960) expect((await tutor.boundingBox())!.width).toBeGreaterThan(width * .48)
  expect(await page.evaluate(() => window.__leerNbmeReal().attempts)).toEqual(stored)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
