// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El medidor de la IA gratuita.
 *
 * Es el único sitio donde el presupuesto se ve sin haberlo gastado antes, así que tiene
 * que ser fiel: lo que pinta es lo que el servidor ha contabilizado, no una estimación
 * optimista, y baja cuando algo gasta.
 */
const sesion = vi.hoisted(() => ({ token: 'token-de-prueba' as string | null }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: sesion.token ? { access_token: sesion.token } : null } }) } },
}))

import { MedidorIA } from '../components/MedidorIA'
import { notificarUsoIA, olvidarCuota, porcentajeRestante, refrescarCuota } from '../lib/cuota-ia'

const cuota = (restantes: number, extra: Record<string, unknown> = {}) => Response.json({
  presupuesto: 8500, gastadas: 8500 - restantes, restantes, llamadas: 3, activa: true, ...extra,
})

let host: HTMLDivElement, root: Root
const red = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  sesion.token = 'token-de-prueba'
  olvidarCuota()
  red.mockReset().mockResolvedValue(cuota(7650))
  vi.stubGlobal('fetch', red)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers() })

const pintar = async () => { await act(async () => { root.render(<MedidorIA />); await Promise.resolve() }) }
const arco = () => host.querySelector('.medidor-arco') as SVGCircleElement | null

describe('medidor de la IA gratuita', () => {
  it('pinta el porcentaje que queda y lo lleva al anillo', async () => {
    await pintar()
    expect(host.textContent).toContain('90')
    expect(host.textContent).toContain('IA gratis hoy')
    expect(host.textContent).toContain('90 % disponible')
    // El arco tapado es el gasto: al 90 % restante queda un 10 % del perímetro oculto.
    const perimetro = 2 * Math.PI * 30
    expect(Number(arco()!.getAttribute('stroke-dashoffset'))).toBeCloseTo(perimetro * 0.1, 5)
  })

  it('avisa cuando queda poco y cuando no queda nada', async () => {
    red.mockResolvedValue(cuota(850))
    await pintar()
    expect(host.querySelector('.medidor-bajo')).toBeTruthy()

    // Ya montado, el medidor se entera por el store: no hace falta volver a pintarlo.
    red.mockResolvedValue(cuota(0))
    await act(async () => { await refrescarCuota(true) })
    expect(host.textContent).toContain('Sin cuota hoy')
    expect(host.textContent).toContain('00:00 UTC')
  })

  it('el primer dato aparece directo; solo los cambios se cuentan', async () => {
    vi.useFakeTimers()
    await pintar()
    // Sin avanzar un solo fotograma: al entrar se lee el dato, no un contador arrancando.
    expect(host.querySelector('.medidor-valor')!.textContent).toBe('90%')

    red.mockResolvedValue(cuota(1700))
    await act(async () => { await refrescarCuota(true) })
    const enCamino = host.querySelector('.medidor-valor')!.textContent
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(host.querySelector('.medidor-valor')!.textContent).toBe('20%')
    expect(enCamino).not.toBe('20%')
  })

  it('agotada se distingue de baja, para que el rojo signifique algo', async () => {
    red.mockResolvedValue(cuota(0))
    await pintar()
    expect(host.querySelector('.medidor-cero')).toBeTruthy()
    expect(host.querySelector('.medidor-bajo')).toBeTruthy()

    red.mockResolvedValue(cuota(1700))
    await act(async () => { await refrescarCuota(true) })
    expect(host.querySelector('.medidor-cero')).toBeNull()
    expect(host.querySelector('.medidor-bajo')).toBeTruthy()
  })

  it('con la ayuda apagada lo dice en vez de fingir que hay cuota', async () => {
    red.mockResolvedValue(cuota(8500, { activa: false }))
    await pintar()
    expect(host.textContent).toContain('desactivada')
    expect(host.querySelector('.medidor-apagado')).toBeTruthy()
    // El anillo apagado no pinta un saldo falso: el número sigue siendo el real.
    expect(host.textContent).toContain('100')
  })

  it('baja después de un uso, sin que la pantalla tenga que pedir nada', async () => {
    vi.useFakeTimers()
    await pintar()
    expect(host.textContent).toContain('90 % disponible')

    red.mockResolvedValue(cuota(4250))
    notificarUsoIA()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(host.textContent).toContain('50 % disponible')
  })

  it('sin sesión o con la red caída conserva el último dato en vez de vaciarse', async () => {
    await pintar()
    expect(host.textContent).toContain('90 % disponible')

    red.mockRejectedValue(new TypeError('sin red'))
    await act(async () => { await refrescarCuota(true) })
    expect(host.textContent).toContain('90 % disponible')

    sesion.token = null
    await act(async () => { await refrescarCuota(true) })
    expect(host.textContent).toContain('90 % disponible')
  })

  it('sin dato todavía no ocupa sitio, y el porcentaje nunca se sale de la escala', async () => {
    olvidarCuota()
    red.mockResolvedValue(new Response('no es json', { headers: { 'content-type': 'text/plain' } }))
    await pintar()
    expect(host.textContent).toBe('')
    expect(porcentajeRestante({ presupuesto: 8500, gastadas: 0, restantes: 99999, llamadas: 0, activa: true })).toBe(100)
    expect(porcentajeRestante({ presupuesto: 8500, gastadas: 8500, restantes: -5, llamadas: 0, activa: true })).toBe(0)
  })
})
