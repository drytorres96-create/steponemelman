// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ } from '../schema/concept'
import type { EstadoApp } from '../store/model'
import type { CloudSnapshot, SyncReply } from '../store/sync'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), load: vi.fn(), rpc: vi.fn() }))
vi.mock('../store/db', () => ({ leer: mocks.read, escribir: mocks.write }))
vi.mock('../data/corpus', () => ({ cargarIndice: async () => null, cargarMigraciones: async () => ({}) }))
vi.mock('../lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.load }) }) }), rpc: mocks.rpc,
} }))

import { ProveedorEstado, useApp } from '../store/estado'
import { Reproductor, type Cola } from '../screens/Reproductor'

// Datos sintéticos: verifican el circuito UI → proveedor → respaldo, sin cuentas ni contenido real.
const concepto = ConceptoZ.parse({
  concept_id: 'QA-001', source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: 'QA-I1', fragment: 'FUENTE SINTÉTICA: primer elemento alfa.' },
  objetivo: 'Identificar el primer elemento', afirmacion: 'El primer elemento sintético es alfa.',
  respuesta_canonica: 'alfa', sinonimos: ['alpha'], distractores_cercanos: [{ texto: 'beta', por_que_incorrecto: 'Es el segundo.' }],
  explicacion: 'EXPLICACIÓN SINTÉTICA: alfa ocupa el primer lugar.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Cardiovascular', tema: 'Secuencia sintética', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre' },
  evaluacion: { pregunta: '¿Cómo se llama el primer elemento sintético?' },
  pistas: ['PISTA SINTÉTICA 1', 'PISTA SINTÉTICA 2', 'PISTA SINTÉTICA 3'], calidad: { confianza: 1, estado: 'aprobado' },
})
const opciones = ConceptoZ.parse({ ...concepto, concept_id: 'QA-002', interaccion: { recomendada: 'opcion_multiple' },
  evaluacion: { ...concepto.evaluacion, opciones: [
    { texto: 'alfa', correcta: true, por_que: 'Es el primero.' },
    { texto: 'beta', correcta: false, por_que: 'DISTRACTOR SINTÉTICO: es el segundo.' },
  ] },
})
const nuevaCola = (ruta = 'repaso'): Cola => ({ titulo: 'Sesión sintética', subtitulo: 'QA', ruta, modulo: 'QA-MOD', conceptos: [concepto] })
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
let root: Root
let host: HTMLDivElement
let api: ReturnType<typeof useApp>
let row: CloudSnapshot | null
const onSalir = vi.fn()

function Harness({ cola, indiceInicial = 0, mostrar = true }: { cola: Cola; indiceInicial?: number; mostrar?: boolean }) {
  api = useApp()
  return api.listo && mostrar ? createElement(Reproductor, { cola, indiceInicial, onSalir }) : null
}
async function render(cola: Cola, indiceInicial = 0, mostrar = true) {
  await act(async () => root.render(createElement(StrictMode, null, createElement(ProveedorEstado, {
    userId: 'qa-user', children: createElement(Harness, { cola, indiceInicial, mostrar }),
  }))))
}
function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text || b.querySelector('b')?.textContent === text)
  if (!found) throw new Error(`No aparece el botón ${text}. UI: ${host.textContent}`)
  return found
}
async function click(text: string, doble = false) {
  const target = button(text)
  await act(async () => { target.click(); if (doble) target.click() })
}
async function responder(text: string) {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Tu respuesta"]')!
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('Comprobar', true)
}
function guardado(): EstadoApp {
  return JSON.parse(localStorage.getItem('step1-respaldo:cuenta:qa-user')!).state as EstadoApp
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  localStorage.clear()
  row = null
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  mocks.read.mockResolvedValue(null)
  mocks.write.mockResolvedValue(undefined)
  mocks.load.mockImplementation(async () => ({ data: clone(row), error: null }))
  mocks.rpc.mockImplementation(async (_name: string, params: { p_state: EstadoApp; p_generation: string | null }) => {
    row = { state: clone(params.p_state), generation: params.p_generation ?? 'qa-generation', revision: (row?.revision ?? 0) + 1,
      user_id: 'qa-user', updated_at: new Date().toISOString() }
    return { data: { ok: true, kind: 'saved', row: clone(row) } satisfies SyncReply, error: null }
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('integración de estudio antes de publicar', () => {
  it('respalda la respuesta antes de autoevaluar y no duplica por doble clic', async () => {
    await render(nuevaCola())
    await responder('alfa')
    const first = guardado().progreso['QA-001'].intentos
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ respuesta_dada: 'alfa', resultado: 'correcta', modo: 'repaso', explicacion_previa: false })
    expect(host.textContent).toContain('Tu respuesta ya está registrada')
    await click('Bien', true)
    expect(guardado().progreso['QA-001'].intentos).toHaveLength(1)
    expect(guardado().progreso['QA-001'].intentos[0].attempt_id).toBe(first[0].attempt_id)
    expect(host.textContent).toContain('Has completado 1 preguntas')
    await act(async () => { expect(await api.sincronizarAhora()).toBe(true) })
    expect(row!.state.progreso['QA-001'].intentos).toHaveLength(1)
  })

  it('oculta fuente, pistas y resultado durante examen y termina tras el último fallo', async () => {
    const cola = { ...nuevaCola('examen'), conceptos: [opciones] }
    await render(cola)
    expect(host.textContent).not.toMatch(/Ver la fuente|Necesito una pista|Antes de recuperar|EXPLICACIÓN SINTÉTICA|FUENTE SINTÉTICA/)
    const beta = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b => b.textContent?.includes('beta'))!
    await act(async () => { beta.click(); beta.click() })
    expect(host.textContent).toContain('Respuesta registrada')
    expect(host.textContent).not.toMatch(/Incorrecto|Respuesta correcta|DISTRACTOR SINTÉTICO|EXPLICACIÓN SINTÉTICA/)
    expect(host.querySelector('.fallo, .acierto, .correcta-oculta')).toBeNull()
    expect(api.estado.progreso['QA-002'].intentos).toHaveLength(1)
    expect(api.estado.progreso['QA-002'].intentos[0]).toMatchObject({ resultado: 'incorrecta', modo: 'examen', fuente_consultada: false, explicacion_previa: false })
    await click('Terminar y revisar', true)
    expect(host.textContent).toContain('Has completado 1 preguntas')
    expect(host.textContent).toContain('EXPLICACIÓN SINTÉTICA')
    expect(host.textContent).not.toContain('Pregunta 2 de')
  })

  it('reanuda la retroalimentación de una respuesta guardada sin solicitarla ni contarla otra vez', async () => {
    const cola = nuevaCola()
    await render(cola)
    await responder('alfa')
    const attempt = api.estado.progreso['QA-001'].intentos[0].attempt_id
    await click('Necesito una pausa')
    const saved = clone(api.estado.reanudable!)
    expect(onSalir).toHaveBeenCalledTimes(1)
    await render(cola, 0, false)
    await render({ ...cola, sessionId: saved.sessionId }, saved.indice)
    expect(host.textContent).toContain('Tu respuesta ya está registrada')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Tu respuesta"]')?.disabled).toBe(true)
    await click('Fácil')
    expect(api.estado.progreso['QA-001'].intentos).toHaveLength(1)
    expect(api.estado.progreso['QA-001'].intentos[0].attempt_id).toBe(attempt)
  })

  it('recupera el envío desde el respaldo al cerrar toda la aplicación antes de autoevaluar', async () => {
    const cola = nuevaCola()
    await render(cola)
    await responder('alfa')
    const saved = clone(api.estado.reanudable!)
    const attempt = api.estado.progreso['QA-001'].intentos[0].attempt_id
    await act(async () => root.unmount())
    root = createRoot(host)
    await render({ ...cola, sessionId: saved.sessionId }, saved.indice)
    expect(host.textContent).toContain('Tu respuesta ya está registrada')
    expect(api.estado.progreso['QA-001'].intentos).toHaveLength(1)
    expect(api.estado.progreso['QA-001'].intentos[0].attempt_id).toBe(attempt)
  })

  it('conserva la pista al pausar antes de responder y registra el acierto como ayudado', async () => {
    const cola = nuevaCola()
    await render(cola)
    await click('Necesito una pista')
    await click('Necesito una pausa')
    const saved = clone(api.estado.reanudable!)
    expect(saved.paso?.pistas).toBe(1)
    await render(cola, 0, false)
    await render({ ...cola, sessionId: saved.sessionId }, saved.indice)
    expect(host.textContent).toContain('PISTA SINTÉTICA 1')
    await responder('alfa')
    expect(api.estado.progreso['QA-001'].intentos[0]).toMatchObject({ pistas_usadas: 1, tipo_error: 'correcta_con_pistas' })
  })

  it('una fuente abierta antes del envío conserva la evidencia de ayuda al reanudar', async () => {
    const cola = nuevaCola()
    await render(cola)
    await click('Ver la fuente')
    expect(document.body.textContent).toContain('FUENTE SINTÉTICA')
    const cerrar = document.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')!
    expect(cerrar).not.toBeNull()
    await act(async () => cerrar.click())
    await click('Necesito una pausa')
    const saved = clone(api.estado.reanudable!)
    expect(saved.paso?.fuenteConsultada).toBe(true)
    await render(cola, 0, false)
    await render({ ...cola, sessionId: saved.sessionId }, saved.indice)
    await responder('alfa')
    expect(api.estado.progreso['QA-001'].intentos[0]).toMatchObject({ fuente_consultada: true, tipo_error: 'correcta_con_pistas' })
  })

  it('la primera práctica guiada registra explicación previa y una sola sesión con StrictMode', async () => {
    await render(nuevaCola('guiada'))
    expect(host.textContent).toContain('EXPLICACIÓN SINTÉTICA')
    expect(api.estado.sesiones).toHaveLength(1)
    await click('Ahora recupéralo')
    await responder('alfa')
    expect(api.estado.progreso['QA-001'].intentos[0]).toMatchObject({ explicacion_previa: true, tipo_error: 'correcta_con_pistas' })
  })

  it('mantiene una respuesta ambigua por revisar sin aumentar aciertos ni fallos', async () => {
    await render(nuevaCola())
    await responder('Una explicación distinta que el corrector debe revisar')
    const p = api.estado.progreso['QA-001']
    expect(p.intentos[0].resultado).toBe('revision')
    expect(p.aciertos).toBe(0)
    expect(p.fallos).toBe(0)
    expect(host.textContent).toContain('no se contará como acierto ni fallo')
    await click('Continuar con respuesta pendiente de revisión')
    expect(host.textContent).toContain('1 respuestas por revisar. No se contaron como aciertos ni fallos.')
  })

  it('restaura una sesión finalizada en el resumen y salir elimina su reanudación', async () => {
    const cola = nuevaCola()
    await render(cola)
    await responder('alfa')
    await click('Bien')
    const saved = clone(api.estado.reanudable!)
    expect(saved.indice).toBe(1)
    await render(cola, 0, false)
    await render({ ...cola, sessionId: saved.sessionId }, saved.indice)
    expect(host.textContent).toContain('Has completado 1 preguntas')
    expect(host.querySelector('input[aria-label="Tu respuesta"]')).toBeNull()
    await click('Volver a mi plan')
    expect(api.estado.reanudable).toBeNull()
    expect(onSalir).toHaveBeenCalledTimes(1)
  })
})
