// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ analizar: vi.fn() }))
vi.mock('../lib/error-ia', () => ({ analizarError: mock.analizar }))
import { CorreccionErrorIA } from '../components/CorreccionErrorIA'
const peticion = { tipo: 'nbme' as const, questionId: 'NBME27-P0001', revision: 'QA-r1', optionId: 'B' }
const correccion = { observado: 'Elegiste beta.', confusion: 'Puede que hayas invertido el orden.', clave: 'Se pide el primero.', evitar: 'Comprueba el orden solicitado.', evidencia: 'Alfa es el primer elemento.' }
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  mock.analizar.mockReset().mockResolvedValue({ estado: 'ok', data: correccion })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
describe('corrección personalizada después del intento', () => {
  it('analiza automáticamente una vez y distingue una hipótesis de un razonamiento escrito', async () => {
    await act(async () => { root.render(<CorreccionErrorIA peticion={peticion} />) })
    expect(mock.analizar).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('Posible confusión')
    expect(host.textContent).toContain(correccion.clave)
    const input = host.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Pensé en el segundo elemento.')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(mock.analizar).toHaveBeenCalledOnce()
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(mock.analizar.mock.calls[1][0]).toMatchObject({ ...peticion, razonamiento: 'Pensé en el segundo elemento.' })
    expect(host.textContent).toContain('Revisión de tu razonamiento')
  })
  it('sin cuota conserva el material y no reintenta solo', async () => {
    mock.analizar.mockResolvedValue({ estado: 'sin_ia', motivo: 'Cuota agotada.' })
    await act(async () => { root.render(<CorreccionErrorIA peticion={peticion} />) })
    expect(host.textContent).toContain('Cuota agotada')
    expect(host.textContent).toContain('puedes seguir')
    expect(mock.analizar).toHaveBeenCalledOnce()
  })
  it('salir cancela la ayuda sin guardar una respuesta extra', async () => {
    mock.analizar.mockImplementation(() => new Promise(() => {}))
    await act(async () => { root.render(<CorreccionErrorIA peticion={peticion} />) })
    const signal = mock.analizar.mock.calls[0][1] as AbortSignal
    await act(async () => { root.render(<div>Continuar</div>) })
    expect(signal.aborted).toBe(true)
  })
})
