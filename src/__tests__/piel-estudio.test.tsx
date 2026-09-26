// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Enfoque } from '../plan/Enfoque'
import { BotonPiel, usePielEstudio } from '../components/PielEstudio'
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

  it('una sesión y su reproductor comparten la piel: salir del reproductor no la quita, salir de la sesión sí', async () => {
    guardarPiel('claro')
    function Reproductor() {
      const piel = usePielEstudio()
      return <BotonPiel piel={piel.piel} alternar={piel.alternar} />
    }
    function Sesion({ conReproductor }: { conReproductor: boolean }) {
      const piel = usePielEstudio()
      return <div><p className="piel-sesion">{piel.piel}</p>{conReproductor && <Reproductor />}</div>
    }
    await act(async () => { root.render(<Sesion conReproductor />) })
    expect(document.documentElement.getAttribute(ATRIBUTO_PIEL)).toBe('claro')
    // Cambiarla en el reproductor la cambia para toda la sesión.
    await act(async () => { conmutador().click() })
    expect(host.querySelector('.piel-sesion')?.textContent).toBe('oscuro')
    // Como al pasar de un concepto a una pregunta NBME: el reproductor se va y la piel se queda.
    await act(async () => { root.render(<Sesion conReproductor={false} />) })
    expect(document.documentElement.getAttribute(ATRIBUTO_PIEL)).toBe('oscuro')
    await act(async () => { root.render(<div />) })
    expect(document.documentElement.hasAttribute(ATRIBUTO_PIEL)).toBe(false)
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
