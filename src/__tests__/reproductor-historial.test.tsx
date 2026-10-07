// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL, registrarVistaConceptoEstado, type EstadoApp } from '../store/model'
import { ConceptoZ, type Concepto } from '../schema/concept'
import { nuevoProgreso } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'

const mock = vi.hoisted(() => ({ app: vi.fn(), vista: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../components/AyudaIA', () => ({ AyudaIA: () => null }))

import { Reproductor } from '../screens/Reproductor'

const concepto = ConceptoZ.parse({
  concept_id: 'QA-HISTORIAL',
  source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: 'QA-HISTORIAL', fragment: 'Alfa es el primero.' },
  objetivo: 'Reconocer', afirmacion: 'Alfa es el primero.', respuesta_canonica: 'alfa', sinonimos: [],
  explicacion: 'Explicación sintética.',
  clasificacion: { disciplina_primaria: 'Bioquímica', sistema_primario: 'Multisistémico', tema: 'Ejemplo', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'opcion_multiple', permitidas: ['opcion_multiple'] },
  evaluacion: { pregunta: '¿Cuál es el primero?', opciones: [{ texto: 'alfa', correcta: true }, { texto: 'beta', correcta: false }] },
  pistas: ['Primera pista sintética.', 'Segunda pista sintética.', 'Tercera pista sintética.'],
  calidad: { estado: 'aprobado', confianza: 1 },
})
const preguntaId = `sesion-historial:0:${concepto.concept_id}`
const intento = (extra: Partial<Intento> = {}): Intento => ({
  attempt_id: 'anterior', session_id: 'otra-sesion', pregunta_id: 'otra-pregunta', ts: 10,
  resultado: 'correcta', calificacion: 3, tipo_error: 'ninguno', interaccion: 'opcion_multiple',
  recuperacion_activa: false, pistas_usadas: 0, ms: 100, confianza_declarada: null,
  fuente_consultada: false, explicacion_previa: false, respuesta_dada: 'alfa', ...extra,
})

let host: HTMLDivElement, root: Root, estado: EstadoApp
const repintar = { fn: (() => {}) as (fn: (n: number) => number) => void }
function Envoltura({ c = concepto }: { c?: Concepto }) {
  const [, setRender] = useState(0)
  repintar.fn = setRender
  return <Reproductor cola={{ titulo: 'Historial', subtitulo: '', ruta: 'aprendizaje', modulo: 'qa',
    conceptos: [c], sessionId: 'sesion-historial' }} onSalir={vi.fn()} />
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  estado = { ...ESTADO_INICIAL, progreso: {}, reanudable: null }
  mock.vista.mockReset()
  mock.vista.mockImplementation((id: string, preguntaId: string) => {
    const siguiente = registrarVistaConceptoEstado(estado, id, preguntaId)
    if (siguiente === estado) return
    estado = siguiente
    repintar.fn(n => n + 1)
  })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  mock.app.mockImplementation(() => ({
    estado,
    registrarVistaConcepto: mock.vista,
    progresoDe: (id: string) => estado.progreso[id] ?? nuevoProgreso(id),
    registrarIntento: (id: string, t: Intento) => {
      const p = estado.progreso[id] ?? nuevoProgreso(id)
      estado = { ...estado, progreso: { ...estado.progreso, [id]: { ...p, intentos: [...p.intentos, t] } } }
      repintar.fn(n => n + 1)
    },
    iniciarSesion: () => 'sesion-historial', cerrarSesion: vi.fn(),
    guardarReanudable: (r: EstadoApp['reanudable']) => {
      estado = { ...estado, reanudable: r }
      repintar.fn(n => n + 1)
    },
  }))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

const guardarHistorial = (intentos: Intento[]) => {
  estado.progreso[concepto.concept_id] = { ...nuevoProgreso(concepto.concept_id), intentos }
}
const pintar = (c = concepto) => act(async () => { root.render(<Envoltura c={c} />) })
const etiqueta = () => host.querySelector('.reproductor > p.mini')!.textContent
const responder = async () => {
  await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b => b.textContent?.includes('alfa'))!.click() })
  await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Comprobar respuesta')!.click() })
}

describe('etiqueta de historial del concepto', () => {
  it('presentar material visible cuenta como visto sin responder ni convertirlo en practicado', async () => {
    await pintar()
    expect(estado.conceptosVistos?.[concepto.concept_id]?.preguntaId).toBe(preguntaId)
    expect(estado.progreso[concepto.concept_id]).toBeUndefined()
    expect(etiqueta()).toBe('Concepto nuevo aquí')
    const copia = estado.conceptosVistos
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(estado.conceptosVistos).toBe(copia)
    expect(estado.progreso[concepto.concept_id]).toBeUndefined()
    await responder()
    expect(estado.progreso[concepto.concept_id].intentos).toHaveLength(1)
  })

  it('una pestaña oculta espera a presentar el concepto antes de marcarlo visto', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await pintar()
    expect(estado.conceptosVistos).toBeUndefined()
    expect(estado.progreso[concepto.concept_id]).toBeUndefined()
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(estado.conceptosVistos?.[concepto.concept_id]?.preguntaId).toBe(preguntaId)
    expect(estado.progreso[concepto.concept_id]).toBeUndefined()
  })

  it('un concepto nuevo conserva la etiqueta después de guardar su propia respuesta', async () => {
    await pintar()
    expect(etiqueta()).toBe('Concepto nuevo aquí')
    await responder()
    expect(estado.progreso[concepto.concept_id].intentos).toHaveLength(1)
    expect(etiqueta()).toBe('Concepto nuevo aquí')
  })

  it('reconoce práctica anterior aunque el historial antiguo no tenga pregunta_id', async () => {
    const anterior = intento({ pregunta_id: undefined })
    guardarHistorial([anterior])
    await pintar()
    expect(etiqueta()).toBe('Concepto ya practicado aquí')
    await responder()
    expect(etiqueta()).toBe('Concepto ya practicado aquí')
    expect(estado.progreso[concepto.concept_id].intentos[0]).toBe(anterior)
  })

  it('retomar la primera respuesta no la reclasifica por prácticas posteriores', async () => {
    guardarHistorial([intento({ session_id: 'sesion-historial', pregunta_id: preguntaId, ts: 10 }),
      intento({ attempt_id: 'posterior', ts: 20 })])
    await pintar()
    expect(host.textContent).toContain('Tu respuesta ya está registrada')
    expect(etiqueta()).toBe('Concepto nuevo aquí')
    expect(estado.progreso[concepto.concept_id].intentos).toHaveLength(2)
  })

  it('distingue una variante nueva de otra variante del mismo concepto', async () => {
    guardarHistorial([intento({ variante_id: 'QA-V1' })])
    await pintar({ ...concepto, variante_id: 'QA-V2' })
    expect(etiqueta()).toContain('Concepto ya practicado aquí')
    expect(etiqueta()).toContain('Primera presentación de esta variante')
    await responder()
    expect(etiqueta()).toContain('Primera presentación de esta variante')
  })

  it('la misma variante practicada antes sigue siendo repetida al responder', async () => {
    guardarHistorial([intento({ variante_id: 'QA-V1' })])
    await pintar({ ...concepto, variante_id: 'QA-V1' })
    expect(etiqueta()).toContain('Variante ya practicada')
    await responder()
    expect(etiqueta()).toContain('Variante ya practicada')
  })
})
