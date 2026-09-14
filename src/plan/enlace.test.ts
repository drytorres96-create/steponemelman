import { describe, expect, it } from 'vitest'
import { enlazarCheckpoints, sesionDeCheckpoint, sesionesDeLaSemana, tituloDeCheckpoint } from './enlace'
import type { PlanCheckpoint } from './tipos'
import type { SesionSemanal } from '../semana/tipos'

/**
 * El enlace entre el plan y las sesiones preparadas es lo que evita marcar dos
 * veces la misma cosa, así que lo que se comprueba aquí es sobre todo cuándo NO
 * empareja: abrir la sesión equivocada cuesta más que no abrir ninguna.
 */

let siguiente = 1
const cp = (extra: Partial<PlanCheckpoint> = {}): PlanCheckpoint => ({
  id: siguiente, idx: siguiente++, dia: 1, kind: 'tarjetas',
  label: 'StepOneMelman · Sesión de la semana 1/4 · Farmacología endocrina · Tiroides y suprarrenal (15 conceptos + 5 preguntas, 20 pasos)',
  done: false, doneAt: null, ...extra,
})

const sesion = (extra: Partial<SesionSemanal> = {}): SesionSemanal => ({
  id: `sesion-${extra.titulo ?? extra.dia ?? '1'}`, semana: 'S2', semanaInicio: '2026-09-14',
  dia: 1, orden: 1, titulo: 'Farmacología endocrina 1/4 · Tiroides y suprarrenal', subtitulo: null,
  guion: [{ kind: 'concepto', id: 'CPT-1' }], presupuestoMin: 30, estado: 'pendiente',
  cursor: 0, nbmeSessionId: null, completadaEn: null, ...extra,
})

describe('enlace entre el plan y las sesiones preparadas', () => {
  it('reconoce sólo las etiquetas de sesión preparada', () => {
    expect(tituloDeCheckpoint(cp())).toBe('Farmacología endocrina · Tiroides y suprarrenal (15 conceptos + 5 preguntas, 20 pasos)')
    expect(tituloDeCheckpoint(cp({ label: 'AMBOSS Psiquiatría · 14 preguntas · modo examen' }))).toBeNull()
    // Una tanda suelta de tarjetas lleva el nombre de la app pero no es una sesión.
    expect(tituloDeCheckpoint(cp({ label: 'StepOneMelman · Cardio · 15' }))).toBeNull()
    expect(tituloDeCheckpoint(cp({ label: 'Arranque (mínimo) · StepOneMelman 5 · Endocrino · Farmacología' }))).toBeNull()
  })

  it('empareja por día dentro de la semana del plan', () => {
    const s = sesion({ dia: 3 })
    expect(sesionDeCheckpoint(cp({ dia: 3 }), [s])).toBe(s)
    // Mismo título, otro día: el día es el criterio, no el texto.
    expect(sesionDeCheckpoint(cp({ dia: 1 }), [s])).toBeNull()
  })

  it('devuelve null para los checkpoints que no son sesión preparada', () => {
    const s = sesion()
    expect(sesionDeCheckpoint(cp({ label: 'AMBOSS Female Repro · 25 preguntas' }), [s])).toBeNull()
    expect(sesionDeCheckpoint(cp({ kind: 'descanso', label: 'Descanso' }), [s])).toBeNull()
    expect(sesionDeCheckpoint(cp(), [])).toBeNull()
  })

  it('usa el título para desempatar cuando el día tiene dos sesiones', () => {
    const farmaco = sesion({ dia: 2, titulo: 'Farmacología endocrina 1/4 · Tiroides y suprarrenal' })
    const inmuno = sesion({ dia: 2, titulo: 'Inmunología 2/3 · Complemento' })
    expect(sesionDeCheckpoint(cp({ dia: 2 }), [farmaco, inmuno])).toBe(farmaco)
    expect(sesionDeCheckpoint(cp({ dia: 2,
      label: 'StepOneMelman · Sesión de la semana 2/3 · Inmunología · Complemento' }), [farmaco, inmuno])).toBe(inmuno)
  })

  it('no adivina cuando dos sesiones del mismo día empatan en el título', () => {
    const a = sesion({ dia: 4, titulo: 'Bioquímica · vía A' })
    const b = sesion({ dia: 4, titulo: 'Bioquímica · vía B' })
    expect(sesionDeCheckpoint(cp({ dia: 4,
      label: 'StepOneMelman · Sesión de la semana 1/2 · Bioquímica · otra cosa' }), [a, b])).toBeNull()
  })

  it('no empareja dos veces la misma sesión cuando hay dos checkpoints el mismo día', () => {
    const farmaco = sesion({ dia: 1, titulo: 'Farmacología endocrina 1/4 · Tiroides y suprarrenal' })
    const inmuno = sesion({ dia: 1, titulo: 'Inmunología 2/3 · Complemento' })
    const primero = cp({ dia: 1 })
    const segundo = cp({ dia: 1, label: 'StepOneMelman · Sesión de la semana 2/3 · Inmunología · Complemento' })
    const enlaces = enlazarCheckpoints([primero, segundo], [farmaco, inmuno])
    expect(enlaces.get(primero.id)).toBe(farmaco)
    expect(enlaces.get(segundo.id)).toBe(inmuno)

    // Con una sola sesión el segundo checkpoint se queda sin enlace en vez de repetirla.
    const solos = enlazarCheckpoints([primero, segundo], [farmaco])
    expect(solos.get(primero.id)).toBe(farmaco)
    expect(solos.has(segundo.id)).toBe(false)
    expect(new Set(solos.values()).size).toBe(solos.size)
  })

  it('acota las sesiones a la semana del plan', () => {
    const estaSemana = sesion({ semanaInicio: '2026-09-14' })
    const laQueViene = sesion({ semanaInicio: '2026-09-21', semana: 'S3' })
    expect(sesionesDeLaSemana([estaSemana, laQueViene], '2026-09-14', '2026-09-19')).toEqual([estaSemana])
  })
})
