import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

test('un fallo al descargar una pantalla conserva la navegación y permite volver a Hoy', async ({ page }) => {
  await page.route('**/screens/Modulos.tsx*', route => route.abort())
  await page.goto('/?escena=abierto')
  await expect(page.locator('.anillo-doble')).toBeVisible()
  await page.evaluate(() => { location.hash = 'modulos' })
  await expect(page.getByRole('heading', { name: 'Esta pantalla no pudo mostrarse.' })).toBeVisible()
  await expect(page.locator('nav')).toBeVisible()
  await page.getByRole('button', { name: 'Volver a Hoy', exact: true }).click()
  await expect(page.locator('.anillo-doble')).toBeVisible()
})

test('navegar no acumula fondos animados invisibles y estudiar retira el paisaje', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-28T07:30:00-04:00') })
  await page.goto('/?escena=abierto')
  await expect(page.locator('.anillo-doble')).toBeVisible()
  for (const view of ['modulos', 'auditoria', 'ajustes', 'inicio', 'hoy']) {
    await page.evaluate(view => { location.hash = view }, view)
    const fondo = page.locator('.cinematic-backdrop')
    await expect.poll(() => fondo.locator('.cine-escena').count()).toBeLessThanOrEqual(2)
    await expect(fondo.locator('.cine-escena[data-activa="true"]')).toHaveCount(1)
  }
  const oculta = page.locator('.cine-escena[data-activa="false"]')
  await expect(oculta).toHaveCSS('visibility', 'hidden')
  await expect(oculta.locator('img')).toHaveCSS('animation-play-state', 'paused')
  await page.getByRole('button', { name: /(Empezar|Seguir con) las cajas/ }).click()
  await expect(page.locator('.cinematic-backdrop')).toHaveCount(0)
})

test('IndexedDB reutiliza una conexión para lecturas y escrituras concurrentes', async ({ page }) => {
  await page.goto('/?escena=abierto')
  const result = await page.evaluate(async modulePath => {
    const original = indexedDB.open.bind(indexedDB)
    let opens = 0
    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => { opens++; return original(...args) }
    const db = await import(modulePath)
    const key = 'qa:connection-reuse'
    await db.escribir(key, { value: 123 }, { estricto: true })
    const values = await Promise.all(Array.from({ length: 100 }, () => db.leer(key, { estricto: true })))
    await db.borrar([key])
    const deleted = await db.leer(key)
    return { opens, correct: values.every(v => v.value === 123), deleted }
  }, `/@fs${resolve('src/store/db.ts')}`)
  expect(result).toEqual({ opens: 1, correct: true, deleted: null })
})

test('una actualización desde otra pestaña no queda bloqueada por la conexión compartida', async ({ page }) => {
  await page.goto('/?escena=abierto')
  const result = await page.evaluate(async modulePath => {
    const db = await import(modulePath)
    await db.escribir('qa:upgrade', { value: 1 }, { estricto: true })
    return new Promise<string>((resolve, reject) => {
      const upgrade = indexedDB.open('step1-progreso', 2)
      upgrade.onerror = () => reject(upgrade.error)
      upgrade.onblocked = () => reject(new Error('La conexión de estudio bloqueó la actualización.'))
      upgrade.onsuccess = () => {
        const transaction = upgrade.result.transaction('kv', 'readonly').objectStore('kv').get('qa:upgrade')
        transaction.onerror = () => reject(transaction.error)
        transaction.onsuccess = () => { upgrade.result.close(); resolve(transaction.result.value === 1 ? 'ok' : 'lost') }
      }
    })
  }, `/@fs${resolve('src/store/db.ts')}`)
  expect(result).toBe('ok')
})
