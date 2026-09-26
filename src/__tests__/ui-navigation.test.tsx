// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import type { Concepto } from '../schema/concept'

const mock = vi.hoisted(() => ({ app: vi.fn(), cargarTodo: vi.fn(), cargarConceptos: vi.fn(), reproductor: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({
  state: { sessions: {}, attempts: {}, activeSessionId: null }, catalog: { questions: [] }, pauseSession: vi.fn(),
  syncNow: vi.fn().mockResolvedValue(true), startSession: vi.fn().mockResolvedValue(true),
  resumeSession: vi.fn().mockResolvedValue(true), nextQuestion: vi.fn(), loading: false, busy: false,
  syncStatus: { message: 'Preguntas sincronizadas' },
}) }))
vi.mock('../semana/api', () => ({
  cargarHistorialSesiones: vi.fn().mockResolvedValue([]),
  guardarAvance: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargarTodo, cargarConceptos: mock.cargarConceptos, cargarModulo: vi.fn() }))
vi.mock('../screens/Reproductor', () => ({ Reproductor: (props: { indiceInicial: number }) => {
  mock.reproductor(props)
  return <div>Sesión restaurada</div>
} }))
vi.mock('../screens/Modulos', () => ({ Modulos: (props: { onEstudiar: (ids: string[]) => void }) =>
  <button onClick={() => props.onEstudiar(['concepto-1'])}>Estudiar selección de prueba</button> }))

import App from '../App'
import { Modal } from '../components/comunes'

let host: HTMLDivElement
let root: Root
let app: Record<string, unknown>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  // Un jueves: la portada depende del tipo de día y un viernes sale cerrado con otro texto.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 24, 10))
  window.history.replaceState(null, '', '/')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  app = {
    listo: true, indice: { n_conceptos: 1, modulos: [], documentos: [], glosario: [], cuarentena: 0 },
    estado: { ...ESTADO_INICIAL }, sincronizacion: { mensaje: 'Guardado' }, sincronizarAhora: vi.fn().mockResolvedValue(true),
  }
  mock.app.mockImplementation(() => app)
  mock.cargarTodo.mockResolvedValue([])
  mock.cargarConceptos.mockResolvedValue(new Map([['concepto-1', { concept_id: 'concepto-1' } as Concepto]]))
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(texto))!
const pintar = async () => {
  await act(async () => { root.render(<App />) })
  await act(async () => { await Promise.resolve() })
}
const abrirDesplegable = async (titulo: string) => {
  const resumen = [...host.querySelectorAll('summary')].find(s => s.textContent === titulo)!
  await act(async () => { resumen.click() })
  await act(async () => { await Promise.resolve() })
}

describe('continuidad y navegación accesible', () => {
  it('«Hoy» es la vista por defecto y la única entrada de la navegación principal', async () => {
    await pintar()
    const nav = host.querySelector('nav')!
    expect([...nav.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Hoy'])
    expect(host.textContent).toContain('Mi espacio / Hoy')
    // Un día sin material se ve cerrado, no vacío.
    expect(host.textContent).toContain('Hoy ya está')
    // Mi semana, Recuperación y Progreso viven ya dentro de Hoy: el menú discreto guarda
    // lo demás, y estudiar más es ir a «Elegir contenido» a propósito.
    const menu = [...host.querySelectorAll('.menu-cuenta-opciones button')].map(b => b.textContent)
    expect(menu).toEqual(['Elegir contenido', 'Ajustes y respaldo', 'Calidad del material', 'Plan diario clásico', 'Salir'])
    await act(async () => { boton('Elegir contenido').click() })
    expect(window.location.hash).toBe('#modulos')
    expect(host.textContent).toContain('Mi espacio / Elegir contenido')
  })

  it.each(['#semana', '#recuperacion', '#progreso', '#repaso'])('el enlace guardado %s aterriza en Hoy', async hash => {
    window.history.replaceState(null, '', `/${hash}`)
    await pintar()
    expect(host.textContent).toContain('Mi espacio / Hoy')
    expect(host.querySelector('.anillo-doble')).not.toBeNull()
    expect([...host.querySelectorAll('summary')].map(s => s.textContent)).toContain('Cómo va todo')
  })

  it('recargar #estudio aterriza en Hoy y el plan clásico permite recuperar el resumen pendiente', async () => {
    window.history.replaceState(null, '', '/#estudio')
    app.estado = { ...ESTADO_INICIAL, reanudable: {
      modulo: 'modulo-1', sesion: 'guiada', indice: 1, ts: 1, conceptIds: ['concepto-1'], titulo: 'Bioquímica',
    } }
    await act(async () => { root.render(<App />) })
    // Una cola nunca se restaura desde la URL: se aterriza en la portada.
    expect(host.textContent).toContain('Mi espacio / Hoy')
    expect(host.textContent).not.toContain('Sesión restaurada')
    // Fuera de la sesión la barra sí navega.
    expect(host.querySelector('nav')).not.toBeNull()
    await act(async () => { boton('Plan diario clásico').click() })
    expect(host.textContent).toContain('Tu estudio de hoy')
    await act(async () => { boton('Continuar sesión guardada').click() })
    expect(host.textContent).toContain('Sesión restaurada')
    expect(mock.reproductor.mock.calls.at(-1)?.[0].indiceInicial).toBe(1)
    // Estudiando, la barra calla: ni navegación, ni menú de cuenta, ni interruptor de concentración.
    expect(host.querySelector('nav')).toBeNull()
    expect(host.querySelector('.menu-cuenta')).toBeNull()
    expect(host.textContent).not.toContain('Mostrar menú')
    expect(host.textContent).not.toContain('Concentrarme')
    expect(host.querySelector('.study-focus')).not.toBeNull()
    expect(host.querySelectorAll('img.medical-image')).toHaveLength(0)
  })

  it('el estado de sincronización solo aparece cuando hay un problema que atender', async () => {
    app.sincronizacion = { estado: 'sincronizado', mensaje: 'Progreso sincronizado' }
    await act(async () => { root.render(<App />) })
    expect(host.textContent).not.toContain('Progreso sincronizado')

    await act(async () => { root.unmount() })
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    app.sincronizacion = { estado: 'error', mensaje: 'El servidor no pudo guardar ahora.' }
    await act(async () => { root.render(<App />) })
    expect(host.textContent).toContain('El servidor no pudo guardar ahora.')
  })

  it('un error al preparar el estudio elegido deja una salida para reintentar', async () => {
    window.history.replaceState(null, '', '/#modulos')
    mock.cargarConceptos.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { root.render(<App />) })
    await act(async () => { boton('Estudiar selección de prueba').click() })
    expect(host.textContent).toContain('No se pudo preparar el repaso')
    expect(host.textContent).not.toContain('Preparando la sesión')
    expect(boton('Estudiar selección de prueba')).toBeTruthy()
  })

  it('saltar al contenido conserva la pantalla actual', async () => {
    window.history.replaceState(null, '', '/#modulos')
    await act(async () => { root.render(<App />) })
    await act(async () => { (host.querySelector('.saltar-contenido') as HTMLAnchorElement).click() })
    expect(window.location.hash).toBe('#modulos')
    expect(document.activeElement).toBe(host.querySelector('main'))
  })

  it('las cifras de Progreso siguen dentro de Hoy, plegadas en «Cómo va todo»', async () => {
    window.history.replaceState(null, '', '/#progreso')
    await pintar()
    // Plegado no se pinta ni se carga: el corpus entero sólo se pide al abrirlo.
    expect(host.querySelector('[aria-label="Resumen de esta semana"]')).toBeNull()
    expect(mock.cargarTodo).not.toHaveBeenCalled()
    await abrirDesplegable('Cómo va todo')
    expect(host.querySelector('[aria-label="Resumen de esta semana"]')).not.toBeNull()
    expect(host.querySelectorAll('.progress-ring-layer')).toHaveLength(3)
    expect(host.textContent).toContain('Cubrir el material en 10 semanas')
  })

  it('ya no quedan las secciones retiradas del progreso', async () => {
    window.history.replaceState(null, '', '/#progreso')
    await pintar()
    await abrirDesplegable('Cómo va todo')
    expect(host.textContent).not.toContain('Respuestas por revisar')
    expect(host.textContent).not.toContain('¿Puedes aplicarlo en una pregunta nueva?')
    expect(host.querySelector('[aria-labelledby="revision-titulo"]')).toBeNull()
    expect(host.querySelector('[aria-labelledby="aplicacion-titulo"]')).toBeNull()
  })

  it('el modal contiene Tab, acepta Escape y devuelve el foco al control anterior', async () => {
    const previo = document.createElement('button')
    document.body.append(previo)
    previo.focus()
    const cerrar = vi.fn(() => root.render(null))
    await act(async () => { root.render(<Modal titulo="Fuente" onCerrar={cerrar}><button>Último control</button></Modal>) })
    const primero = boton('Cerrar'), ultimo = boton('Último control')
    expect(document.activeElement).toBe(primero)
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })) })
    expect(document.activeElement).toBe(ultimo)
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })) })
    expect(document.activeElement).toBe(primero)
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(cerrar).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(previo)
    previo.remove()
  })
})
