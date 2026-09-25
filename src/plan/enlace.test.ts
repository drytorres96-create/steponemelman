import { describe, expect, it } from 'vitest'
import { sesionesDeLaSemana, tituloDeCheckpoint } from './enlace'
import type { PlanCheckpoint } from './tipos'
import type { SesionSemanal } from '../semana/tipos'

/**
 * Lo que el plan y las sesiones preparadas comparten: reconocer un checkpoint de
 * sesión preparada y acotar las sesiones a la semana del plan.
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

describe('el plan y las sesiones preparadas', () => {
  it('reconoce sólo las etiquetas de sesión preparada', () => {
    expect(tituloDeCheckpoint(cp())).toBe('Farmacología endocrina · Tiroides y suprarrenal (15 conceptos + 5 preguntas, 20 pasos)')
    expect(tituloDeCheckpoint(cp({ label: 'AMBOSS Psiquiatría · 14 preguntas · modo examen' }))).toBeNull()
    // Una tanda suelta de tarjetas lleva el nombre de la app pero no es una sesión.
    expect(tituloDeCheckpoint(cp({ label: 'StepOneMelman · Cardio · 15' }))).toBeNull()
    expect(tituloDeCheckpoint(cp({ label: 'Arranque (mínimo) · StepOneMelman 5 · Endocrino · Farmacología' }))).toBeNull()
  })

  it('acota las sesiones a la semana del plan', () => {
    const estaSemana = sesion({ semanaInicio: '2026-09-14' })
    const laQueViene = sesion({ semanaInicio: '2026-09-21', semana: 'S3' })
    expect(sesionesDeLaSemana([estaSemana, laQueViene], '2026-09-14', '2026-09-19')).toEqual([estaSemana])
  })
})
