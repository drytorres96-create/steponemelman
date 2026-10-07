// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ } from '../schema/concept'
import { nuevoProgreso } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'
import { ESTADO_INICIAL } from '../store/model'
import type { OpcionesSesionPersonalizada } from '../lib/busqueda'
import type { Cola } from '../screens/Reproductor'

const mock = vi.hoisted(() => ({ app: vi.fn(), cargarConceptos: vi.fn(), cargarModulo: vi.fn(), cargarTodo: vi.fn(), reproductor: vi.fn(), opciones: {} as OpcionesSesionPersonalizada }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({
  state: { sessions: {}, attempts: {}, activeSessionId: null }, catalog: { questions: [] }, pauseSession: vi.fn(),
  syncNow: vi.fn().mockResolvedValue(true), loading: false, busy: false, syncStatus: { state: 'synced' },
}) }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargarTodo, cargarConceptos: mock.cargarConceptos, cargarModulo: mock.cargarModulo }))
vi.mock('../screens/Hoy', () => ({ Hoy: ({ onRetomar }: { onRetomar: () => Promise<unknown> }) => <button onClick={() => { void onRetomar() }}>Retomar guardada</button> }))
vi.mock('../screens/Reproductor', () => ({ Reproductor: (props: { cola: Cola; indiceInicial: number }) => {
  mock.reproductor(props)
  return <div>Práctica abierta</div>
} }))
vi.mock('../screens/Modulos', () => ({ Modulos: ({ onEstudiar }: { onEstudiar: (ids: string[], opciones: OpcionesSesionPersonalizada) => Promise<void> }) =>
  <button onClick={() => { void onEstudiar(['QA-LONG'], mock.opciones) }}>Abrir práctica</button> }))

import App from '../App'

const concepto = ConceptoZ.parse({
  concept_id: 'QA-LONG', source: { doc: 'QA', doc_title: 'Synthetic fixture', page: 1, item_id: 'QA-LONG', fragment: 'Synthetic mechanism.' },
  objetivo: 'Apply a synthetic mechanism', afirmacion: 'Substrate binding activates a downstream signal.',
  respuesta_canonica: 'Binding of substrate activates a downstream intracellular signal', explicacion: 'Compare the synthetic mechanisms.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'QA', tipo_conocimiento: 'Mecanismo', dificultad: 2 },
  step: 'step1', interaccion: { recomendada: 'opcion_multiple' },
  evaluacion: { pregunta: 'What follows binding of the synthetic substrate?', opciones: [
    { texto: 'Binding of substrate activates a downstream intracellular signal', correcta: true },
    { texto: 'All intracellular signals are blocked', correcta: false }, { texto: 'The receptor is removed', correcta: false },
  ] }, pistas: ['Compare signals', 'Consider the receptor', 'Follow its downstream effect'], calidad: { estado: 'aprobado', confianza: 1 },
  variantes: ['a1', 'a2'].map(id => ({ variant_id: `QA-LONG-${id}`, nivel: 'aplicacion',
    pregunta: `A synthetic receptor is blocked (${id}). What accounts for the lost signal?`,
    opciones: [{ texto: 'Lost receptor signaling', correcta: true }, { texto: 'Increased receptor signaling', correcta: false }, { texto: 'Unaffected receptor signaling', correcta: false }],
    explicacion: 'The receptor is required to transmit the synthetic signal.' })),
})
const intento: Intento = { ts: 1000, calificacion: 3, resultado: 'correcta', interaccion: 'opcion_multiple', recuperacion_activa: false,
  pistas_usadas: 0, ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, fuente_consultada: false, explicacion_previa: false }
const p = { ...nuevoProgreso(concepto.concept_id), ultimo: 1000, proxima: 1001, intentos: [intento] }
const modulo = { module_id: 'QA-M', nombre: 'Synthetic module', proposito: 'Synthetic practice', sesiones: [] }
let host: HTMLDivElement
let root: Root
let estado = { ...ESTADO_INICIAL }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  mock.opciones = {}
  estado = { ...ESTADO_INICIAL, progreso: { [concepto.concept_id]: p } }
  mock.app.mockImplementation(() => ({ listo: true, indice: { modulos: [modulo] }, estado,
    sincronizacion: { estado: 'sincronizado' }, sincronizarAhora: vi.fn().mockResolvedValue(true) }))
  mock.cargarConceptos.mockResolvedValue(new Map([[concepto.concept_id, concepto]]))
  mock.cargarModulo.mockResolvedValue([concepto])
  mock.cargarTodo.mockResolvedValue([concepto])
  window.history.replaceState(null, '', '/#modulos')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})
const abrir = async (texto: string) => {
  await act(async () => root.render(<App />))
  await act(async () => { await vi.dynamicImportSettled() })
  await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === texto)!.click() })
  await act(async () => { await vi.dynamicImportSettled() })
  return mock.reproductor.mock.calls.at(-1)![0] as { cola: Cola; indiceInicial: number }
}

describe('inicio y restauración de aplicaciones desde App', () => {
  it('una práctica nueva recibe aplicación, sin alterar registros ni IDs de concepto', async () => {
    const antes = JSON.stringify(estado)
    const props = await abrir('Abrir práctica')
    expect(props.cola.conceptos.map(c => c.concept_id)).toEqual([concepto.concept_id])
    expect(props.cola.conceptos[0]).toMatchObject({ variante_id: 'QA-LONG-a1', interaccion: { recomendada: 'caso_clinico' } })
    expect(props.indiceInicial).toBe(0)
    expect(JSON.stringify(estado)).toBe(antes)
  })

  it.each(['examen', 'primera', 'criterio'] as const)('conserva la presentación base para %s', caso => {
    if (caso === 'examen') mock.opciones = { ruta: 'examen' }
    if (caso === 'primera') estado = { ...estado, progreso: {} }
    if (caso === 'criterio') estado = { ...estado, criterios: { ...estado.criterios, exigirRecuperacionActiva: false } }
    return abrir('Abrir práctica').then(props => {
      expect(props.cola.conceptos[0]).toBe(concepto)
      expect(props.cola.conceptos[0].variante_id).toBeUndefined()
    })
  })

  it('retoma la variante y null exactos, conservando sesión, orden, versión e índice', async () => {
    window.history.replaceState(null, '', '/#hoy')
    estado = { ...estado, reanudable: { modulo: 'QA-M', sesion: 'repaso', indice: 1, ts: 2000, sessionId: 'QA-SAVED',
      conceptIds: [concepto.concept_id, concepto.concept_id], variantes: ['QA-LONG-a2', null], versionFormato: 2 } }
    const antes = JSON.stringify(estado)
    const props = await abrir('Retomar guardada')
    expect(props.cola.sessionId).toBe('QA-SAVED')
    expect(props.cola.conceptos.map(c => c.variante_id ?? null)).toEqual(['QA-LONG-a2', null])
    expect(props.cola.conceptos.map(c => c.concept_id)).toEqual([concepto.concept_id, concepto.concept_id])
    expect(props.indiceInicial).toBe(1)
    expect(JSON.stringify(estado)).toBe(antes)
  })

  it('el fallback heredado sin IDs no cambia a una aplicación al retomar', async () => {
    window.history.replaceState(null, '', '/#hoy')
    estado = { ...estado, reanudable: { modulo: 'QA-M', sesion: 'guiada', indice: 0, ts: 2000, sessionId: 'QA-LEGACY', versionFormato: 1 } }
    const antes = JSON.stringify(estado)
    const props = await abrir('Retomar guardada')
    expect(props.cola.conceptos[0]).toBe(concepto)
    expect(props.cola.conceptos[0].variante_id).toBeUndefined()
    expect(props.indiceInicial).toBe(0)
    expect(JSON.stringify(estado)).toBe(antes)
  })

  it('una cola antigua con IDs pero sin variantes/versiones conserva la base aunque cambie el historial durante la carga', async () => {
    window.history.replaceState(null, '', '/#hoy')
    const continuidad = { modulo: 'QA-M', sesion: 'repaso', indice: 1, ts: 2000, sessionId: 'QA-OLD-METADATA',
      conceptIds: [concepto.concept_id, concepto.concept_id] }
    estado = { ...estado, reanudable: continuidad }
    let resolver!: (mapa: Map<string, typeof concepto>) => void
    mock.cargarConceptos.mockImplementationOnce(() => new Promise<Map<string, typeof concepto>>(resolve => { resolver = resolve }))
    await act(async () => root.render(<App />))
    await act(async () => { await vi.dynamicImportSettled() })
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Retomar guardada')!.click() })
    // Un dispositivo aporta nuevos intentos mientras llega el material; una cola
    // nueva elegiría otro caso, pero la restauración no vuelve a elegir variantes.
    estado = { ...estado, progreso: { [concepto.concept_id]: { ...p, intentos: [intento,
      { ...intento, ts: 2000, variante_id: 'QA-LONG-a1' }] } } }
    await act(async () => root.render(<App />))
    await act(async () => { resolver(new Map([[concepto.concept_id, concepto]])) })
    await act(async () => { await vi.dynamicImportSettled() })
    const props = mock.reproductor.mock.calls.at(-1)![0] as { cola: Cola; indiceInicial: number }
    expect(props.cola.sessionId).toBe('QA-OLD-METADATA')
    expect(props.cola.conceptos).toEqual([concepto, concepto])
    expect(props.cola.conceptos.every(c => c.variante_id === undefined)).toBe(true)
    expect(props.indiceInicial).toBe(1)
    expect(estado.reanudable).toEqual(continuidad)
    expect(estado.reanudable?.versionFormato).toBeUndefined()
    expect(estado.reanudable?.variantes).toBeUndefined()
  })
})
