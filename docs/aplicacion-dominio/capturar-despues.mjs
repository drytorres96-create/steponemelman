import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = process.env.APLICACION_CAPTURE_REPO ?? fileURLToPath(new URL('../..', import.meta.url))
const { chromium, expect } = await import(pathToFileURL(path.join(REPO, 'node_modules/@playwright/test/index.mjs')).href)
const BASE = process.env.APLICACION_CAPTURE_URL ?? 'http://127.0.0.1:5319'
const OUT = process.env.APLICACION_CAPTURE_OUT ?? path.join(REPO,'docs/aplicacion-dominio/despues')
const BUILD = process.env.APLICACION_CAPTURE_BUILD
if(!BUILD)throw new Error('Indica APLICACION_CAPTURE_BUILD, el directorio compilado final')
const AHORA = '2026-10-05T11:30:00Z'
const CASO = 'A simulated operator has a blue token and an amber counter below its threshold. Which gate action follows from the demonstration rule?'
const BASE_PREGUNTA = 'In the demonstration protocol, which complete rule governs the blue token?'
const CORRECTA = 'Keep gate one closed until the amber counter reaches its threshold.'
const html = await (await fetch(BASE)).text()
if (html.includes('/@vite/client') || !/\/assets\/[^"\s]+\.js/.test(html)) {
  throw new Error('La captura exige fuente compilada: no se permite el servidor HMR.')
}
if (BUILD && await readFile(path.join(BUILD, 'index.html'), 'utf8') !== html) {
  throw new Error('El servidor no corresponde al directorio compilado solicitado.')
}
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' })
const evidencia = { escena: 'aplicacion', contenido: 'Reglas inventadas de fichas y compuertas. Sin material clínico.',
  hora: AHORA, url: BASE, bundle: html.match(/\/assets\/[^"\s]+\.js/)?.[0], capturas: [] }
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, locale: 'es-ES', timezoneId: 'America/New_York', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errores = []
    page.on('pageerror', e => errores.push(String(e)))
    await page.clock.install({ time: new Date(AHORA) })
    await page.route('**/*', route => {
      const u = new URL(route.request().url())
      if (!['localhost', '127.0.0.1'].includes(u.hostname)) return route.abort()
      if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Synthetic backend unavailable.' } })
      return route.continue()
    })
    const capturar = async nombre => {
      await expect(page.locator('.synapse-heading[data-animating="true"]')).toHaveCount(0)
      await page.mouse.move(0, 0)
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); scrollTo(0, 0) })
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(errores).toEqual([])
      const archivo = `${nombre}-${width}.png`
      await page.screenshot({ path: path.join(OUT, archivo), fullPage: true })
      evidencia.capturas.push({ archivo, width, pregunta: await page.locator('.pregunta').innerText() })
    }
    const elegir = async texto => {
      await page.getByRole('radiogroup', { name: 'Opciones de respuesta', exact: true }).getByRole('radio', { name: texto }).click()
      await page.getByRole('button', { name: 'Comprobar respuesta', exact: true }).click()
    }
    await page.goto(`${BASE}/?escena=aplicacion#hoy`)
    await page.getByRole('button', { name: 'Empezar las cajas', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(CASO)
    await capturar('caso')
    await elegir('Open gate one before the counter reaches its threshold.')
    await page.getByRole('button', { name: 'Siguiente pregunta', exact: true }).click()
    await expect(page.getByText('Corrección · repaso de un fallo', { exact: true })).toBeVisible()
    await expect(page.locator('.pregunta')).toHaveText(CASO)
    await capturar('correccion')
    await elegir(CORRECTA)
    const progresoAntes = await page.evaluate(() => window.__leerProgresoSintetico().progreso)
    await page.getByRole('button', { name: 'Necesito una pausa', exact: true }).click()
    await page.getByRole('region', { name: 'Tu sesión guardada', exact: true }).getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(CASO)
    await expect(page.locator('.retro')).toContainText(CORRECTA)
    expect(await page.evaluate(() => window.__leerProgresoSintetico().progreso)).toEqual(progresoAntes)
    await capturar('retoma')
    await page.goto(`${BASE}/?escena=aplicacion&retomar=base-guardada#hoy`)
    await page.getByRole('region', { name: 'Tu sesión guardada', exact: true }).getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
    await expect(page.locator('.pregunta')).toHaveText(BASE_PREGUNTA)
    await expect(page.locator('.avance')).toHaveAttribute('aria-label', 'Pregunta 2 de 2')
    await capturar('mcq')
    await context.close()
  }
  await writeFile(path.join(OUT, 'evidencia.json'), `${JSON.stringify(evidencia, null, 2)}\n`)
  console.log(JSON.stringify({ ok: true, capturas: evidencia.capturas.length, carpeta: OUT, bundle: evidencia.bundle }))
} finally {
  await browser.close()
}
