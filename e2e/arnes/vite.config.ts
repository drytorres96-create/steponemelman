import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * La aplicación de verdad con los proveedores sustituidos por dobles en memoria: sin
 * Supabase, sin Worker y sin corpus. Todo lo que se ve son datos sintéticos de escena.ts.
 */
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(AQUI, '../..')
const SUSTITUTOS: Record<string, string> = {
  'src/store/estado.tsx': 'falso-estado.tsx',
  'src/nbme/NbmeProvider.tsx': 'falso-nbme.tsx',
  'src/auth/AuthProvider.tsx': 'falso-auth.tsx',
  'src/semana/api.ts': 'falso-semana-api.ts',
  'src/plan/api.ts': 'falso-plan-api.ts',
  'src/data/corpus.ts': 'falso-corpus.ts',
}

export default defineConfig({
  root: AQUI,
  publicDir: path.join(REPO, 'public'),
  resolve: { alias: { '@app': path.join(REPO, 'src') } },
  server: { fs: { allow: [REPO] }, port: 5199, strictPort: true },
  plugins: [react(), {
    name: 'sustitutos',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0')) return null
      const resuelto = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resuelto) return null
      for (const [fin, falso] of Object.entries(SUSTITUTOS)) {
        if (resuelto.id.endsWith(path.join(REPO, fin))) return path.join(AQUI, falso)
      }
      return null
    },
  }],
})
