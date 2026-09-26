// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { guardarProgresoVinetas, leerProgresoVinetas, leerVineta, progresoVacio, seleccionar, SET_VINETAS, type Vineta } from './modelo'
import { filaSintetica } from '../__tests__/vinetas-fixtures'

beforeEach(() => localStorage.clear())

describe('lectura de viñetas', () => {
  it('lee una fila completa', () => {
    const v = leerVineta(filaSintetica(1))
    expect(v).toMatchObject({ id: 'qa-1', position: 1, reviewed: false, discipline: 'Bioquímica', answer: 'C' })
    expect(v?.options.map(o => o.id)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(Object.keys(v!.explanation.distractors).sort()).toEqual(['A', 'B', 'D', 'E'])
  })

  it('descarta la viñeta entera si le falta cualquier pieza', () => {
    const cambios: ((f: ReturnType<typeof filaSintetica>) => void)[] = [
      f => { f.payload.options = f.payload.options.slice(0, 4) },
      f => { f.payload.options[1].id = 'X' },
      f => { f.payload.answer = 'F' },
      f => { delete (f.payload.explanation.distractors as Record<string, string>).A },
      f => { f.payload.explanation.clues = [] },
      f => { f.payload.explanation.pattern = '  ' },
      f => { f.payload.discipline = 'Cardiología' },
      f => { f.payload.schemaVersion = 2 },
      f => { f.payload.stem = '' },
    ]
    for (const cambio of cambios) {
      const fila = filaSintetica(2)
      cambio(fila)
      expect(leerVineta(fila)).toBeNull()
    }
    expect(leerVineta(null)).toBeNull()
    expect(leerVineta({ id: 'x', position: 'uno', payload: {} })).toBeNull()
  })
})

describe('progreso del piloto', () => {
  it('se guarda por cuenta y por conjunto, y una copia ilegible empieza vacía', () => {
    const p = { respuestas: { 'qa-1': { opcion: 'B', correcta: false, ts: 5 } }, dudosas: { 'qa-2': 7 } }
    guardarProgresoVinetas('cuenta-a', p)
    expect(leerProgresoVinetas('cuenta-a')).toEqual(p)
    expect(leerProgresoVinetas('cuenta-b')).toEqual(progresoVacio())
    expect(localStorage.getItem(`step1-vinetas:cuenta-a:${SET_VINETAS}`)).not.toBeNull()
    localStorage.setItem(`step1-vinetas:cuenta-a:${SET_VINETAS}`, '{ roto')
    expect(leerProgresoVinetas('cuenta-a')).toEqual(progresoVacio())
    localStorage.setItem(`step1-vinetas:cuenta-a:${SET_VINETAS}`, JSON.stringify({ respuestas: { x: { opcion: 1 } }, dudosas: { y: 'no' } }))
    expect(leerProgresoVinetas('cuenta-a')).toEqual(progresoVacio())
  })
})

describe('qué abre cada botón', () => {
  const vinetas = [filaSintetica(3, 'Microbiología'), filaSintetica(1), filaSintetica(2, 'Microbiología'), filaSintetica(0)]
    .map(leerVineta) as Vineta[]
  const progreso = { respuestas: { 'qa-0': { opcion: 'C', correcta: true, ts: 1 }, 'qa-2': { opcion: 'A', correcta: false, ts: 2 } }, dudosas: { 'qa-3': 3, 'qa-0': 4 } }

  it('por disciplina y todas: sólo las pendientes, en el orden del conjunto', () => {
    expect(seleccionar(vinetas, progreso, 'Bioquímica').map(v => v.id)).toEqual(['qa-1'])
    expect(seleccionar(vinetas, progreso, 'Microbiología').map(v => v.id)).toEqual(['qa-3'])
    expect(seleccionar(vinetas, progreso, 'todas').map(v => v.id)).toEqual(['qa-1', 'qa-3'])
  })

  it('las falladas y las dudosas, respondidas o no', () => {
    expect(seleccionar(vinetas, progreso, 'falladas').map(v => v.id)).toEqual(['qa-2'])
    expect(seleccionar(vinetas, progreso, 'dudosas').map(v => v.id)).toEqual(['qa-0', 'qa-3'])
  })
})
