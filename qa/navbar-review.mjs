import { mkdir, access, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

/**
 * Visual review uses the exact same App and synthetic providers as e2e.
 * A second checkout provides the before state. All requests stay on localhost;
 * no signed URLs, production account or private study material can be loaded.
 */
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseline = path.join(repo, 'work/navbar-before')
const output = path.join(repo, 'work/navbar-review')
await mkdir(output, { recursive: true })
try { await access(path.join(baseline, 'node_modules')) } catch {
  await symlink(path.join(repo, 'node_modules'), path.join(baseline, 'node_modules'), 'dir')
}
const browser = await chromium.launch()
const errors = []
const captures = []

async function captureTree(root, phase, port) {
  const server = await createServer({
    configFile: path.join(root, 'e2e/arnes/vite.config.ts'),
    server: { port, strictPort: true, host: '127.0.0.1' },
  })
  await server.listen()
  try {
    const viewports = [{ width: 390, height: 844 }, { width: 1280, height: 900 }]
    if (phase === 'despues') viewports.push({ width: 844, height: 390 })
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport, reducedMotion: 'reduce', locale: 'es-ES', timezoneId: 'America/New_York',
        hasTouch: viewport.width < 1000, isMobile: viewport.width < 1000,
      })
      try {
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(phase + ': ' + String(error)))
        await page.route('**/*', route => {
          const url = new URL(route.request().url())
          return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
        })
        await page.clock.install({ time: new Date('2026-10-05T07:30:00-04:00') })
        await page.goto(`http://127.0.0.1:${port}/?escena=abierto`)
        await page.getByRole('heading', { name: 'Hoy', exact: true }).waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.clock.runFor(700)
        const menu = page.locator('.menu-cuenta')
        for (const state of ['cerrado', 'abierto']) {
          if (viewport.height === 390 && state === 'cerrado') continue
          if (state === 'abierto') {
            await menu.locator('summary').click()
            await page.clock.runFor(350)
            await menu.locator('.menu-cuenta-opciones').waitFor()
          }
          const name = `${phase}-${viewport.width}x${viewport.height}-${state}`
          await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled' })
          const jpeg = await page.screenshot({
            type: 'jpeg', quality: 72, animations: 'disabled',
            clip: { x: 0, y: 0, width: viewport.width, height: Math.min(viewport.height, 740) },
          })
          await writeFile(path.join(output, name + '.jpg'), jpeg)
          const encoded = jpeg.toString('base64')
          const chunk = 6000
          for (let i = 0; i < encoded.length; i += chunk) {
            console.log(`NAVBAR_CHUNK ${name} ${i / chunk} ${encoded.slice(i, i + chunk)}`)
          }
          captures.push(name)
        }
      } finally { await context.close() }
    }
  } finally { await server.close() }
}

try {
  await captureTree(baseline, 'antes', 5200)
  await captureTree(repo, 'despues', 5201)
  await writeFile(path.join(output, 'review.json'), JSON.stringify({ baseline: 'ef9e3c21514b11a9fd4791cce618e03acdae244b', captures, errors }, null, 2))
  console.log('NAVBAR_REVIEW ' + JSON.stringify({ captures, errors }))
  if (errors.length) throw new Error('Errors in the synthetic visual review: ' + errors.join('; '))
} finally { await browser.close() }
