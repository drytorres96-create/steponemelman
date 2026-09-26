import { describe, expect, it } from 'vitest'
import { TECHOS, tipoDeDia } from '../lib/dia'
import {
  DIAS_META, META_CONCEPTOS, META_PREGUNTAS, diaDeLaMeta, fechaDelDia, inicioDelDiaMeta, lineaConceptos,
  lineaPreguntas, primerasRespuestasNbme, resumenMeta, rumboDe, type EntradaMeta,
} from '../lib/meta'
import type { NbmeAttempt, NbmeCatalog, NbmeQuestionMeta } from '../nbme/types'

/**
 * La meta de 60 días es la vista a futuro de los techos de Hoy. Lo que se comprueba
 * es lo que decide si Yoel la mira sin agobio: la ventana y las metas son las
 * acordadas, la línea nunca va más deprisa que los techos, ir por debajo sólo se dice
 * con una distancia real, y la proyección no aparece hasta que hay ritmo de verdad.
 */

const DIA = 86_400_000
/** Mediodía del día `n` de la ventana. */
const mediodia = (n: number) => inicioDelDiaMeta(n) + 9 * 3_600_000
const entrada = (extra: Partial<EntradaMeta> = {}): EntradaMeta => ({
  ahora: mediodia(2), dominadosEn: [], conceptosPublicados: 2079, primerasRespuestas: [], preguntasPublicadas: 452, ...extra,
})
/** Marcas que siguen una línea al pie de la letra durante `dias` días, a mediodía de cada uno. */
function siguiendo(linea: (n: number) => number, dias: number, desde = 1, factor = 1): number[] {
  const marcas: number[] = []
  for (let k = desde; k <= dias; k++) {
    const nuevas = Math.round(factor * linea(k)) - Math.round(factor * linea(k - 1))
    for (let i = 0; i < nuevas; i++) marcas.push(mediodia(k))
  }
  return marcas
}
const techoDelDia = (k: number) => {
  const f = fechaDelDia(k)
  return TECHOS[tipoDeDia(new Date(f.getFullYear(), f.getMonth(), f.getDate(), 12).getTime())]
}

describe('la ventana', () => {
  it('va del viernes 25-sep al lunes 23-nov, con el corte de las 3:00', () => {
    expect(diaDeLaMeta(new Date(2026, 8, 25, 2, 59).getTime())).toBe(0)
    expect(diaDeLaMeta(new Date(2026, 8, 25, 3).getTime())).toBe(1)
    expect(diaDeLaMeta(new Date(2026, 8, 26, 10).getTime())).toBe(2)
    expect(diaDeLaMeta(new Date(2026, 10, 23, 12).getTime())).toBe(60)
    expect(diaDeLaMeta(new Date(2026, 10, 24, 2, 59).getTime())).toBe(60)
    expect(diaDeLaMeta(new Date(2026, 10, 24, 3).getTime())).toBe(61)
    expect(fechaDelDia(1).getDay()).toBe(5)
    expect(fechaDelDia(DIAS_META).toDateString()).toBe(new Date(2026, 10, 23).toDateString())
  })

  it('deja cuatro semanas enteras para consolidar antes del examen', () => {
    expect(resumenMeta(entrada()).semanasConsolidacion).toBe(4)
  })
})

describe('las metas', () => {
  it('510 conceptos, y las preguntas la mitad porque su techo es justo la mitad', () => {
    let conceptos = 0, preguntas = 0
    for (let k = 1; k <= DIAS_META; k++) { conceptos += techoDelDia(k).conceptos; preguntas += techoDelDia(k).preguntas }
    expect(META_CONCEPTOS).toBe(510)
    // Si alguien cambia los techos, esta cuenta obliga a recalibrar en lugar de dejar la meta desfasada.
    expect(META_PREGUNTAS).toBe(Math.round(META_CONCEPTOS * preguntas / conceptos))
    expect(META_PREGUNTAS).toBe(255)
  })

  it('bajan a lo que existe cuando no queda material para cumplirlas', () => {
    const r = resumenMeta(entrada({
      ahora: mediodia(61), preguntasPublicadas: 100,
      primerasRespuestas: Array.from({ length: 40 }, (_, i) => inicioDelDiaMeta(1) - (i + 1) * DIA),
    }))
    expect(r.preguntas.meta).toBe(60)
    expect(r.preguntas.linea).toBe(60)
    expect(r.filas.at(-1)!.preguntas).toBe(60)
    expect(r.conceptos.meta).toBe(510)
  })
})

describe('la línea', () => {
  it('sigue los techos de Hoy: nada el viernes, el doble el fin de semana, y llega a la meta el último día', () => {
    expect(lineaPreguntas(0)).toBe(0)
    expect(lineaPreguntas(1)).toBe(0) // el viernes 25 no suma
    const lunes = lineaPreguntas(4) - lineaPreguntas(3) // lunes 28-sep
    const sabado = lineaPreguntas(9) - lineaPreguntas(8) // sábado 3-oct
    expect(lunes).toBeGreaterThan(0)
    expect(sabado).toBeCloseTo(2 * lunes, 9)
    expect(lineaPreguntas(8)).toBe(lineaPreguntas(7)) // el viernes 2-oct tampoco
    expect(lineaPreguntas(DIAS_META)).toBeCloseTo(META_PREGUNTAS, 9)
    expect(lineaConceptos(DIAS_META)).toBeCloseTo(META_CONCEPTOS, 9)
  })

  it('en conceptos va una semana por detrás: lo visto el sábado 26 queda dominado hacia el 3-oct', () => {
    expect(lineaConceptos(8)).toBe(0)
    expect(lineaConceptos(9)).toBeGreaterThan(0)
    // Siete días después, la misma forma que la de preguntas.
    const forma = (n: number) => lineaConceptos(n + 7) / lineaConceptos(14)
    expect(forma(3)).toBeCloseTo((lineaPreguntas(3) - lineaPreguntas(0)) / (lineaPreguntas(7) - lineaPreguntas(0)), 9)
  })

  it('nunca va más deprisa que los techos: ya cuenta con días malos', () => {
    for (let k = 1; k <= DIAS_META; k++) {
      expect(lineaConceptos(k) - lineaConceptos(k - 1)).toBeLessThanOrEqual(techoDelDia(k - 7 >= 1 ? k - 7 : k).conceptos)
      expect(lineaPreguntas(k) - lineaPreguntas(k - 1)).toBeLessThanOrEqual(techoDelDia(k).preguntas)
    }
  })
})

describe('el rumbo', () => {
  it('por delante, en la línea o por debajo, con un margen que no convierte un día flojo en ir detrás', () => {
    expect(rumboDe(10, 0)).toEqual({ rumbo: 'delante', distancia: 10 })
    expect(rumboDe(2, 0)).toEqual({ rumbo: 'linea', distancia: 0 })
    expect(rumboDe(5, 7.4)).toEqual({ rumbo: 'linea', distancia: 0 })
    expect(rumboDe(0, 3)).toEqual({ rumbo: 'debajo', distancia: 3 })
    expect(rumboDe(91, 100)).toEqual({ rumbo: 'linea', distancia: 0 })
    expect(rumboDe(109, 100)).toEqual({ rumbo: 'linea', distancia: 0 })
    expect(rumboDe(110, 100)).toEqual({ rumbo: 'delante', distancia: 10 })
    expect(rumboDe(89, 100)).toEqual({ rumbo: 'debajo', distancia: 11 })
  })
})

describe('lo que cuenta', () => {
  it('sólo lo de la ventana: lo dominado antes del 25-sep no suma, ni lo que llegue después del 23-nov', () => {
    const antes = inicioDelDiaMeta(1) - 1
    const r = resumenMeta(entrada({
      ahora: mediodia(61), conceptosPublicados: 600,
      dominadosEn: [antes, antes, mediodia(1), mediodia(30), mediodia(60), inicioDelDiaMeta(61) + 1],
    }))
    expect(r.conceptos.hechos).toBe(3)
    // Lo dominado antes ya no está disponible para la meta, pero con 598 sigue sobrando.
    expect(r.conceptos.meta).toBe(510)
  })

  it('lo que todavía no ha pasado no suma, aunque un reloj adelantado lo haya fechado', () => {
    const r = resumenMeta(entrada({ ahora: mediodia(10), dominadosEn: [mediodia(9), mediodia(10), mediodia(10) + 1, mediodia(12)] }))
    expect(r.conceptos.hechos).toBe(2)
  })

  it('una pregunta cuenta la primera vez que se responde, y sólo si está publicada y calificable', () => {
    const q = (id: string, status: NbmeQuestionMeta['status'] = 'ready') => ({ id, status }) as NbmeQuestionMeta
    const r = (id: string, questionId: string, submittedAt: number) => ({ id, questionId, submittedAt }) as NbmeAttempt
    const catalog = { questions: [q('Q1'), q('Q2'), q('Q3'), q('Q4', 'blocked')] } as NbmeCatalog
    const state = { sessions: {}, attempts: Object.fromEntries([
      r('a', 'Q1', mediodia(0)), r('b', 'Q1', mediodia(3)), // respondida antes: repetirla no es nueva
      r('c', 'Q2', mediodia(4)), r('d', 'Q2', mediodia(2)), // el orden de llegada no importa
      r('e', 'Q4', mediodia(3)), r('f', 'QX', mediodia(3)), // bloqueada o fuera del catálogo
    ].map(a => [a.id, a])) }
    const { marcas, publicadas } = primerasRespuestasNbme(state as never, catalog)
    expect(publicadas).toBe(3)
    expect(marcas.sort((a, b) => a - b)).toEqual([mediodia(0), mediodia(2)])
    expect(resumenMeta(entrada({ ahora: mediodia(5), primerasRespuestas: marcas, preguntasPublicadas: publicadas })).preguntas.hechos).toBe(1)
  })
})

describe('la proyección', () => {
  it('espera dos semanas: antes no hay ritmo que proyectar', () => {
    const marcas = siguiendo(lineaPreguntas, 13)
    expect(resumenMeta(entrada({ ahora: mediodia(14), primerasRespuestas: marcas })).preguntas.proyeccion).toBeNull()
    expect(resumenMeta(entrada({ ahora: mediodia(15), primerasRespuestas: siguiendo(lineaPreguntas, 14) })).preguntas.proyeccion).not.toBeNull()
    expect(resumenMeta(entrada({ ahora: mediodia(61), primerasRespuestas: siguiendo(lineaPreguntas, 60) })).preguntas.proyeccion).toBeNull()
  })

  it('siguiendo la línea lleva a la meta; a medio ritmo la última semana, a medio camino de lo que falta', () => {
    const enLinea = resumenMeta(entrada({ ahora: mediodia(15), primerasRespuestas: siguiendo(lineaPreguntas, 14) })).preguntas
    expect(enLinea.rumbo).toBe('linea')
    expect(Math.abs(enLinea.proyeccion! - META_PREGUNTAS)).toBeLessThanOrEqual(5)

    const semana1 = siguiendo(lineaPreguntas, 7)
    const semana2 = siguiendo(n => lineaPreguntas(7) + (lineaPreguntas(n) - lineaPreguntas(7)) / 2, 14, 8)
    const medio = resumenMeta(entrada({ ahora: mediodia(15), primerasRespuestas: [...semana1, ...semana2] })).preguntas
    const alEmpezarHoy = semana1.length + semana2.length
    expect(medio.proyeccion!).toBeGreaterThan(alEmpezarHoy)
    // El redondeo de las marcas a enteros deja unas pocas de holgura.
    expect(Math.abs(medio.proyeccion! - (alEmpezarHoy + (META_PREGUNTAS - lineaPreguntas(14)) / 2))).toBeLessThanOrEqual(8)

    const conceptos = resumenMeta(entrada({ ahora: mediodia(22), dominadosEn: siguiendo(lineaConceptos, 21) })).conceptos
    expect(Math.abs(conceptos.proyeccion! - META_CONCEPTOS)).toBeLessThanOrEqual(8)
  })

  it('lo de hoy mueve la barra pero no la proyección, que no baila a lo largo del día', () => {
    const base = siguiendo(lineaPreguntas, 14)
    const antes = resumenMeta(entrada({ ahora: mediodia(15), primerasRespuestas: base })).preguntas
    const despues = resumenMeta(entrada({ ahora: mediodia(15) + 3_600_000, primerasRespuestas: [...base, ...Array(10).fill(mediodia(15))] })).preguntas
    expect(despues.hechos).toBe(antes.hechos + 10)
    expect(despues.proyeccion).toBe(antes.proyeccion)
  })
})

describe('la tabla', () => {
  it('una fila por semana hasta el 23-nov, con la línea acumulada y la semana de hoy marcada', () => {
    const r = resumenMeta(entrada({ ahora: new Date(2026, 9, 20, 10).getTime() }))
    expect(r.filas).toHaveLength(10)
    expect(r.filas[0]).toMatchObject({ semana: 1, hasta: '2026-09-27', conceptos: 0 })
    expect(r.filas.at(-1)).toMatchObject({ semana: 10, hasta: '2026-11-23', conceptos: 510, preguntas: 255 })
    expect(r.filas.filter(f => f.actual).map(f => f.hasta)).toEqual(['2026-10-25'])
    // Ninguna semana pide más de lo que dan los techos en esa semana: 80 conceptos y 40 preguntas.
    r.filas.forEach((f, i) => {
      const previa = r.filas[i - 1]
      expect(f.conceptos - (previa?.conceptos ?? 0)).toBeLessThanOrEqual(80)
      expect(f.preguntas - (previa?.preguntas ?? 0)).toBeLessThanOrEqual(40)
    })
    expect(resumenMeta(entrada({ ahora: mediodia(0) })).filas.some(f => f.actual)).toBe(false)
  })
})
