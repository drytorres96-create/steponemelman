import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ERROR_TEMPORAL, instalarRed, leerBanco, leerRecuperacionLocal, retenerRespuesta } from './fixture'

const fase = process.env.RECUPERACION_CAPTURE === 'despues' ? 'despues' : 'antes'
const errorControlado = fase === 'antes' ? { error: 'Error del servidor.' } : ERROR_TEMPORAL
const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), fase)
const panel = (page: Page) => page.getByRole('region', { name: 'Recuperación del error NBME', exact: true })
async function foto(page: Page, width: number, nombre: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  fs.mkdirSync(destino, { recursive: true })
  await page.screenshot({ path: path.join(destino, `${width}-${nombre}.png`), fullPage: true, animations: 'disabled' })
}

for (const width of [390, 1280]) test(`comparación compilada ${fase} a ${width}px`, async ({ page, request, browser }) => {
  await page.setViewportSize({ width, height: 844 })
  const respuestaHTML = await request.get('/')
  const html = await respuestaHTML.text()
  expect(html).not.toContain('/@vite/client')
  expect(html).toMatch(/\/assets\/[^" ]+\.js/)
  const retenida = retenerRespuesta()
  const red = await instalarRed(page, async (route, numero) => numero === 1
    ? route.fulfill({ status: 503, headers: { 'Retry-After': '60' }, json: errorControlado })
    : retenida.manejar(route))
  try {
    await page.goto('/?escena=atraso&proveedor=nbme-real#progreso')
    await expect(page.locator('.medidor-detalle')).toContainText('80 % disponible')
    await foto(page, width, 'saldo-80')
    await page.getByText('Ponerme al día con la meta', { exact: true }).click()
    await page.getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
    await expect(page.locator('.nbme-feedback')).toBeVisible()
    const bancoAntes = await leerBanco(page)
    const generar = panel(page).getByRole('button', { name: 'Practicar este error con IA', exact: true })
    await generar.click()
    await expect(panel(page)).toContainText(errorControlado.error)
    await expect(panel(page)).toContainText('Puedes volver a intentarlo en 60 s.')
    await expect(panel(page)).toHaveAttribute('aria-busy', 'false')
    await foto(page, width, 'error-503')
    await generar.click()
    await retenida.inicio
    await expect(panel(page)).toHaveAttribute('aria-busy', 'true')
    if (fase === 'despues') {
      await expect(panel(page).getByRole('progressbar', { name: 'Generando ejercicios de recuperación', exact: true })).toBeVisible()
      await expect(panel(page)).toContainText('Puede tardar hasta un minuto.')
    }
    await foto(page, width, 'generando')
    await page.clock.fastForward(26_000)
    if (fase === 'antes') {
      await expect(panel(page)).toContainText('La IA tardó demasiado. Puedes seguir estudiando.')
      await expect(panel(page)).toHaveAttribute('aria-busy', 'false')
    } else {
      await expect(panel(page)).toHaveAttribute('aria-busy', 'true')
      await expect(panel(page).getByRole('progressbar', { name: 'Generando ejercicios de recuperación', exact: true })).toBeVisible()
    }
    await foto(page, width, 'espera-26s')
    expect(red.generaciones).toHaveLength(2)
    expect((await leerBanco(page)).attempts).toEqual(bancoAntes.attempts)
    expect(await leerRecuperacionLocal(page)).toEqual([])
    expect(red.errores).toEqual([])
    fs.writeFileSync(path.join(destino, `${width}-evidencia.json`), JSON.stringify({
      fase, width, browser: browser.version(),
      build: process.env.RECUPERACION_QA_BUILD || `/workspace/work/recuperacion-ia-qa-${fase}`,
      head: process.env.RECUPERACION_QA_HEAD || (fase === 'antes' ? '463c1771b12445110874f7b0ea28195703f133c2' : 'fuente final congelada'),
      javascript: html.match(/\/assets\/[^" ]+\.js/g),
      respuesta503Sintetica: errorControlado, saldoPorcentaje: 80, segundosSimulados: 26,
      generaciones: red.generaciones,
      intentoOriginalConservado: true, sinRecuperacionGuardadaDuranteEspera: true,
      compiladoSinHMR: true, sinErroresDePagina: true,
    }, null, 2) + '\n')
  } finally {
    retenida.soltar()
    if (red.generaciones.length > 1) await retenida.fin
  }
})
