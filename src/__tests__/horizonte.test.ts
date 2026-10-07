import { describe, expect, it } from 'vitest'
import { DIA, EXAMEN_MS, estaVencido, nuevoProgreso, prioridad, programar, proximaRevision, techoHorizonte } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'
import { DIAS_META, inicioDelDiaMeta } from '../lib/meta'

const limite = EXAMEN_MS - DIA
const ahora = Date.parse('2026-10-05T08:00:00-04:00')
const despues = EXAMEN_MS + 30 * DIA
const ids = Array.from({ length: 1400 }, (_, n) => `QA-horizonte-${n}`)
const diaNY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })

describe('reparto del horizonte final', () => {
  it('la ventana de meta termina antes de los repasos finales y deja intactas sus fechas finitas', () => {
    const cierreMeta = inicioDelDiaMeta(DIAS_META + 1)
    expect(cierreMeta).toBe(Date.parse('2026-11-24T03:00:00-05:00'))
    for (const id of ids) {
      const fecha = techoHorizonte(despues, ahora, EXAMEN_MS, id)
      expect(fecha).toBeGreaterThan(cierreMeta)
      expect(fecha).toBeLessThanOrEqual(Date.parse('2026-12-20T08:00:00-05:00'))
    }
  })

  it('mantiene compatible el tope de las llamadas anteriores sin ID', () => {
    expect(techoHorizonte(despues, ahora)).toBe(limite)
    expect(techoHorizonte(despues, ahora, EXAMEN_MS, undefined)).toBe(limite)
    expect(techoHorizonte(despues, ahora, EXAMEN_MS, '')).toBe(limite)
    expect(new Date(limite).toISOString()).toBe('2026-12-20T13:00:00.000Z')
  })

  it.each([
    ['QA-001', '2026-12-08T08:00:00-05:00'],
    ['QA-002', '2026-12-12T08:00:00-05:00'],
    ['QA-α', '2026-12-08T08:00:00-05:00'],
    ['concepto-largo', '2026-12-16T08:00:00-05:00'],
  ])('conserva el slot estable de %s', (id, fecha) => {
    expect(techoHorizonte(despues, ahora, EXAMEN_MS, id)).toBe(Date.parse(fecha))
  })

  it('reparte numerosos IDs en las 12 fechas disponibles, con viernes libre y sin superar el límite', () => {
    const asignaciones = new Map(ids.map(id => [id, techoHorizonte(despues, ahora, EXAMEN_MS, id)]))
    expect(new Set(asignaciones.values()).size).toBe(12)
    for (const [id, fecha] of asignaciones) {
      expect(fecha).toBeGreaterThanOrEqual(limite - 13 * DIA)
      expect(fecha).toBeLessThanOrEqual(limite)
      expect(diaNY.format(fecha)).not.toBe('Fri')
      expect((limite - fecha) % DIA).toBe(0)
      expect(techoHorizonte(despues + 7 * DIA, ahora, EXAMEN_MS, id)).toBe(fecha)
    }
    const inverso = new Map([...ids].reverse().map(id => [id, techoHorizonte(despues, ahora, EXAMEN_MS, id)]))
    expect(inverso).toEqual(asignaciones)
  })

  it('conserva exactamente los intervalos ya válidos, incluso antes de la ventana final o en viernes', () => {
    for (const propuesta of [ahora + DIA, limite - 2 * DIA, limite]) {
      expect(techoHorizonte(propuesta, ahora, EXAMEN_MS, 'QA-001')).toBe(propuesta)
    }
  })

  it('pone el suelo en ahora cuando se recibe una propuesta anterior al momento de programación', () => {
    expect(techoHorizonte(ahora - DIA, ahora, EXAMEN_MS, 'QA-001')).toBe(ahora)
    expect(techoHorizonte(ahora - DIA, ahora)).toBe(ahora)
  })

  it('cerca del horizonte reparte únicamente entre las fechas futuras disponibles', () => {
    const jueves = Date.parse('2026-12-17T12:00:00-05:00')
    const fechas = ids.map(id => techoHorizonte(despues, jueves, EXAMEN_MS, id))
    expect(new Set(fechas)).toEqual(new Set([
      Date.parse('2026-12-19T08:00:00-05:00'), limite,
    ]))
    expect(fechas.every(fecha => fecha >= jueves && fecha <= limite)).toBe(true)
  })

  it('no reintroduce el viernes ni fechas vencidas y usa el límite cuando sólo queda un slot', () => {
    for (const cerca of [Date.parse('2026-12-18T12:00:00-05:00'),
      Date.parse('2026-12-19T09:00:00-05:00'), limite - 1]) {
      for (const id of ids.slice(0, 50)) {
        const fecha = techoHorizonte(despues, cerca, EXAMEN_MS, id)
        expect(fecha).toBeGreaterThanOrEqual(cerca)
        expect(fecha).toBeLessThanOrEqual(limite)
        expect(diaNY.format(fecha)).not.toBe('Fri')
        if (cerca >= Date.parse('2026-12-19T09:00:00-05:00')) expect(fecha).toBe(limite)
      }
    }
  })

  it('mantiene el comportamiento largo al llegar al horizonte o después del examen', () => {
    for (const t of [limite, EXAMEN_MS, EXAMEN_MS + DIA]) {
      const propuesta = t + 30 * DIA
      expect(techoHorizonte(propuesta, t, EXAMEN_MS, 'QA-001')).toBe(propuesta)
    }
    expect(techoHorizonte(despues, ahora, NaN, 'QA-001')).toBe(despues)
    expect(techoHorizonte(despues, ahora, Infinity, 'QA-001')).toBe(despues)
    expect(techoHorizonte(NaN, ahora, EXAMEN_MS, 'QA-001')).toBeNaN()
  })

  it('si un examen personalizado deja sólo un viernes conserva su límite compatible', () => {
    const examenSabado = Date.parse('2026-12-19T08:00:00-05:00')
    const viernes = Date.parse('2026-12-18T07:00:00-05:00')
    expect(techoHorizonte(despues, viernes, examenSabado, 'QA-001')).toBe(examenSabado - DIA)
  })

  it('programar usa el ID sin alterar cálculo, intentos ni contadores del modelo', () => {
    const p = { ...nuevoProgreso('QA-001'), dificultad: 4, estabilidad: 200, ultimo: ahora - DIA }
    const intento: Intento = { ts: ahora, calificacion: 4, resultado: 'correcta',
      interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0,
      fuente_consultada: false, explicacion_previa: false, ms: 1000,
      tipo_error: 'ninguno', confianza_declarada: null }
    const sinHorizonte = programar(p, intento, ahora, NaN)
    expect(sinHorizonte.proxima!).toBeGreaterThan(limite)
    const repartido = programar(p, intento, ahora)
    expect(repartido.proxima).toBe(Date.parse('2026-12-08T08:00:00-05:00'))
    expect({ ...repartido, proxima: null }).toEqual({ ...sinHorizonte, proxima: null })
    expect(p.intentos).toEqual([])
    expect(repartido.intentos).toEqual([intento])
  })

  it('la agenda canónica del antiguo tope coincide con el último replay sin mutar lo guardado', () => {
    const p = { ...nuevoProgreso('QA-001'), dificultad: 4, estabilidad: 200, ultimo: ahora - DIA }
    const intento: Intento = { ts: ahora, calificacion: 4, resultado: 'correcta',
      interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0,
      fuente_consultada: false, explicacion_previa: false, ms: 1000,
      tipo_error: 'ninguno', confianza_declarada: null }
    const replay = programar(p, intento, ahora)
    const antiguo = { ...replay, proxima: limite }
    const copia = structuredClone(antiguo)
    expect(proximaRevision(antiguo)).toBe(replay.proxima)
    expect(antiguo).toEqual(copia)
    const antes = Date.parse('2026-12-08T07:59:59-05:00')
    expect(estaVencido(antiguo, antes)).toBe(false)
    expect(estaVencido(antiguo, replay.proxima!)).toBe(true)
    expect(prioridad(antiguo, replay.proxima! + DIA)).toBe(prioridad(replay, replay.proxima! + DIA))
  })

  it('la lectura de agenda conserva fechas normales, ausencia y un último intento pasado el límite', () => {
    for (const proxima of [null, ahora + DIA, limite - DIA, EXAMEN_MS + DIA]) {
      const p = { ...nuevoProgreso('QA-001'), ultimo: ahora, proxima }
      expect(proximaRevision(p)).toBe(proxima)
    }
    expect(proximaRevision({ ...nuevoProgreso('QA-001'), proxima: limite })).toBe(limite)
    expect(proximaRevision({ ...nuevoProgreso('QA-001'), ultimo: limite, proxima: limite })).toBe(limite)
  })
})
