// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import { filaSintetica } from './vinetas-fixtures'

const mock = vi.hoisted(() => ({ cargar: vi.fn(), app: vi.fn(), registrarIntento: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'cuenta-qa' }, signOut: vi.fn() }) }))
vi.mock('../vinetas/api', () => ({ cargarVinetas: mock.cargar }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({
  state: { sessions: {}, attempts: {}, activeSessionId: null }, catalog: { questions: [] }, pauseSession: vi.fn(),
  syncNow: vi.fn().mockResolvedValue(true), loading: false, busy: false, syncStatus: { state: 'synced', message: '' },
}) }))
vi.mock('../semana/api', () => ({ cargarHistorialSesiones: vi.fn().mockResolvedValue([]), guardarAvance: vi.fn() }))
vi.mock('../data/corpus', () => ({ cargarTodo: vi.fn().mockResolvedValue([]), cargarConceptos: vi.fn(), cargarModulo: vi.fn() }))
vi.mock('../screens/Modulos', () => ({ Modulos: () => <p>Lista de conceptos</p> }))

import App from '../App'
import { VinetasInicio, VinetasSesion } from '../vinetas/Vinetas'
import { leerVineta, SET_VINETAS, type Vineta } from '../vinetas/modelo'

let host: HTMLDivElement
let root: Root
const vinetas = (n: number, desde = 0) => Array.from({ length: n }, (_, i) => leerVineta(filaSintetica(desde + i)) as Vineta)
const guardado = () => JSON.parse(localStorage.getItem(`step1-vinetas:cuenta-qa:${SET_VINETAS}`) ?? 'null')
const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === texto)
const pulsar = (key: string) => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => { (document.activeElement ?? document.body).dispatchEvent(evento) })
  return evento
}
const pintar = async (nodo: React.ReactNode) => {
  await act(async () => { root.render(nodo) })
  await act(async () => { await new Promise(listo => setTimeout(listo, 0)) })
}
const clic = async (texto: string) => {
  expect(boton(texto), texto).toBeTruthy()
  await act(async () => { boton(texto)!.click() })
}
/** Elige con la letra, comprueba con Intro y pasa con el botón que recibió el foco. */
async function responder(letra: string) {
  pulsar(letra)
  pulsar('Enter')
  const foco = document.activeElement as HTMLButtonElement
  expect(['Siguiente viñeta', 'Terminar']).toContain(foco.textContent)
  await act(async () => { foco.click() })
  await act(async () => { await new Promise(listo => setTimeout(listo, 0)) })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  mock.app.mockImplementation(() => ({
    listo: true, indice: { n_conceptos: 1, modulos: [], documentos: [], glosario: [], cuarentena: 0 },
    estado: { ...ESTADO_INICIAL }, sincronizacion: { estado: 'sincronizado', mensaje: '' }, sincronizarAhora: vi.fn().mockResolvedValue(true),
    registrarIntento: mock.registrarIntento, avisoLocal: null, descartarAvisoLocal: vi.fn(),
  }))
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
})

describe('una viñeta tras otra', () => {
  it('la letra elige, Intro comprueba y se consume, y el foco pasa a «Siguiente viñeta»', async () => {
    await pintar(<VinetasSesion vinetas={vinetas(2)} onSalir={vi.fn()} />)
    expect(document.activeElement?.id).toBe('vineta-titulo')
    expect(host.textContent).toContain('Generada por IA · sin revisión clínica')
    pulsar('b')
    expect(host.querySelector<HTMLInputElement>('input[value="B"]')?.checked).toBe(true)
    const intro = pulsar('Enter')
    expect(intro.defaultPrevented).toBe(true)
    expect(host.textContent).toContain('No: la respuesta es C')
    expect(host.textContent).toContain('Tu opción, B: No es B por una razón sintética.')
    expect(host.textContent).toContain('Patrón: Si ves lo sintético')
    expect(document.activeElement).toBe(boton('Siguiente viñeta'))
    // Tras corregir, las letras ya no cambian la respuesta.
    pulsar('c')
    expect(host.querySelector<HTMLInputElement>('input[value="B"]')?.checked).toBe(true)
  })

  it('la respuesta y la marca de dudosa se guardan sólo en este navegador, sin tocar el progreso de estudio', async () => {
    const onSalir = vi.fn()
    await pintar(<VinetasSesion vinetas={vinetas(2)} onSalir={onSalir} />)
    pulsar('b'); pulsar('Enter')
    expect(guardado().respuestas['qa-0']).toMatchObject({ opcion: 'B', correcta: false })
    await clic('Marcar como dudosa')
    expect(boton('Marcada como dudosa')?.getAttribute('aria-pressed')).toBe('true')
    expect(Object.keys(guardado().dudosas)).toEqual(['qa-0'])
    await clic('Siguiente viñeta')
    await responder('c')
    expect(host.textContent).toContain('Respondiste 2: 1 correctas.')
    expect(guardado().respuestas['qa-1']).toMatchObject({ opcion: 'C', correcta: true })
    await clic('Volver a las viñetas')
    expect(onSalir).toHaveBeenCalledOnce()
    expect(mock.app).not.toHaveBeenCalled()
    expect(mock.registrarIntento).not.toHaveBeenCalled()
  })

  it('Intro sobre un botón manda el botón, y sin respuesta elegida no comprueba', async () => {
    await pintar(<VinetasSesion vinetas={vinetas(1)} onSalir={vi.fn()} />)
    expect(pulsar('Enter').defaultPrevented).toBe(false)
    expect(host.textContent).not.toContain('Correcto')
    pulsar('c')
    boton('Salir')!.focus()
    expect(pulsar('Enter').defaultPrevented).toBe(false)
    expect(host.textContent).not.toContain('Correcto')
  })

  it('tras 20 seguidas sugiere una pausa con el foco en «Seguir», y no la pide al final', async () => {
    await pintar(<VinetasSesion vinetas={vinetas(21)} onSalir={vi.fn()} />)
    for (let i = 0; i < 20; i++) {
      expect(host.textContent).not.toContain('Pausa sugerida')
      await responder('c')
    }
    expect(host.textContent).toContain('Pausa sugerida')
    expect(document.activeElement).toBe(boton('Seguir'))
    await clic('Seguir')
    await act(async () => { await new Promise(listo => setTimeout(listo, 0)) })
    expect(host.textContent).toContain('21 de 21')
    await responder('c')
    expect(host.textContent).not.toContain('Pausa sugerida')
    expect(host.textContent).toContain('Respondiste 21: 21 correctas.')
  })

  it('viste la ventana con la piel de estudio mientras dura', async () => {
    await pintar(<VinetasSesion vinetas={vinetas(1)} onSalir={vi.fn()} />)
    expect(document.documentElement.getAttribute('data-piel-estudio')).toMatch(/^(claro|oscuro)$/)
    await act(async () => { root.unmount() })
    expect(document.documentElement.hasAttribute('data-piel-estudio')).toBe(false)
    root = createRoot(host)
  })
})

describe('la entrada del piloto', () => {
  it('cuenta lo hecho por disciplina y abre sólo lo pendiente, las falladas o las dudosas', async () => {
    const filas = [filaSintetica(0), filaSintetica(1), filaSintetica(2), filaSintetica(3, 'Microbiología')]
    mock.cargar.mockResolvedValue({ vinetas: filas.map(leerVineta), descartadas: 0, desdeCopia: false })
    localStorage.setItem(`step1-vinetas:cuenta-qa:${SET_VINETAS}`, JSON.stringify({
      respuestas: { 'qa-0': { opcion: 'A', correcta: false, ts: 1 }, 'qa-3': { opcion: 'C', correcta: true, ts: 2 } }, dudosas: { 'qa-2': 3 } }))
    const onEmpezar = vi.fn()
    await pintar(<VinetasInicio onEmpezar={onEmpezar} />)
    expect(host.textContent).toContain('Sin revisión clínica')
    expect(host.textContent).toContain('Bioquímica · 1 de 3 hechas')
    expect(host.textContent).toContain('Microbiología · 1 de 1 hechas')
    expect(boton('Hechas todas')?.disabled).toBe(true)
    await clic('Empezar bioquímica (2)')
    expect(onEmpezar.mock.calls[0][0].map((v: Vineta) => v.id)).toEqual(['qa-1', 'qa-2'])
    await clic('Repasar las falladas (1)')
    expect(onEmpezar.mock.calls[1][0].map((v: Vineta) => v.id)).toEqual(['qa-0'])
    await clic('Ver las dudosas (1)')
    expect(onEmpezar.mock.calls[2][0].map((v: Vineta) => v.id)).toEqual(['qa-2'])
  })

  it('si no carga, lo dice y deja reintentar', async () => {
    mock.cargar.mockRejectedValueOnce(new Error('No se pudieron cargar las viñetas.'))
      .mockResolvedValueOnce({ vinetas: [leerVineta(filaSintetica(0))], descartadas: 0, desdeCopia: true })
    await pintar(<VinetasInicio onEmpezar={vi.fn()} />)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar las viñetas.')
    await clic('Volver a intentar')
    await act(async () => { await Promise.resolve() })
    expect(host.textContent).toContain('Sin conexión: usas la copia guardada en este dispositivo.')
    expect(boton('Empezar bioquímica (1)')).toBeTruthy()
  })
})

describe('en la aplicación', () => {
  it('«Elegir contenido → Viñetas (piloto)» abre una vista de concentración y «Salir» vuelve a la pestaña', async () => {
    mock.cargar.mockResolvedValue({ vinetas: [leerVineta(filaSintetica(0))], descartadas: 0, desdeCopia: false })
    window.history.replaceState(null, '', '/#modulos')
    await pintar(<App />)
    await clic('Viñetas (piloto)')
    await act(async () => { await Promise.resolve() })
    await clic('Empezar bioquímica (1)')
    expect(host.querySelector('[data-view="vinetas"]')).not.toBeNull()
    expect(host.querySelector('.study-focus')).not.toBeNull()
    expect(host.querySelector('nav[aria-label="Navegación principal"]')).toBeNull()
    await clic('Salir')
    await act(async () => { await Promise.resolve() })
    expect(host.querySelector('[data-view="modulos"]')).not.toBeNull()
    expect(boton('Viñetas (piloto)')?.getAttribute('aria-pressed')).toBe('true')
  })
})
