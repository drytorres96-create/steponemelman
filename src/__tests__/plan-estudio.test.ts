import { describe, expect, it } from 'vitest'
import { ConceptoZ, type Concepto } from '../schema/concept'
import { DIA, nuevoProgreso } from '../srs/fsrs'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import { construirPlanDiario, erroresRecientesPendientes } from '../lib/plan-estudio'
import { construirCola } from '../lib/rutas'

const ahora = 20 * DIA
const concepto = (id: string, tipo: Concepto['clasificacion']['tipo_conocimiento'] = 'Diagnóstico'): Concepto => ConceptoZ.parse({
  concept_id: id, source: { doc: 'Prueba', doc_title: 'Prueba', page: 1, item_id: id, fragment: 'Fuente de prueba' },
  objetivo: 'Objetivo de prueba', afirmacion: 'Afirmación de prueba', respuesta_canonica: 'Respuesta', explicacion: 'Explicación',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Renal', tema: 'Prueba', tipo_conocimiento: tipo, dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre' }, evaluacion: { pregunta: '¿Respuesta?' },
  pistas: ['Una', 'Dos', 'Tres'], calidad: { confianza: 0.9, estado: 'aprobado' },
})
const intento = (ts: number, correcta: boolean, extra: Partial<Intento> = {}): Intento => ({
  ts, resultado: correcta ? 'correcta' : 'incorrecta', calificacion: correcta ? 3 : 1,
  interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0,
  ms: 5000, tipo_error: correcta ? 'ninguno' : 'desconocimiento', confianza_declarada: 2, ...extra,
})
const progreso = (id: string, intentos: Intento[], proxima = ahora + DIA): ProgresoConcepto => ({
  ...nuevoProgreso(id), intentos, proxima, ultimo: Math.max(...intentos.map(i => i.ts)), estabilidad: 1,
})

describe('plan diario y rutas', () => {
  it('respeta el límite global y ordena vencidos, errores pendientes y nuevos sin duplicar', () => {
    const [nuevo, vencido, fallo, fundamento, otro] = ['new', 'due', 'bad', 'base', 'more'].map(id => concepto(id))
    fundamento.clasificacion.tipo_conocimiento = 'Mecanismo'
    const ps = {
      due: progreso('due', [intento(ahora - DIA, false)], ahora - DIA),
      bad: progreso('bad', [intento(ahora - 1000, false)]),
    }
    const cs = [nuevo, fallo, fundamento, vencido, otro, vencido]
    const plan = construirPlanDiario(cs, ps, 5, ahora)
    expect(plan.conceptos.map(c => c.concept_id)).toEqual(['due', 'bad', 'base', 'new', 'more'])
    expect([plan.vencidos, plan.errores, plan.nuevos]).toEqual([1, 1, 3])
    expect(construirCola('guiada', cs, ps, 5, ahora)).toEqual(plan.conceptos)
  })

  it('el repaso acumulado reduce el material nuevo pero nunca lo expulsa del plan', () => {
    const cs = Array.from({ length: 10 }, (_, i) => concepto(`c-${i}`))
    const ps = Object.fromEntries(cs.slice(0, 6).map(c => [c.concept_id,
      progreso(c.concept_id, [intento(ahora - DIA, true)], ahora - DIA)]))
    const plan = construirPlanDiario(cs, ps, 5, ahora)
    expect(plan.conceptos).toHaveLength(5)
    // Con seis vencidos y cinco plazas, el tope del 70 % deja una plaza para algo nuevo.
    expect(plan.vencidos).toBe(4)
    expect(plan.nuevos).toBe(1)
    expect(plan.hayRepasoAcumulado).toBe(true)
    expect(plan.repasoLimitado).toBe(true)
    expect(plan.explicacion).toContain('70 %')
  })

  it('sin material nuevo disponible, el repaso ocupa todas las plazas', () => {
    const cs = Array.from({ length: 6 }, (_, i) => concepto(`v-${i}`))
    const ps = Object.fromEntries(cs.map(c => [c.concept_id,
      progreso(c.concept_id, [intento(ahora - DIA, true)], ahora - DIA)]))
    const plan = construirPlanDiario(cs, ps, 5, ahora)
    expect(plan.vencidos).toBe(5)
    expect(plan.nuevos).toBe(0)
    // El tope no actuó: no hay material nuevo al que reservar plazas, así que no se anuncia.
    expect(plan.repasoLimitado).toBe(false)
    expect(plan.explicacion).not.toContain('70 %')
  })

  it('el repaso recupera las plazas que el material nuevo no llega a llenar', () => {
    const vencidos = Array.from({ length: 6 }, (_, i) => concepto(`v-${i}`))
    const nuevo = concepto('n-0')
    const ps = Object.fromEntries(vencidos.map(c => [c.concept_id,
      progreso(c.concept_id, [intento(ahora - DIA, true)], ahora - DIA)]))
    const plan = construirPlanDiario([...vencidos, nuevo], ps, 5, ahora)
    expect(plan.conceptos).toHaveLength(5)
    expect([plan.vencidos, plan.nuevos]).toEqual([4, 1])
  })

  it('el plan no rellena con conceptos al día cuando se terminaron los nuevos', () => {
    const c = concepto('listo')
    expect(construirPlanDiario([c], { listo: progreso('listo', [intento(ahora - 100, true)]) }, 5, ahora).conceptos).toEqual([])
    expect(construirPlanDiario([c], {}, 0, ahora).conceptos).toEqual([])
    expect(construirPlanDiario([c], {}, -3, ahora).conceptos).toEqual([])
  })

  it('un acierto posterior elimina el fallo histórico aunque los intentos estén desordenados', () => {
    const cs = [concepto('recuperado'), concepto('antiguo'), concepto('pendiente')]
    const ps = {
      recuperado: { ...progreso('recuperado', [intento(ahora - 100, true), intento(ahora - DIA, false)]), fallos: 12 },
      antiguo: progreso('antiguo', [intento(ahora - 8 * DIA, false)]),
      pendiente: progreso('pendiente', [intento(ahora - 1000, false, { calificacion: 4 })]),
    }
    expect(erroresRecientesPendientes(cs, ps, ahora).map(c => c.concept_id)).toEqual(['pendiente'])
    expect(construirCola('debiles', cs, ps, 20, ahora).map(c => c.concept_id)).toEqual(['pendiente'])
    ps.recuperado.proxima = ahora
    expect(construirCola('debiles', cs, ps, 20, ahora).map(c => c.concept_id)).toEqual(['recuperado', 'pendiente'])
  })

  it('la práctica sin ayuda admite hasta 20 preguntas con opciones válidas ya vistas', () => {
    const cs = Array.from({ length: 24 }, (_, i) => {
      const c = concepto(`mcq-${i}`)
      c.interaccion.recomendada = i % 2 ? 'caso_clinico' : 'opcion_multiple'
      c.evaluacion.opciones = [{ texto: 'A', correcta: true, por_que: '' }, { texto: 'B', correcta: false, por_que: 'Motivo' }]
      return c
    })
    const libre = concepto('libre'), ambiguo = { ...cs[0], concept_id: 'ambiguo', evaluacion: { pregunta: 'Sin opciones', respuestas_aceptadas: [] } }
    const ps = Object.fromEntries([...cs.slice(0, 23), libre, ambiguo].map(c => [c.concept_id, progreso(c.concept_id, [intento(ahora - DIA, true)])]))
    const cola = construirCola('examen', [...cs, libre, ambiguo], ps, 100, ahora)
    expect(cola).toHaveLength(20)
    expect(cola.every(c => c.concept_id !== 'mcq-23' && c.concept_id !== 'libre' && c.concept_id !== 'ambiguo')).toBe(true)
    expect(construirCola('examen', cs, ps, 5, ahora)).toHaveLength(5)
  })

  it('una respuesta por revisar no añade un fallo ni borra el último resultado comprobado', () => {
    const cs = [concepto('revision-sola'), concepto('acierto-previo'), concepto('fallo-previo')]
    const pendiente = intento(ahora - 100, false, { resultado: 'revision', tipo_error: 'error_por_revisar' })
    const ps = {
      'revision-sola': progreso('revision-sola', [pendiente]),
      'acierto-previo': progreso('acierto-previo', [intento(ahora - DIA, true), pendiente]),
      'fallo-previo': progreso('fallo-previo', [intento(ahora - DIA, false, { tipo_error: 'confusion_conceptos' }), pendiente]),
    }
    expect(erroresRecientesPendientes(cs, ps, ahora).map(c => c.concept_id)).toEqual(['fallo-previo'])
    expect(construirCola('confusiones', cs, ps, 20, ahora).map(c => c.concept_id)).toEqual(['fallo-previo'])
    const plan = construirPlanDiario(cs, ps, 5, ahora)
    expect(plan.errores).toBe(1)
    expect(plan.nuevos).toBe(0)
    expect(plan.conceptos.map(c => c.concept_id)).toEqual(['fallo-previo'])
  })

  it('la ruta mixta no incorpora material nuevo de disciplinas ya iniciadas', () => {
    const cs = [concepto('visto'), concepto('nuevo')]
    expect(construirCola('mixta', cs, { visto: progreso('visto', [intento(ahora - DIA, true)]) }, 20, ahora)
      .map(c => c.concept_id)).toEqual(['visto'])
  })
})
