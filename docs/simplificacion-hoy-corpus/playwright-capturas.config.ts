import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const build = process.env.HOY_QA_BUILD ?? '/workspace/work/hoy-faq-qa-antes'
export default defineConfig({
  testDir: path.resolve('docs/simplificacion-hoy-corpus'),
  testMatch: 'capturas.spec.ts',
  workers: 1, fullyParallel: false, retries: 0,
  timeout: 60_000, expect: { timeout: 10_000 }, reporter: 'list',
  use: { baseURL: 'http://localhost:5311', locale: 'es-ES', timezoneId: 'America/New_York', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } }],
  webServer: { command: `npx vite preview --host 127.0.0.1 --port 5311 --strictPort --outDir ${build}`,
    cwd: process.cwd(), url: 'http://localhost:5311', reuseExistingServer: false, timeout: 60_000 },
})
