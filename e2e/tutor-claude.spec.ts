import { expect, test, type Page, type Request } from '@playwright/test'
import { catalogoNbmeReal, NBME_REAL_SESSION, NBME_REAL_TOKEN, preguntaNbmeReal } from './arnes/nbme-real-fixture'
import { installOriginalRecoveryPolicy } from './arnes/source-safety-fixture'
import type { NbmeQuestion } from '../src/nbme/types'

/** Sábado: desde la 1.32.0 sólo el fin de semana trae preguntas NBME nuevas. */
const SABADO = new Date('2026-10-17T11:30:00Z')
const RESPUESTA = 'El mecanismo sintético empieza por **alfa**, sigue por beta y termina en gamma.'
const EJERCICIOS = [
  { tipo: 'completar', enunciado: 'El segundo elemento sintético de la serie es ____.', respuesta: 'beta', aceptadas: [],
    pista: 'Va entre alfa y gamma.', explicacion: 'Beta ocupa el segundo lugar de la serie sintética.' },
  { tipo: 'verdadero_falso', enunciado: 'En la serie sintética, gamma aparece antes que alfa.', verdadero: false,
    explicacion: 'Alfa abre la serie y gamma la cierra.' },
  { tipo: 'opcion_unica', enunciado: '¿Cuál es el último elemento de la serie sintética?', opciones: ['Alfa', 'Beta', 'Gamma'],
    correcta: 'Gamma', explicacion: 'Gamma cierra la serie sintética.' },
]

type Consulta = Record<string, any>

type Respuesta = { status?: number; json: unknown }

/** Responde como lo haría el Worker: el chat y la práctica por la misma ruta, según `accion`. */
async function instalarRed(page: Page, opciones: { extra?: (ruta: string, req: Request) => unknown | undefined;
  chat?: (cuerpo: Consulta, numero: number) => Respuesta | undefined } = {}) {
  const consultas: Consulta[] = []
  const cabeceras: (string | undefined)[] = []
  await page.route('**/api/**', async route => {
    const req = route.request()
    const ruta = new URL(req.url()).pathname
    const propio = opciones.extra?.(ruta, req)
    if (propio !== undefined) return route.fulfill({ json: propio })
    if (ruta === '/api/ia/chat') {
      const cuerpo = req.postDataJSON() as Consulta
      consultas.push(cuerpo); cabeceras.push(req.headers()['authorization'])
      const a_medida = opciones.chat?.(cuerpo, consultas.length)
      if (a_medida) return route.fulfill({ status: a_medida.status ?? 200, json: a_medida.json })
      return route.fulfill({ json: cuerpo.accion === 'practica' ? { ejercicios: EJERCICIOS, cached: false } : { respuesta: RESPUESTA, cached: false } })
    }
    if (ruta === '/api/calificar') return route.fulfill({ json: { veredicto: 'incorrecta', motivo: 'No es la respuesta sintética.' } })
    return route.fulfill({ status: 503, json: { disponible: false, error: 'Synthetic backend unavailable.' } })
  })
  return { consultas, cabeceras }
}

const tutor = (page: Page) => page.getByRole('region', { name: 'Claude, tu tutor de esta pregunta', exact: true })
const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

async function recorrerRonda(page: Page) {
  const tarjeta = (n: number) => page.getByRole('group', { name: `Recuperación activa, ejercicio ${n} de 3`, exact: true })
  const comprobar = async (n: number) => {
    await tarjeta(n).getByRole('button', { name: 'Comprobar', exact: true }).click()
    await page.clock.runFor(600)
    await expect(tarjeta(n).locator('.tutor-resultado')).toBeVisible()
  }
  await expect(tarjeta(1)).toContainText('1 de 3')
  await expect(tarjeta(1).getByRole('progressbar', { name: 'Progreso de la ronda', exact: true })).toHaveAttribute('aria-valuenow', '0')
  await tarjeta(1).getByRole('button', { name: 'Una pista', exact: true }).click()
  await expect(tarjeta(1)).toContainText('Va entre alfa y gamma.')
  await tarjeta(1).getByRole('textbox', { name: 'Palabra que completa la frase', exact: true }).fill('Beta')
  await comprobar(1)
  await expect(tarjeta(1).getByRole('progressbar', { name: 'Progreso de la ronda', exact: true })).toHaveAttribute('aria-valuenow', '1')
  await tarjeta(1).getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()

  await tarjeta(2).getByRole('radio', { name: 'Falso', exact: true }).click()
  await comprobar(2)
  await tarjeta(2).getByRole('button', { name: 'Siguiente ejercicio', exact: true }).click()

  await tarjeta(3).getByRole('radio', { name: /Gamma/ }).click()
  await comprobar(3)
  await tarjeta(3).getByRole('button', { name: 'Ver resumen', exact: true }).click()
}

for (const width of [390, 1280]) test.describe(`tutor Claude a ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })

  test('tras responder aparece el chat, no llama a la API hasta que lo pides y la recuperación activa no toca el progreso', async ({ page }) => {
    const { consultas } = await instalarRed(page)
    await page.clock.install({ time: SABADO })
    await page.goto('/?escena=abierto&ia=1')
    await page.locator('.hoy-next-block .btn.principal').click()
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).fill('beta')
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).press('Enter')

    await expect(tutor(page)).toBeVisible()
    await expect(tutor(page)).toContainText('Tu tutor de esta pregunta')
    await expect(tutor(page).getByRole('button', { name: 'Mecanismo paso a paso', exact: true })).toBeVisible()
    await expect(tutor(page).getByRole('button', { name: 'Key learning point', exact: true })).toBeVisible()
    await expect(tutor(page).getByRole('button', { name: 'Recuperación activa', exact: true })).toBeVisible()
    expect(consultas).toHaveLength(0)

    await tutor(page).getByRole('button', { name: 'Mecanismo paso a paso', exact: true }).click()
    await expect(tutor(page)).toContainText('Explícame el mecanismo paso a paso')
    await expect(tutor(page)).toContainText('El mecanismo sintético empieza por alfa, sigue por beta y termina en gamma.')
    expect(consultas).toHaveLength(1)
    expect(consultas[0]).toMatchObject({ tipo: 'concepto', accion: 'mensaje', mensaje: 'Explícame el mecanismo paso a paso',
      historial: [], resultado: 'incorrecta', presentacion: { answer: 'beta', formatVersion: 3, retry: false } })

    const entrada = tutor(page).getByRole('textbox', { name: 'Tu pregunta para Claude', exact: true })
    await entrada.fill('Dame otro ejemplo sintético')
    await entrada.press('Enter')
    await expect(tutor(page).getByText('Dame otro ejemplo sintético', { exact: true })).toBeVisible()
    await expect.poll(() => consultas.length).toBe(2)
    expect(consultas[1].historial).toEqual([{ rol: 'yo', texto: 'Explícame el mecanismo paso a paso' }, { rol: 'ia', texto: RESPUESTA }])

    const antes = await page.evaluate(() => window.__leerProgresoSintetico().progreso)
    await tutor(page).getByRole('button', { name: 'Recuperación activa', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Recuperación activa, ejercicio 1 de 3', exact: true })).toBeVisible()
    expect(consultas).toHaveLength(3)
    expect(consultas[2]).toMatchObject({ tipo: 'concepto', accion: 'practica', evitar: [] })
    expect(consultas[2]).not.toHaveProperty('mensaje')

    await recorrerRonda(page)
    const resumen = page.getByRole('group', { name: 'Resumen de la ronda 1', exact: true })
    await expect(resumen).toContainText('3 de 3')
    await expect(resumen).toContainText('3 correctas · 2 sin pista')
    await expect(resumen.getByRole('button', { name: 'Otra ronda con ideas nuevas', exact: true })).toBeVisible()

    expect(await page.evaluate(() => window.__leerProgresoSintetico().progreso)).toEqual(antes)
    await expect(page.getByRole('button', { name: 'Siguiente pregunta', exact: true })).toBeEnabled()
    expect(await sinDesborde(page)).toBe(true)
  })

  test('un fallo del servicio se explica dentro del chat y se puede reintentar sin duplicar tu mensaje', async ({ page }) => {
    const { consultas } = await instalarRed(page, { chat: (_, n) => n === 1
      ? { status: 503, json: { error: 'Claude no está disponible ahora mismo.', codigo: 'proveedor' } } : undefined })
    await page.clock.install({ time: SABADO })
    await page.goto('/?escena=abierto&ia=1')
    await page.locator('.hoy-next-block .btn.principal').click()
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).fill('beta')
    await page.getByRole('textbox', { name: 'Tu respuesta', exact: true }).press('Enter')

    await tutor(page).getByRole('button', { name: 'Key learning point', exact: true }).click()
    await expect(tutor(page).getByRole('alert')).toContainText('Claude no está disponible ahora mismo.')
    await tutor(page).getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect(tutor(page)).toContainText('El mecanismo sintético empieza por alfa')
    expect(consultas).toHaveLength(2)
    expect(consultas[1]).toMatchObject({ mensaje: consultas[0].mensaje, historial: [] })
    await expect(tutor(page).getByText(consultas[0].mensaje, { exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Siguiente pregunta', exact: true })).toBeEnabled()
    expect(await sinDesborde(page)).toBe(true)
  })

  test('en una pregunta NBME el chat identifica pregunta, revisión y opción, y no cambia el intento', async ({ page }) => {
    await installOriginalRecoveryPolicy(page)
    const pregunta = (id: string, revision = 'synthetic-r1'): NbmeQuestion => ({ ...preguntaNbmeReal(id, revision), systems: ['Renal'], disciplines: ['Fisiología'],
      topic: 'Tema de demostración', objective: 'Synthetic mechanism: distinguish demonstration from another synthetic response.' })
    const { consultas, cabeceras } = await instalarRed(page, { extra: (ruta, req) => {
      if (ruta === '/api/nbme/catalog') return catalogoNbmeReal()
      if (ruta === '/api/nbme/questions') {
        const refs = req.postDataJSON().refs as { id: string; revision?: string }[]
        return { questions: refs.map(ref => pregunta(ref.id, ref.revision)) }
      }
      return undefined
    } })
    await page.clock.install({ time: new Date('2026-10-26T11:30:00Z') })
    await page.goto('/?escena=atraso&proveedor=nbme-real#progreso')
    await expect.poll(() => page.evaluate(() => window.__leerNbmeReal?.().sessions)).toHaveProperty(NBME_REAL_SESSION)
    await page.getByText('Ponerme al día con la meta', { exact: true }).click()
    await page.getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
    await expect(page.locator('.nbme-feedback')).toContainText('Vamos a repasarla')

    await expect(tutor(page)).toBeVisible()
    expect(consultas).toHaveLength(0)
    const antes = await page.evaluate(() => window.__leerNbmeReal())
    await tutor(page).getByRole('button', { name: 'Mecanismo paso a paso', exact: true }).click()
    await expect(tutor(page)).toContainText('El mecanismo sintético empieza por alfa')
    expect(consultas).toEqual([expect.objectContaining({ tipo: 'nbme', accion: 'mensaje', questionId: 'Q3', revision: 'synthetic-r1', optionId: 'B', historial: [] })])
    expect(cabeceras).toEqual([`Bearer ${NBME_REAL_TOKEN}`])
    // El cuerpo no lleva el enunciado ni las opciones: el Worker las lee de su propia fuente.
    expect(JSON.stringify(consultas[0])).not.toContain('Synthetic saved')
    expect(await page.evaluate(() => window.__leerNbmeReal())).toEqual(antes)
    expect(await sinDesborde(page)).toBe(true)
  })
})
