// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { tieneClasificacionContradictoria } from './fuente-recuperacion-confiable'

// Synthetic agents only: private NBME material must never be copied into tests.
const depolarizante = 'Alpha is a depolarizing skeletal muscle relaxant.'
const noDepolarizante = 'Alpha is a nondepolarizing neuromuscular blocker.'

describe('consistencia de la fuente primaria para recuperación', () => {
  it('detecta clasificaciones opuestas del mismo agente sin elegir cuál prevalece', () => {
    expect(tieneClasificacionContradictoria(depolarizante, noDepolarizante)).toBe(true)
    expect(tieneClasificacionContradictoria(noDepolarizante, depolarizante)).toBe(true)
  })

  it.each(['nondepolarizing', 'non-depolarizing', 'non depolarizing', 'non\u2011depolarizing'])(
    'reconoce la variante %s de la clasificación explícita', clasificacion => {
      expect(tieneClasificacionContradictoria(depolarizante,
        `Alpha is a ${clasificacion} neuromuscular blocker.`)).toBe(true)
    })

  it('normaliza mayúsculas, espacios y guiones tipográficos del mismo nombre', () => {
    expect(tieneClasificacionContradictoria(
      'Synthetic\u2011alpha chloride is a potent depolarizing neuromuscular blocker.',
      '  SYNTHETIC-ALPHA   CHLORIDE is a non-depolarizing skeletal muscle relaxant.')).toBe(true)
  })

  it('encuentra afirmaciones directas en frases posteriores o líneas separadas', () => {
    expect(tieneClasificacionContradictoria('Introductory synthetic material. ' + depolarizante,
      'A synthetic heading\n' + noDepolarizante)).toBe(true)
  })

  it('incluye los nombres completos y las variantes directas de bloqueador', () => {
    expect(tieneClasificacionContradictoria(
      'Synthetic Alpha chloride is a short-acting depolarizing neuromuscular blocking agent.',
      'Synthetic Alpha chloride is a nondepolarizing muscle relaxant.')).toBe(true)
  })

  it('no considera equivalentes sujetos diferentes ni nombres parcialmente coincidentes', () => {
    expect(tieneClasificacionContradictoria(depolarizante,
      'Beta is a nondepolarizing neuromuscular blocker.')).toBe(false)
    expect(tieneClasificacionContradictoria(depolarizante,
      'Alpha chloride is a nondepolarizing neuromuscular blocker.')).toBe(false)
    expect(tieneClasificacionContradictoria(depolarizante,
      'Alphabet is a nondepolarizing neuromuscular blocker.')).toBe(false)
  })

  it('permite explicar ambos tipos con agentes distintos', () => {
    const material = depolarizante + ' Beta is a nondepolarizing neuromuscular blocker.'
    expect(tieneClasificacionContradictoria(material, material)).toBe(false)
  })

  it('no marca una clasificación idéntica aunque el vocabulario posterior mencione el otro tipo', () => {
    expect(tieneClasificacionContradictoria(depolarizante,
      'Alpha is a depolarizing neuromuscular blocker, unlike nondepolarizing blockers.')).toBe(false)
    expect(tieneClasificacionContradictoria(noDepolarizante,
      'Alpha is a non-depolarizing skeletal muscle relaxant.')).toBe(false)
  })

  it.each([
    'Alpha is not a nondepolarizing neuromuscular blocker.',
    'Alpha is a blocker that can resemble a nondepolarizing block during Phase II.',
    'Phase II is a nondepolarizing block.',
    'A Phase II block can have characteristics superficially resembling a nondepolarizing block.',
    'An incorrect statement describes Alpha as a nondepolarizing neuromuscular blocker.',
    'If Alpha were a nondepolarizing neuromuscular blocker, the synthetic result would differ.',
    'Is Alpha a nondepolarizing neuromuscular blocker?',
    '"Alpha is a nondepolarizing neuromuscular blocker" is an incorrect statement.',
  ])('no convierte una negación, comparación, condición o cita en clasificación directa: %s', objetivo => {
    expect(tieneClasificacionContradictoria(depolarizante, objetivo)).toBe(false)
  })

  it.each(['It', 'This', 'That', 'They', 'The drug', 'The agent', 'This drug', 'That agent'])(
    'no atribuye las clasificaciones de la referencia ambigua %s al mismo agente', sujeto => {
      expect(tieneClasificacionContradictoria(
        `${sujeto} is a depolarizing neuromuscular blocker.`,
        `${sujeto} is a nondepolarizing neuromuscular blocker.`)).toBe(false)
    })

  it.each([undefined, null, ''])('acepta un objetivo ausente: %j', objetivo => {
    expect(tieneClasificacionContradictoria(depolarizante, objetivo)).toBe(false)
  })

  it('no intenta resolver equivalencias de nombres ni validar otras afirmaciones médicas', () => {
    expect(tieneClasificacionContradictoria(depolarizante,
      'SyntheticBrand is a nondepolarizing neuromuscular blocker.')).toBe(false)
    expect(tieneClasificacionContradictoria('Alpha inhibits the synthetic receptor.',
      'Alpha stimulates the synthetic receptor.')).toBe(false)
  })
})
