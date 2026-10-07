// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PeticionRecuperacionNbmeZ, PREFIJO_FALSO, validarRecuperacionNbme } from './recuperacion-nbme'

const frases = ['Alpha is the first synthetic element.', 'Beta is the second synthetic element.',
  'Gamma is the third synthetic element.', 'Delta is the fourth synthetic element.']
const objetivo = 'Distinguish the synthetic element order.'
const fuente = [...frases, objetivo].join('\n')
function salida() {
  return { objetivo, ejercicios: [
    { tipo: 'completar', pregunta: '____ is the first synthetic element.', respuesta: 'Alpha', explicacion: frases[0], evidencia: frases[0] },
    { tipo: 'verdadero_falso', pregunta: frases[1], respuesta: 'Verdadero', explicacion: frases[1], evidencia: frases[1] },
    { tipo: 'seleccion', pregunta: '____ is the third synthetic element.', respuesta: 'Gamma', alternativas: ['Alpha', 'Beta', 'Gamma'], explicacion: frases[2], evidencia: frases[2] },
    { tipo: 'discriminar', pregunta: '____ is the fourth synthetic element.', respuesta: 'Delta', alternativas: ['Alpha', 'Delta'], explicacion: frases[3], evidencia: frases[3] },
  ] }
}
const raw = (value: unknown) => ({ response: JSON.stringify(value) })

describe('recuperación extractiva NBME', () => {
  it('valida los cuatro formatos, asigna IDs y conserva los fragmentos literales', () => {
    const resultado = validarRecuperacionNbme(raw(salida()), fuente)
    expect(resultado?.ejercicios.map(e => e.tipo)).toEqual(['completar', 'verdadero_falso', 'seleccion', 'discriminar'])
    expect(resultado?.ejercicios.map(e => e.id)).toEqual(['rec-1', 'rec-2', 'rec-3', 'rec-4'])
    expect(resultado?.ejercicios.map(e => e.evidencia)).toEqual(frases)
  })
  it('Falso exige negar toda la cita, sin inventar un distractor médico falso', () => {
    const value = salida()
    value.ejercicios[1] = { ...value.ejercicios[1], pregunta: PREFIJO_FALSO + frases[1], respuesta: 'Falso' }
    expect(validarRecuperacionNbme(raw(value), fuente)).not.toBeNull()
    value.ejercicios[1].pregunta = frases[1]
    expect(validarRecuperacionNbme(raw(value), fuente)).toBeNull()
  })
  it.each(['evidencia', 'explicacion', 'pregunta', 'respuesta'] as const)('rechaza %s no respaldada aunque las otras citas sean válidas', field => {
    const value = salida()
    value.ejercicios[0][field] = 'An invented synthetic assertion.'
    expect(validarRecuperacionNbme(raw(value), fuente)).toBeNull()
  })
  it('rechaza alternativas inventadas, duplicadas, ausentes o superpuestas a la correcta', () => {
    for (const alternativas of [['Alpha', 'Invented receptor', 'Gamma'], ['Gamma', 'Gamma', 'Beta'],
      ['Alpha', 'Beta', 'Delta'], ['Gamma', 'Gamma receptor', 'Beta']]) {
      const value = salida()
      value.ejercicios[2].alternativas = alternativas
      expect(validarRecuperacionNbme(raw(value), fuente, ['Gamma receptor'])).toBeNull()
    }
  })
  it('permite términos de las opciones originales sin tratarlos como evidencia verdadera', () => {
    const value = salida()
    value.ejercicios[2].alternativas = ['Alpha', 'Original synthetic option', 'Gamma']
    expect(validarRecuperacionNbme(raw(value), fuente, ['Original synthetic option'])).not.toBeNull()
    value.ejercicios[0].evidencia = 'Original synthetic option'
    expect(validarRecuperacionNbme(raw(value), fuente, ['Original synthetic option'])).toBeNull()
  })
  it('no acepta una recuperación monocorde ni un lote ilimitado', () => {
    const value = salida()
    expect(validarRecuperacionNbme(raw({ ...value, ejercicios: value.ejercicios.slice(0, 2) }), fuente)).toBeNull()
    expect(validarRecuperacionNbme(raw({ ...value, ejercicios: [...value.ejercicios, ...value.ejercicios] }), fuente)).toBeNull()
    expect(validarRecuperacionNbme(raw({ ...value, ejercicios: [value.ejercicios[1], value.ejercicios[1], value.ejercicios[1]] }), fuente)).toBeNull()
  })
  it('rechaza metadatos, objetivos inventados y JSON malformado', () => {
    expect(validarRecuperacionNbme(raw({ ...salida(), objetivo: 'An unsupported learning objective.' }), fuente)).toBeNull()
    expect(validarRecuperacionNbme(raw({ ...salida(), cambiar_clave: true }), fuente)).toBeNull()
    expect(validarRecuperacionNbme({ response: '{not JSON' }, fuente)).toBeNull()
  })
  it('no admite material clínico, letras nuevas ni instrucciones del cliente', () => {
    const input = { questionId: 'NBME27-P0001', revision: 'synthetic-r1', optionId: 'B' }
    expect(PeticionRecuperacionNbmeZ.safeParse(input).success).toBe(true)
    expect(PeticionRecuperacionNbmeZ.safeParse({ ...input, stem: fuente }).success).toBe(false)
    expect(PeticionRecuperacionNbmeZ.safeParse({ ...input, sourceRefs: [] }).success).toBe(false)
    expect(PeticionRecuperacionNbmeZ.safeParse({ ...input, revision: '../other' }).success).toBe(false)
  })
  it('una sola oración de mecanismo admite partes solapadas sin exigir hechos nuevos', () => {
    const sentence = 'The synthetic mediator Alpha activates Beta.'
    const clause = 'Alpha activates Beta.'
    const value = { objetivo: sentence, ejercicios: [
      { tipo: 'completar', pregunta: 'The synthetic mediator ____ activates Beta.', respuesta: 'Alpha', explicacion: sentence, evidencia: sentence },
      { tipo: 'verdadero_falso', pregunta: sentence, respuesta: 'Verdadero', explicacion: sentence, evidencia: sentence },
      { tipo: 'discriminar', pregunta: 'Alpha activates ____.', respuesta: 'Beta', alternativas: ['Alpha', 'Beta'], explicacion: clause, evidencia: clause },
    ] }
    expect(validarRecuperacionNbme(raw(value), sentence)).not.toBeNull()
  })
  it('un solo paso de procesamiento admite fragmentos menores sin afirmar otro mecanismo', () => {
    const sentence = 'The synthetic processor Alpha cleaves Beta into Gamma.'
    const clause = 'Alpha cleaves Beta into Gamma.'
    const value = { objetivo: sentence, ejercicios: [
      { tipo: 'completar', pregunta: 'The synthetic processor ____ cleaves Beta into Gamma.', respuesta: 'Alpha', explicacion: sentence, evidencia: sentence },
      { tipo: 'verdadero_falso', pregunta: sentence, respuesta: 'Verdadero', explicacion: sentence, evidencia: sentence },
      { tipo: 'seleccion', pregunta: 'Alpha cleaves ____ into Gamma.', respuesta: 'Beta', alternativas: ['Alpha', 'Beta', 'Gamma'], explicacion: clause, evidencia: clause },
    ] }
    expect(validarRecuperacionNbme(raw(value), sentence)).not.toBeNull()
  })
  it('atribuye cada cita a su fuente y no acepta citas construidas cruzando dos fuentes', () => {
    const sources = [{ fragment: [frases[0], frases[1], objetivo].join('\n'), title: 'Synthetic NBME', page: 1 },
      { fragment: [frases[2], frases[3]].join('\n'), title: 'Synthetic linked material', page: 2, conceptId: 'QA-C1' }]
    const result = validarRecuperacionNbme(raw(salida()), fuente, [], sources)
    expect(result?.ejercicios[2].source).toEqual({ title: 'Synthetic linked material', page: 2, conceptId: 'QA-C1' })
    const value = salida()
    const mixed = frases[1] + '\n' + frases[2]
    value.ejercicios[1] = { ...value.ejercicios[1], pregunta: mixed, evidencia: mixed, explicacion: mixed }
    expect(validarRecuperacionNbme(raw(value), fuente, [], sources)).toBeNull()
  })
})
