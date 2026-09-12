import { describe, it, expect } from 'vitest'
import { nuevoProgreso, programar, retencion, intervalo, estaVencido, prioridad, DIA, calificacionEfectiva, techoHorizonte, EXAMEN_MS } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'

const intento = (g: 1|2|3|4, extra: Partial<Intento> = {}): Intento => ({
  ts: Date.now(), calificacion: g, interaccion: 'recuperacion_libre', recuperacion_activa: true,
  pistas_usadas: 0, ms: 4000, tipo_error: g >= 3 ? 'ninguno' : 'desconocimiento', confianza_declarada: 2, ...extra,
})

describe('planificador de repetición espaciada', () => {
  it('la retención decae con el tiempo', () => {
    expect(retencion(0, 10)).toBeCloseTo(1, 5)
    expect(retencion(10, 10)).toBeLessThan(1)
    expect(retencion(60, 10)).toBeLessThan(retencion(10, 10))
  })
  it('el intervalo para 90 % de retención es próximo a la estabilidad', () => {
    const s = 12
    expect(intervalo(s, 0.9)).toBeGreaterThan(s * 0.7)
    expect(intervalo(s, 0.9)).toBeLessThan(s * 1.3)
  })
  it('un acierto alarga el intervalo y un fallo lo acorta', () => {
    let p = programar(nuevoProgreso('X'), intento(3))
    const primero = p.proxima! - p.ultimo!
    p = programar(p, intento(3), p.ultimo! + 3 * DIA)
    const segundo = p.proxima! - p.ultimo!
    expect(segundo).toBeGreaterThan(primero)
    const tras_fallo = programar(p, intento(1), p.ultimo! + 5 * DIA)
    expect(tras_fallo.proxima! - tras_fallo.ultimo!).toBeLessThan(segundo)
    expect(tras_fallo.estabilidad).toBeLessThanOrEqual(p.estabilidad)
  })
  it('el tipo de error modula el intervalo: una errata penaliza menos que una confusión', () => {
    const base = programar(nuevoProgreso('A'), intento(3))
    const orto = programar(base, intento(3, { tipo_error: 'error_ortografico' }), base.ultimo! + DIA)
    const conf = programar(base, intento(3, { tipo_error: 'confusion_conceptos' }), base.ultimo! + DIA)
    expect(orto.proxima! - orto.ultimo!).toBeGreaterThan(conf.proxima! - conf.ultimo!)
  })
  it('acertar con demasiadas pistas acorta el intervalo', () => {
    const base = programar(nuevoProgreso('B'), intento(3))
    const normal = programar(base, intento(3), base.ultimo! + DIA)
    const conPistas = programar(base, intento(3, { tipo_error: 'correcta_con_pistas' }), base.ultimo! + DIA)
    expect(conPistas.proxima! - conPistas.ultimo!).toBeLessThan(normal.proxima! - normal.ultimo!)
  })
  it('detecta el vencimiento y prioriza lo más olvidado', () => {
    const p = programar(nuevoProgreso('C'), intento(3))
    expect(estaVencido(p)).toBe(false)
    expect(estaVencido(p, p.proxima! + 1000)).toBe(true)
    expect(prioridad(p, p.proxima! + 10 * DIA)).toBeGreaterThan(prioridad(p, p.proxima! + 1000))
  })
  it('la dificultad se mantiene en el rango 1-10', () => {
    let p = nuevoProgreso('D')
    for (let i = 0; i < 25; i++) p = programar(p, intento(i % 2 ? 1 : 4), Date.now() + i * DIA)
    expect(p.dificultad).toBeGreaterThanOrEqual(1)
    expect(p.dificultad).toBeLessThanOrEqual(10)
    expect(p.estabilidad).toBeGreaterThan(0)
  })
  it('el resultado objetivo prevalece sobre una autoevaluación incompatible', () => {
    const incorrecta = intento(4, { resultado: 'incorrecta' })
    expect(calificacionEfectiva(incorrecta)).toBe(1)
    const p1 = programar(nuevoProgreso('OUT-1'), incorrecta)
    expect([p1.aciertos, p1.fallos]).toEqual([0, 1])

    const correcta = intento(1, { resultado: 'correcta' })
    expect(calificacionEfectiva(correcta)).toBe(2)
    const p2 = programar(nuevoProgreso('OUT-2'), correcta)
    expect([p2.aciertos, p2.fallos]).toEqual([1, 0])

    const parcial = programar(nuevoProgreso('OUT-3'), intento(4, { resultado: 'parcial' }))
    const ortografia = programar(nuevoProgreso('OUT-4'), intento(1, { resultado: 'ortografia' }))
    expect([parcial.aciertos, parcial.fallos]).toEqual([0, 1])
    expect([ortografia.aciertos, ortografia.fallos]).toEqual([1, 0])
  })
  it('guarda una respuesta por revisar sin alterar agenda ni evidencia de aciertos/fallos', () => {
    const t = Date.now()
    const base = programar(nuevoProgreso('REV'), intento(3), t)
    const pendiente = intento(1, { resultado: 'revision', tipo_error: 'error_por_revisar' })
    const actualizado = programar(base, pendiente, t + DIA)
    expect(actualizado).toEqual({ ...base, intentos: [...base.intentos, pendiente] })
    const nuevo = programar(nuevoProgreso('NUEVO'), pendiente, t)
    expect(nuevo.proxima).toBeNull()
    expect([nuevo.aciertos, nuevo.fallos]).toEqual([0, 0])
  })
  it('un acierto con fuente, explicación o una pista no se programa como fácil', () => {
    for (const ayuda of [{ fuente_consultada: true }, { explicacion_previa: true }, { pistas_usadas: 1 }]) {
      expect(calificacionEfectiva({ resultado: 'correcta', calificacion: 4, ...ayuda })).toBe(2)
    }
    expect(calificacionEfectiva({ resultado: 'correcta', calificacion: 4,
      fuente_consultada: false, explicacion_previa: false, pistas_usadas: 0 })).toBe(4)
  })
})

describe('horizonte del examen', () => {
  const examen = Date.parse('2026-12-21T08:00:00-05:00')
  const limite = examen - DIA

  it('la fecha del examen está fijada y es un instante válido', () => {
    expect(EXAMEN_MS).toBe(examen)
    expect(Number.isFinite(EXAMEN_MS)).toBe(true)
  })
  it('comprime un repaso que caería después del examen al día anterior', () => {
    const ahora = Date.parse('2026-09-12T12:00:00-04:00')
    expect(techoHorizonte(ahora + 102 * DIA, ahora, examen)).toBe(limite)
  })
  it('no altera un repaso que ya cae dentro del horizonte', () => {
    const ahora = Date.parse('2026-09-12T12:00:00-04:00')
    const propuesta = ahora + 11 * DIA
    expect(techoHorizonte(propuesta, ahora, examen)).toBe(propuesta)
  })
  it('deja de comprimir una vez pasado el horizonte, sin programar en el pasado', () => {
    const despues = Date.parse('2026-12-22T12:00:00-05:00')
    const propuesta = despues + 102 * DIA
    expect(techoHorizonte(propuesta, despues, examen)).toBe(propuesta)
  })
  it('un tercer acierto no puede dejar el concepto sin comprobar hasta después del examen', () => {
    const ahora = Date.parse('2026-09-12T12:00:00-04:00')
    let p = nuevoProgreso('HORIZONTE')
    for (const d of [0, 4, 9]) {
      const t = ahora + d * DIA
      p = programar(p, intento(3, { ts: t }), t, examen)
    }
    expect(p.proxima).not.toBeNull()
    expect(p.proxima!).toBeLessThanOrEqual(limite)
    expect(p.proxima!).toBeGreaterThan(ahora + 9 * DIA)
  })
})
