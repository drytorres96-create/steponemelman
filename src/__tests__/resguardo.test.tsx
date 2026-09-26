// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'

const mock = vi.hoisted(() => ({ app: vi.fn(), entregar: vi.fn(), claves: vi.fn(), leer: vi.fn(),
  ajustesFalla: { valor: true }, hoyFalla: { valor: false } }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({
  state: { sessions: {}, attempts: {}, activeSessionId: null, marca: 'preguntas' }, catalog: { questions: [] }, pauseSession: vi.fn(),
  syncNow: vi.fn().mockResolvedValue(true), loading: false, busy: false, syncStatus: { state: 'synced', message: '' },
  localNotice: null, dismissLocalNotice: vi.fn(),
}) }))
vi.mock('../semana/api', () => ({ cargarHistorialSesiones: vi.fn().mockResolvedValue([]), guardarAvance: vi.fn() }))
vi.mock('../data/corpus', () => ({ cargarTodo: vi.fn().mockResolvedValue([]), cargarConceptos: vi.fn(), cargarModulo: vi.fn() }))
vi.mock('../components/descarga', () => ({ useDescarga: () => ({ entregar: mock.entregar, dialogo: null }) }))
vi.mock('../store/db', () => ({ clavesConPrefijo: mock.claves, leer: mock.leer }))
vi.mock('../screens/Hoy', () => ({ Hoy: () => {
  if (mock.hoyFalla.valor) throw new Error('Fallo sintético al pintar Hoy')
  return <p>Hoy sin fallo</p>
} }))
vi.mock('../screens/Ajustes', () => ({ Ajustes: () => {
  if (mock.ajustesFalla.valor) throw new Error('Fallo sintético al pintar Ajustes')
  return <p>Ajustes sin fallo</p>
} }))

import App from '../App'
import { Resguardo, FalloGeneral, FalloPantalla } from '../components/Resguardo'
import { respaldoDeEmergencia } from '../lib/respaldo'

let host: HTMLDivElement
let root: Root
let app: Record<string, unknown>
const exportar = vi.fn((extra?: Record<string, unknown>) => JSON.stringify({ version: 1, progreso: {}, ...extra }))

function Explota(): never { throw new Error('Fallo sintético') }
/** jsdom informa de cada error de pintado aunque un resguardo lo recoja; aquí son a propósito. */
const silenciar = (evento: ErrorEvent) => evento.preventDefault()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  // React anuncia en la consola cada fallo que recoge un resguardo: aquí son todos a propósito.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  window.addEventListener('error', silenciar)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 24, 10))
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  mock.ajustesFalla.valor = true
  mock.hoyFalla.valor = false
  mock.claves.mockResolvedValue([])
  mock.leer.mockResolvedValue(null)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  app = {
    listo: true, indice: { n_conceptos: 1, modulos: [], documentos: [], glosario: [], cuarentena: 0 },
    estado: { ...ESTADO_INICIAL }, sincronizacion: { estado: 'sincronizado', mensaje: 'Guardado' },
    sincronizarAhora: vi.fn().mockResolvedValue(true), exportar, avisoLocal: null, descartarAvisoLocal: vi.fn(),
  }
  mock.app.mockImplementation(() => app)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  window.removeEventListener('error', silenciar)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === texto)
const pintar = async (nodo: React.ReactNode) => {
  await act(async () => { root.render(nodo) })
  await act(async () => { await Promise.resolve() })
}

describe('resguardo de una pantalla', () => {
  it('un fallo al pintar deja una salida con el foco en Volver a Hoy y un respaldo con las preguntas NBME', async () => {
    const onHoy = vi.fn()
    await pintar(<Resguardo alFallar={error => <FalloPantalla error={error} onHoy={onHoy} />}><Explota /></Resguardo>)
    expect(host.textContent).toContain('Esta pantalla no pudo mostrarse.')
    expect(host.textContent).toContain('Tu progreso está a salvo')
    expect(host.textContent).toContain('Fallo sintético')
    expect(document.activeElement).toBe(boton('Volver a Hoy'))
    await act(async () => { boton('Descargar respaldo')!.click() })
    expect(exportar).toHaveBeenCalledWith({ nbme: expect.objectContaining({ marca: 'preguntas' }) })
    const [nombre, contenido, tipo] = mock.entregar.mock.calls[0]
    expect(nombre).toMatch(/^progreso-step1-\d{4}-\d{2}-\d{2}\.json$/)
    expect(JSON.parse(contenido).nbme.marca).toBe('preguntas')
    expect(tipo).toBe('application/json')
    await act(async () => { boton('Volver a Hoy')!.click() })
    expect(onHoy).toHaveBeenCalledOnce()
  })

  it('en la aplicación, el fallo de una pantalla conserva la barra y Volver a Hoy la recupera', async () => {
    window.history.replaceState(null, '', '/#ajustes')
    await pintar(<App />)
    expect(host.textContent).toContain('Esta pantalla no pudo mostrarse.')
    // La barra sigue: se puede navegar sin recargar.
    expect(host.querySelector('.barra')).not.toBeNull()
    expect(host.textContent).toContain('Cuenta y ajustes')
    await act(async () => { boton('Volver a Hoy')!.click() })
    await act(async () => { await Promise.resolve() })
    expect(host.textContent).not.toContain('Esta pantalla no pudo mostrarse.')
    expect(host.querySelector('[data-view="hoy"]')).not.toBeNull()
    expect(host.textContent).toContain('Hoy sin fallo')
    // Volver a la pantalla que falló la monta de nuevo: si ya no falla, se ve.
    mock.ajustesFalla.valor = false
    await act(async () => { window.location.hash = 'ajustes'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    await act(async () => { await Promise.resolve() })
    expect(host.textContent).toContain('Ajustes sin fallo')
  })

  it('si la que falla es Hoy, Volver a Hoy la vuelve a montar en lugar de dejar el fallo', async () => {
    mock.hoyFalla.valor = true
    await pintar(<App />)
    expect(host.textContent).toContain('Esta pantalla no pudo mostrarse.')
    mock.hoyFalla.valor = false
    await act(async () => { boton('Volver a Hoy')!.click() })
    await act(async () => { await Promise.resolve() })
    expect(host.textContent).toContain('Hoy sin fallo')
  })

  it('el aviso de una copia apartada se ve en Hoy y se cierra con Entendido', async () => {
    app = { ...app, avisoLocal: 'La copia guardada en este dispositivo estaba dañada.' }
    await pintar(<App />)
    expect(host.querySelector('.aviso-local')?.textContent).toContain('estaba dañada')
    await act(async () => { boton('Entendido')!.click() })
    expect(app.descartarAvisoLocal).toHaveBeenCalledOnce()
  })
})

describe('resguardo general', () => {
  it('si falla toda la aplicación, se puede recargar y descargar lo guardado en el navegador', async () => {
    localStorage.setItem('step1-respaldo:cuenta:user-a', JSON.stringify({ state: { version: 1, progreso: { A: 'rapido' } }, savedAt: 200 }))
    await pintar(<Resguardo alFallar={error => <FalloGeneral error={error} />}><Explota /></Resguardo>)
    expect(host.textContent).toContain('La aplicación se ha detenido.')
    expect(boton('Recargar la página')).toBeTruthy()
    await act(async () => { boton('Descargar respaldo')!.click() })
    await act(async () => { await Promise.resolve() })
    expect(JSON.parse(mock.entregar.mock.calls[0][1]).progreso).toEqual({ A: 'rapido' })
  })

  it('el respaldo de emergencia elige la copia más reciente y pone los conceptos arriba para poder importarlos', async () => {
    mock.claves.mockImplementation(async (prefijo: string) => prefijo === 'cuenta:' ? ['cuenta:user-a'] : ['nbme-state:user-a'])
    mock.leer.mockImplementation(async (clave: string) => clave === 'cuenta:user-a'
      ? { state: { version: 1, progreso: { A: 'principal' } }, savedAt: 300 }
      : { state: { schemaVersion: 1, fuente: 'principal' }, savedAt: 100 })
    localStorage.setItem('step1-respaldo:cuenta:user-a', JSON.stringify({ state: { version: 1, progreso: { A: 'rapido' } }, savedAt: 200 }))
    localStorage.setItem('step1-backup:nbme-state:user-a', JSON.stringify({ state: { schemaVersion: 1, fuente: 'rapido' }, savedAt: 150 }))
    const archivo = JSON.parse(await respaldoDeEmergencia())
    expect(archivo.version).toBe(1)
    expect(archivo.progreso).toEqual({ A: 'principal' })
    expect(archivo.nbme).toEqual({ schemaVersion: 1, fuente: 'rapido' })
    expect(typeof archivo.exportado).toBe('string')
  })

  it('sin ninguna copia legible entrega lo que haya, tal cual', async () => {
    localStorage.setItem('step1-respaldo:cuenta:user-a', '{ roto')
    const archivo = JSON.parse(await respaldoDeEmergencia())
    expect(archivo.copias['step1-respaldo:cuenta:user-a']).toBe('{ roto')
  })
})
