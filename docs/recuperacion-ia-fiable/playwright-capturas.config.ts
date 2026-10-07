import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const carpeta = path.dirname(fileURLToPath(import.meta.url))

const fase = process.env.RECUPERACION_CAPTURE === 'despues' ? 'despues' : 'antes'
const puerto = fase === 'antes' ? 5321 : 5322
const build = process.env.RECUPERACION_QA_BUILD || `/workspace/work/recuperacion-ia-qa-${fase}`
if (!/^\/[a-zA-Z0-9/_-]+$/.test(build)) throw new Error('La carpeta de build debe ser una ruta absoluta sin espacios.')

export default defineConfig({
  testDir: carpeta,
  testMatch: 'capturas.spec.ts',
  outputDir: path.join(carpeta, 'resultados', fase),
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${puerto}`,
    locale: 'es-ES',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' },
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${puerto} --strictPort --outDir ${build}`,
    url: `http://127.0.0.1:${puerto}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
