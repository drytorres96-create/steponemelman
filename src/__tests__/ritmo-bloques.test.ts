import { describe, expect, it } from 'vitest'
import { estimarBloque } from '../lib/ritmo'
import { bloqueDelGuion } from '../lib/bloques'
import { nuevoProgreso } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'
import type { NbmeAttempt } from '../nbme/types'

const progreso = (duraciones: number[]) => ({ C: { ...nuevoProgreso('C'), intentos: duraciones.map(ms => ({ ms, resultado: 'correcta' } as Intento)) } })
const preguntas = (duraciones: number[]) => duraciones.map(durationMs => ({ durationMs } as NbmeAttempt))

describe('estimación de tiempo según práctica registrada', () => {
  it('no inventa tiempos si falta una muestra de cualquiera de los dos métodos', () => {
    expect(estimarBloque(progreso([60_000, 60_000, 60_000, 60_000]), [], { conceptos: 3, preguntas: 0 })).toBeNull()
    expect(estimarBloque(progreso(Array(5).fill(60_000)), preguntas([120_000]), { conceptos: 3, preguntas: 1 })).toBeNull()
    expect(estimarBloque({}, [], { conceptos: 0, preguntas: 0 })).toBeNull()
  })
  it('usa la mediana y excluye duraciones inválidas o interrupciones largas', () => {
    const normales = [60_000, 60_000, 60_000, 60_000, 60_000]
    const estimado = estimarBloque(progreso(normales), [], { conceptos: 3, preguntas: 0 })
    expect(estimado).toContain('≈ 2–4 min')
    expect(estimarBloque(progreso([...normales, 0, 1_000, NaN, Infinity, 3_600_000]), [], { conceptos: 3, preguntas: 0 })).toBe(estimado)
  })
  it('estima el bloque mixto y explicita que la lectura de explicaciones añade tiempo', () => {
    const estimado = estimarBloque(progreso(Array(5).fill(60_000)), preguntas(Array(5).fill(120_000)), { conceptos: 3, preguntas: 1 })
    expect(estimado).toContain('≈ 4–7 min')
    expect(estimado).toContain('las explicaciones pueden añadir tiempo')
  })
  it('los intentos pendientes de revisar no aportan una duración evaluada', () => {
    const p = progreso(Array(5).fill(60_000))
    p.C.intentos[0].resultado = 'revision'
    expect(estimarBloque(p, [], { conceptos: 1, preguntas: 0 })).toBeNull()
  })
})

describe('bloques sin cambiar el guion', () => {
  it('una pregunta cierra el tramo anterior y el final parcial conserva su tamaño real', () => {
    const guion = [{ kind: 'concepto' }, { kind: 'concepto' }, { kind: 'pregunta' }, { kind: 'concepto' }] as const
    const copia = structuredClone(guion)
    expect(bloqueDelGuion([...guion], 1)).toEqual({ numero: 1, total: 2, paso: 2, pasos: 3, inicio: 0, fin: 3 })
    expect(bloqueDelGuion([...guion], 3)).toEqual({ numero: 2, total: 2, paso: 1, pasos: 1, inicio: 3, fin: 4 })
    expect(guion).toEqual(copia)
  })
  it('los guiones vacíos y los cursores del cierre no fabrican pasos fuera del bloque', () => {
    expect(bloqueDelGuion([], 0)).toMatchObject({ numero: 0, total: 0, paso: 0, pasos: 0 })
    expect(bloqueDelGuion([{ kind: 'pregunta' }], 10)).toMatchObject({ numero: 1, total: 1, paso: 1, pasos: 1 })
  })
})
