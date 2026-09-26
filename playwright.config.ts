import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas de navegador del recorrido de estudio. Arrancan la aplicación de verdad con
 * dobles en memoria (e2e/arnes) y datos sintéticos: ni Supabase, ni Worker, ni corpus.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5199',
    locale: 'es-ES',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 },
    // En CI se instala el Chromium de esta versión de Playwright. En un equipo con otro ya
    // instalado, CHROMIUM_PATH apunta a él en lugar de descargarlo.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } }],
  webServer: {
    command: 'npx vite --config e2e/arnes/vite.config.ts',
    url: 'http://localhost:5199/?escena=abierto',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
