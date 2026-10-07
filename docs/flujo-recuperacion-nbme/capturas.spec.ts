import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { catalogoNbmeReal, NBME_REAL_SESSION, preguntaNbmeReal } from '../../e2e/arnes/nbme-real-fixture'
import type { NbmeQuestion } from '../../src/nbme/types'

const CARPETA = path.resolve('docs/flujo-recuperacion-nbme')
const IDS = ['C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10']
const AHORA = new Date('2026-10-05T11:30:00Z')
const RECUPERACION = { objetivo: 'Distinguish the first, second and last synthetic tokens.', source: { title: 'Synthetic demonstration source', page: 1 }, cached: false,
  ejercicios: [
    { id: 'rec-1', tipo: 'completar', pregunta: 'The first synthetic token is ____.', respuesta: 'alpha', explicacion: 'Alpha comes first.', evidencia: 'The first synthetic token is alpha.' },
    { id: 'rec-2', tipo: 'verdadero_falso', pregunta: 'The first synthetic token is alpha.', respuesta: 'Verdadero', explicacion: 'This matches the synthetic source.', evidencia: 'The first synthetic token is alpha.' },
    { id: 'rec-3', tipo: 'seleccion', pregunta: 'Which is the second synthetic token?', respuesta: 'beta', alternativas: ['alpha', 'beta', 'gamma'], explicacion: 'Beta comes second.', evidencia: 'The second synthetic token is beta.' },
    { id: 'rec-4', tipo: 'discriminar', pregunta: 'Which is the last synthetic token?', respuesta: 'gamma', alternativas: ['beta', 'gamma'], explicacion: 'Gamma comes last.', evidencia: 'The last synthetic token is gamma.' },
  ],
}

function preguntaRecuperacion(id: string, revision = 'synthetic-r1'): NbmeQuestion {
  return { ...preguntaNbmeReal(id, revision), systems: ['Renal'], disciplines: ['Fisiología'],
    topic: 'Tema de demostración', objective: 'Synthetic mechanism: distinguish demonstration from another synthetic response.',
    conceptLinks: IDS.map((conceptId, i) => ({ conceptId, relation: i === 0 ? 'tested' : 'foundation',
      confidence: 0.9, review: 'suggested' })),
  }
}

async function retomarPreguntas(page: Page) {
  await page.goto('/?escena=atraso&proveedor=nbme-real#progreso')
  await expect.poll(() => page.evaluate(() => window.__leerNbmeReal?.().sessions)).toHaveProperty(NBME_REAL_SESSION)
  await page.getByText('Ponerme al día con la meta', { exact: true }).click()
  await page.getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
  await expect(page.locator('.nbme-feedback')).toContainText('Vamos a repasarla')
}

async function abrirFallo(page: Page, opciones: { estadoIA?: number; colaGeneralPendiente?: boolean } = {}) {
  const llamadas: { path: string; body: unknown }[] = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: AHORA })
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (route.request().method() === 'POST') llamadas.push({ path: pathname, body: route.request().postDataJSON() })
    if (pathname === '/api/nbme/catalog') {
      const catalog = catalogoNbmeReal()
      catalog.questions = catalog.questions.map(meta => ({ ...meta, systems: ['Renal'], disciplines: ['Fisiología'],
        topic: 'Tema de demostración', conceptLinks: preguntaRecuperacion(meta.id).conceptLinks }))
      return route.fulfill({ json: catalog })
    }
    if (pathname === '/api/nbme/questions') {
      const refs = route.request().postDataJSON().refs as { id: string; revision?: string }[]
      return route.fulfill({ json: { questions: refs.map(ref => preguntaRecuperacion(ref.id, ref.revision)) } })
    }
    if (pathname === '/api/calificar') return route.fulfill({ json: { veredicto: 'correcta', motivo: 'Respuesta sintética de demostración.' } })
    if (pathname === '/api/ia/estado') return route.fulfill({ json: { presupuesto: 8500, restantes: 8500, activa: true } })
    if (pathname === '/api/ia/recuperacion-nbme') return route.fulfill({ status: opciones.estadoIA ?? 200,
      json: opciones.estadoIA ? { available: false, error: 'La parte gratuita de hoy se agotó.', codigo: 'cuota_agotada' } : RECUPERACION })
    return route.fulfill({ status: 503, json: { disponible: false, error: 'Synthetic backend unavailable.' } })
  })
  if (opciones.colaGeneralPendiente) {
    await page.goto('/?escena=atraso&proveedor=nbme-real&retomar=concepto#modulos')
    await expect.poll(() => page.evaluate(() => window.__leerNbmeReal?.().sessions)).toHaveProperty(NBME_REAL_SESSION)
    await page.getByRole('button', { name: 'Preguntas', exact: true }).click()
    await page.getByRole('region', { name: 'Sesión de preguntas guardada', exact: true }).getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.locator('.nbme-feedback')).toContainText('Vamos a repasarla')
  } else await retomarPreguntas(page)
  return { llamadas }
}

async function capturaLegible(page: Page, nombre: string) {
  await expect(page.locator('.synapse-heading[data-animating="true"]')).toHaveCount(0)
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: path.join(CARPETA, 'despues', nombre), fullPage: true })
}

for (const width of [390, 1280]) test.describe(`capturas finales del recorrido a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 } })
  test('fundamentos, práctica, IA y regreso conservan encabezados legibles', async ({ page }) => {
    await abrirFallo(page)
    await mkdir(path.join(CARPETA, 'despues'), { recursive: true })
    await page.getByRole('button', { name: /Ver más/ }).click()
    for (let i = 0; i < 7; i++) await page.getByRole('checkbox').nth(i).setChecked(i === 0)
    await capturaLegible(page, `fundamentos-${width}.png`)
    await page.getByRole('button', { name: 'Practicar conceptos seleccionados', exact: true }).click()
    const respuesta = page.getByRole('textbox', { name: 'Tu respuesta', exact: true })
    await respuesta.fill('demostración'); await respuesta.press('Enter')
    await page.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Repaso terminado', exact: true })).toBeVisible()
    await capturaLegible(page, `concepto-recuperado-${width}.png`)
    await page.getByRole('button', { name: 'Volver a la pregunta original', exact: true }).last().click()
    const panel = page.getByRole('region', { name: 'Recuperación del error NBME', exact: true })
    await panel.getByRole('button', { name: 'Practicar este error con IA', exact: true }).click()
    await expect(panel).toContainText('Ejercicio 1 de 4')
    await capturaLegible(page, `ejercicios-ia-${width}.png`)
    await panel.getByRole('textbox').fill('alpha')
    for (const siguiente of ['Verdadero', 'B. beta', 'B. gamma']) {
      await panel.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
      await panel.getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()
      await panel.getByRole('radio', { name: siguiente, exact: true }).check()
    }
    await panel.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    await panel.getByRole('button', { name: 'Terminar recuperación', exact: true }).click()
    await panel.getByRole('button', { name: 'Ir a la siguiente pregunta', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pregunta 2 de 2', exact: true })).toBeVisible()
    await capturaLegible(page, `retorno-nbme-${width}.png`)
  })
  test('biblioteca y visor muestran su título terminado', async ({ page }) => {
    await abrirFallo(page)
    await page.getByRole('button', { name: 'Pausar y guardar', exact: true }).click()
    await expect(page.locator('.nbme-library')).toBeVisible()
    await capturaLegible(page, `biblioteca-nbme-${width}.png`)
    await page.getByRole('button', { name: 'Ver solo falladas (1)', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Preguntas falladas', exact: true })
    await expect(modal).toContainText('Synthetic saved question Q3')
    await capturaLegible(page, `visor-falladas-${width}.png`)
  })
})

for (const width of [390, 1280]) test.describe(`contraste de respuestas a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
  test('capturas del contraste de respuestas en piel oscura', async ({ page }) => {
    await abrirFallo(page)
    await page.evaluate(() => document.documentElement.setAttribute('data-piel-estudio', 'oscuro'))
    if (process.env.NBME_CAPTURE_CONTRAST !== 'antes') {
      await expect(page.locator('.nbme-option.correct')).toHaveCSS('border-top-width', '2px')
      await expect(page.locator('.nbme-option.correct')).toHaveCSS('border-top-color', 'rgb(146, 242, 199)')
      await expect(page.locator('.nbme-option.correct .nbme-option-state')).toContainText('Respuesta correcta')
      await expect(page.locator('.nbme-option.correct .nbme-option-state')).toHaveCSS('background-color', 'rgb(182, 246, 212)')
    }
    const destino = path.join(CARPETA, process.env.NBME_CAPTURE_CONTRAST === 'antes' ? 'antes' : 'despues')
    await mkdir(destino, { recursive: true })
    await page.locator('.nbme-question').evaluate(element => element.scrollIntoView({ block: 'center' }))
    await page.locator('.nbme-question').screenshot({ path: path.join(destino, `contraste-fallo-${width}.png`) })
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pregunta 2 de 2', exact: true })).toBeVisible()
    await page.getByRole('radio', { name: 'A. Synthetic saved option A', exact: true }).check()
    await page.locator('.nbme-question').evaluate(element => element.scrollIntoView({ block: 'center' }))
    await page.locator('.nbme-question').screenshot({ path: path.join(destino, `contraste-seleccion-${width}.png`) })
    await page.getByRole('radio', { name: 'C. Synthetic saved option C', exact: true }).check()
    await page.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    await expect(page.locator('.nbme-feedback')).toContainText('Respuesta correcta')
    await page.locator('.nbme-question').evaluate(element => element.scrollIntoView({ block: 'center' }))
    await page.locator('.nbme-question').screenshot({ path: path.join(destino, `contraste-acierto-${width}.png`) })
    for (let i = 0; i < 6; i++) await page.getByRole('checkbox').nth(i).setChecked(i === 0)
    await page.getByRole('button', { name: 'Practicar conceptos seleccionados', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Tu respuesta', exact: true })).toBeVisible()
    const modoNoche = page.getByRole('button', { name: 'Cambiar al modo noche', exact: true })
    if (await modoNoche.count()) await modoNoche.click()
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).fill('demostración')
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).press('Enter')
    await page.locator('.reproductor').evaluate(element => element.scrollIntoView({ block: 'center' }))
    await page.locator('.reproductor').screenshot({ path: path.join(destino, `contraste-melman-${width}.png`) })
  })
})
