// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Enfoque } from '../plan/Enfoque'
import { ATRIBUTO_PIEL, guardarPiel, pielGuardada, pielInicial } from '../lib/piel-estudio'

let host: HTMLDivElement
let root: Root

const limpiar = () => {
  try { localStorage.clear() } catch { /* sin almacenamiento en esta prueba */ }
  document.documentElement.removeAttribute(ATRIBUTO_PIEL)
}

const montarFoco = async () => {
  await act(async () => { root.render(<Enfoque minutos={20} etiqueta="Banco AMBOSS · cardiología" onTerminar={() => {}} />) })
}

const conmutador = () => host.querySelector('.piel-boton') as HTMLButtonElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  limpiar()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  limpiar()
})

describe('piel de las pantallas de concentración', () => {
  it('viste la ventana mientras el panel de foco está abierto y la devuelve al salir', async () => {
    guardarPiel('claro')
    await montarFoco()
    expect(document.documentElement.getAttribute(ATRIBUTO_PIEL)).toBe('claro')

    await act(async () => { root.render(<div />) })
    expect(document.documentElement.hasAttribute(ATRIBUTO_PIEL)).toBe(false)
  })

  it('el conmutador cambia la piel y la recuerda en este navegador', async () => {
    guardarPiel('claro')
    await montarFoco()
    expect(conmutador().getAttribute('aria-label')).toBe('Cambiar al modo noche')

    await act(async () => { conmutador().click() })
    expect(document.documentElement.getAttribute(ATRIBUTO_PIEL)).toBe('oscuro')
    expect(pielGuardada()).toBe('oscuro')
    expect(conmutador().getAttribute('aria-label')).toBe('Cambiar al modo día')
  })

  it('sin preferencia guardada decide el dispositivo: claro de día, oscuro de noche', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta.includes('light') }))
    expect(pielInicial()).toBe('claro')

    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(pielInicial()).toBe('oscuro')
  })

  it('una preferencia guardada manda sobre el dispositivo', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    guardarPiel('claro')
    expect(pielInicial()).toBe('claro')
  })
})
