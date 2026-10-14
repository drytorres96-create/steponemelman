import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate entry and artifact. The normal application and Worker never load this fixture.
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server: { host: '0.0.0.0', port: 5180, strictPort: true },
  build: {
    target: 'es2022', outDir: 'dist-myqbank', assetsInlineLimit: 0,
    rollupOptions: { input: 'preview/myqbank/index.html' },
  },
})
