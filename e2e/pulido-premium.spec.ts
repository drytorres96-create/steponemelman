import { expect, test, type Locator, type Page } from '@playwright/test'

const LUNES = new Date('2026-10-05T07:30:00-04:00')

async function colores(elemento: Locator) {
  return elemento.evaluate(el => {
    const estilo = getComputedStyle(el)
    return { fondo: estilo.backgroundColor, borde: estilo.borderColor, texto: estilo.color }
  })
}

function contraste(a: string, b: string) {
  const luminancia = (color: string) => {
    const canales = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(c => {
      const v = c / 255
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
    })
    return canales[0] * .2126 + canales[1] * .7152 + canales[2] * .0722
  }
  const l1 = luminancia(a), l2 = luminancia(b)
  return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05)
}

async function abrirPregunta(page: Page) {
  await page.clock.install({ time: LUNES })
  await page.goto('/?escena=abierto')
  await page.getByRole('button', { name: /(Empezar|Seguir con) lo nuevo/ }).click()
  for (let n = 0; n < 3; n++) {
    const respuesta = page.getByRole('textbox', { name: 'Tu respuesta', exact: true })
    await respuesta.fill('demostración')
    await respuesta.press('Enter')
    await page.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
  }
  await expect(page.locator('.nbme-question')).toBeVisible()
}

for (const width of [390, 1280]) {
  for (const piel of ['light', 'dark'] as const) test.describe(`detalles premium a ${width}px en ${piel}`, () => {
    test.use({ viewport: { width, height: 844 }, colorScheme: piel, contextOptions: { reducedMotion: 'reduce' } })

    test('la elección, el resultado y el foco de teclado conservan señales inequívocas', async ({ page }) => {
      await abrirPregunta(page)
      await page.keyboard.press('b')
      const seleccionada = page.locator('.nbme-option.selected')
      await expect(seleccionada.getByRole('radio')).toBeChecked()
      await page.mouse.move(0, 0)
      // reducedMotion es una opción de contexto en Playwright; comprobamos que llega al navegador.
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
      const seleccionAntes = await colores(seleccionada)
      await seleccionada.hover()
      expect(await colores(seleccionada)).toEqual(seleccionAntes)

      // La selección por letra conserva el foco inicial. Tab entra al grupo de respuestas.
      await page.keyboard.press('Tab')
      const radio = seleccionada.getByRole('radio')
      await expect(radio).toBeFocused()
      const foco = await seleccionada.evaluate(el => {
        const estilo = getComputedStyle(el)
        return { estilo: estilo.outlineStyle, ancho: parseFloat(estilo.outlineWidth), color: estilo.outlineColor, fondo: estilo.backgroundColor }
      })
      expect(foco.estilo).toBe('solid')
      expect(foco.ancho).toBeGreaterThanOrEqual(2)
      expect(contraste(foco.color, foco.fondo)).toBeGreaterThanOrEqual(3)
      expect(await colores(seleccionada)).toEqual(seleccionAntes)

      await page.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
      await expect(page.locator('.nbme-option.incorrect')).toBeVisible()
      await expect(page.locator('.nbme-option.correct')).toBeVisible()
      for (const estado of ['incorrect', 'correct']) {
        const opcion = page.locator(`.nbme-option.${estado}`)
        await page.mouse.move(0, 0)
        const antes = await colores(opcion)
        await opcion.hover()
        expect(await colores(opcion)).toEqual(antes)
      }

      await page.getByText('Así lo razoné · opcional', { exact: true }).click()
      const razonamiento = page.getByLabel('¿Qué dato te llevó a esa respuesta?')
      await razonamiento.focus()
      expect(await razonamiento.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
      await expect(razonamiento).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })

    test('hover conserva límites visibles de controles y la pausa sigue siendo accesible', async ({ page }) => {
      await abrirPregunta(page)
      const opcion = page.locator('.nbme-option').first()
      await opcion.hover()
      const estiloOpcion = await colores(opcion)
      expect(contraste(estiloOpcion.borde, estiloOpcion.fondo)).toBeGreaterThanOrEqual(3)
      const pausa = page.locator('.nbme-player-header').getByRole('button', { name: 'Volver a Hoy', exact: true })
      await pausa.hover()
      const estiloPausa = await colores(pausa)
      expect(contraste(estiloPausa.borde, estiloPausa.fondo)).toBeGreaterThanOrEqual(3)
      const caja = await pausa.boundingBox()
      expect(caja!.height).toBeGreaterThanOrEqual(44)
      expect(caja!.width).toBeGreaterThanOrEqual(44)
      await pausa.click()
      await expect(page.locator('[data-view="hoy"]')).toBeVisible()
      await expect(page.locator('html')).not.toHaveAttribute('data-piel-estudio')
    })
  })

  test.describe(`biblioteca y navegación coherentes a ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, colorScheme: 'light', contextOptions: { reducedMotion: 'reduce' } })

    test('los filtros nativos comparten paleta y el acceso a Hoy aprovecha su fila móvil', async ({ page }) => {
      await page.clock.install({ time: LUNES })
      await page.goto('/?escena=abierto#modulos')
      const accion = page.getByRole('button', { name: /Estudiar estos filtros/ })
      await expect(accion).toBeEnabled()
      const campo = page.getByLabel('Filtrar por disciplina')
      const estiloCampo = await colores(campo)
      const estiloOpcion = await colores(campo.locator('option').first())
      const superficie = await colores(page.locator('.library-composer'))
      expect([estiloCampo.fondo, superficie.fondo]).toContain(estiloOpcion.fondo)
      expect(estiloOpcion.texto).toBe(estiloCampo.texto)
      expect(contraste(estiloOpcion.texto, estiloOpcion.fondo)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(estiloCampo.texto, estiloCampo.fondo)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(estiloCampo.borde, estiloCampo.fondo)).toBeGreaterThanOrEqual(3)
      await campo.focus()
      const foco = await campo.evaluate(el => ({ estilo: getComputedStyle(el).outlineStyle, ancho: parseFloat(getComputedStyle(el).outlineWidth) }))
      expect(foco.estilo).toBe('solid')
      expect(foco.ancho).toBeGreaterThanOrEqual(2)
      if (width === 390) {
        const nav = await page.locator('.nav').boundingBox()
        const hoy = await page.getByRole('button', { name: 'Hoy', exact: true }).boundingBox()
        expect(hoy!.width / nav!.width).toBeGreaterThan(.95)
        const fila = await accion.locator('..').boundingBox()
        const boton = await accion.boundingBox()
        expect(boton!.width / fila!.width).toBeGreaterThan(.95)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  })
}
