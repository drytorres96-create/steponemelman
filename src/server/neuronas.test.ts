import { describe, expect, it } from 'vitest'
import {
  FRACCION_POR_USUARIO, PRESUPUESTO_DIARIO, PRESUPUESTO_UTIL, TARIFA_ENTRADA, TARIFA_SALIDA,
  costeEstimado, costeReal, neuronasDe, techoDeModo, tokensDeTexto, tokensUsados,
} from './neuronas'

/**
 * El presupuesto es la única defensa contra pasarse del regalo diario: no hay plan de pago
 * detrás, así que un error de cuenta aquí no encarece nada, apaga la ayuda a media semana.
 */
describe('presupuesto de neuronas', () => {
  it('cobra con las tarifas publicadas del modelo y redondea hacia arriba', () => {
    expect(neuronasDe(1_000_000, 0)).toBe(TARIFA_ENTRADA)
    expect(neuronasDe(0, 1_000_000)).toBe(TARIFA_SALIDA)
    expect(neuronasDe(1, 0)).toBe(1) // nunca sale gratis un resto
    expect(neuronasDe(0, 0)).toBe(0)
  })

  it('la salida pesa mucho más que la entrada: explicar es caro por lo que escribe', () => {
    expect(neuronasDe(0, 100)).toBeGreaterThan(neuronasDe(700, 0))
  })

  it('deja sin tocar una reserva del regalo diario', () => {
    expect(PRESUPUESTO_UTIL).toBeLessThan(PRESUPUESTO_DIARIO)
    expect(PRESUPUESTO_UTIL).toBeGreaterThan(PRESUPUESTO_DIARIO * 0.75)
    expect(PRESUPUESTO_UTIL * FRACCION_POR_USUARIO).toBeLessThan(PRESUPUESTO_UTIL)
  })

  it('corregir llega hasta el final del presupuesto y explicar se corta antes', () => {
    expect(techoDeModo('calificar')).toBe(PRESUPUESTO_UTIL)
    expect(techoDeModo('explicar')).toBeLessThan(techoDeModo('analizar'))
    expect(techoDeModo('analizar')).toBeLessThan(techoDeModo('calificar'))
  })

  it('la estimación sobrestima antes que quedarse corta', () => {
    const texto = 'x'.repeat(3500)
    expect(tokensDeTexto(texto)).toBe(1000)
    expect(costeEstimado(texto, 550)).toBe(neuronasDe(1000, 550))
    expect(costeEstimado('', 0)).toBe(0)
  })

  it('con el consumo real se cobra ese; sin él se conserva la reserva', () => {
    expect(tokensUsados({ usage: { prompt_tokens: 300, completion_tokens: 40 } })).toEqual({ entrada: 300, salida: 40 })
    expect(tokensUsados({ usage: { prompt_tokens: -1, completion_tokens: 40 } })).toBeNull()
    expect(tokensUsados({ response: 'sin uso' })).toBeNull()
    expect(tokensUsados(undefined)).toBeNull()
    expect(costeReal({ usage: { prompt_tokens: 300, completion_tokens: 40 } }, 120)).toBe(neuronasDe(300, 40))
    expect(costeReal({ response: 'sin uso' }, 120)).toBe(120)
  })

  it('el presupuesto da para muchas más correcciones de las que cabían contando llamadas', () => {
    // Una corrección típica: material de un concepto y un veredicto de dos líneas.
    const tipica = costeEstimado('x'.repeat(4000), 160)
    expect(Math.floor(techoDeModo('calificar') / tipica)).toBeGreaterThan(30)
  })
})
