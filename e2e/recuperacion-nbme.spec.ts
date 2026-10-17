import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { catalogoNbmeReal, NBME_REAL_SESSION, preguntaNbmeReal } from './arnes/nbme-real-fixture'
import type { NbmeQuestion } from '../src/nbme/types'
import { installOriginalRecoveryPolicy } from './arnes/source-safety-fixture'

const CARPETA = path.resolve('docs/flujo-recuperacion-nbme')
const IDS = ['C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10']
/** Lunes 26-oct, día 15 de la meta (1.32.0): las dos líneas van por encima de la escena de atraso. */
const AHORA = new Date('2026-10-26T11:30:00Z')

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

async function abrirFallo(page: Page, opciones: { colaGeneralPendiente?: boolean } = {}) {
  await installOriginalRecoveryPolicy(page)
  const llamadas: { path: string; body: unknown }[] = []
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

for (const width of [390, 1280]) test.describe(`recuperación desde NBME a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
  test('ofrece más fundamentos, registra el concepto practicado y regresa a la misma pregunta', async ({ page }) => {
    const { llamadas } = await abrirFallo(page, { colaGeneralPendiente: true })
    const antes = await page.evaluate(() => ({ nbme: window.__leerNbmeReal(), estudio: window.__leerProgresoSintetico() }))
    expect(antes.estudio.reanudable).toMatchObject({ sessionId: 'conceptos-guardados', conceptIds: ['C8', 'C4', 'C8'], indice: 1 })
    await expect(page.getByRole('heading', { name: 'Conceptos para recuperar esta pregunta', exact: true })).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(6)
    await page.getByRole('button', { name: /Ver más/ }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(7)
    for (let i = 0; i < 7; i++) await page.getByRole('checkbox').nth(i).setChecked(i === 0)
    const sinPracticar = await page.evaluate(() => window.__leerProgresoSintetico())
    expect(sinPracticar.progreso).toEqual(antes.estudio.progreso)
    expect(sinPracticar.conceptosVistos).toEqual(antes.estudio.conceptosVistos)
    expect(llamadas.filter(l => l.path.startsWith('/api/ia/'))).toHaveLength(0)
    await mkdir(path.join(CARPETA, 'despues'), { recursive: true })
    await page.screenshot({ path: path.join(CARPETA, 'despues', `fundamentos-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Practicar conceptos seleccionados', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Tu respuesta', exact: true })).toBeVisible()
    const presentado = await page.evaluate(() => window.__leerProgresoSintetico())
    expect(Object.keys(presentado.conceptosVistos)).toEqual(['C4'])
    expect(presentado.progreso).toEqual(antes.estudio.progreso)
    expect(presentado.reanudable).toEqual(antes.estudio.reanudable)
    const input = page.getByRole('textbox', { name: 'Tu respuesta', exact: true })
    await input.fill('demostración'); await input.press('Enter')
    await page.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Volver a la pregunta original', exact: true }).last()).toBeVisible()
    const practicado = await page.evaluate(() => window.__leerProgresoSintetico())
    expect(practicado.progreso.C4.intentos).toHaveLength(1)
    expect(practicado.progreso.C4.intentos[0]).toMatchObject({ resultado: 'correcta', recuperacion_activa: true })
    expect(Object.keys(practicado.conceptosVistos)).toEqual(['C4'])
    const intentoGuardado = practicado.progreso.C4.intentos[0]
    await page.screenshot({ path: path.join(CARPETA, 'despues', `concepto-recuperado-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Volver a la pregunta original', exact: true }).last().click()
    await expect(page.locator('.app')).toHaveAttribute('data-view', 'preguntas')
    await expect(page.locator('.nbme-feedback')).toContainText('Vamos a repasarla')
    const despues = await page.evaluate(() => window.__leerNbmeReal())
    expect(Object.keys(despues.sessions)).toEqual(Object.keys(antes.nbme.sessions))
    expect(despues.sessions[NBME_REAL_SESSION].initial).toEqual(antes.nbme.sessions[NBME_REAL_SESSION].initial)
    expect(despues.attempts).toEqual(antes.nbme.attempts)
    expect(await page.evaluate(() => window.__leerProgresoSintetico().progreso.C4.intentos)).toEqual([intentoGuardado])
    expect(await page.evaluate(() => window.__leerProgresoSintetico().reanudable)).toEqual(antes.estudio.reanudable)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('la biblioteca conserva el primer resultado al revisar falladas y borrar sólo la sesión visible', async ({ page }) => {
    const { llamadas } = await abrirFallo(page)
    const antes = await page.evaluate(() => ({ nbme: window.__leerNbmeReal(), progreso: window.__leerProgresoSintetico().progreso }))
    await page.getByRole('button', { name: 'Pausar y guardar', exact: true }).click()
    await expect(page.locator('.nbme-library')).toBeVisible()
    await expect(page.getByRole('img', { name: /Primera vuelta: 0 correctas .*1 equivocadas .*1 sin respuesta válida/ })).toBeVisible()
    await mkdir(path.join(CARPETA, 'despues'), { recursive: true })
    await page.screenshot({ path: path.join(CARPETA, 'despues', `biblioteca-nbme-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Ver solo falladas (1)', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Preguntas falladas', exact: true })
    await expect(modal).toContainText('Synthetic saved question Q3')
    await expect(modal).toContainText('Synthetic saved option B')
    await expect(modal).toContainText('Synthetic saved option C')
    const refs = llamadas.filter(l => l.path === '/api/nbme/questions').flatMap(l => (l.body as { refs: { id: string; revision: string }[] }).refs)
    expect(refs.filter(ref => ref.id === 'Q3').every(ref => ref.revision === 'synthetic-r1')).toBe(true)
    await page.screenshot({ path: path.join(CARPETA, 'despues', `visor-falladas-${width}.png`), fullPage: true })
    await modal.getByRole('button', { name: 'Volver a mis sesiones', exact: true }).click()
    expect((await page.evaluate(() => window.__leerNbmeReal())).attempts).toEqual(antes.nbme.attempts)
    await page.getByRole('button', { name: 'Borrar sesión', exact: true }).click()
    await expect(page.getByText(/Conserva|conserva/).filter({ hasText: /respuestas/ }).last()).toBeVisible()
    await page.getByRole('button', { name: 'Sí, borrar sesión', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Borrar sesión', exact: true })).toHaveCount(0)
    const despues = await page.evaluate(() => window.__leerNbmeReal())
    expect(despues.attempts).toEqual(antes.nbme.attempts)
    expect(despues.sessions[NBME_REAL_SESSION].initial).toEqual(antes.nbme.sessions[NBME_REAL_SESSION].initial)
    expect(despues.archivedSessions?.[NBME_REAL_SESSION]).toEqual(expect.any(Number))
    expect(despues.discarded).toEqual({})
    expect(await page.evaluate(() => window.__leerProgresoSintetico().progreso)).toEqual(antes.progreso)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
})
