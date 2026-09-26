// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import { ConceptoZ } from '../schema/concept'
import type { Intento } from '../srs/tipos'

/**
 * En una caja quien orquesta decide las reinserciones: el reproductor no repite el
 * fallo por su cuenta, registra la reinserción como corrección y devuelve el
 * control sin resumen intermedio. Cada paso trae su propia sesión, así que su
 * identificador no choca con el de otro paso.
 */
const mock = vi.hoisted(() => ({ app: vi.fn(), intentos: [] as Intento[], reanudables: [] as unknown[] }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../components/AyudaIA', () => ({ AyudaIA: () => <div>ayuda</div> }))
vi.mock('../lib/calificacion-ia', () => ({ calificarConIA: async () => ({ estado: 'sin_ia', motivo: 'Sin IA en pruebas.' }) }))

import { Reproductor, type ModoCaja } from '../screens/Reproductor'

const concepto = ConceptoZ.parse({
  concept_id: 'QA-1',
  source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: 'QA-1', fragment: 'Alfa es el primero.' },
  objetivo: 'Reconocer', afirmacion: 'Alfa es el primero.', respuesta_canonica: 'alfa', sinonimos: [], explicacion: 'Porque sí.',
  distractores_cercanos: [{ texto: 'beta', por_que_incorrecto: 'Beta va después.' }],
  clasificacion: { disciplina_primaria: 'Bioquímica', sistema_primario: 'Multisistémico', tema: 'Ejemplo', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] },
  evaluacion: { pregunta: '¿Cuál es el primero?' }, pistas: ['una', 'dos', 'tres'],
  calidad: { estado: 'aprobado', confianza: 1 },
})

let host: HTMLDivElement
let root: Root
let estado: Record<string, unknown>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mock.intentos = []
  mock.reanudables = []
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  estado = { ...ESTADO_INICIAL, progreso: {}, reanudable: {
    modulo: 'hoy:cajas:3', sesion: 'repaso', indice: 0, ts: 1, sessionId: 'caja-1:3', conceptIds: ['QA-1'], cantidadInicial: 1,
  } }
  mock.app.mockImplementation(() => ({
    estado,
    registrarIntento: (_id: string, intento: Intento) => { mock.intentos.push(intento) },
    cerrarSesion: vi.fn(),
    iniciarSesion: () => 'no-debe-usarse',
    progresoDe: (id: string) => ({ concept_id: id, intentos: [], estado: 'nuevo' }),
    guardarReanudable: (r: unknown) => { mock.reanudables.push(r); estado = { ...estado, reanudable: r } },
  }))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

const pintar = async (modoCaja: ModoCaja, onTramoCompleto = vi.fn(), onSalir = vi.fn()) => {
  const cola = { titulo: 'Cajas', subtitulo: '', ruta: 'repaso', modulo: 'hoy:cajas:3', conceptos: [concepto], sessionId: 'caja-1:3' }
  await act(async () => root.render(<Reproductor cola={cola} onSalir={onSalir} onTramoCompleto={onTramoCompleto} modoCaja={modoCaja} />))
  return { onTramoCompleto, onSalir, repintar: () => act(async () => root.render(<Reproductor cola={cola} onSalir={onSalir} onTramoCompleto={onTramoCompleto} modoCaja={modoCaja} />)) }
}

async function responder(texto: string) {
  const input = host.querySelector('input')!
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Comprobar')!.click())
  await act(async () => { await Promise.resolve() })
}

describe('reproductor en una caja', () => {
  it('un fallo no se repite dentro del reproductor: devuelve el control con su propio identificador', async () => {
    const { onTramoCompleto, repintar } = await pintar({ reintento: false, avisoFallo: 'Vuelve dentro de unos pasos.' })
    // Sin contador propio: el progreso lo pone quien orquesta.
    expect(host.textContent).not.toContain('Primera vuelta')
    await responder('beta')
    expect(mock.intentos).toHaveLength(1)
    expect(mock.intentos[0]).toMatchObject({ resultado: 'incorrecta', session_id: 'caja-1:3', pregunta_id: 'caja-1:3:0:QA-1', explicacion_previa: false })
    expect(host.textContent).toContain('Vuelve dentro de unos pasos.')
    expect(host.textContent).not.toContain('volverá al final de la cola')

    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Siguiente pregunta'))!.click())
    await repintar()
    // Ni reintento interno en la cola, ni resumen de «Sesión terminada»: el control vuelve una sola vez.
    expect((mock.reanudables.at(-1) as { conceptIds?: string[] } | null)).toBeNull()
    expect(mock.reanudables.some(r => (r as { conceptIds?: string[] } | null)?.conceptIds?.length === 2)).toBe(false)
    expect(host.textContent).not.toContain('Sesión terminada')
    expect(onTramoCompleto).toHaveBeenCalledOnce()
    await repintar()
    expect(onTramoCompleto).toHaveBeenCalledOnce()
  })

  it('las manos no salen del teclado: la respuesta tiene el foco y, corregida, «Siguiente pregunta» también', async () => {
    await pintar({ reintento: false, avisoFallo: 'Vuelve dentro de unos pasos.' })
    expect(document.activeElement).toBe(host.querySelector('input[type="text"]'))
    await responder('alfa')
    expect(host.textContent).toContain('Siguiente pregunta')
    expect(document.activeElement?.textContent).toBe('Siguiente pregunta')
  })

  it('Intro corrige y se consume: la misma pulsación no llega a «Siguiente pregunta» y la corrección se ve', async () => {
    await pintar({ reintento: false, avisoFallo: 'Vuelve dentro de unos pasos.' })
    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'beta')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const intro = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    await act(async () => { input.dispatchEvent(intro) })
    await act(async () => { await Promise.resolve() })
    // Sin cancelar, el navegador entrega el keypress al botón que acaba de recibir el foco y la corrección se salta.
    expect(intro.defaultPrevented).toBe(true)
    expect(mock.intentos).toHaveLength(1)
    expect(document.activeElement?.textContent).toBe('Siguiente pregunta')
    expect(host.textContent).toContain('Vuelve dentro de unos pasos.')
  })

  it('si el corrector no decide, «La sabía» cuenta como acierto y pasa con un solo toque', async () => {
    const { onTramoCompleto } = await pintar({ reintento: false, avisoFallo: 'Vuelve dentro de unos pasos.' })
    await responder('gamma')
    expect(mock.intentos.at(-1)).toMatchObject({ resultado: 'revision' })
    // Una sola decisión a la vista: ni «Siguiente pregunta» ni volver a responder.
    expect(host.textContent).not.toContain('Siguiente pregunta')
    expect(host.textContent).not.toContain('Volver a responder')
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'La sabía')!.click())
    expect(mock.intentos.at(-1)).toMatchObject({ resultado: 'correcta', calificacion: 3, tipo_error: 'ninguno', correccion_manual: true,
      pregunta_id: mock.intentos[0].pregunta_id })
    expect(onTramoCompleto).toHaveBeenCalledOnce()
  })

  it('tras responder hay una acción principal y lo demás espera plegado en «Más sobre esta pregunta»', async () => {
    await pintar({ reintento: false, avisoFallo: 'Vuelve dentro de unos pasos.' })
    await responder('beta')
    // A la vista: lo que no está dentro de un desplegable cerrado.
    const principales = [...host.querySelectorAll('.retro .btn.principal')].filter(b => !b.closest('details')).map(b => b.textContent)
    expect(principales).toEqual(['Siguiente pregunta'])
    const mas = [...host.querySelectorAll('details.retro-mas')]
    expect(mas).toHaveLength(1)
    const dentro = [...mas[0].querySelectorAll('summary')].map(x => x.textContent)
    expect(dentro).toEqual(['Más sobre esta pregunta', 'Sigo sin entender', 'Profundizar', 'Cómo caería en el examen',
      'Preguntar sobre esta pregunta', 'Ajustar dificultad (opcional)'])
    expect(mas[0].textContent).toContain('Abrir la fuente')
    // En un recorrido sobran el formato y el estado del concepto.
    expect(host.textContent).not.toContain('Recuperación libre')
    expect(host.querySelector('.etq.rojo')).toBeNull()
  })

  it('una reinserción se presenta y se registra como corrección con explicación previa', async () => {
    await pintar({ reintento: true, avisoFallo: 'Por hoy ya está.' })
    expect(host.textContent).toContain('Volvemos a un concepto de esta sesión')
    await responder('alfa')
    expect(mock.intentos[0]).toMatchObject({ resultado: 'correcta', pregunta_id: 'caja-1:3:0:QA-1', explicacion_previa: true, modo: 'repaso' })
  })
})

describe('reproductor en un tramo de lo nuevo', () => {
  const segundo = ConceptoZ.parse({ ...concepto, concept_id: 'QA-2', respuesta_canonica: 'delta', evaluacion: { pregunta: '¿Cuál es el cuarto?' } })
  const pintarTramo = async (onTramoCompleto = vi.fn()) => {
    estado = { ...ESTADO_INICIAL, progreso: {}, reanudable: {
      modulo: 'semana:S', sesion: 'repaso', indice: 0, ts: 1, sessionId: 'S', conceptIds: ['QA-1', 'QA-2'], cantidadInicial: 2,
    } }
    const cola = { titulo: 'Nuevo', subtitulo: '', ruta: 'repaso', modulo: 'semana:S', conceptos: [concepto, segundo], sessionId: 'S' }
    const pintarla = () => act(async () => root.render(<Reproductor cola={cola} onSalir={vi.fn()} onTramoCompleto={onTramoCompleto} />))
    await pintarla()
    return { onTramoCompleto, repintar: pintarla }
  }
  const siguiente = () => act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Siguiente pregunta')!.click())

  it('acabado el tramo sigue la sesión sin «Sesión terminada» ni resumen intermedio', async () => {
    const { onTramoCompleto, repintar } = await pintarTramo()
    // Sin contador propio: la cuenta la pone el recorrido.
    expect(host.textContent).not.toContain('Primera vuelta')
    await responder('alfa'); await siguiente(); await repintar()
    await responder('delta'); await siguiente(); await repintar()
    expect(host.textContent).not.toContain('Sesión terminada')
    expect(host.textContent).not.toContain('Continuar la sesión')
    expect(onTramoCompleto).toHaveBeenCalledOnce()
  })

  it('también en lo nuevo las manos no salen del teclado', async () => {
    await pintarTramo()
    expect(document.activeElement).toBe(host.querySelector('input[type="text"]'))
    await responder('alfa')
    expect(document.activeElement?.textContent).toBe('Siguiente pregunta')
  })
})
