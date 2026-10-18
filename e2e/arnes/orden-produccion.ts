import { expect, type Page } from '@playwright/test'

/**
 * En el build, la hoja de entrada (con workspace.css, por AuthFrame) carga antes que la del chunk
 * de MyQBank (con layout.css); el servidor de desarrollo las inyecta al revés. Se reproduce el
 * orden de producción para que la prueba no dependa de cómo las ordene cada herramienta.
 */
export async function ordenDeProduccion(page: Page) {
  const movida = await page.evaluate(() => {
    const hoja = [...document.querySelectorAll('style[data-vite-dev-id]')]
      .find(s => (s.getAttribute('data-vite-dev-id') ?? '').endsWith('/myqbank/layout.css'))
    if (!hoja) return false
    document.head.appendChild(hoja)
    return true
  })
  expect(movida, 'layout.css debe estar inyectada para reproducir el orden del build').toBe(true)
}
