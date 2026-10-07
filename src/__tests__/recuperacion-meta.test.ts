import { describe, expect, it } from 'vitest'
import { recuperacionMeta, type EntradaRecuperacion } from '../lib/recuperacion-meta'
import { prepararNuevoDeHoy } from '../lib/nuevo-hoy'
import { rumboDe, type ResumenMeta } from '../lib/meta'
import { estadoDelDia, type EntradaDia } from '../lib/dia'
import { emptyNbmeState, startNbmeSession } from '../nbme/model'
import type { NbmeQuestionMeta } from '../nbme/types'
import type { ItemCaja } from '../lib/cajas'

const AHORA = new Date(2026, 9, 5, 10).getTime()
const serie = (hechos: number, linea: number) => ({ hechos, linea, meta: 510, ...rumboDe(hechos, linea), proyeccion: null })
const meta = (hechos = 50, linea = 57): ResumenMeta => ({ dia: 11, conceptos: serie(hechos, linea), preguntas: serie(20, 20), filas: [], semanasConsolidacion: 4 })
const caja = (id: string, hecho = false): ItemCaja => ({ id, tipo: 'concepto', caja: 1, vence: AHORA - 1, hecho })
const entrada = (extra: Partial<EntradaRecuperacion> = {}): EntradaRecuperacion => ({
  meta: meta(), datosListos: true, semanaLista: true, sesionPendiente: false,
  dia: { tipo: 'semana', nuevo: { conceptos: 3, preguntas: 1, techoConceptos: 10, techoPreguntas: 5, cerrada: false }, cajas: { hechos: 1, techo: 4, cerrada: false }, completo: false },
  cajas: [caja('C0', true), caja('C1'), caja('C2'), caja('C3')],
  nuevo: { conceptIds: ['N1', 'N2'], preguntas: [{ id: 'Q1', revision: 'r-original' }], titulo: 'Nuevo de hoy · 5 oct', nbmeSessionId: null }, ...extra,
})

describe('ponerse al día sin cambiar qué cuenta como dominio ni añadir deuda diaria', () => {
  it('distingue recuperar la marca, superar por una unidad y completar la meta sin prometerlo por una cola', () => {
    const e = entrada({ meta: { ...meta(17, 50), preguntas: { ...serie(23, 52), meta: 255 } } })
    const antes = JSON.stringify(e)
    expect(recuperacionMeta(e)).toMatchObject({ faltaDominio: 33, paraSuperarDominio: 34, faltanMetaDominio: 493,
      faltanPreguntas: 29, paraSuperarPreguntas: 30, faltanMetaPreguntas: 232 })
    expect(JSON.stringify(e)).toBe(antes)
    const igual = recuperacionMeta(entrada({ meta: meta(57, 57) }))
    expect(igual).toMatchObject({ faltaDominio: 0, paraSuperarDominio: 1, accion: null })
  })

  it('50 frente a 57 muestra la diferencia exacta y propone los repasos de Hoy antes de lo nuevo', () => {
    const r = recuperacionMeta(entrada())
    expect(r.faltaDominio).toBe(7)
    expect(r.faltanPreguntas).toBe(0)
    expect(r.accion).toEqual({ tipo: 'cajas', items: entrada().cajas.slice(1) })
    // La cola válida se conserva entera: no se recorta a la distancia de la meta.
    const e = entrada({ cajas: Array.from({ length: 10 }, (_, i) => caja(`C${i}`)) })
    e.dia.cajas = { hechos: 0, techo: 10, cerrada: false }
    expect(recuperacionMeta(e).accion).toEqual({ tipo: 'cajas', items: e.cajas })
  })

  it('muestra una diferencia pequeña sin convertirla en recuperación dentro del margen acordado', () => {
    const r = recuperacionMeta(entrada({ meta: meta(54, 57) }))
    expect(r.faltaDominio).toBe(3)
    expect(r.accion).toBeNull()
    expect(r.motivo).toContain('margen')
    expect(recuperacionMeta(entrada({ meta: meta(60, 57) })).faltaDominio).toBe(0)
  })

  it('activa la misma recuperación cuando sólo faltan primeras respuestas NBME', () => {
    const m = meta(57, 57); m.preguntas = serie(10, 20)
    expect(recuperacionMeta(entrada({ meta: m }))).toMatchObject({ faltaDominio: 0, faltanPreguntas: 10, accion: { tipo: 'cajas' } })
  })

  it('respeta la ventana, viernes, sincronización y sesiones pendientes', () => {
    for (const dia of [0, 61]) expect(recuperacionMeta(entrada({ meta: { ...meta(), dia } })).accion).toBeNull()
    const viernes = entrada(); viernes.dia.tipo = 'vacio'; viernes.sesionPendiente = true
    expect(recuperacionMeta(viernes)).toMatchObject({ accion: null, retomar: false })
    expect(recuperacionMeta(entrada({ datosListos: false })).accion).toBeNull()
    expect(recuperacionMeta(entrada({ sesionPendiente: true }))).toMatchObject({ accion: null, retomar: true })
  })

  it('deduplica sin cambiar el orden ni superar las plazas de repaso restantes', () => {
    const e = entrada({ cajas: [caja('C0', true), caja('C2'), caja('C2'), caja('C1'), caja('C3'), caja('C4')] })
    expect(recuperacionMeta(e).accion).toEqual({ tipo: 'cajas', items: [caja('C2'), caja('C1'), caja('C3')] })
  })

  it('permite repasar sin material semanal cargado pero exige conocerlo para abrir lo nuevo', () => {
    expect(recuperacionMeta(entrada({ semanaLista: false })).accion?.tipo).toBe('cajas')
    expect(recuperacionMeta(entrada({ semanaLista: false, cajas: [] })).accion).toBeNull()
    expect(recuperacionMeta(entrada({ cajas: [] })).accion).toEqual({ tipo: 'nuevo', material: entrada().nuevo })
  })

  it('limita lo nuevo al hueco de Hoy y conserva letras, revisión y cola exacta', () => {
    const e = entrada({ cajas: [] })
    e.dia.nuevo.conceptos = 9; e.dia.nuevo.preguntas = 4
    e.nuevo = { ...e.nuevo, conceptIds: ['N2', 'N2', 'N1'], preguntas: [{ id: 'Q1', revision: 'r-original' }, { id: 'Q2', revision: 'r2' }], nbmeSessionId: 'vieja' }
    expect(recuperacionMeta(e).accion).toEqual({ tipo: 'nuevo', material: { ...e.nuevo, conceptIds: ['N2'], preguntas: [{ id: 'Q1', revision: 'r-original' }], nbmeSessionId: null } })
    e.dia.nuevo.cerrada = true
    expect(recuperacionMeta(e).accion).toBeNull()
  })

  it('no abre un recorrido sin tareas válidas ni acredita la diferencia como dominio', () => {
    const e = entrada({ cajas: [], nuevo: { conceptIds: [], preguntas: [], titulo: 'Hoy', nbmeSessionId: null } })
    expect(recuperacionMeta(e)).toMatchObject({ faltaDominio: 7, accion: null })
    expect(e.meta.conceptos.hechos).toBe(50)
  })
})

it('Hoy y recuperación seleccionan exactamente los mismos IDs y reutilizan sólo la sesión NBME con las mismas referencias', () => {
  const e: EntradaDia = { progreso: {}, intentosPreguntas: [], conceptosSemana: ['C2', 'C1'], preguntasSemana: ['Q2', 'Q1'], cajas: { hechos: 0, techo: 0 }, ahora: AHORA }
  const q = (id: string): NbmeQuestionMeta => ({ id, revision: 'r2', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [], topic: 'Synthetic', objective: null, status: 'ready', reasons: [], figureRequired: false, conceptLinks: [] })
  const listas = new Map(['Q1', 'Q2'].map(id => [id, q(id)]))
  const esperado = { conceptIds: ['C2', 'C1'], preguntas: [{ id: 'Q2', revision: 'r2' }, { id: 'Q1', revision: 'r2' }], titulo: 'Nuevo de hoy · 5 oct', nbmeSessionId: null }
  const inicial = prepararNuevoDeHoy(e, listas, emptyNbmeState())
  expect(inicial).toEqual(esperado)
  const state = startNbmeSession(emptyNbmeState(), { id: 'pendiente', title: inicial.titulo, refs: inicial.preguntas }, AHORA)
  expect(prepararNuevoDeHoy(e, listas, state).nbmeSessionId).toBe('pendiente')
  listas.set('Q1', { ...q('Q1'), revision: 'r3' })
  expect(prepararNuevoDeHoy(e, listas, state).nbmeSessionId).toBeNull()
  expect(recuperacionMeta(entrada({ cajas: [], dia: estadoDelDia(e), nuevo: inicial })).accion).toEqual({ tipo: 'nuevo', material: inicial })
})
