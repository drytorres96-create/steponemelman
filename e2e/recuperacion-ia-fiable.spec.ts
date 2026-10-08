import { expect, test, type Page } from '@playwright/test'
import { NBME_REAL_TOKEN } from './arnes/nbme-real-fixture'
import { abrirOriginal, ERROR_TEMPORAL, instalarRed, leerBanco, leerEstudio,
  leerRecuperacionLocal, NBME_REAL_SESSION, RECUPERACION, retenerRespuesta } from '../docs/recuperacion-ia-fiable/fixture'

const panel = (page: Page) => page.getByRole('region', { name: 'Recuperación del error NBME', exact: true })
const generar = (page: Page) => panel(page).getByRole('button', { name: 'Practicar este error con IA', exact: true })
const indicador = (page: Page) => panel(page).getByRole('progressbar', { name: 'Generando ejercicios de recuperación', exact: true })
async function verificarEspera(page: Page) {
  await expect(panel(page)).toHaveAttribute('aria-busy', 'true')
  await expect(indicador(page)).toBeVisible()
  await expect(indicador(page)).not.toHaveAttribute('value')
  await expect(panel(page)).toContainText('Puede tardar hasta un minuto.')
  await expect(generar(page)).toBeDisabled()
  await expect(panel(page).getByRole('button', { name: 'Volver a la pregunta original', exact: true })).toBeEnabled()
  await expect(panel(page).getByRole('button', { name: 'Ir a la siguiente pregunta', exact: true })).toBeEnabled()
}
async function verificarInterfaz(page: Page, errores: string[]) {
  expect(errores).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

for (const width of [390, 1280]) test.describe(`recuperación IA fiable a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 } })

  test('fuente verificada permite practicar, retomar y volver a la original sin crear sesión ni modificar resultados', async ({ page }) => {
    const procedencia = 'Preparada desde el material verificado; la IA no pudo completar la selección.'
    const red = await instalarRed(page, route => route.fulfill({ json: { ...RECUPERACION, preparacion: 'fuente_verificada' } }))
    await abrirOriginal(page)
    const antes = await leerBanco(page)
    const estudioAntes = await leerEstudio(page)
    await generar(page).click()
    await expect(panel(page)).toContainText(procedencia)
    await expect(panel(page)).toContainText('Ejercicio 1 de 4')
    await expect(panel(page)).not.toContainText('Alpha comes first.')
    await panel(page).getByRole('textbox').fill('alpha')
    await panel(page).getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    await panel(page).getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()
    await panel(page).getByRole('radio', { name: 'Falso', exact: true }).check()
    const [guardada] = await leerRecuperacionLocal(page)
    expect(guardada).toMatchObject({ ownerId: 'cuenta-demo', cursor: 1, borrador: 'Falso', cerrada: false,
      origen: { qid: 'Q3', revision: 'synthetic-r1', optionId: 'B', attemptId: `${NBME_REAL_SESSION}:0` },
      contenido: { preparacion: 'fuente_verificada' } })
    await page.reload(); await abrirOriginal(page)
    await expect(panel(page)).not.toContainText(procedencia)
    await panel(page).getByRole('button', { name: 'Retomar recuperación · 2 de 4', exact: true }).click()
    await expect(panel(page)).toContainText(procedencia)
    await expect(panel(page).getByRole('radio', { name: 'Falso', exact: true })).toBeChecked()
    expect(await leerRecuperacionLocal(page)).toEqual([guardada])
    await panel(page).getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    await panel(page).getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()
    await panel(page).getByRole('radio', { name: 'B. beta', exact: true }).check()
    await panel(page).getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    await panel(page).getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()
    await panel(page).getByRole('radio', { name: 'B. gamma', exact: true }).check()
    await panel(page).getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    await panel(page).getByRole('button', { name: 'Terminar recuperación', exact: true }).click()
    await expect(panel(page)).toContainText('4 ejercicios; 3 acertados.')
    await panel(page).getByRole('button', { name: 'Volver a la pregunta original', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pregunta 1 de 2', exact: true })).toBeVisible()
    const despues = await leerBanco(page)
    expect(despues.attempts).toEqual(antes.attempts)
    // Retomar actualiza el reloj de la misma sesión; conserva todo su contenido y sus resultados.
    expect(despues.sessions).toEqual({ ...antes.sessions, [NBME_REAL_SESSION]: {
      ...antes.sessions[NBME_REAL_SESSION], elapsedMs: expect.any(Number), controlChangedAt: expect.any(Number),
    } })
    expect(despues.sessions[NBME_REAL_SESSION].elapsedMs).toBeGreaterThanOrEqual(antes.sessions[NBME_REAL_SESSION].elapsedMs)
    expect((await leerEstudio(page)).progreso).toEqual(estudioAntes.progreso)
    expect(red.generaciones).toHaveLength(1)
    expect(red.otrasIA).toEqual([])
    await verificarInterfaz(page, red.errores)
  })

  test('503 con saldo conserva el error; retry manual espera más de 25 s y la recuperación retoma tras reload', async ({ page }) => {
    const retenida = retenerRespuesta()
    const red = await instalarRed(page, async (route, numero) => numero === 1
      ? route.fulfill({ status: 503, headers: { 'Retry-After': '60' }, json: ERROR_TEMPORAL })
      : retenida.manejar(route))
    try {
      await page.goto('/?escena=atraso&proveedor=nbme-real#progreso')
      await expect(page.locator('.medidor-detalle')).toContainText('80 % disponible')
      await page.getByText('Ponerme al día con la meta', { exact: true }).click()
      await page.getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
      await expect(page.locator('.nbme-feedback')).toBeVisible()
      const antes = await leerBanco(page)
      const estudioAntes = await leerEstudio(page)
      await generar(page).click()
      await expect(panel(page)).toContainText(ERROR_TEMPORAL.error)
      await expect(panel(page)).toContainText('Puedes volver a intentarlo en 60 s.')
      await expect(panel(page)).toHaveAttribute('aria-busy', 'false')
      expect(red.generaciones).toEqual([{ method: 'POST', body: { questionId: 'Q3', revision: 'synthetic-r1', optionId: 'B' }, authorization: `Bearer ${NBME_REAL_TOKEN}` }])
      expect(await leerRecuperacionLocal(page)).toEqual([])
      await page.clock.fastForward(60_001)
      expect(red.generaciones).toHaveLength(1)
      await generar(page).click()
      await retenida.inicio
      await verificarEspera(page)
      await page.clock.fastForward(26_000)
      await verificarEspera(page)
      expect(red.generaciones).toHaveLength(2)
      expect((await leerBanco(page)).attempts).toEqual(antes.attempts)
      retenida.soltar(); await retenida.fin
      await expect(panel(page)).toContainText('Ejercicio 1 de 4')
      await panel(page).getByRole('textbox').fill('alpha')
      await panel(page).getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
      await panel(page).getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()
      await panel(page).getByRole('radio', { name: 'Falso', exact: true }).check()
      const [guardada] = await leerRecuperacionLocal(page)
      expect(guardada).toMatchObject({ ownerId: 'cuenta-demo', cursor: 1, borrador: 'Falso', cerrada: false,
        origen: { qid: 'Q3', revision: 'synthetic-r1', optionId: 'B', attemptId: `${NBME_REAL_SESSION}:0` } })
      expect(guardada.respuestas).toHaveLength(1)
      await page.reload()
      await abrirOriginal(page)
      await panel(page).getByRole('button', { name: 'Retomar recuperación · 2 de 4', exact: true }).click()
      await expect(panel(page)).toContainText('Ejercicio 2 de 4')
      await expect(panel(page).getByRole('radio', { name: 'Falso', exact: true })).toBeChecked()
      await expect(panel(page).locator('.recuperacion-feedback')).toHaveCount(0)
      expect(red.generaciones).toHaveLength(2)
      expect(await leerRecuperacionLocal(page)).toEqual([guardada])
      await panel(page).getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
      await panel(page).getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()
      await panel(page).getByRole('radio', { name: 'B. beta', exact: true }).check()
      await panel(page).getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
      await panel(page).getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()
      await panel(page).getByRole('radio', { name: 'B. gamma', exact: true }).check()
      await panel(page).getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
      await panel(page).getByRole('button', { name: 'Terminar recuperación', exact: true }).click()
      await panel(page).getByRole('button', { name: 'Volver a la pregunta original', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Pregunta 1 de 2', exact: true })).toBeVisible()
      expect((await leerBanco(page)).attempts).toEqual(antes.attempts)
      await panel(page).getByRole('button', { name: 'Ver recuperación guardada', exact: true }).click()
      await panel(page).getByRole('button', { name: 'Ir a la siguiente pregunta', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Pregunta 2 de 2', exact: true })).toBeVisible()
      const despues = await leerBanco(page)
      expect(Object.keys(despues.sessions)).toEqual([NBME_REAL_SESSION])
      expect(despues.sessions[NBME_REAL_SESSION].initial).toEqual(antes.sessions[NBME_REAL_SESSION].initial)
      expect(despues.attempts).toEqual({ ...antes.attempts,
        [`${NBME_REAL_SESSION}:0`]: { ...antes.attempts[`${NBME_REAL_SESSION}:0`], reviewedAt: expect.any(Number) } })
      expect((await leerEstudio(page)).progreso).toEqual(estudioAntes.progreso)
      expect(red.generaciones).toHaveLength(2)
      expect(red.otrasIA).toEqual([])
      await verificarInterfaz(page, red.errores)
    } finally { retenida.soltar() }
  })

  test('timeout a 90 s quita el estado de espera y conserva el intento original', async ({ page }) => {
    const retenida = retenerRespuesta()
    const red = await instalarRed(page, route => retenida.manejar(route))
    try {
      await abrirOriginal(page)
      const antes = await leerBanco(page)
      await generar(page).click(); await retenida.inicio
      await verificarEspera(page)
      await page.clock.fastForward(90_001)
      await expect(panel(page)).toContainText('La IA tardó demasiado. Puedes seguir estudiando.')
      await expect(panel(page)).toHaveAttribute('aria-busy', 'false')
      await expect(indicador(page)).toHaveCount(0)
      await expect(generar(page)).toBeEnabled()
      expect(red.generaciones).toHaveLength(1)
      expect(await leerRecuperacionLocal(page)).toEqual([])
      expect((await leerBanco(page)).attempts).toEqual(antes.attempts)
      await panel(page).getByRole('button', { name: 'Volver a la pregunta original', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Pregunta 1 de 2', exact: true })).toBeVisible()
      retenida.soltar(); await retenida.fin
      await page.clock.fastForward(1_000)
      expect(await leerRecuperacionLocal(page)).toEqual([])
      expect((await leerBanco(page)).attempts).toEqual(antes.attempts)
      expect(Object.keys((await leerBanco(page)).sessions)).toEqual([NBME_REAL_SESSION])
      await verificarInterfaz(page, red.errores)
    } finally { retenida.soltar() }
  })

  for (const destino of ['original', 'siguiente'] as const) test(`cancelar hacia ${destino} ignora el 200 tardío y conserva la sesión`, async ({ page }) => {
    const retenida = retenerRespuesta()
    const red = await instalarRed(page, route => retenida.manejar(route))
    try {
      await abrirOriginal(page)
      const antes = await leerBanco(page)
      const estudioAntes = await leerEstudio(page)
      await generar(page).click(); await retenida.inicio
      await verificarEspera(page)
      await panel(page).getByRole('button', { name: destino === 'original' ? 'Volver a la pregunta original' : 'Ir a la siguiente pregunta', exact: true }).click()
      await expect(page.getByRole('heading', { name: destino === 'original' ? 'Pregunta 1 de 2' : 'Pregunta 2 de 2', exact: true })).toBeVisible()
      retenida.soltar(); await retenida.fin
      await page.clock.fastForward(91_000)
      await expect(page.getByText('Ejercicio 1 de 4', { exact: false })).toHaveCount(0)
      expect(await leerRecuperacionLocal(page)).toEqual([])
      const despues = await leerBanco(page)
      expect(Object.keys(despues.sessions)).toEqual([NBME_REAL_SESSION])
      expect(despues.sessions[NBME_REAL_SESSION].initial).toEqual(antes.sessions[NBME_REAL_SESSION].initial)
      expect(despues.attempts).toEqual(destino === 'original' ? antes.attempts : { ...antes.attempts,
        [`${NBME_REAL_SESSION}:0`]: { ...antes.attempts[`${NBME_REAL_SESSION}:0`], reviewedAt: expect.any(Number) } })
      expect((await leerEstudio(page)).progreso).toEqual(estudioAntes.progreso)
      expect(red.generaciones).toHaveLength(1)
      expect(red.otrasIA).toEqual([])
      await verificarInterfaz(page, red.errores)
    } finally { retenida.soltar() }
  })
})
