import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: { output: { manualChunks(id) {
      if (!id.includes('/node_modules/')) return
      if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react'
      if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase'
      if (id.includes('/node_modules/zod/')) return 'vendor-validation'
    } } },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
})
