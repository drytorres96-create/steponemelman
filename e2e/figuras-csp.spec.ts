import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('las figuras descargadas se decodifican con la política de seguridad de producción', async ({ page }) => {
  const headers = readFileSync('public/_headers', 'utf8')
  const policy = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1]
  expect(policy).toBeTruthy()
  // PNG sintético: la comprobación no descarga ni publica material del banco.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9WQAAAAASUVORK5CYII=', 'base64')
  await page.route('**/figura-csp.png', route => route.fulfill({ contentType: 'image/png', body: png }))
  await page.route('**/figura-csp.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `fetch('/figura-csp.png').then(response => response.blob()).then(blob => {
      document.querySelector('img').src = URL.createObjectURL(blob)
    })`,
  }))
  await page.route('**/figura-csp', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', headers: { 'Content-Security-Policy': policy! },
    body: '<!doctype html><html><body><img alt="Figura sintética"><script src="/figura-csp.js"></script></body></html>',
  }))
  await page.goto('/figura-csp')
  const image = page.getByRole('img', { name: 'Figura sintética' })
  await expect(image).toHaveAttribute('src', /^blob:/)
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
})
