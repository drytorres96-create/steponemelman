import { expect, test, type Page } from '@playwright/test'

/**
 * El recorrido de estudio en un navegador de verdad: teclado, foco, piel y cortes. Son
 * los fallos que jsdom no ve, como el Intro que se saltaba la corrección (1.22.1).
 * Todo corre contra dobles en memoria con datos sintéticos (e2e/arnes).
 */

/** Un lunes a primera hora: día de semana, con techo de 10 conceptos y 5 preguntas. */
const LUNES = new Date('2026-09-28T07:30:00-04:00')

async function abrir(page: Page, escena = 'abierto') {
  const errores: string[] = []
  page.on('pageerror', error => errores.push(String(error)))
  await page.clock.install({ time: LUNES })
  await page.goto(`/?escena=${escena}`)
  await expect(page.locator('.anillo-doble')).toBeVisible()
  return errores
}

const respuesta = (page: Page) => page.locator('input[type="text"]')
const preguntaNbme = (page: Page) => page.locator('.nbme-question')
const piel = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-piel-estudio'))
const cajasHechas = (page: Page) => page.getByRole('progressbar', { name: 'Cajas hechas' })

/** Responde el paso que toque, concepto o pregunta NBME, sólo con el teclado. */
async function responderPaso(page: Page, texto = 'demostración') {
  await expect(preguntaNbme(page).or(respuesta(page))).toBeVisible()
  if (await preguntaNbme(page).isVisible()) {
    await page.keyboard.press('c')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeFocused()
  } else {
    await respuesta(page).fill(texto)
    await respuesta(page).press('Enter')
    await expect(page.getByRole('button', { name: 'Siguiente pregunta' })).toBeFocused()
  }
  await page.keyboard.press('Enter')
}

test('cajas: Intro comprueba, enseña la corrección y sólo el segundo Intro pasa a la siguiente', async ({ page }) => {
  const errores = await abrir(page)
  await page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ }).click()
  await expect(respuesta(page)).toBeFocused()
  await expect(cajasHechas(page)).toHaveAttribute('value', '0')
  await respuesta(page).fill('demostración')
  await respuesta(page).press('Enter')
  // La corrección se ve y espera: el mismo Intro no la salta.
  await expect(page.getByRole('button', { name: 'Siguiente pregunta' })).toBeFocused()
  await expect(cajasHechas(page)).toHaveAttribute('value', '0')
  await page.keyboard.press('Enter')
  await expect(cajasHechas(page)).toHaveAttribute('value', '1')
  expect(errores).toEqual([])
})

test('cajas: si el corrector no sabe juzgar, «La sabía» cuenta y pasa con un toque', async ({ page }) => {
  const errores = await abrir(page)
  await page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ }).click()
  await respuesta(page).fill('gamma rara')
  await respuesta(page).press('Enter')
  await expect(page.getByRole('button', { name: 'La sabía', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'No la sabía' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Volver a responder' })).toHaveCount(0)
  await page.getByRole('button', { name: 'La sabía', exact: true }).click()
  await expect(cajasHechas(page)).toHaveAttribute('value', '1')
  await expect(preguntaNbme(page).or(respuesta(page))).toBeVisible()
  expect(errores).toEqual([])
})

test('cajas: tras un fallo hay una sola acción principal y el resto queda plegado', async ({ page }) => {
  const errores = await abrir(page)
  await page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ }).click()
  await respuesta(page).fill('otra cosa')
  await respuesta(page).press('Enter')
  const principales = page.locator('.retro .btn.principal:visible')
  await expect(principales).toHaveCount(1)
  await expect(principales).toHaveText('Siguiente pregunta')
  await expect(principales).toBeFocused()
  await expect(page.getByText('Más sobre esta pregunta')).toBeVisible()
  expect(errores).toEqual([])
})

test('cajas: la pregunta NBME se contesta con el teclado y la piel no cambia en toda la sesión', async ({ page }) => {
  const errores = await abrir(page)
  await page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ }).click()
  await expect(respuesta(page).or(preguntaNbme(page))).toBeVisible()
  const pielInicial = await piel(page)
  expect(pielInicial).toMatch(/^(claro|oscuro)$/)
  // Se avanza hasta la pregunta NBME que vence hoy en esta escena.
  for (let paso = 0; paso < 8 && !(await preguntaNbme(page).isVisible()); paso++) {
    await responderPaso(page)
    await expect(preguntaNbme(page).or(respuesta(page)).or(page.getByText('Cajas hechas'))).toBeVisible()
  }
  await expect(preguntaNbme(page)).toBeVisible()
  expect(await piel(page)).toBe(pielInicial)
  await expect(page.locator('#nbme-question-title')).toHaveText('Pregunta NBME')
  await expect(page.getByText('Correcciones pendientes')).toHaveCount(0)
  await page.keyboard.press('a')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeFocused()
  await expect(page.getByText(/Vuelve/).first()).toBeVisible()
  expect(await piel(page)).toBe(pielInicial)
  expect(errores).toEqual([])
})

test('lo nuevo: los tramos de tres conceptos se encadenan sin «Sesión terminada»', async ({ page }) => {
  const errores = await abrir(page)
  await page.getByRole('button', { name: /(Empezar|Seguir con) lo nuevo/ }).click()
  const pasos = page.getByRole('progressbar', { name: 'Pasos respondidos de la sesión' })
  await expect(pasos).toHaveAttribute('value', '0')
  // Tres conceptos y la pregunta del tramo: cruza el corte donde antes salía el resumen.
  for (let hecho = 1; hecho <= 4; hecho++) {
    await responderPaso(page)
    await expect(pasos).toHaveAttribute('value', String(hecho))
    await expect(page.getByText('Sesión terminada')).toHaveCount(0)
  }
  await expect(preguntaNbme(page).or(respuesta(page))).toBeVisible()
  expect(errores).toEqual([])
})

test('cajas: tras 20 seguidas llega la pausa sugerida; Intro en «Seguir» continúa', async ({ page }) => {
  test.setTimeout(120_000)
  const errores = await abrir(page, 'muchas')
  await page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ }).click()
  const pausa = page.getByText('Pausa sugerida')
  for (let paso = 0; paso < 20; paso++) {
    await expect(pausa).toHaveCount(0)
    await responderPaso(page)
  }
  await expect(pausa).toBeVisible()
  await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(pausa).toHaveCount(0)
  await expect(preguntaNbme(page).or(respuesta(page))).toBeVisible()
  expect(errores).toEqual([])
})

test('viñetas del piloto: la letra elige, Intro comprueba sin saltar la explicación y otro Intro sigue', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', error => errores.push(String(error)))
  await page.clock.install({ time: LUNES })
  await page.goto('/?escena=abierto#modulos')
  await page.getByRole('button', { name: 'Viñetas (piloto)' }).click()
  await expect(page.getByText('Sin revisión clínica')).toBeVisible()
  await page.getByRole('button', { name: 'Empezar bioquímica (2)' }).click()
  await expect(page.locator('#vineta-titulo')).toBeFocused()
  const pielInicial = await piel(page)
  expect(pielInicial).toMatch(/^(claro|oscuro)$/)
  await page.keyboard.press('b')
  await expect(page.locator('input[value="B"]')).toBeChecked()
  await page.keyboard.press('Enter')
  // La explicación se queda: el mismo Intro no pasa a la siguiente.
  await expect(page.getByText('No: la respuesta es C')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Siguiente viñeta' })).toBeFocused()
  await expect(page.getByText('1 de 2 · Bioquímica')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByText('2 de 2 · Bioquímica')).toBeVisible()
  await expect(page.locator('#vineta-titulo')).toBeFocused()
  expect(await piel(page)).toBe(pielInicial)
  await page.keyboard.press('c')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Correcto' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Terminar' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Respondiste 2: 1 correctas.')).toBeVisible()
  expect(errores).toEqual([])
})
