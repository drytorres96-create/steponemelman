import { describe, it, expect, vi, afterEach } from 'vitest'
import { mensajeSeguro, registrar } from './registro'
import { MOTIVOS } from './worker'

afterEach(() => vi.restoreAllMocks())

describe('registro del Worker', () => {
  it('nunca deja pasar una credencial al log', () => {
    const texto = mensajeSeguro(new Error(
      'fetch failed apikey=sb_publishable_ABCdef123456 Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef'))
    expect(texto).not.toMatch(/sb_publishable_ABCdef/)
    expect(texto).not.toMatch(/eyJhbGciOi/)
    expect(texto).toContain('[oculto]')
  })
  it('recorta mensajes desmesurados', () => {
    expect(mensajeSeguro(new Error('x'.repeat(5000))).length).toBeLessThanOrEqual(300)
  })
  it('escribe una sola línea con la etiqueta del punto de fallo', () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    registrar('nbme/preguntas', new Error('boom'), { preguntas: 3 })
    expect(espia).toHaveBeenCalledTimes(1)
    const linea = JSON.parse(espia.mock.calls[0][0] as string)
    expect(linea).toMatchObject({ evento: 'fallo', donde: 'nbme/preguntas', preguntas: 3 })
    expect(linea.mensaje).toContain('boom')
  })
  it('cada motivo del coach tiene un texto propio y accionable', () => {
    const textos = Object.values(MOTIVOS)
    expect(new Set(textos).size).toBe(textos.length)
    for (const t of textos) expect(t.length).toBeGreaterThan(20)
  })
})
