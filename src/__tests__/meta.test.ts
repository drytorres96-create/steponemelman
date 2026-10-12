import { describe, expect, it } from 'vitest'
import { TECHOS, tipoDeDia } from '../lib/dia'
import {
  DIAS_META, META_CONCEPTOS, META_PREGUNTAS, diaDeLaMeta, fechaDelDia, inicioDelDiaMeta, lineaConceptos,
  lineaPreguntas, primerasRespuestasNbme, resumenMeta, rumboDe, distanciasMeta, type EntradaMeta,
} from '../lib/meta'
import type { NbmeAttempt, NbmeCatalog, NbmeQuestionMeta } from '../nbme/types'

/**
 * La meta de 43 días es la vista a futuro de los techos de Hoy. Lo que se comprueba
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
  return TECHOS[tipoDeDia(fechaDelDia(k).getTime())]
}

describe('la ventana', () => {
  it('va del lunes 12-oct al lunes 23-nov, con el corte de las 3:00', () => {
    expect(DIAS_META).toBe(43)
    expect(diaDeLaMeta(Date.parse('2026-10-12T02:59:00-04:00'))).toBe(0)
    expect(diaDeLaMeta(Date.parse('2026-10-12T03:00:00-04:00'))).toBe(1)
    expect(diaDeLaMeta(Date.parse('2026-10-13T10:00:00-04:00'))).toBe(2)
    expect(diaDeLaMeta(Date.parse('2026-11-23T12:00:00-05:00'))).toBe(43)
    expect(diaDeLaMeta(Date.parse('2026-11-24T02:59:00-05:00'))).toBe(43)
    expect(diaDeLaMeta(Date.parse('2026-11-24T03:00:00-05:00'))).toBe(44)
    expect(fechaDelDia(1).getUTCDay()).toBe(1)
    expect(fechaDelDia(DIAS_META).toISOString()).toBe('2026-11-23T17:00:00.000Z')
  })

  it('deja cuatro semanas enteras para consolidar antes del examen', () => {
    expect(resumenMeta(entrada()).semanasConsolidacion).toBe(4)
  })
})

describe('las metas', () => {
  it('180 conceptos, y las preguntas en la proporción de sus techos en la ventana: 44', () => {
    let conceptos = 0, preguntas = 0
    for (let k = 1; k <= DIAS_META; k++) { conceptos += techoDelDia(k).conceptos; preguntas += techoDelDia(k).preguntas }
    // Seis semanas de lunes a domingo más el lunes 23-nov: 6 × 40 + 5 conceptos, y sólo los fines de semana, 6 × 10 preguntas.
    expect([conceptos, preguntas]).toEqual([245, 60])
    expect(META_CONCEPTOS).toBe(180)
    // Si alguien cambia los techos, esta cuenta obliga a recalibrar en lugar de dejar la meta desfasada.
    expect(META_PREGUNTAS).toBe(Math.round(META_CONCEPTOS * preguntas / conceptos))
    expect(META_PREGUNTAS).toBe(44)
  })

  it('bajan a lo que existe cuando no queda material para cumplirlas', () => {
    // 60 publicadas y 40 ya respondidas antes de la ventana: quedan 20, menos que las 44 de la meta.
    const r = resumenMeta(entrada({
      ahora: mediodia(DIAS_META + 1), preguntasPublicadas: 60,
      primerasRespuestas: Array.from({ length: 40 }, (_, i) => inicioDelDiaMeta(1) - (i + 1) * DIA),
    }))
    expect(r.preguntas.meta).toBe(20)
    expect(r.preguntas.meta).toBeLessThan(META_PREGUNTAS)
    expect(r.preguntas.linea).toBe(20)
    expect(r.filas.at(-1)!.preguntas).toBe(20)
    expect(r.conceptos.meta).toBe(META_CONCEPTOS)
  })
})

describe('la línea', () => {
  it('es monótona y finita antes, durante y después de los días de la ventana', () => {
    for (const [linea, meta] of [[lineaConceptos, META_CONCEPTOS], [lineaPreguntas, META_PREGUNTAS]] as const) {
      let anterior = 0
      for (let dia = -30; dia <= 100; dia++) {
        const valor = linea(dia)
        expect(valor).toBeGreaterThanOrEqual(anterior)
        expect(valor).toBeGreaterThanOrEqual(0)
        expect(valor).toBeLessThanOrEqual(meta)
        if (dia <= 0) expect(valor).toBe(0)
        if (dia >= DIAS_META) expect(valor).toBe(meta)
        anterior = valor
      }
    }
  })

  it('sigue los techos de Hoy: nada el viernes, el doble de conceptos el fin de semana, preguntas sólo en sábado y domingo, y llega a la meta el último día', () => {
    expect(lineaPreguntas(0)).toBe(0)
    // Entre semana el techo de preguntas es cero: de lunes 12 a jueves 15 no suma, ni el viernes 16.
    expect(lineaPreguntas(5)).toBe(0)
    const sabado = lineaPreguntas(6) - lineaPreguntas(5) // sábado 17-oct
    const domingo = lineaPreguntas(7) - lineaPreguntas(6) // domingo 18-oct
    expect(sabado).toBeGreaterThan(0)
    expect(domingo).toBeCloseTo(sabado, 9)
    expect(lineaPreguntas(12)).toBe(lineaPreguntas(7)) // de lunes 19 a viernes 23, tampoco
    // En conceptos, con su semana de margen: lo del lunes 12 entra el 19 y lo del sábado 17, el doble, el 24.
    const lunes = lineaConceptos(8) - lineaConceptos(7)
    const sabadoConceptos = lineaConceptos(13) - lineaConceptos(12)
    expect(lunes).toBeGreaterThan(0)
    expect(sabadoConceptos).toBeCloseTo(2 * lunes, 9)
    expect(lineaConceptos(12)).toBe(lineaConceptos(11)) // lo del viernes 16 no suma
    expect(lineaPreguntas(DIAS_META)).toBeCloseTo(META_PREGUNTAS, 9)
    expect(lineaConceptos(DIAS_META)).toBeCloseTo(META_CONCEPTOS, 9)
  })

  it('en conceptos va una semana por detrás: lo visto el lunes 12 queda dominado hacia el 19-oct', () => {
    expect(lineaConceptos(7)).toBe(0)
    expect(lineaConceptos(8)).toBeGreaterThan(0)
    // Siete días después, la misma forma que los techos de conceptos de Hoy.
    const forma = (n: number) => lineaConceptos(n + 7) / lineaConceptos(14)
    const techos = (n: number) => Array.from({ length: n }, (_, i) => techoDelDia(i + 1).conceptos).reduce((a, b) => a + b, 0)
    expect(forma(3)).toBeCloseTo(techos(3) / techos(7), 9)
  })

  it('nunca va más deprisa que los techos: ya cuenta con días malos', () => {
    for (let k = 1; k <= DIAS_META; k++) {
      expect(lineaConceptos(k) - lineaConceptos(k - 1)).toBeLessThanOrEqual(techoDelDia(k - 7 >= 1 ? k - 7 : k).conceptos)
      expect(lineaPreguntas(k) - lineaPreguntas(k - 1)).toBeLessThanOrEqual(techoDelDia(k).preguntas)
    }
  })
})

describe('el rumbo', () => {
  it('separa igualdad, superar por una unidad y completar la meta del margen de planificación', () => {
    expect(distanciasMeta({ hechos: 17, linea: 50, meta: 510 })).toEqual({ igualarLinea: 33, superarLinea: 34, completarMeta: 493 })
    expect(distanciasMeta({ hechos: 23, linea: 52, meta: 255 })).toEqual({ igualarLinea: 29, superarLinea: 30, completarMeta: 232 })
    expect(distanciasMeta({ hechos: 50, linea: 50, meta: 510 })).toEqual({ igualarLinea: 0, superarLinea: 1, completarMeta: 460 })
    expect(distanciasMeta({ hechos: 51, linea: 50, meta: 510 })).toEqual({ igualarLinea: 0, superarLinea: 0, completarMeta: 459 })
    expect(rumboDe(51, 50).rumbo).toBe('linea')
    expect(distanciasMeta({ hechos: 515, linea: 510, meta: 510 })).toEqual({ igualarLinea: 0, superarLinea: 0, completarMeta: 0 })
  })

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
  it('una fecha desconocida o futura no se convierte en actividad ni en dominio anterior', () => {
    const r = resumenMeta(entrada({ ahora: mediodia(13), conceptosPublicados: 3,
      dominadosEn: [0, Number.NaN, Number.POSITIVE_INFINITY, mediodia(14), mediodia(13) + 0.5] }))
    expect(r.conceptos.hechos).toBe(0)
    expect(r.conceptos.meta).toBe(3)
  })

  it('un primer hito anterior sigue consumiendo disponibilidad aunque hoy haya perdido dominio', () => {
    const r = resumenMeta(entrada({ ahora: mediodia(DIAS_META + 1), conceptosPublicados: 3,
      dominadosEn: [mediodia(12)], primerasAcreditaciones: [mediodia(0), mediodia(12)] }))
    expect(r.conceptos.hechos).toBe(1)
    expect(r.conceptos.meta).toBe(2)
    expect(r.conceptos.linea).toBe(2)
    expect(r.filas.at(-1)?.conceptos).toBe(2)
  })

  it('sólo lo de la ventana: lo dominado antes del 12-oct no suma, ni lo que llegue después del 23-nov', () => {
    const antes = inicioDelDiaMeta(1) - 1
    const r = resumenMeta(entrada({
      ahora: mediodia(DIAS_META + 1), conceptosPublicados: 600,
      dominadosEn: [antes, antes, mediodia(1), mediodia(22), mediodia(DIAS_META), inicioDelDiaMeta(DIAS_META + 1) + 1],
    }))
    expect(r.conceptos.hechos).toBe(3)
    // Lo dominado antes ya no está disponible para la meta, pero con 598 sigue sobrando.
    expect(r.conceptos.meta).toBe(META_CONCEPTOS)
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
    expect(resumenMeta(entrada({ ahora: mediodia(DIAS_META + 1), primerasRespuestas: siguiendo(lineaPreguntas, DIAS_META) })).preguntas.proyeccion).toBeNull()
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
    // Martes 20-oct: segunda semana de la ventana, la que acaba el domingo 25.
    const r = resumenMeta(entrada({ ahora: Date.parse('2026-10-20T10:00:00-04:00') }))
    // Seis semanas de lunes a domingo, del 12-oct al 22-nov, y el lunes 23-nov solo.
    expect(r.filas).toHaveLength(7)
    expect(r.filas[0]).toMatchObject({ semana: 1, hasta: '2026-10-18', conceptos: 0 })
    expect(r.filas.at(-1)).toMatchObject({ semana: 7, hasta: '2026-11-23', conceptos: 180, preguntas: 44 })
    expect(r.filas.filter(f => f.actual).map(f => f.hasta)).toEqual(['2026-10-25'])
    // Ninguna semana pide más de lo que dan los techos en esa semana: 40 conceptos y 10 preguntas.
    const semanaConceptos = 4 * TECHOS.semana.conceptos + 2 * TECHOS.finde.conceptos
    const semanaPreguntas = 4 * TECHOS.semana.preguntas + 2 * TECHOS.finde.preguntas
    expect([semanaConceptos, semanaPreguntas]).toEqual([40, 10])
    r.filas.forEach((f, i) => {
      const previa = r.filas[i - 1]
      expect(f.conceptos - (previa?.conceptos ?? 0)).toBeLessThanOrEqual(semanaConceptos)
      expect(f.preguntas - (previa?.preguntas ?? 0)).toBeLessThanOrEqual(semanaPreguntas)
    })
    expect(resumenMeta(entrada({ ahora: mediodia(0) })).filas.some(f => f.actual)).toBe(false)
  })
})
