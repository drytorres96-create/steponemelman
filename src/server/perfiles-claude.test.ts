import { expect, it } from 'vitest'
import { clavePerfil, PERFILES_CLAUDE } from './perfiles-claude'

it('no reutiliza caché al cambiar modelo, esfuerzo, pensamiento o límites', () => {
  const original = PERFILES_CLAUDE.entender
  const clave = JSON.stringify(clavePerfil(original))
  for (const cambio of [
    { modelo: 'claude-sonnet-5-5' as const }, { esfuerzo: 'low' as const },
    { pensamiento: 'sin_pensar' as const }, { maxTokens: original.maxTokens + 100 }, { tiempoMs: original.tiempoMs + 1000 },
  ]) expect(JSON.stringify(clavePerfil({ ...original, ...cambio }))).not.toBe(clave)
  expect(JSON.stringify(clavePerfil({ ...original }))).toBe(clave)
})
