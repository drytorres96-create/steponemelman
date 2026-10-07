import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

// Immutable build of the synthetic harness: editing source during a team review
// cannot navigate a running test through Vite HMR. It uses no real services.
export default defineConfig({
  testDir: path.resolve(process.env.NBME_CAPTURE_CONTRAST || process.env.NBME_CAPTURE_META ? 'docs/flujo-recuperacion-nbme' : 'e2e'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, workers: 1, retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5288', locale: 'es-ES', timezoneId: 'America/New_York', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 },
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } }],
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 5288 --strictPort --outDir ../nbme-qa-dist',
    cwd: process.cwd(), url: 'http://localhost:5288', reuseExistingServer: false, timeout: 60_000 },
})
