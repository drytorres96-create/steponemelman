import { describe, it, expect } from 'vitest'
import { normalizar, distancia, evaluarTexto, evaluarNumero } from '../lib/normalize'

describe('normalización de respuestas', () => {
  it('ignora acentos, mayúsculas y puntuación', () => {
    expect(normalizar('Síndrome de Sheehan.')).toBe('sindrome de sheehan')
  })
  it('acepta la respuesta canónica exacta', () => {
    expect(evaluarTexto('addison', 'Addison')).toBe('correcta')
  })
  it('acepta un sinónimo declarado', () => {
    expect(evaluarTexto('hipoadrenalismo primario', 'enfermedad de Addison', ['hipoadrenalismo primario'])).toBe('correcta')
  })
  it('distingue error ortográfico de error conceptual', () => {
    expect(evaluarTexto('fenoxibenzamin', 'fenoxibenzamina')).toBe('ortografia')
    expect(evaluarTexto('propranolol', 'fenoxibenzamina')).toBe('incorrecta')
  })
  it('no acepta como ortografía una escritura que produce otro término médico', () => {
    // 'metimazol' frente a 'metronidazol' no debe pasar por errata
    expect(evaluarTexto('metimazol', 'metronidazol', [], ['metimazol'])).not.toBe('ortografia')
  })
  it('marca como parcial una respuesta incompleta', () => {
    expect(evaluarTexto('hipoalbuminemia', 'proteinuria, hipoalbuminemia, edema e hiperlipidemia')).toBe('parcial')
  })
  it('la distancia de edición es simétrica y correcta', () => {
    expect(distancia('casa', 'caza')).toBe(1)
    expect(distancia('caza', 'casa')).toBe(1)
  })
  it('respeta la tolerancia numérica', () => {
    expect(evaluarNumero('3.78', '3.78', 0.05)).toBe('correcta')
    expect(evaluarNumero('3.9', '3.78', 0.05)).toBe('parcial')
    expect(evaluarNumero('12', '3.78', 0.05)).toBe('incorrecta')
  })
  it('entiende fracciones', () => {
    expect(evaluarNumero('1/4', '0.25', 0.01)).toBe('correcta')
  })
})
