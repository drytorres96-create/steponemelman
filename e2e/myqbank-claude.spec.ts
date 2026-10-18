import { expect, test, type Page } from '@playwright/test'
import { createBlock } from '../src/myqbank/blocks'
import { ESTADO_INICIAL, reconstruirProgreso } from '../src/store/model'
import type { Intento } from '../src/srs/tipos'
import { myqbankConcepts } from './arnes/myqbank-fixture'
import { ordenDeProduccion } from './arnes/orden-produccion'

/**
 * Claude en el dashboard de MyQBank (workspace=myqbank#dashboard): «Reinforce today» y «Ask Claude for a session»
 * viven bajo «Your next step». Un miércoles hay 27 conceptos fallados hace dos días: 20 caben en las cajas del
 * día y el resto es lo que la plataforma puede sugerir (máximo 5, una vez al día).
 */
const MIERCOLES = new Date('2026-10-14T16:00:00Z').getTime()
const VIERNES = new Date('2026-10-16T16:00:00Z').getTime()
const url = '/?workspace=myqbank&proveedor=nbme-real&escena=fragil&ia=1'

const fallo = (id: string, i: number): Intento => ({
  attempt_id: `old-${id}`, session_id: 'old-session', ts: MIERCOLES - 2 * 86_400_000 - (i % 10) * 3_600_000, calificacion: 1, resultado: 'incorrecta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0, ms: 5000, tipo_error: 'desconocimiento', confianza_declarada: null,
} as Intento)

async function preparar(page: Page, { ahora = MIERCOLES, bloques = {} }: { ahora?: number; bloques?: Record<string, unknown> } = {}) {
  const progreso = Object.fromEntries(Array.from({ length: 27 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`).map((id, i) => [id, reconstruirProgreso(id, [fallo(id, i)], ESTADO_INICIAL.criterios)]))
  const estado = { ...ESTADO_INICIAL, progreso, myqbankBlocks: bloques }
  await page.clock.setFixedTime(ahora)
  await page.addInitScript(s => { if (!localStorage.getItem('qa-myqbank-state')) localStorage.setItem('qa-myqbank-state', JSON.stringify(s)) }, estado)
  const entender: Record<string, unknown>[] = []
  await page.route('**/api/**', async route => {
    const req = route.request()
    const ruta = new URL(req.url()).pathname
    if (ruta === '/api/nbme/catalog') return route.fulfill({ json: { schemaVersion: 1, bankVersion: 'qa', total: 0, questions: [] } })
    if (ruta === '/api/ia/sesion') {
      const cuerpo = req.postDataJSON() as Record<string, unknown>
      if (cuerpo.fase === 'hilo') return route.fulfill({ json: { hilo: 'Son conceptos que fallaste esta semana.', cached: false } })
      if (cuerpo.fase === 'entender') {
        entender.push(cuerpo)
        return route.fulfill({ json: { tipo: 'consulta', consulta: { fuente: 'conceptos', sistemas: ['Renal'], disciplinas: [], terminos: [], estados: ['falladas'], minutos: 10, titulo: 'Renal · falladas' } } })
      }
    }
    return route.fulfill({ status: 503, json: { disponible: false, error: 'Synthetic backend unavailable.' } })
  })
  return { entender }
}

const bloques = (page: Page) => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('qa-myqbank-state')!).myqbankBlocks ?? {}) as { title: string; mode: string; entries: { kind: string; id: string }[] }[])
const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
const sugerencia = (page: Page) => page.getByRole('region', { name: 'Reinforce today', exact: true })
const dialogo = (page: Page) => page.getByRole('dialog', { name: 'Pídele a Claude una sesión', exact: true })

/** Las tarjetas de la cuadrícula no se pisan entre sí ni se salen de ella. */
async function sinSolapes(page: Page) {
  const cajas = await page.evaluate(() => {
    const raiz = document.querySelector('main.mq-dashboard')!.getBoundingClientRect()
    const hijos = [...document.querySelectorAll('main.mq-dashboard > *')].map(el => {
      const r = el.getBoundingClientRect()
      return { clase: el.className, top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    })
    return { raiz: { top: raiz.top, bottom: raiz.bottom, left: raiz.left, right: raiz.right }, hijos }
  })
  expect(cajas.hijos.length).toBeGreaterThanOrEqual(5)
  for (const h of cajas.hijos) {
    expect(h.left, `${h.clase} dentro por la izquierda`).toBeGreaterThanOrEqual(cajas.raiz.left - 1)
    expect(h.right, `${h.clase} dentro por la derecha`).toBeLessThanOrEqual(cajas.raiz.right + 1)
    expect(h.bottom, `${h.clase} dentro por abajo`).toBeLessThanOrEqual(cajas.raiz.bottom + 1)
  }
  for (const [i, a] of cajas.hijos.entries()) for (const b of cajas.hijos.slice(i + 1)) {
    const seCruzan = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
    expect(seCruzan, `${a.clase} y ${b.clase} no se pisan`).toBe(false)
  }
}

for (const width of [390, 1280]) test.describe(`Claude en el dashboard de MyQBank a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })

  test('«Reinforce today» y «Ask Claude for a session» salen bajo «Your next step», en inglés, plegadas y sin pisar nada', async ({ page }) => {
    await preparar(page)
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Build a block' })).toBeVisible()
    await ordenDeProduccion(page)
    await expect(sugerencia(page)).toBeVisible()
    await expect(sugerencia(page).getByRole('heading', { name: 'Reinforce today' })).toBeVisible()
    await expect(sugerencia(page).getByText('Optional · once a day')).toBeVisible()
    await expect(sugerencia(page).getByText('Son conceptos que fallaste esta semana.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ask Claude for a session' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open chat', exact: true })).toBeVisible()
    // La lista de lo sugerido está plegada y el techo es de cinco.
    const detalle = sugerencia(page).locator('details')
    await expect(detalle).not.toHaveAttribute('open', '')
    await expect(detalle.locator('summary')).toHaveText('See the 5 items')
    // Bajo «Your next step», no al lado ni por encima.
    const [paso, refuerzo, pedir] = await Promise.all([
      page.getByText('YOUR NEXT STEP', { exact: true }).boundingBox(), sugerencia(page).boundingBox(), page.getByRole('heading', { name: 'Ask Claude for a session' }).boundingBox(),
    ])
    expect(refuerzo!.y).toBeGreaterThan(paso!.y)
    expect(pedir!.y).toBeGreaterThan(refuerzo!.y)
    expect(await sinDesborde(page)).toBe(true)
    await sinSolapes(page)
    // Abierta, la lista se queda dentro de su tarjeta.
    await detalle.locator('summary').click()
    await expect(detalle.locator('li')).toHaveCount(5)
    await expect(detalle.getByText('Missed this week').first()).toBeVisible()
    expect(await sinDesborde(page)).toBe(true)
    await sinSolapes(page)
  })

  test('«Review these 5» abre un bloque Tutor con lo sugerido, con su nombre, y no vuelve a ofrecer el mismo refuerzo', async ({ page }) => {
    await preparar(page)
    await page.goto(url)
    await expect(sugerencia(page)).toBeVisible()
    await sugerencia(page).getByRole('button', { name: 'Review these 5', exact: true }).click()
    await expect(page.locator('.mq-study')).toBeVisible()
    await expect(page.locator('.mq-legacy-study')).toHaveCount(0)
    const [bloque, ...otros] = await bloques(page)
    expect(otros).toHaveLength(0)
    expect(bloque).toMatchObject({ title: 'Para reforzar · hoy', mode: 'tutor' })
    expect(bloque.entries).toHaveLength(5)
    expect(bloque.entries.every(e => e.kind === 'concept' && /^G\d{2}$/.test(e.id))).toBe(true)
    // Al pausar vuelve al dashboard: el bloque se llama como la sugerencia y ella ya no sale.
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Para reforzar · hoy', level: 1 })).toBeVisible()
    await expect(sugerencia(page).getByRole('button', { name: /Review/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Ask Claude for a session' })).toBeVisible()
  })

  test('«Not today» conserva la tarjeta con su estado y no abre nada', async ({ page }) => {
    await preparar(page)
    await page.goto(url)
    await sugerencia(page).getByRole('button', { name: 'Not today', exact: true }).click()
    await expect(sugerencia(page).getByRole('button', { name: /Review/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Ask Claude for a session' })).toBeVisible()
    expect(await bloques(page)).toHaveLength(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Build a block' })).toBeVisible()
    await expect(sugerencia(page).getByRole('button', { name: /Review/ })).toHaveCount(0)
  })

  test('el chat abre como diálogo, se cierra con Escape devolviendo el foco, y la página de detrás no se mueve', async ({ page }) => {
    await preparar(page)
    await page.goto(url)
    const abrir = page.getByRole('button', { name: 'Open chat', exact: true })
    await expect(abrir).toBeVisible()
    await abrir.focus()
    await abrir.click()
    await expect(dialogo(page)).toBeVisible()
    await expect(dialogo(page).getByLabel('Lo que quieres estudiar', { exact: true })).toBeFocused()
    // Con el diálogo abierto la página no se desplaza, y el diálogo cabe en la ventana.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden')
    const caja = (await dialogo(page).boundingBox())!
    expect(caja.x).toBeGreaterThanOrEqual(0)
    expect(caja.x + caja.width).toBeLessThanOrEqual(width)
    expect(caja.y).toBeGreaterThanOrEqual(0)
    expect(caja.y + caja.height).toBeLessThanOrEqual(844)
    expect(await sinDesborde(page)).toBe(true)
    // Tab no se escapa a la página de detrás.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Continue chat', exact: true })).toBeFocused()
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden')
  })

  test('de lo que se pide a la sesión: Claude entiende, la plataforma arma el bloque con el nombre pedido', async ({ page }) => {
    const red = await preparar(page)
    await page.goto(url)
    await page.getByRole('button', { name: 'Open chat', exact: true }).click()
    await dialogo(page).getByLabel('Lo que quieres estudiar', { exact: true }).fill('renal que he fallado')
    await dialogo(page).getByRole('button', { name: 'Enviar', exact: true }).click()
    await expect(dialogo(page).getByText('Renal · falladas').first()).toBeVisible()
    expect(red.entender).toHaveLength(1)
    // Cerrar y volver a abrir conserva la conversación y no pide nada de nuevo.
    await page.keyboard.press('Escape')
    await expect(dialogo(page)).toBeHidden()
    await page.getByRole('button', { name: 'Continue chat', exact: true }).click()
    await expect(dialogo(page).getByText('renal que he fallado').first()).toBeVisible()
    expect(red.entender).toHaveLength(1)
    await dialogo(page).getByRole('button', { name: 'Empezar la sesión', exact: true }).click()
    await expect(page.locator('.mq-study')).toBeVisible()
    await expect(dialogo(page)).toHaveCount(0)
    const [bloque, ...otros] = await bloques(page)
    expect(otros).toHaveLength(0)
    expect(bloque).toMatchObject({ title: 'Renal · falladas', mode: 'tutor' })
    expect(bloque.entries.length).toBeGreaterThan(0)
    expect(bloque.entries.every(e => e.kind === 'concept')).toBe(true)
    // La página de detrás vuelve a desplazarse.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden')
  })

  test('el viernes conserva el chat y explica que no hay refuerzo opcional', async ({ page }) => {
    await preparar(page, { ahora: VIERNES })
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Build a block' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ask Claude for a session' })).toBeVisible()
    await page.getByRole('button', { name: 'Open chat', exact: true }).click()
    await expect(dialogo(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sugerencia(page).getByRole('button', { name: /Review/ })).toHaveCount(0)
    expect(await sinDesborde(page)).toBe(true)
  })

  test('con un Test sin terminar puede pedir y abrir otra sesión sin cerrar el Test', async ({ page }) => {
    const test_ = createBlock('t1', [{ kind: 'nbme', id: 'QA-NBME-1', revision: 'r1' }, { kind: 'nbme', id: 'QA-NBME-2', revision: 'r1' }], 'test', MIERCOLES)
    await preparar(page, { bloques: { t1: test_ } })
    await page.goto(url)
    await expect(page.getByText('Finish your Test block to update the daily goal.')).toBeVisible()
    if (process.env.CLAUDE_CAPTURE_DIR) {
      await page.getByText('Saved blocks', { exact: true }).click()
      await ordenDeProduccion(page)
      await page.screenshot({ path: `${process.env.CLAUDE_CAPTURE_DIR}/after-${width}.png`, fullPage: true })
    }
    await expect(page.getByRole('heading', { name: 'Ask Claude for a session' })).toBeVisible()
    await expect(sugerencia(page)).toBeVisible()
    await page.getByRole('button', { name: 'Open chat', exact: true }).click()
    await dialogo(page).getByLabel('Lo que quieres estudiar', { exact: true }).fill('renal que he fallado')
    await dialogo(page).getByRole('button', { name: 'Enviar', exact: true }).click()
    await dialogo(page).getByRole('button', { name: 'Empezar la sesión', exact: true }).click()
    await expect(page.locator('.mq-study')).toBeVisible()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-myqbank-state')!).myqbankBlocks)
    expect(saved.t1).toEqual(test_)
    expect(Object.values(saved)).toHaveLength(2)
  })

  test('con el día completo conserva ambas tarjetas y puede abrir el chat', async ({ page }) => {
    await preparar(page)
    await page.goto(url)
    await expect(page.locator('.mq-goal')).toBeVisible()
    // Resolve every synthetic concept today; no real account or corpus is touched.
    const ids = [...myqbankConcepts.map(c => c.concept_id), ...Array.from({ length: 27 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`)]
    const progreso = Object.fromEntries(ids.map((id, i) => [id, reconstruirProgreso(id, [{ ...fallo(id, i), ts: MIERCOLES - 1000, resultado: 'correcta', calificacion: 3 }], ESTADO_INICIAL.criterios)]))
    await page.evaluate(progreso => { const s = JSON.parse(localStorage.getItem('qa-myqbank-state')!); localStorage.setItem('qa-myqbank-state', JSON.stringify({ ...s, progreso })) }, progreso)
    await page.reload()
    await expect(page.getByText('Daily goal complete. You can stop here.')).toBeVisible()
    await expect(sugerencia(page)).toBeVisible()
    await page.getByRole('button', { name: 'Open chat', exact: true }).click()
    await expect(dialogo(page)).toBeVisible()
  })

  test('elimina bloques pendientes y completos, conserva respuestas y no vuelven al recargar', async ({ page }) => {
    const entry = { kind: 'concept' as const, id: myqbankConcepts[1].concept_id, revision: 'r1', concept: myqbankConcepts[1] }
    const older = createBlock('older', [entry], 'test', MIERCOLES - 1000)
    const newer = createBlock('newer', [entry], 'tutor', MIERCOLES)
    const completed = { ...createBlock('completed', [entry], 'tutor', MIERCOLES - 2000), completedAt: MIERCOLES - 1500 }
    await preparar(page, { bloques: { older, newer, completed } })
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Ask Claude for a session' })).toBeVisible()
    await ordenDeProduccion(page)
    await page.getByText('Saved blocks', { exact: true }).click()
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-myqbank-state')!).progreso)
    const remove = page.getByRole('button', { name: 'Remove 1-item Test block', exact: true })
    await remove.click()
    const confirmation = page.getByRole('dialog', { name: 'Remove saved block?' })
    await expect(confirmation).toBeVisible()
    if (process.env.CLAUDE_CAPTURE_DIR) await page.screenshot({ path: `${process.env.CLAUDE_CAPTURE_DIR}/remove-${width}.png`, fullPage: true })
    await expect(confirmation.getByRole('button', { name: 'Keep block' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(confirmation).not.toBeVisible()
    await expect(remove).toBeFocused()
    await remove.click()
    await confirmation.getByRole('button', { name: 'Remove block', exact: true }).click()
    await expect(remove).toHaveCount(0)
    await expect(page.getByText('Saved blocks', { exact: true })).toBeFocused()
    await expect(page.getByRole('heading', { name: '1-item Tutor block', exact: true })).toBeVisible()
    await expect(page.getByText('Finish your Test block to update the daily goal.')).toHaveCount(0)
    const completeRow = page.locator('.mq-block-row').filter({ has: page.getByRole('button', { name: '1-item Tutor block · Review', exact: true }) })
    await completeRow.getByRole('button', { name: 'Remove 1-item Tutor block', exact: true }).click()
    await confirmation.getByRole('button', { name: 'Remove block', exact: true }).click()
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('qa-myqbank-state')!))
    expect(after.progreso).toEqual(before)
    expect(after.myqbankBlocks.older).toMatchObject({ ...older, archivedAt: MIERCOLES, completedAt: MIERCOLES, paused: true, changedAt: MIERCOLES })
    expect(after.myqbankBlocks.completed.completedAt).toBe(completed.completedAt)
    expect(after.myqbankBlocks.newer).toEqual(newer)
    expect(await sinDesborde(page)).toBe(true)
    await page.reload()
    await page.getByText('Saved blocks', { exact: true }).click()
    await expect(page.locator('.mq-block-row')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Ask Claude for a session' })).toBeVisible()
  })
})

/** Entre 961 y 1100 px las columnas laterales dejan estrecha la del medio: aun así nada se pisa, cerrada o abierta la lista. */
test.describe('escritorio estrecho', () => {
  for (const width of [961, 1024]) test(`la rejilla del dashboard aguanta a ${width}px con la lista abierta`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await preparar(page)
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Build a block' })).toBeVisible()
    await ordenDeProduccion(page)
    await expect(sugerencia(page)).toBeVisible()
    expect(await sinDesborde(page)).toBe(true)
    await sinSolapes(page)
    await sugerencia(page).locator('summary').click()
    await expect(sugerencia(page).locator('li')).toHaveCount(5)
    expect(await sinDesborde(page)).toBe(true)
    await sinSolapes(page)
    // Y la página baja hasta el final.
    await page.mouse.move(width / 2, 400)
    await page.mouse.wheel(0, 3000)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
  })
})


test('el chat permanece accesible mientras carga el catálogo NBME', async ({ page }) => {
  await preparar(page)
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/nbme/catalog', async route => { await held; await route.fulfill({ json: { schemaVersion: 1, bankVersion: 'qa', total: 0, questions: [] } }) })
  await page.goto(url)
  await page.getByRole('button', { name: 'Open chat', exact: true }).click()
  await expect(dialogo(page)).toBeVisible()
  await expect(sugerencia(page)).toBeAttached()
  release()
  await expect(page.locator('.mq-goal')).toBeVisible()
  await expect(dialogo(page)).toBeVisible()
})
