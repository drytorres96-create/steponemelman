import { expect, test, type Page } from '@playwright/test'
import { preguntaNbmeReal } from './arnes/nbme-real-fixture'
import { ordenDeProduccion } from './arnes/orden-produccion'

/**
 * En escritorio la página de MyQBank tiene que poder bajar: el dashboard tiene el progreso
 * detallado por debajo de la cuadrícula y Ajustes es más alto que la ventana. Las demás pruebas
 * corren a 390 px, donde una media query tapa este fallo.
 */
test.use({ viewport: { width: 1280, height: 720 } })

const url = '/?workspace=myqbank&proveedor=nbme-real&escena=abierto'

async function red(page: Page) {
  const preguntas = Array.from({ length: 12 }, (_, i) => ({ ...preguntaNbmeReal(`QA-NBME-${i + 1}`), systems: ['Renal'] }))
  await page.route('**/api/**', async route => {
    const ruta = new URL(route.request().url()).pathname
    if (ruta === '/api/nbme/catalog') return route.fulfill({ json: { schemaVersion: 1, bankVersion: 'synthetic-myqbank', total: preguntas.length, questions: preguntas } })
    if (ruta === '/api/nbme/questions') {
      const refs = route.request().postDataJSON().refs as { id: string; revision: string }[]
      return route.fulfill({ json: { questions: refs.map(r => ({ ...preguntaNbmeReal(r.id, r.revision), systems: ['Renal'] })) } })
    }
    return route.fulfill({ status: 503, json: { disponible: false, error: 'Synthetic backend unavailable.' } })
  })
}

async function sePuedeBajar(page: Page) {
  await ordenDeProduccion(page)
  const medida = await page.evaluate(() => {
    const raiz = document.querySelector('.mq-workspace') as HTMLElement
    const estilo = getComputedStyle(raiz)
    return { overflowY: estilo.overflowY, alto: raiz.getBoundingClientRect().height, ventana: innerHeight, documento: document.documentElement.scrollHeight }
  })
  // La raíz no recorta ni se queda al alto de la ventana: el documento es el que se desplaza.
  expect(medida.overflowY).toBe('visible')
  expect(medida.documento).toBeGreaterThan(medida.ventana)
  expect(medida.alto).toBeGreaterThan(medida.ventana)
  await page.mouse.move(640, 400)
  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
}

test('el dashboard de MyQBank se desplaza hacia abajo en escritorio', async ({ page }) => {
  await red(page)
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Build a block' })).toBeVisible()
  await sePuedeBajar(page)
  await expect(page.getByText('Detailed progress and study plan')).toBeInViewport()
})

test('Ajustes de MyQBank se desplaza hacia abajo en escritorio', async ({ page }) => {
  await red(page)
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Build a block' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await sePuedeBajar(page)
})

test('la vista de estudio sigue al alto de la ventana y desplaza sus paneles por dentro (orden del build)', async ({ page }) => {
  await red(page)
  await page.goto(url)
  await page.getByRole('button', { name: 'Start 5-question block' }).click()
  await expect(page.locator('.mq-study')).toBeVisible()
  await ordenDeProduccion(page)
  const medida = await page.evaluate(() => {
    const raiz = document.querySelector('.mq-workspace') as HTMLElement
    return { overflowY: getComputedStyle(raiz).overflowY, alto: Math.round(raiz.getBoundingClientRect().height), ventana: innerHeight, documento: document.documentElement.scrollHeight }
  })
  expect(medida.overflowY).toBe('hidden')
  expect(medida.alto).toBe(medida.ventana)
  expect(medida.documento).toBeLessThanOrEqual(medida.ventana)
})
