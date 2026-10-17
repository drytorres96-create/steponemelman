import { beforeEach, describe, expect, it } from 'vitest'
import { decidirSugerencia, diaDeEstudio, guardarSugerencia, leerSugerencia, type SugerenciaDelDia } from '../lib/sugerencia-diaria'
import type { FichaInventario } from '../lib/inventario'

/** Sábado 17 y viernes 16 de octubre de 2026 (hora de Nueva York). */
const F = (d: number, h: number) => Date.parse(`2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-04:00`)
const SABADO = F(17, 10), VIERNES = F(16, 10)

const ficha = (id: string, extra: Partial<FichaInventario> = {}): FichaInventario => ({
  tipo: 'concepto', id, intentos: 1, fallos: 1, ultimoFallo: F(15, 9), ultimaVez: F(15, 9), senales: ['fallo_reciente'], puntos: 3, ...extra,
})
const fichas = (n: number) => Array.from({ length: n }, (_, k) => ficha(`C${k}`))
const guardada = (extra: Partial<SugerenciaDelDia> = {}): SugerenciaDelDia => ({
  v: 1, dia: diaDeEstudio(SABADO), estado: 'visible', items: [{ tipo: 'concepto', id: 'C0', senales: ['fallo_reciente'] }, { tipo: 'concepto', id: 'C1', senales: ['fallo_reciente'] }], ...extra,
})

describe('la sugerencia diaria y su techo', () => {
  it('el viernes no hay tarjeta, aunque haya de sobra, y no se congela nada', () => {
    expect(decidirSugerencia({ ahora: VIERNES, guardada: null, candidatas: fichas(9), listo: true })).toEqual({ mostrar: null, guardar: null })
  })
  it('a las 2 AM del sábado todavía es el viernes de estudio: sigue sin tarjeta', () => {
    expect(decidirSugerencia({ ahora: Date.parse('2026-10-17T02:00:00-04:00'), guardada: null, candidatas: fichas(9), listo: true }).mostrar).toBeNull()
  })
  it('no se congela la lista del día mientras llega el progreso de la cuenta', () => {
    expect(decidirSugerencia({ ahora: SABADO, guardada: null, candidatas: fichas(9), listo: false })).toEqual({ mostrar: null, guardar: null })
  })
  it('sin candidatas no hay tarjeta ni se guarda nada', () => {
    expect(decidirSugerencia({ ahora: SABADO, guardada: null, candidatas: [], listo: true })).toEqual({ mostrar: null, guardar: null })
  })
  it('la primera vez del día congela como mucho cinco, con su revisión si es una pregunta', () => {
    const candidatas = [ficha('Q', { tipo: 'pregunta', id: 'NBME28-P0001', revision: 'r3' }), ...fichas(10)]
    const d = decidirSugerencia({ ahora: SABADO, guardada: null, candidatas, listo: true })
    expect(d.mostrar?.items).toHaveLength(5)
    expect(d.mostrar?.items[0]).toEqual({ tipo: 'pregunta', id: 'NBME28-P0001', revision: 'r3', senales: ['fallo_reciente'] })
    expect(d.guardar).toEqual(d.mostrar)
    expect(d.mostrar).toMatchObject({ v: 1, dia: '2026-10-17', estado: 'visible' })
  })
  it('la lista del día no cambia aunque aparezcan candidatas mejores después', () => {
    const primera = decidirSugerencia({ ahora: SABADO, guardada: null, candidatas: fichas(5), listo: true })
    const luego = decidirSugerencia({ ahora: SABADO + 3_600_000, guardada: primera.guardar, candidatas: [ficha('NUEVA', { puntos: 99 }), ...fichas(5)], listo: true })
    expect(luego.mostrar?.items.map(i => i.id)).toEqual(['C0', 'C1', 'C2', 'C3', 'C4'])
    expect(luego.guardar).toBeNull()
  })
  it('al mostrarla se retira lo que ya no es candidato (se hizo hoy o entró en cajas), sin reponerlo', () => {
    const d = decidirSugerencia({ ahora: SABADO, guardada: guardada(), candidatas: [ficha('C1'), ficha('OTRA')], listo: true })
    expect(d.mostrar?.items.map(i => i.id)).toEqual(['C1'])
  })
  it('si ya no queda ninguno, la tarjeta desaparece', () => {
    expect(decidirSugerencia({ ahora: SABADO, guardada: guardada(), candidatas: [ficha('OTRA')], listo: true }).mostrar).toBeNull()
  })
  it('descartada o usada, no vuelve a salir ese día, tenga las candidatas que tenga', () => {
    for (const estado of ['descartada', 'usada'] as const) {
      expect(decidirSugerencia({ ahora: SABADO, guardada: guardada({ estado }), candidatas: fichas(9), listo: true })).toEqual({ mostrar: null, guardar: null })
    }
  })
  it('al día siguiente se recalcula desde cero: lo de ayer no se arrastra', () => {
    const ayer = guardada({ dia: '2026-10-16', estado: 'descartada' })
    const hoy = decidirSugerencia({ ahora: SABADO, guardada: ayer, candidatas: fichas(3), listo: true })
    expect(hoy.mostrar?.items.map(i => i.id)).toEqual(['C0', 'C1', 'C2'])
    expect(hoy.guardar?.dia).toBe('2026-10-17')
  })
})

describe('lo guardado en el navegador', () => {
  beforeEach(() => localStorage.clear())
  it('se guarda y se lee por cuenta', () => {
    const s = guardada({ hilo: 'Giran en torno a las hormonas.', hiloIntentado: true })
    guardarSugerencia('u1', s)
    expect(leerSugerencia('u1')).toEqual(s)
    expect(leerSugerencia('u2')).toBeNull()
  })
  it('lo ilegible o con otra forma se ignora en lugar de romper Hoy', () => {
    localStorage.setItem('step1-sugerencia-recuperar:v1:u', '{no es json')
    expect(leerSugerencia('u')).toBeNull()
    for (const raro of [null, 3, { v: 2 }, { v: 1, dia: 5, items: [], estado: 'visible' }, { v: 1, dia: 'x', items: {}, estado: 'visible' }, { v: 1, dia: 'x', items: [], estado: 'otra' }]) {
      localStorage.setItem('step1-sugerencia-recuperar:v1:u', JSON.stringify(raro))
      expect(leerSugerencia('u')).toBeNull()
    }
  })
  it('descarta ítems con señales inventadas y recorta a cinco aunque alguien haya escrito más', () => {
    const items = [...Array.from({ length: 8 }, (_, k) => ({ tipo: 'concepto', id: `C${k}`, senales: ['fallo_reciente'] })),
      { tipo: 'concepto', id: 'MALO', senales: ['inventada'] }, { tipo: 'otro', id: 'X', senales: [] }]
    localStorage.setItem('step1-sugerencia-recuperar:v1:u', JSON.stringify({ v: 1, dia: '2026-10-17', estado: 'visible', items }))
    expect(leerSugerencia('u')?.items.map(i => i.id)).toEqual(['C0', 'C1', 'C2', 'C3', 'C4'])
  })
  it('sin almacenamiento disponible nada lanza', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('lleno') }
    try { expect(() => guardarSugerencia('u', guardada())).not.toThrow() } finally { Storage.prototype.setItem = original }
  })
})
