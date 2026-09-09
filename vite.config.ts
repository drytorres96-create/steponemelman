import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: { output: { manualChunks: undefined, inlineDynamicImports: true } },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
})
