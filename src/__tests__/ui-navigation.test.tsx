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
  state: { sessions: {}, attempts: {} }, catalog: null, pauseSession: vi.fn(), syncNow: vi.fn().mockResolvedValue(true),
  syncStatus: { message: 'Preguntas sincronizadas' },
}) }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargarTodo, cargarConceptos: mock.cargarConceptos, cargarModulo: vi.fn() }))
vi.mock('../screens/Reproductor', () => ({ Reproductor: (props: { indiceInicial: number }) => {
  mock.reproductor(props)
  return <div>Sesión restaurada</div>
} }))
vi.mock('../screens/Repaso', () => ({ Repaso: (props: { onEstudiar: (ids: string[]) => void }) =>
  <button onClick={() => props.onEstudiar(['concepto-1'])}>Abrir repaso de prueba</button> }))

import App from '../App'
import { Modal } from '../components/comunes'

let host: HTMLDivElement
let root: Root
let app: Record<string, unknown>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
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
  vi.restoreAllMocks()
})

const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(texto))!

describe('continuidad y navegación accesible', () => {
  it('recargar #estudio muestra Inicio y permite recuperar incluso el resumen pendiente', async () => {
    window.history.replaceState(null, '', '/#estudio')
    app.estado = { ...ESTADO_INICIAL, reanudable: {
      modulo: 'modulo-1', sesion: 'guiada', indice: 1, ts: 1, conceptIds: ['concepto-1'], titulo: 'Bioquímica',
    } }
    await act(async () => { root.render(<App />) })
    expect(host.textContent).toContain('Tu estudio de hoy')
    // Fuera de la sesión la barra sí navega.
    expect(host.querySelector('nav')).not.toBeNull()
    await act(async () => { boton('Continuar sesión guardada').click() })
    expect(host.textContent).toContain('Sesión restaurada')
    expect(mock.reproductor.mock.calls.at(-1)?.[0].indiceInicial).toBe(1)
    // Estudiando, la barra calla: ni navegación, ni menú de cuenta, ni interruptor de concentración.
    expect(host.querySelector('nav')).toBeNull()
    expect(host.querySelector('.menu-cuenta')).toBeNull()
    expect(host.textContent).not.toContain('Mostrar menú')
    expect(host.textContent).not.toContain('Concentrarme')
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

  it('un error al preparar repaso deja una salida para reintentar', async () => {
    window.history.replaceState(null, '', '/#repaso')
    mock.cargarConceptos.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { root.render(<App />) })
    await act(async () => { boton('Abrir repaso de prueba').click() })
    expect(host.textContent).toContain('No se pudo preparar el repaso')
    expect(host.textContent).not.toContain('Preparando la sesión')
    expect(boton('Abrir repaso de prueba')).toBeTruthy()
  })

  it('saltar al contenido conserva la pantalla actual', async () => {
    window.history.replaceState(null, '', '/#repaso')
    await act(async () => { root.render(<App />) })
    await act(async () => { (host.querySelector('.saltar-contenido') as HTMLAnchorElement).click() })
    expect(window.location.hash).toBe('#repaso')
    expect(document.activeElement).toBe(host.querySelector('main'))
  })

  it('las respuestas por revisar permiten ver el resto y practicar como máximo 20', async () => {
    window.history.replaceState(null, '', '/#progreso')
    const conceptos = Array.from({ length: 21 }, (_, n) => ({ concept_id: `concepto-${n + 1}`, objetivo: `Objetivo ${n + 1}`,
      clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Renal' },
      respuesta_canonica: 'Referencia', explicacion: 'Explicación', source: { doc_title: 'Documento', page: 1 },
    }))
    mock.cargarTodo.mockResolvedValue(conceptos)
    app.estado = { ...ESTADO_INICIAL, progreso: Object.fromEntries(conceptos.map(c => [c.concept_id, {
      concept_id: c.concept_id, estado: 'en_aprendizaje', dificultad: 5, estabilidad: 0, ultimo: 1, proxima: null,
      aciertos: 0, fallos: 0, dominado_en: null,
      intentos: [{ resultado: 'revision', ts: 1, ms: 1, tipo_error: 'ninguno', respuesta_dada: 'Mi respuesta' }],
    }])) }
    await act(async () => { root.render(<App />) })
    expect(host.querySelectorAll('[aria-labelledby="revision-titulo"] details')).toHaveLength(20)
    await act(async () => { boton('Mostrar 20 más').click() })
    expect(host.querySelectorAll('[aria-labelledby="revision-titulo"] details')).toHaveLength(21)
    await act(async () => { boton('Volver a practicar estas respuestas').click() })
    expect(mock.cargarConceptos.mock.calls.at(-1)?.[0]).toEqual(conceptos.slice(0, 20).map(c => c.concept_id))
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
