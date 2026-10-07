import { expect, test, type Page } from '@playwright/test'
import { CANONICA_LARGA, PREGUNTA_BASE, PREGUNTA_CASO, PREGUNTA_NUEVA, RESPUESTA_CASO, VARIANTE_NUEVA } from './arnes/aplicacion-fixture'

const AHORA = new Date('2026-10-05T11:30:00Z')
const ID = 'QA-APLICACION'
async function abrir(page: Page, hash = 'hoy', retomar = '') {
  const errores: string[] = []
  page.on('pageerror', error => errores.push(String(error)))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: AHORA })
  await page.route('**/*', route => {
    const u = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(u.hostname)) return route.abort()
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Synthetic backend unavailable.' } })
    return route.continue()
  })
  await page.goto(`/?escena=aplicacion${retomar ? `&retomar=${retomar}` : ''}#${hash}`)
  return errores
}
const estudio = (page: Page) => page.evaluate(() => window.__leerProgresoSintetico())
const banco = (page: Page) => page.evaluate(() => window.__leerNbmeSintetico())
const repasoLocal = (page: Page) => page.evaluate(() => Object.keys(localStorage)
  .filter(key => key.startsWith('melman:repaso-nbme:v1:')).map(key => JSON.parse(localStorage.getItem(key)!)))
const opciones = (page: Page) => page.getByRole('radiogroup', { name: 'Opciones de respuesta', exact: true })
async function elegir(page: Page, texto: string) {
  await opciones(page).getByRole('radio', { name: texto }).click()
  await page.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
}
async function sinErrores(page: Page, errores: string[]) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errores).toEqual([])
}

for (const width of [390, 1280]) test.describe(`aplicación para dominio a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 } })

  test('Hoy y Cajas ofrecen el caso menos visto y retoman su respuesta exacta sin otro intento', async ({ page }) => {
    const errores = await abrir(page)
    await expect(page.getByRole('heading', { name: 'Hoy', exact: true })).toBeVisible()
    const antes = await estudio(page)
    expect(antes.progreso[ID].intentos).toHaveLength(2)
    await page.getByRole('button', { name: 'Empezar las cajas', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_CASO)
    await expect(page.locator('.session-presentation')).toContainText('Primera presentación de esta variante')
    await expect(page.getByRole('textbox', { name: 'Tu respuesta', exact: true })).toHaveCount(0)
    const presentada = await estudio(page)
    expect(presentada.progreso).toEqual(antes.progreso)
    expect(presentada.reanudable).toMatchObject({ indice: 0, conceptIds: [ID], variantes: [VARIANTE_NUEVA], versionFormato: 3 })
    await elegir(page, RESPUESTA_CASO)
    await expect(page.locator('.retro')).toContainText('Correcto')
    const resuelta = await estudio(page)
    expect(resuelta.progreso[ID].intentos.slice(0, 2)).toEqual(antes.progreso[ID].intentos)
    expect(resuelta.progreso[ID].intentos).toHaveLength(3)
    expect(resuelta.progreso[ID].intentos[2]).toMatchObject({
      session_id: presentada.reanudable.sessionId, variante_id: VARIANTE_NUEVA, primera_presentacion: true,
      interaccion: 'caso_clinico', tipo_evidencia: 'aplicacion', resultado: 'correcta', recuperacion_activa: false,
      pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
    })
    expect(resuelta.criterios).toEqual(antes.criterios)
    expect(resuelta.progreso[ID].dominado_en).toBeNull()
    expect(resuelta.progreso[ID].estado).not.toBe('dominado')
    // This new active success would stop automatic promotion on a fresh session.
    // Resume must still show the saved case and its already recorded feedback.
    await page.getByRole('button', { name: 'Necesito una pausa', exact: true }).click()
    await page.getByRole('region', { name: 'Tu sesión guardada', exact: true })
      .getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_CASO)
    await expect(page.locator('.retro')).toContainText(RESPUESTA_CASO)
    await expect(page.getByRole('button', { name: 'Siguiente pregunta', exact: true })).toBeVisible()
    const retomada = await estudio(page)
    expect(retomada.reanudable).toMatchObject({ sessionId: presentada.reanudable.sessionId,
      indice: 0, conceptIds: [ID], variantes: [VARIANTE_NUEVA], versionFormato: 3 })
    expect(retomada.progreso).toEqual(resuelta.progreso)
    await sinErrores(page, errores)
  })

  test('repaso NBME conserva la variante local y devuelve el mismo intento, revisión y posición', async ({ page }) => {
    const errores = await abrir(page, 'hoy', 'nbme')
    await page.getByRole('region', { name: 'Tu sesión guardada', exact: true })
      .getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
    await expect(page.locator('.nbme-feedback')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pregunta 1 de 2', exact: true })).toBeVisible()
    const original = await banco(page)
    const progresoAntes = await estudio(page)
    const panel = page.getByRole('region', { name: 'Repaso relacionado con esta pregunta', exact: true })
    await expect(panel.getByRole('checkbox')).toHaveCount(2)
    await panel.getByRole('checkbox', { name: /Apply the synthetic gate rule/ }).check()
    await panel.getByRole('checkbox', { name: /Learn the synthetic gate rule/ }).uncheck()
    await panel.getByRole('button', { name: 'Practicar conceptos seleccionados', exact: true }).click()
    await expect(panel.locator('.pregunta')).toHaveText(PREGUNTA_CASO)
    const [guardada] = await repasoLocal(page)
    expect(guardada).toMatchObject({ ids: [ID], terminado: false,
      origen: { sessionId: 'preguntas-guardadas', attemptId: 'preguntas-guardadas:0', questionId: 'Q3', revision: 'r1', position: 0 },
      continuacion: { indice: 0, conceptIds: [ID], variantes: [VARIANTE_NUEVA], versionFormato: 3 },
    })
    await elegir(page, RESPUESTA_CASO)
    const practicada = await estudio(page)
    expect(practicada.progreso[ID].intentos).toHaveLength(3)
    expect(practicada.progreso[ID].intentos[2]).toMatchObject({ variante_id: VARIANTE_NUEVA,
      interaccion: 'caso_clinico', tipo_evidencia: 'aplicacion', resultado: 'correcta', explicacion_previa: true })
    expect(practicada.progreso[ID].dominado_en).toBeNull()
    expect(practicada.reanudable).toEqual(progresoAntes.reanudable)
    // Both cases now have one exposure. Selecting again would return case 1.
    expect(practicada.progreso[ID].intentos.filter((i: any) => i.variante_id === 'QA-APLICACION-caso-1')).toHaveLength(1)
    expect(practicada.progreso[ID].intentos.filter((i: any) => i.variante_id === VARIANTE_NUEVA)).toHaveLength(1)
    await panel.getByRole('button', { name: 'Necesito una pausa', exact: true }).click()
    await expect(page.locator('.nbme-feedback')).toBeVisible()
    await panel.getByRole('button', { name: 'Retomar repaso guardado', exact: true }).click()
    await expect(panel.locator('.pregunta')).toHaveText(PREGUNTA_CASO)
    await expect(panel.locator('.retro')).toContainText(RESPUESTA_CASO)
    const [retomada] = await repasoLocal(page)
    expect(retomada.continuacion).toMatchObject({ sessionId: guardada.continuacion.sessionId,
      indice: 0, conceptIds: [ID], variantes: [VARIANTE_NUEVA], versionFormato: 3 })
    expect((await estudio(page)).progreso).toEqual(practicada.progreso)
    await panel.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
    await expect(panel.getByRole('heading', { name: 'Repaso terminado', exact: true })).toBeVisible()
    await panel.getByRole('button', { name: 'Volver a la pregunta original', exact: true }).click()
    await expect(page.locator('.nbme-feedback')).toContainText('Vamos a repasarla')
    await expect(page.getByRole('heading', { name: 'Pregunta 1 de 2', exact: true })).toBeVisible()
    const devuelta = await banco(page)
    expect(devuelta.attempts).toEqual(original.attempts)
    expect(Object.keys(devuelta.sessions)).toEqual(Object.keys(original.sessions))
    expect(devuelta.activeSessionId).toBe(original.activeSessionId)
    expect(devuelta.sessions['preguntas-guardadas'].initial).toEqual(original.sessions['preguntas-guardadas'].initial)
    expect((await estudio(page)).reanudable).toEqual(progresoAntes.reanudable)
    await sinErrores(page, errores)
  })

  test('un fallo de Cajas repite el mismo caso como corrección y cuenta una sola caja', async ({ page }) => {
    const errores = await abrir(page)
    await page.getByRole('button', { name: 'Empezar las cajas', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_CASO)
    await elegir(page, 'Open gate one before the counter reaches its threshold.')
    await expect(page.locator('.retro')).toContainText('Incorrecto')
    const fallada = await estudio(page)
    await page.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
    await expect(page.getByText('Corrección · repaso de un fallo', { exact: true })).toBeVisible()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_CASO)
    await expect(page.getByRole('progressbar', { name: 'Cajas hechas', exact: true })).toHaveAttribute('value', '1')
    await expect(page.getByRole('progressbar', { name: 'Cajas hechas', exact: true })).toHaveAttribute('max', '1')
    await elegir(page, RESPUESTA_CASO)
    const corregida = await estudio(page)
    expect(corregida.progreso[ID].intentos).toHaveLength(4)
    expect(corregida.progreso[ID].intentos.slice(0, 3)).toEqual(fallada.progreso[ID].intentos)
    expect(corregida.progreso[ID].intentos[3]).toMatchObject({ variante_id: VARIANTE_NUEVA,
      interaccion: 'caso_clinico', tipo_evidencia: 'aplicacion', resultado: 'correcta',
      primera_presentacion: false, explicacion_previa: true })
    expect(corregida.progreso[ID].intentos[3].pregunta_id).not.toBe(fallada.progreso[ID].intentos[2].pregunta_id)
    expect(corregida.progreso[ID].dominado_en).toBeNull()
    await sinErrores(page, errores)
  })

  test('el primer intento de Hoy mantiene las opciones base y el recuerdo breve sigue siendo escrito', async ({ page }) => {
    const errores = await abrir(page)
    await page.getByRole('button', { name: 'Empezar lo nuevo', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_NUEVA)
    await expect(page.locator('.session-presentation')).toHaveText('Concepto nuevo aquí')
    await expect(opciones(page).getByRole('radio')).toHaveCount(4)
    await elegir(page, CANONICA_LARGA)
    const primerIntento = (await estudio(page)).progreso['QA-NUEVO'].intentos
    expect(primerIntento).toHaveLength(1)
    expect(primerIntento[0]).toMatchObject({ interaccion: 'opcion_multiple', tipo_evidencia: 'discriminacion',
      recuperacion_activa: false, resultado: 'correcta' })
    expect(primerIntento[0].variante_id).toBeUndefined()
    await page.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText('Which token is first in the invented list?')
    const input = page.getByRole('textbox', { name: 'Tu respuesta', exact: true })
    await input.fill('alpha'); await input.press('Enter')
    const escrito = (await estudio(page)).progreso['QA-CORTO'].intentos
    expect(escrito).toHaveLength(1)
    expect(escrito[0]).toMatchObject({ interaccion: 'recuperacion_libre', tipo_evidencia: 'recuerdo',
      recuperacion_activa: true, resultado: 'correcta' })
    expect(escrito[0].variante_id).toBeUndefined()
    await sinErrores(page, errores)
  })

  test('la base guardada se retoma sin promoción y una selección nueva sí prepara su caso', async ({ page }) => {
    const errores = await abrir(page, 'hoy', 'base-guardada')
    const antes = await estudio(page)
    await page.getByRole('region', { name: 'Tu sesión guardada', exact: true })
      .getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_BASE)
    await expect(page.locator('.avance')).toHaveAttribute('aria-label', 'Pregunta 2 de 2')
    await expect(page.locator('.session-presentation')).not.toContainText('Aplicación en un caso')
    expect((await estudio(page)).reanudable).toMatchObject({ sessionId: 'qa-base-guardada', indice: 1,
      conceptIds: ['QA-CORTO', ID], versionFormato: 3 })
    expect((await estudio(page)).progreso).toEqual(antes.progreso)
    await page.getByRole('button', { name: 'Necesito una pausa', exact: true }).click()
    await page.evaluate(() => { location.hash = 'modulos' })
    await page.getByRole('tab', { name: 'Conceptos', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Agregar Apply the synthetic gate rule', exact: true }).check()
    await page.getByRole('button', { name: 'Estudiar 1 de 1 seleccionados', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_CASO)
    const nueva = await estudio(page)
    expect(nueva.reanudable).toMatchObject({ indice: 0, conceptIds: [ID], variantes: [VARIANTE_NUEVA], versionFormato: 3 })
    expect(nueva.reanudable.sessionId).not.toBe('qa-base-guardada')
    expect(nueva.progreso).toEqual(antes.progreso)
    await sinErrores(page, errores)
  })

  test('examen mantiene la pregunta base y su corrección sin convertirla en otro caso', async ({ page }) => {
    const errores = await abrir(page, 'modulos')
    await page.getByText('Más filtros y modo de práctica', { exact: true }).click()
    await page.getByLabel('Modo de práctica', { exact: true }).selectOption('examen')
    await page.getByRole('button', { name: 'Estudiar estos filtros (1)', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_BASE)
    await expect(page.locator('.session-presentation')).not.toContainText('Aplicación en un caso')
    const antes = await estudio(page)
    await elegir(page, 'The blue token opens gate one before the amber counter reaches its threshold.')
    await expect(page.getByText('Respuesta registrada', { exact: true })).toBeVisible()
    await expect(page.locator('.retro')).toHaveCount(0)
    await expect(page.getByText('Respuesta correcta', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Terminar y revisar', exact: true }).click()
    await page.getByRole('button', { name: 'Practicar los errores', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(PREGUNTA_BASE)
    await expect(page.locator('.session-presentation')).not.toContainText('Aplicación en un caso')
    await elegir(page, CANONICA_LARGA)
    await expect(page.locator('.retro')).toContainText('Correcto')
    const corregida = await estudio(page)
    expect(corregida.progreso[ID].intentos.slice(0, 2)).toEqual(antes.progreso[ID].intentos)
    expect(corregida.progreso[ID].intentos).toHaveLength(4)
    const nuevos = corregida.progreso[ID].intentos.slice(2)
    expect(nuevos[0]).toMatchObject({ interaccion: 'opcion_multiple', tipo_evidencia: 'discriminacion', resultado: 'incorrecta', explicacion_previa: false })
    expect(nuevos[1]).toMatchObject({ interaccion: 'opcion_multiple', tipo_evidencia: 'discriminacion', resultado: 'correcta', explicacion_previa: true })
    expect(nuevos.every((i: any) => i.variante_id === undefined)).toBe(true)
    await sinErrores(page, errores)
  })
})
