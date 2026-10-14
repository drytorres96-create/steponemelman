import { defineConfig } from '@playwright/test'

export default defineConfig({
  outputDir: 'test-results/myqbank',
  testDir: 'e2e-myqbank', timeout: 45_000, fullyParallel: false, workers: 1,
  forbidOnly: !!process.env.CI, reporter: 'list',
  use: {
    baseURL: 'http://localhost:5180', locale: 'en-US', reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: { command: 'npm run dev:myqbank', url: 'http://localhost:5180/preview/myqbank/', reuseExistingServer: !process.env.CI },
})
