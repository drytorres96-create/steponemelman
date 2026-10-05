import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Sólo datos sintéticos del arnés: no descarga preguntas, PDFs ni imágenes del banco.
const output = process.env.OUTPUT
const LUNES = new Date('2026-10-05T07:30:00-04:00')

async function abrirConcepto(page: Page, parametros = '') {
  await page.addInitScript(() => localStorage.setItem('step1-piel-estudio', 'claro'))
  await page.clock.install({ time: LUNES })
  await page.goto(`/?escena=abierto&${parametros}`)
  await page.getByRole('button', { name: /(Empezar|Seguir con) lo nuevo/ }).click()
  await expect(page.getByRole('textbox', { name: 'Tu respuesta', exact: true })).toBeVisible()
}

async function abrirPregunta(page: Page, parametros = 'figura=larga&tabla=1') {
  await abrirConcepto(page, parametros)
  for (let paso = 0; paso < 3; paso++) {
    const respuesta = page.getByRole('textbox', { name: 'Tu respuesta', exact: true })
    await respuesta.fill('demostración')
    await respuesta.press('Enter')
    await page.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
  }
  await expect(page.locator('.nbme-question')).toBeVisible()
}

async function mostrarFigura(page: Page) {
  const enlace = page.getByRole('link', { name: 'Ir a la figura', exact: true })
  if (await enlace.count()) await enlace.click()
  const imagen = page.locator('.nbme-image-button img')
  await expect.poll(() => imagen.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1200)).toBe(true)
  return imagen
}

async function contraste(page: Page, selector: string, propiedad = 'color') {
  return page.locator(selector).first().evaluate((element, propiedad) => {
    const canales = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
    const luminancia = (rgb: number[]) => rgb.map(v => {
      v /= 255
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
    }).reduce((total, v, i) => total + v * [.2126, .7152, .0722][i], 0)
    let actual: Element | null = element
    let fondo = 'rgb(255, 255, 255)'
    while (actual) {
      const color = getComputedStyle(actual).backgroundColor
      const valores = color.match(/[\d.]+/g)?.map(Number) ?? []
      if (valores.length === 3 || valores[3] === 1) { fondo = color; break }
      actual = actual.parentElement
    }
    const texto = getComputedStyle(element).getPropertyValue(propiedad)
    const a = luminancia(canales(texto)), b = luminancia(canales(fondo))
    return { texto, fondo, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
  }, propiedad)
}

for (const width of [390, 1280]) test.describe(`auditoría móvil · ${width}px`, () => {
  test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, hasTouch: width === 390, isMobile: width === 390, reducedMotion: 'reduce' })

  test('figura grande sintética: carga, dimensiones, captura y foco del modal', async ({ page }) => {
    await abrirPregunta(page)
    const imagen = await mostrarFigura(page)
    expect(await imagen.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(800)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const valores = await contraste(page, '.nbme-lab-tabla td')
    const caption = await contraste(page, '.nbme-lab-encabezado')
    if (output) {
      await mkdir(output, { recursive: true })
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
      await page.screenshot({ path: join(output, `nbme-grande-${width}.png`), fullPage: true })
      await writeFile(join(output, `contraste-${width}.json`), JSON.stringify({ valores, caption }, null, 2))
    }
    const ampliar = page.getByRole('button', { name: 'Ampliar: Synthetic figure', exact: true })
    await ampliar.click()
    const dialog = page.getByRole('dialog', { name: 'Figura de la pregunta' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused()
    await expect.poll(() => dialog.getByRole('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1200)).toBe(true)
    if (output) {
      await page.screenshot({ path: join(output, `figura-grande-${width}.png`) })
      await page.locator('.modal').screenshot({ path: join(output, `visor-grande-${width}.png`) })
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(ampliar).toBeFocused()
  })

  test('laboratorios y caption son legibles en ambas pieles', async ({ page }) => {
    await abrirPregunta(page)
    for (const piel of ['claro', 'oscuro']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-piel-estudio', value), piel)
      for (const selector of ['.nbme-lab-tabla td', '.nbme-matrix td', '.nbme-lab-encabezado']) {
        const resultado = await contraste(page, selector)
        expect(resultado.ratio, `${piel}: ${selector} ${JSON.stringify(resultado)}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  test('zoom aumenta la imagen y permite desplazamiento sin perder el foco', async ({ page }) => {
    await abrirPregunta(page)
    await mostrarFigura(page)
    await page.getByRole('button', { name: 'Ampliar: Synthetic figure', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Figura de la pregunta' })
    const imagen = dialog.getByRole('img')
    const ancho = await imagen.evaluate(img => img.getBoundingClientRect().width)
    await dialog.getByRole('button', { name: 'Acercar figura', exact: true }).click()
    await expect.poll(() => imagen.evaluate(img => img.getBoundingClientRect().width)).toBeGreaterThan(ancho)
    const scroll = dialog.getByRole('region', { name: 'Figura ampliada', exact: true })
    expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    if (output) {
      for (let paso = 0; paso < 3; paso++) await dialog.getByRole('button', { name: 'Acercar figura', exact: true }).click()
      await page.screenshot({ path: join(output, `figura-zoom-300-${width}.png`) })
    }
    await scroll.focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
    await dialog.getByRole('button', { name: 'Ajustar figura', exact: true }).click()
    expect(await imagen.evaluate(img => img.getBoundingClientRect().width)).toBeCloseTo(ancho, 0)
    if (await scroll.evaluate(element => element.scrollHeight > element.clientHeight)) {
      await scroll.evaluate(element => { element.scrollTop = element.scrollHeight })
      await dialog.getByRole('button', { name: 'Ajustar figura', exact: true }).click()
      expect(await scroll.evaluate(element => element.scrollTop)).toBe(0)
    }
    for (const button of await dialog.getByRole('button').all()) {
      const rect = await button.boundingBox()
      expect(rect!.width).toBeGreaterThanOrEqual(44)
      expect(rect!.height).toBeGreaterThanOrEqual(44)
    }
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Ampliar: Synthetic figure', exact: true })).toBeFocused()
  })
})

test.describe('auditoría táctil de figuras', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })

  test('el campo de respuesta mantiene un borde visible en ambas pieles y el conmutador mide 44px', async ({ page }) => {
    await abrirConcepto(page)
    const boton = page.locator('.piel-boton')
    const rect = (await boton.boundingBox())!
    expect(rect.width).toBeGreaterThanOrEqual(44)
    expect(rect.height).toBeGreaterThanOrEqual(44)
    for (const piel of ['claro', 'oscuro']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-piel-estudio', value), piel)
      await page.locator('#contenido').focus()
      const resultado = await contraste(page, 'input[type="text"]', 'border-top-color')
      expect(resultado.ratio, `${piel}: ${JSON.stringify(resultado)}`).toBeGreaterThanOrEqual(3)
    }
  })

  test('pellizcar amplía y arrastrar desplaza la figura con eventos táctiles del navegador', async ({ page, context }) => {
    await abrirPregunta(page)
    await mostrarFigura(page)
    await page.getByRole('button', { name: 'Ampliar: Synthetic figure', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Figura de la pregunta' })
    const region = dialog.getByRole('region', { name: 'Figura ampliada', exact: true })
    const imagen = dialog.getByRole('img')
    const antes = await imagen.evaluate(img => img.getBoundingClientRect().width)
    const rect = (await region.boundingBox())!
    const x = rect.x + rect.width / 2, y = rect.y + Math.min(rect.height / 2, 100)
    const session = await context.newCDPSession(page)
    const touch = (id: number, pointX: number) => ({ id, x: pointX, y, radiusX: 2, radiusY: 2 })
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0, x - 25), touch(1, x + 25)] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(0, x - 65), touch(1, x + 65)] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => imagen.evaluate(img => img.getBoundingClientRect().width)).toBeGreaterThan(antes * 1.5)
    const izquierda = await region.evaluate(element => element.scrollLeft)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0, x)] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(0, x - 65)] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(izquierda)
    // Al llegar al límite el gesto debe seguir desplazando aunque la escala ya no cambie.
    await dialog.getByRole('button', { name: 'Ajustar figura', exact: true }).click()
    for (let paso = 0; paso < 6; paso++) await dialog.getByRole('button', { name: 'Acercar figura', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Acercar figura', exact: true })).toBeDisabled()
    const limite = await region.evaluate(element => element.scrollLeft)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0, x - 25), touch(1, x + 25)] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(0, x - 45), touch(1, x + 25)] })
    await page.clock.runFor(32)
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(0, x - 45), touch(1, x + 5)] })
    await page.clock.runFor(32)
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(limite)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await session.detach()
  })

  test('las tablas tienen región enfocada con indicador visible', async ({ page }) => {
    await abrirPregunta(page, 'tabla=1')
    for (const region of await page.locator('.nbme-lab-scroll').all()) {
      await expect(region).toHaveAttribute('tabindex', '0')
      await expect(region).toHaveAttribute('role', 'region')
      expect(await region.getAttribute('aria-label')).toBeTruthy()
      await page.keyboard.press('Tab')
      await region.focus()
      await expect(region).toBeFocused()
      expect(await region.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
    }
  })

  test('la descarga espera al viewport y el salto a respuestas no permite omitir la figura necesaria', async ({ page }) => {
    await abrirPregunta(page, 'figura=larga&enunciado-largo=1')
    expect(await page.evaluate(() => (window as Window & { __nbmeFigureRequests: number }).__nbmeFigureRequests)).toBe(0)
    await page.keyboard.press('c')
    await expect(page.getByRole('button', { name: 'Comprobar respuesta', exact: true })).toBeDisabled()
    await page.getByRole('link', { name: 'Ir a las respuestas', exact: true }).click()
    await expect(page.locator('#nbme-answers')).toBeFocused()
    await mostrarFigura(page)
    expect(await page.evaluate(() => (window as Window & { __nbmeFigureRequests: number }).__nbmeFigureRequests)).toBe(1)
    await expect(page.getByRole('button', { name: 'Comprobar respuesta', exact: true })).toBeEnabled()
  })

  for (const error of ['error-descarga', 'error-imagen']) test(`${error}: aviso claro, bloqueo y reintento`, async ({ page }) => {
    await abrirPregunta(page, `figura=${error}`)
    await page.getByRole('link', { name: 'Ir a la figura', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'No se pudo cargar la figura' })).toBeVisible()
    await page.keyboard.press('c')
    await expect(page.getByRole('button', { name: 'Comprobar respuesta', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Reintentar figura', exact: true }).click()
    await mostrarFigura(page)
    await expect(page.getByRole('button', { name: 'Comprobar respuesta', exact: true })).toBeEnabled()
  })
})

test.describe('auditoría móvil horizontal', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })

  test('saltos y modal mantienen el foco visible, sin desbordamiento en horizontal', async ({ page }) => {
    await abrirPregunta(page, 'figura=larga&tabla=1&enunciado-largo=1')
    await page.getByRole('link', { name: 'Ir a las respuestas', exact: true }).click()
    await expect(page.locator('#nbme-answers')).toBeFocused()
    const answer = await page.locator('#nbme-answers').boundingBox()
    const header = await page.locator('.barra').boundingBox()
    expect(answer!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
    await mostrarFigura(page)
    await page.getByRole('button', { name: 'Ampliar: Synthetic figure', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Figura de la pregunta' })
    await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused()
    await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const rect = (await page.locator('.modal').boundingBox())!
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.y + rect.height).toBeLessThanOrEqual(390)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Ampliar: Synthetic figure', exact: true })).toBeFocused()
  })
})
