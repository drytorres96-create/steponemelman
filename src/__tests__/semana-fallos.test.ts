import { describe, expect, it } from 'vitest'
import { errorDominante, fallosDeSemana } from '../lib/semana-fallos'
import type { Intento, ProgresoConcepto, TipoError } from '../srs/tipos'

/**
 * Lo que sale del navegador cuando se pide una lectura de la semana. Dos garantías:
 * que no salga nada que no sea un identificador publicado y tres cifras, y que el orden
 * ponga delante lo que de verdad está costando.
 */
const HORA = 3_600_000
const LUNES = Date.now() - 72 * HORA

const intento = (ts: number, resultado: Intento['resultado'], tipo: TipoError = 'ninguno'): Intento => ({
  attempt_id: `a-${ts}`, session_id: 's', ts, calificacion: resultado === 'correcta' ? 3 : 1, resultado,
  interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0, ms: 1000,
  tipo_error: tipo, confianza_declarada: null,
})
const progreso = (id: string, intentos: Intento[]): ProgresoConcepto => ({
  concept_id: id, estado: 'en_aprendizaje', dificultad: 5, estabilidad: 1,
  ultimo: null, proxima: null, intentos, aciertos: 0, fallos: 0, dominado_en: null,
})

describe('fallos de la semana', () => {
  it('solo cuenta lo de esta semana y deja fuera lo que no se falló', () => {
    const fallos = fallosDeSemana([
      progreso('viejo', [intento(LUNES - 48 * HORA, 'incorrecta', 'desconocimiento')]),
      progreso('limpio', [intento(LUNES + HORA, 'correcta')]),
      progreso('duro', [intento(LUNES + HORA, 'incorrecta', 'confusion_conceptos'), intento(LUNES + 2 * HORA, 'correcta')]),
    ], LUNES)
    expect(fallos).toEqual([{ id: 'duro', fallos: 1, aciertos: 1, error: 'confusion_conceptos' }])
  })

  it('una respuesta por revisar no es un fallo', () => {
    expect(fallosDeSemana([progreso('c', [intento(LUNES + HORA, 'revision', 'error_por_revisar')])], LUNES)).toEqual([])
  })

  it('ordena por fallos y, a igualdad, por menos aciertos', () => {
    const dos = [intento(LUNES + HORA, 'incorrecta', 'desconocimiento'), intento(LUNES + 2 * HORA, 'parcial', 'recuerdo_incompleto')]
    const fallos = fallosDeSemana([
      progreso('con-aciertos', [...dos, intento(LUNES + 3 * HORA, 'correcta')]),
      progreso('sin-aciertos', dos),
      progreso('uno', [intento(LUNES + HORA, 'incorrecta', 'desconocimiento')]),
    ], LUNES)
    expect(fallos.map(f => f.id)).toEqual(['sin-aciertos', 'con-aciertos', 'uno'])
  })

  it('descarta lo que ya no está publicado y respeta el máximo', () => {
    const muchos = Array.from({ length: 25 }, (_, n) => progreso(`c${n}`, [intento(LUNES + HORA, 'incorrecta', 'desconocimiento')]))
    expect(fallosDeSemana(muchos, LUNES, new Set(['c1', 'c2']))).toHaveLength(2)
    expect(fallosDeSemana(muchos, LUNES)).toHaveLength(18)
  })

  it('el error dominante es el más repetido, y en empate el más reciente', () => {
    expect(errorDominante([intento(1, 'incorrecta', 'desconocimiento'), intento(2, 'incorrecta', 'confusion_conceptos'), intento(3, 'incorrecta', 'confusion_conceptos')])).toBe('confusion_conceptos')
    expect(errorDominante([intento(1, 'incorrecta', 'desconocimiento'), intento(2, 'incorrecta', 'error_numerico')])).toBe('error_numerico')
    expect(errorDominante([])).toBe('desconocimiento')
  })
})
