// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnilloDoble, type SegmentoAnillo } from './comunes'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function pintar(segmentos: SegmentoAnillo[], valor: number, total: number) {
  await act(async () => root.render(<AnilloDoble
    interior={{ valor: 1, total: 5, etiqueta: 'Trabajo de hoy' }}
    exterior={{ valor, total, etiqueta: 'Conceptos únicos con dominio demostrado' }} segmentos={segmentos} />))
}

/** Fracción de la pista exterior que queda cubierta en el SVG realmente renderizado. */
function arcosVisibles() {
  return [...host.querySelectorAll('g')].map(g => {
    const [pista, avance] = g.querySelectorAll('circle')
    return { pista: Number.parseFloat(pista.getAttribute('stroke-dasharray')!),
      avance: Number.parseFloat(avance.getAttribute('stroke-dasharray')!) }
  })
}
const proporcionVisible = () => {
  const arcos = arcosVisibles()
  return arcos.reduce((n, a) => n + a.avance, 0) / arcos.reduce((n, a) => n + a.pista, 0)
}

describe('el anillo conserva el denominador de conceptos', () => {
  it('un concepto dominado entre diez ocupa 10%, aunque cierre una sesión completa', async () => {
    await pintar([{ valor: 1, total: 1 }, { valor: 0, total: 9 }], 1, 10)
    expect(proporcionVisible()).toBeCloseTo(.1, 10)
    const [pequena, grande] = arcosVisibles()
    expect(grande.pista / pequena.pista).toBeCloseTo(9, 10)
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('1 de 10')
  })

  it('los huecos entre sesiones no alteran la proporción global de cinco entre diez', async () => {
    await pintar([{ valor: 1, total: 1 }, { valor: 4, total: 9 }], 5, 10)
    expect(proporcionVisible()).toBeCloseTo(.5, 10)
  })

  it('las sesiones sin conceptos no añaden un tramo vacío ni diluyen el avance', async () => {
    await pintar([{ valor: 0, total: 0 }, { valor: 2, total: 2 }, { valor: 1, total: 8 }], 3, 10)
    expect(arcosVisibles()).toHaveLength(2)
    expect(proporcionVisible()).toBeCloseTo(.3, 10)
  })

  it('el dominio completo llena toda la pista disponible con sesiones de tamaños distintos', async () => {
    await pintar([{ valor: 2, total: 2 }, { valor: 8, total: 8 }], 10, 10)
    expect(proporcionVisible()).toBeCloseTo(1, 10)
  })

  it('sin segmentos usa la población exterior y conserva su fracción', async () => {
    await pintar([], 3, 4)
    expect(arcosVisibles()).toHaveLength(1)
    expect(proporcionVisible()).toBeCloseTo(.75, 10)
  })

  it('sin población mantiene la pista vacía, sin NaN ni un acierto ficticio', async () => {
    await pintar([{ valor: 0, total: 0 }], 0, 0)
    expect(proporcionVisible()).toBe(0)
    expect(host.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('0 de 0')
  })
})
