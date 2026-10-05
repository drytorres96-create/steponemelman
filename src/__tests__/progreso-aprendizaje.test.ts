import { describe, expect, it } from 'vitest'
import { DIA, nuevoProgreso } from '../srs/fsrs'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import { antesTeCostaba, hitoSemanalAprendizaje, resumenProgresoAprendizaje } from '../lib/progreso-aprendizaje'

const HOY = new Date(2026, 9, 8, 9).getTime()
const i = (dia: number, extra: Partial<Intento> = {}): Intento => ({
  ts: HOY + dia * DIA, attempt_id: `a-${dia}`, session_id: `s-${dia}`, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false, pregunta_version: 'sintetica-v1',
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const p = (id: string, intentos: Intento[], extra: Partial<ProgresoConcepto> = {}): ProgresoConcepto => ({
  ...nuevoProgreso(id), intentos, ultimo: intentos.at(-1)?.ts ?? null, proxima: HOY + DIA,
  estabilidad: 20, ...extra,
})
const dominado = (id: string, extra: Partial<ProgresoConcepto> = {}) => p(id, [i(-7), i(-4), i(-2)], {
  dominado_en: HOY - 2 * DIA, ...extra,
})

describe('un único resumen de aprendizaje', () => {
  it('cuenta IDs únicos y distingue actividad, dominio y mantenimiento sin confiar en la etiqueta guardada', () => {
    const progreso = {
      nuevo: nuevoProgreso('nuevo'), legado: p('legado', [i(-1, { resultado: undefined, fuente_consultada: undefined })]),
      revision: p('revision', [i(-1, { resultado: 'revision' })]),
      alDia: dominado('alDia', { estado: 'nuevo' }), pendiente: dominado('pendiente', { proxima: HOY }),
      fuera: dominado('fuera'),
    }
    const antes = JSON.stringify(progreso)
    const r = resumenProgresoAprendizaje(['nuevo', 'legado', 'revision', 'alDia', 'pendiente', 'alDia'], progreso, CRITERIOS_POR_DEFECTO, HOY)
    expect(r).toMatchObject({ total: 5, actividad: 4, sinActividad: 1, enAprendizaje: 2,
      dominioDemostrado: 2, mantenimientoAlDia: 1, mantenimientoPendiente: 1 })
    expect([...r.porConcepto.values()].map(s => s.estado)).toEqual(['sin_actividad', 'en_aprendizaje', 'en_aprendizaje', 'mantenimiento_al_dia', 'mantenimiento_pendiente'])
    expect(JSON.stringify(progreso)).toBe(antes)
  })

  it('una fecha histórica de dominio no convierte un fallo actual en evidencia vigente', () => {
    const d = dominado('X')
    const perdido = { ...d, intentos: [...d.intentos, i(-1, { resultado: 'incorrecta' })], proxima: HOY - 1 }
    const r = resumenProgresoAprendizaje(['X'], { X: perdido }, CRITERIOS_POR_DEFECTO, HOY)
    expect(r).toMatchObject({ actividad: 1, enAprendizaje: 1, dominioDemostrado: 0, mantenimientoPendiente: 0 })
  })

  it('no etiqueta al día un concepto en reaprendizaje aunque conserve suficientes aciertos', () => {
    const d = dominado('X', { intentos: [-10, -8, -6, -4, -3, -2].map(dia => i(dia)).concat(i(-1, { resultado: 'incorrecta' })) })
    const r = resumenProgresoAprendizaje(['X'], { X: d }, CRITERIOS_POR_DEFECTO, HOY)
    expect(r).toMatchObject({ dominioDemostrado: 1, mantenimientoAlDia: 0, mantenimientoPendiente: 0, mantenimientoPorComprobar: 1 })
    expect(r.porConcepto.get('X')?.estado).toBe('mantenimiento_por_comprobar')
  })

  it('un mantenimiento vencido conserva los criterios cumplidos y no inventa una fecha de dominio', () => {
    const r = resumenProgresoAprendizaje(['X'], { X: dominado('X', { proxima: HOY - DIA, dominado_en: null }) }, CRITERIOS_POR_DEFECTO, HOY)
    expect(r).toMatchObject({ dominioDemostrado: 1, mantenimientoAlDia: 0, mantenimientoPendiente: 1, dominadosEn: [0] })
  })

  it('un historial sin agenda conserva dominio demostrado sin suponer mantenimiento al día ni inventar fecha', () => {
    const raw = dominado('X', { proxima: null })
    const antes = JSON.stringify(raw)
    const r = resumenProgresoAprendizaje(['X'], { X: raw }, CRITERIOS_POR_DEFECTO, HOY)
    expect(r).toMatchObject({ dominioDemostrado: 1, mantenimientoAlDia: 0, mantenimientoPendiente: 0, mantenimientoPorComprobar: 1 })
    expect(r.porConcepto.get('X')?.estado).toBe('mantenimiento_por_comprobar')
    expect(JSON.stringify(raw)).toBe(antes)
    expect(raw.proxima).toBeNull()
  })

  it('respeta criterios personales y no cuenta elecciones antiguas como recuperación', () => {
    const elecciones = dominado('D')
    elecciones.intentos = elecciones.intentos.map(t => ({ ...t, interaccion: 'secuencia', recuperacion_activa: true }))
    expect(resumenProgresoAprendizaje(['D'], { D: elecciones }, CRITERIOS_POR_DEFECTO, HOY).dominioDemostrado).toBe(0)
    expect(resumenProgresoAprendizaje(['D'], { D: elecciones }, { ...CRITERIOS_POR_DEFECTO, exigirRecuperacionActiva: false }, HOY).dominioDemostrado).toBe(1)
  })
})

describe('hito semanal sustentado en respuestas separadas', () => {
  it('cuenta conceptos únicos, distingue formatos y exige al menos 24 h exactas', () => {
    const progresos = [p('R', [i(-2), i(-1), i(0)]),
      p('D', [i(-1), i(0, { interaccion: 'direccion', tipo_evidencia: 'recuerdo' })]),
      p('A', [i(-1), i(0, { interaccion: 'caso_clinico', tipo_evidencia: 'aplicacion' })]),
      p('corto', [i(-0.99), i(0)])]
    const antes = JSON.stringify(progresos)
    expect(hitoSemanalAprendizaje(progresos, HOY - DIA, HOY)).toMatchObject({ conceptos: 3,
      porTipo: { recuerdo: 1, discriminacion: 1, aplicacion: 1 }, primerTs: HOY - DIA, ultimoTs: HOY })
    expect(JSON.stringify(progresos)).toBe(antes)
  })

  it('excluye ayudas, revisión, versiones dudosas y ventanas fuera del periodo', () => {
    for (const extra of [{ pistas_usadas: 1 }, { fuente_consultada: true }, { explicacion_previa: true },
      { fuente_consultada: undefined }, { resultado: 'revision' as const }, { resultado: 'parcial' as const },
      { pregunta_version: undefined }, { pregunta_version: ' ' }, { pregunta_version: 'v2' }]) {
      expect(hitoSemanalAprendizaje([p('X', [i(-2), i(0, extra)])], HOY - DIA, HOY).conceptos).toBe(0)
    }
    expect(hitoSemanalAprendizaje([p('X', [i(-2, { fuente_consultada: true }), i(0)])], HOY - DIA, HOY).conceptos).toBe(0)
    expect(hitoSemanalAprendizaje([p('X', [i(-2), i(-1)])], HOY, HOY).conceptos).toBe(0)
    expect(hitoSemanalAprendizaje([p('X', [i(-1), i(1)])], HOY, HOY).conceptos).toBe(0)
  })

  it('una exposición intermedia reinicia el intervalo; un reintento inmediato no es hito', () => {
    expect(hitoSemanalAprendizaje([p('X', [i(-3), i(-0.5, { explicacion_previa: true }), i(0)])], HOY - DIA, HOY).conceptos).toBe(0)
  })

  it('nuevos dominios y mantenimiento exigen un hito fechado que conserva evidencia actual', () => {
    const nuevo = dominado('N')
    const mantenimiento = dominado('M', { intentos: [-25, -23, -20, -2].map(dia => i(dia)), dominado_en: HOY - 20 * DIA, proxima: HOY - DIA })
    const sinFecha = dominado('S', { dominado_en: null })
    const fechaCero = dominado('C', { dominado_en: 0 })
    const perdido = dominado('P', { intentos: [i(-7), i(-5), i(-3, { resultado: 'incorrecta' }), i(-1)] })
    const r = hitoSemanalAprendizaje([nuevo, mantenimiento, sinFecha, fechaCero, perdido], HOY - 3 * DIA, HOY)
    expect(r).toMatchObject({ conceptos: 5, nuevosDominios: 1, mantenimientoConfirmado: 1 })
  })

  it('una fecha heredada de elecciones no se celebra como mantenimiento tras demostrar recuerdo real', () => {
    const antiguas = [-25, -23, -20].map(dia => i(dia, { interaccion: 'opcion_multiple', recuperacion_activa: true, tipo_evidencia: 'recuerdo' }))
    const progreso = dominado('X', { intentos: [...antiguas, i(-5), i(-3), i(-1)], dominado_en: HOY - 20 * DIA })
    expect(resumenProgresoAprendizaje(['X'], { X: progreso }, CRITERIOS_POR_DEFECTO, HOY).dominioDemostrado).toBe(1)
    expect(hitoSemanalAprendizaje([progreso], HOY - 3 * DIA, HOY)).toMatchObject({ conceptos: 1, nuevosDominios: 0, mantenimientoConfirmado: 0 })
    expect(progreso.dominado_en).toBe(HOY - 20 * DIA)
  })
})

describe('esto antes te costaba', () => {
  it('sólo reconoce una corrección independiente de otro día tras un fallo ≥24 h antes', () => {
    const actual = i(0)
    expect(antesTeCostaba(p('X', [i(-1, { resultado: 'incorrecta' }), actual]), actual)).toBe(true)
    expect(antesTeCostaba(p('X', [i(-2, { resultado: 'parcial' })]), actual)).toBe(true)
    expect(antesTeCostaba(p('X', [i(-0.99, { resultado: 'incorrecta' })]), actual)).toBe(false)
    expect(antesTeCostaba(p('X', [i(-2)]), actual)).toBe(false)
  })

  it('no anuncia mejoría por ayudas, revisión, autoevaluación antigua o versión diferente', () => {
    const actual = i(0)
    for (const extra of [{ pistas_usadas: 1 }, { fuente_consultada: true }, { explicacion_previa: true },
      { fuente_consultada: undefined }, { resultado: undefined }, { resultado: 'revision' as const },
      { pregunta_version: undefined }, { pregunta_version: 'v2' }]) {
      expect(antesTeCostaba(p('X', [i(-2, { resultado: 'incorrecta', ...extra })]), actual)).toBe(false)
    }
    for (const extra of [{ pistas_usadas: 1 }, { explicacion_previa: true }, { resultado: 'parcial' as const }, { pregunta_version: undefined }]) {
      expect(antesTeCostaba(p('X', [i(-2, { resultado: 'incorrecta' })]), i(0, extra))).toBe(false)
    }
  })
})
