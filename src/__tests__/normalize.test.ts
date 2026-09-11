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
  it('acepta presentación equivalente de términos breves sin exigir guiones ni un teclado griego', () => {
    expect(evaluarTexto('Shine Dalgarno', 'Shine-Dalgarno')).toBe('correcta')
    expect(evaluarTexto('Shine–Dalgarno', 'Shine-Dalgarno')).toBe('correcta')
    expect(evaluarTexto('TNF alfa', 'TNF-α')).toBe('correcta')
    expect(evaluarTexto('TNF-alpha', 'TNF-α')).toBe('correcta')
    expect(evaluarTexto('IFN gamma', 'IFN-γ')).toBe('correcta')
    expect(evaluarTexto('beta1', 'β1')).toBe('correcta')
    expect(evaluarTexto('IL‑12', 'IL-12')).toBe('correcta')
  })
  it('las variantes tipográficas no mezclan letras griegas, subtipos, cargas o fármacos', () => {
    for (const [a, b] of [
      ['TNF beta', 'TNF-α'], ['kappa', 'λ'], ['beta1', 'β2'],
      ['CD4-', 'CD4+'], ['IL-1', 'IL-12'], ['L-DOPA', 'D-DOPA'],
      ['hipertiroidismo', 'hipotiroidismo'], ['no TNF alfa', 'TNF-α'],
    ]) expect(['correcta', 'ortografia']).not.toContain(evaluarTexto(a, b))
    expect(evaluarTexto('TNF beta', 'TNF-α', [], ['TNF-β'])).toBe('incorrecta')
  })
  it('deja palabras no reconocidas por revisar en vez de adivinar su significado', () => {
    expect(evaluarTexto('fenoxibenzamin', 'fenoxibenzamina')).toBe('revision')
    expect(evaluarTexto('propranolol', 'fenoxibenzamina')).toBe('revision')
  })
  it('no acepta como ortografía una escritura que produce otro término médico', () => {
    // 'metimazol' frente a 'metronidazol' no debe pasar por errata
    expect(evaluarTexto('metimazol', 'metronidazol', [], ['metimazol'])).not.toBe('ortografia')
  })
  it('no califica una explicación incompleta por contar palabras compartidas', () => {
    expect(evaluarTexto('hipoalbuminemia', 'proteinuria, hipoalbuminemia, edema e hiperlipidemia')).toBe('revision')
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
  it('rechaza negaciones y contrastes inequívocos aunque se parezcan al texto esperado', () => {
    expect(evaluarTexto('no aumenta', 'aumenta')).toBe('incorrecta')
    expect(evaluarTexto('aumenta', 'no aumenta')).toBe('incorrecta')
    expect(evaluarTexto('disminuye', 'aumenta')).toBe('incorrecta')
    expect(evaluarTexto('hipotiroidismo', 'hipertiroidismo')).toBe('incorrecta')
    expect(evaluarTexto('IgM', 'IgG')).toBe('incorrecta')
  })
  it('preserva los símbolos que cambian el concepto médico', () => {
    for (const [a, b] of [['κ', 'λ'], ['β1', 'β2'], ['CD4+', 'CD4-'], ['<5', '>5'], ['↑', '↓']]) {
      expect(normalizar(a)).not.toBe(normalizar(b))
      expect(['correcta', 'ortografia']).not.toContain(evaluarTexto(a, b))
    }
    expect(evaluarTexto('C3', 'C4')).toBe('revision')
  })
  it('no acepta una frase con el término correcto y una negación adicional', () => {
    expect(evaluarTexto('No es enfermedad de Addison', 'enfermedad de Addison')).toBe('incorrecta')
    expect(evaluarTexto('Addison no es la respuesta', 'Addison')).toBe('revision')
  })
  it('valida unidad, escala y signos y acepta la unidad mostrada junto al campo', () => {
    expect(evaluarNumero('5 g', '5 mg')).toBe('incorrecta')
    expect(evaluarNumero('5', '5', null, 'mg')).toBe('correcta')
    expect(evaluarNumero('5 mg', '5', null, 'mg')).toBe('correcta')
    expect(evaluarNumero('5 g', '5', null, 'mg')).toBe('incorrecta')
    expect(evaluarNumero('5 mg/dL', '5', null, 'mg/dL')).toBe('correcta')
    expect(evaluarNumero('-5', '5', 0)).toBe('incorrecta')
    expect(evaluarNumero('5 mmol/L', '5 mg/dL')).toBe('incorrecta')
    expect(evaluarNumero('5 µg', '5 μg')).toBe('correcta')
    expect(evaluarNumero('5 mM', '5 MM')).toBe('incorrecta')
  })
  it('no extrae el primer número de una respuesta ambigua ni acepta infinito', () => {
    for (const entrada of ['5 o 10', '<5', '1/0', '5 mg 10', 'no 5', 'Infinity']) {
      expect(evaluarNumero(entrada, '5')).toBe('revision')
    }
    expect(evaluarNumero('5', '5', -1)).toBe('revision')
    expect(evaluarNumero('5 mg', '5')).toBe('revision')
  })
})
