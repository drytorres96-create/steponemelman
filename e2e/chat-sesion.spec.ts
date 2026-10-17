import { expect, test, type Page } from '@playwright/test'

/** Miércoles 14 de octubre de 2026, 11:00 en Nueva York. El viernes 16 va vacío. */
const MIERCOLES = new Date('2026-10-14T15:00:00Z')
const VIERNES = new Date('2026-10-16T15:00:00Z')

type Peticion = Record<string, any>
type Respuesta = { status?: number; json: unknown }

/**
 * Simula `/api/ia/sesion`: `entender` y `revisar` las contesta lo que se le pase, en orden;
 * el hilo de «Para reforzar hoy» se contesta con una frase fija. Todo lo demás, como sin servidor.
 */
async function instalarRed(page: Page, guion: { entender?: (p: Peticion, n: number) => Respuesta; revisar?: (p: Peticion, n: number) => Respuesta } = {}) {
  const entender: Peticion[] = [], revisar: Peticion[] = []
  await page.route('**/api/**', async route => {
    const req = route.request()
    const ruta = new URL(req.url()).pathname
    if (ruta === '/api/ia/sesion') {
      const cuerpo = req.postDataJSON() as Peticion
      if (cuerpo.fase === 'hilo') return route.fulfill({ json: { hilo: 'Son conceptos que fallaste esta semana.', cached: false } })
      const lista = cuerpo.fase === 'entender' ? entender : revisar
      lista.push(cuerpo)
      const r = (cuerpo.fase === 'entender' ? guion.entender : guion.revisar)?.(cuerpo, lista.length)
        ?? { status: 503, json: { error: 'Sin guion.', codigo: 'proveedor' } }
      return route.fulfill({ status: r.status ?? 200, json: r.json })
    }
    return route.fulfill({ status: 503, json: { disponible: false, error: 'Synthetic backend unavailable.' } })
  })
  return { entender, revisar }
}

const consulta = (extra: Record<string, unknown> = {}) => ({
  tipo: 'consulta', consulta: { fuente: 'conceptos', sistemas: ['Renal'], disciplinas: [], terminos: [], estados: ['falladas'], minutos: 10, titulo: 'Renal · falladas', ...extra },
})
const tarjetaChat = (page: Page) => page.getByRole('region', { name: 'Pídele a Claude una sesión', exact: true })
const panel = (page: Page) => page.getByRole('region', { name: 'Claude, para armar tu sesión de estudio', exact: true })
const sugerencia = (page: Page) => page.getByRole('region', { name: 'Para reforzar hoy', exact: true })
const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
const decir = async (page: Page, texto: string) => {
  await panel(page).getByLabel('Lo que quieres estudiar', { exact: true }).fill(texto)
  await panel(page).getByRole('button', { name: 'Enviar', exact: true }).click()
}
const abrir = async (page: Page) => {
  await page.clock.install({ time: MIERCOLES })
  await page.goto('/?escena=fragil&ia=1')
  await expect(tarjetaChat(page)).toBeVisible()
  await tarjetaChat(page).getByRole('button', { name: 'Pedir una sesión', exact: true }).click()
  await expect(panel(page)).toBeVisible()
}

for (const width of [390, 1280]) test.describe(`Pídele a Claude una sesión a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })

  test('pregunta con botones, entiende, arma la sesión con el historial y deja empezarla; no toca la sugerencia del día', async ({ page }) => {
    const red = await instalarRed(page, {
      entender: (_p, n) => n === 1
        ? { json: { tipo: 'pregunta', texto: '¿Con qué quieres practicar?', opciones: ['Solo NBME', 'Solo conceptos', 'Mixto'] } }
        : { json: consulta() },
    })
    await abrir(page)
    await expect(sugerencia(page)).toBeVisible()
    const antes = await page.evaluate(() => window.__leerProgresoSintetico().progreso)

    await decir(page, 'una sesión de renal de las que he fallado')
    await expect(panel(page).getByText('¿Con qué quieres practicar?')).toBeVisible()
    await expect(panel(page).getByRole('group', { name: 'Opciones de respuesta' }).getByRole('button')).toHaveText(['Solo NBME', 'Solo conceptos', 'Mixto', 'Elige tú'])
    expect(await sinDesborde(page)).toBe(true)
    await panel(page).getByRole('button', { name: 'Solo conceptos', exact: true }).click()

    await expect(panel(page).getByText('Entendí: Renal · falladas · conceptos · ≈ 10 min', { exact: false })).toBeVisible()
    const resumen = panel(page).locator('.chat-sesion-resultado')
    await expect(resumen).toContainText('Renal · falladas')
    const n = Number((await resumen.textContent())!.match(/(\d+) conceptos? y 0 preguntas/)![1])
    expect(n).toBeGreaterThan(1)
    expect(n).toBeLessThanOrEqual(29)
    expect(await sinDesborde(page)).toBe(true)

    // Dos llamadas a Claude, sin revisión (no hubo tema libre) y con la conversación completa en la segunda.
    expect(red.entender).toHaveLength(2)
    expect(red.revisar).toHaveLength(0)
    expect(red.entender[0]).toMatchObject({ fase: 'entender', preguntasHechas: 0, mensajes: [{ rol: 'yo', texto: 'una sesión de renal de las que he fallado' }] })
    expect(red.entender[1].preguntasHechas).toBe(1)
    expect(red.entender[1].mensajes.map((m: Peticion) => m.rol)).toEqual(['yo', 'ia', 'yo'])
    // La sugerencia del día sigue entera: el chat no la gasta.
    await expect(sugerencia(page).getByRole('button', { name: 'Repasar estos 5', exact: true })).toBeEnabled()

    await panel(page).getByRole('button', { name: 'Empezar la sesión', exact: true }).click()
    await expect(page.getByText('Renal · falladas').first()).toBeVisible()
    await expect(page.getByText(`Paso 1 de ${n}`)).toBeVisible()
    // Abrir la sesión no registra nada por sí solo.
    expect(await page.evaluate(() => window.__leerProgresoSintetico().progreso)).toEqual(antes)
  })

  test('con un tema libre, Claude revisa sólo etiquetas de lo ya filtrado y la sesión lleva lo que deja', async ({ page }) => {
    const red = await instalarRed(page, {
      entender: () => ({ json: consulta({ terminos: ['mecanismo renal'], estados: [], titulo: 'Renal · mecanismo' }) }),
      revisar: p => ({ json: { ids: p.items.slice(0, 3).map((i: Peticion) => i.id), sinRevisar: 0 } }),
    })
    await abrir(page)
    await decir(page, 'renal y lo relacionado con mecanismos')

    await expect(panel(page).locator('.chat-sesion-resultado')).toContainText('3 conceptos y 0 preguntas')
    await expect(panel(page)).toContainText(/Claude revisó \d+ candidatas y dejó 3\./)
    expect(red.revisar).toHaveLength(1)
    const cuerpo = red.revisar[0]
    expect(cuerpo.pedido).toBe('renal y lo relacionado con mecanismos')
    expect(cuerpo.consulta).toMatchObject({ sistemas: ['Renal'], terminos: ['mecanismo renal'] })
    expect(cuerpo.items.length).toBeGreaterThan(3)
    for (const i of cuerpo.items) {
      expect(Object.keys(i).sort()).toEqual(['etiqueta', 'id', 'tipo'])
      expect(i.etiqueta.length).toBeLessThanOrEqual(90)
    }
    // Ni explicaciones, ni respuestas, ni enunciados: sólo el tema y el objetivo.
    expect(JSON.stringify(cuerpo)).not.toMatch(/Ejemplo de interfaz|demostraci[oó]n\./)

    await panel(page).getByRole('button', { name: 'Empezar la sesión', exact: true }).click()
    await expect(page.getByText('Paso 1 de 3')).toBeVisible()
  })

  test('si Claude falla se puede reintentar sin repetir lo dicho, y la conversación no se pierde', async ({ page }) => {
    const red = await instalarRed(page, {
      entender: (_p, n) => n === 1 ? { status: 503, json: { error: 'Claude no está disponible.', codigo: 'proveedor' } } : { json: consulta() },
    })
    await abrir(page)
    await decir(page, 'renal fallado')
    await expect(panel(page).getByRole('alert')).toContainText('Claude no está disponible.')
    expect(await sinDesborde(page)).toBe(true)
    await panel(page).getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect(panel(page).getByRole('button', { name: 'Empezar la sesión', exact: true })).toBeVisible()
    expect(red.entender).toHaveLength(2)
    expect(red.entender[1].mensajes).toEqual([{ rol: 'yo', texto: 'renal fallado' }])
    await expect(panel(page).locator('.tutor-turno--yo')).toHaveCount(1)
  })

  test('si nada cumple lo pedido, lo explica y no ofrece empezar', async ({ page }) => {
    await instalarRed(page, { entender: () => ({ json: consulta({ sistemas: ['Cardiovascular'], estados: [], titulo: 'Cardio' }) }) })
    await abrir(page)
    await decir(page, 'cardiología')
    await expect(panel(page)).toContainText('No encontré conceptos de Cardiovascular')
    await expect(panel(page).getByRole('button', { name: 'Empezar la sesión', exact: true })).toHaveCount(0)
    expect(await sinDesborde(page)).toBe(true)
  })

  test('los ejemplos sólo rellenan el campo y «Empezar de nuevo» limpia la conversación', async ({ page }) => {
    const red = await instalarRed(page, { entender: () => ({ json: consulta() }) })
    await abrir(page)
    await panel(page).getByRole('button', { name: 'Una sesión de las que he fallado', exact: true }).click()
    await expect(panel(page).getByLabel('Lo que quieres estudiar', { exact: true })).toHaveValue('Una sesión de las que he fallado')
    expect(red.entender).toHaveLength(0)
    await panel(page).getByRole('button', { name: 'Enviar', exact: true }).click()
    await expect(panel(page).getByRole('button', { name: 'Empezar la sesión', exact: true })).toBeVisible()
    await panel(page).getByRole('button', { name: 'Empezar de nuevo', exact: true }).click()
    await expect(panel(page).locator('.tutor-turno--yo')).toHaveCount(0)
    await expect(panel(page).getByRole('button', { name: 'Empezar la sesión', exact: true })).toHaveCount(0)
  })

  test('el viernes no hay tarjeta del chat ni se llama a Claude', async ({ page }) => {
    const red = await instalarRed(page)
    await page.clock.install({ time: VIERNES })
    await page.goto('/?escena=fragil&ia=1')
    await expect(page.locator('.hoy')).toBeVisible()
    await expect(tarjetaChat(page)).toHaveCount(0)
    expect(red.entender).toHaveLength(0)
  })
})
