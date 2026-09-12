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
// Este circuito comprueba UI → proveedor → respaldo. La corrección con IA tiene sus propias
// pruebas; aquí se deja sin IA para que mande el corrector propio, como fuera de línea.
vi.mock('../lib/calificacion-ia', () => ({
  calificarConIA: async () => ({ estado: 'sin_ia', motivo: 'Sin IA en las pruebas.' }),
}))

import { ProveedorEstado, useApp } from '../store/estado'
import { Reproductor, type Cola } from '../screens/Reproductor'
import { versionPregunta } from '../screens/sesion'

// Datos sintéticos: verifican el circuito UI → proveedor → respaldo, sin cuentas ni contenido real.
const concepto = ConceptoZ.parse({
  concept_id: 'QA-001', source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: 'QA-I1', fragment: 'FUENTE SINTÉTICA: primer elemento alfa.' },
  objetivo: 'Identificar el primer elemento', afirmacion: 'El primer elemento sintético es alfa.',
  respuesta_canonica: 'alfa', sinonimos: ['alpha'], distractores_cercanos: [{ texto: 'beta', por_que_incorrecto: 'Es el segundo.' }],
  explicacion: 'EXPLICACIÓN SINTÉTICA: alfa ocupa el primer lugar.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Cardiovascular', tema: 'Secuencia sintética', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] },
  evaluacion: { pregunta: '¿Cómo se llama el primer elemento sintético?' },
  pistas: ['PISTA SINTÉTICA 1', 'PISTA SINTÉTICA 2', 'PISTA SINTÉTICA 3'], calidad: { confianza: 1, estado: 'aprobado' },
})
const opciones = ConceptoZ.parse({ ...concepto, concept_id: 'QA-002', interaccion: { recomendada: 'opcion_multiple', permitidas: ['opcion_multiple'] },
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
  // Comprobar una respuesta escrita pasa por el corrector con IA, que es asíncrono aunque
  // no haya IA: sin dejar asentar las promesas, la retroalimentación aún no está en pantalla.
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}
async function responder(text: string) {
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Tu respuesta"]')
  if (!input) {
    const opcion = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b => b.lastElementChild?.textContent === text)
    expect(opcion, `No hay respuesta ${text} en ${host.textContent}`).toBeDefined()
    // Elegir y confirmar son dos actos distintos: un toque suelto no registra el intento.
    await act(async () => opcion!.click())
    await click('Comprobar respuesta', true)
    return
  }
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
  vi.useRealTimers()
})

describe('integración de estudio antes de publicar', () => {
  it('respalda la respuesta antes de autoevaluar y no duplica por doble clic', async () => {
    await render(nuevaCola())
    await responder('alfa')
    const first = guardado().progreso['QA-001'].intentos
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ respuesta_dada: 'alfa', resultado: 'correcta', modo: 'repaso', explicacion_previa: false })
    expect(host.textContent).toContain('Tu respuesta ya está registrada')
    await click('Siguiente pregunta', true)
    expect(guardado().progreso['QA-001'].intentos).toHaveLength(1)
    expect(guardado().progreso['QA-001'].intentos[0].attempt_id).toBe(first[0].attempt_id)
    expect(host.textContent).toContain('Has completado 1 preguntas')
    await act(async () => { expect(await api.sincronizarAhora()).toBe(true) })
    expect(row!.state.progreso['QA-001'].intentos).toHaveLength(1)
  })

  it('oculta el resultado durante examen y corrige el fallo después de cerrar la primera vuelta', async () => {
    const cola = { ...nuevaCola('examen'), conceptos: [opciones] }
    await render(cola)
    expect(host.textContent).not.toMatch(/Ver la fuente|Necesito una pista|Antes de recuperar|EXPLICACIÓN SINTÉTICA|FUENTE SINTÉTICA/)
    const beta = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b => b.textContent?.includes('beta'))!
    await act(async () => beta.click())
    // Durante el examen tampoco se registra nada hasta confirmar.
    expect(host.textContent).not.toContain('Respuesta registrada')
    await click('Comprobar respuesta', true)
    expect(host.textContent).toContain('Respuesta registrada')
    expect(host.textContent).not.toMatch(/Incorrecto|Respuesta correcta|DISTRACTOR SINTÉTICO|EXPLICACIÓN SINTÉTICA/)
    expect(host.querySelector('.fallo, .acierto, .correcta-oculta')).toBeNull()
    expect(api.estado.progreso['QA-002'].intentos).toHaveLength(1)
    expect(api.estado.progreso['QA-002'].intentos[0]).toMatchObject({ resultado: 'incorrecta', modo: 'examen', fuente_consultada: false, explicacion_previa: false })
    await click('Terminar y revisar', true)
    expect(host.textContent).toContain('Primera vuelta terminada')
    expect(host.textContent).toContain('0 de 1 correctas sin ayuda')
    expect(host.textContent).toContain('EXPLICACIÓN SINTÉTICA')
    expect(host.textContent).not.toContain('Sesión terminada')
    await click('Necesito una pausa')
    const saved = clone(api.estado.reanudable!)
    expect(saved).toMatchObject({ cantidadInicial: 1, revisionInicialHecha: false, indice: 1, conceptIds: ['QA-002', 'QA-002'] })
    await render(cola, 0, false)
    await render({ ...cola, conceptos: [opciones, opciones], sessionId: saved.sessionId }, saved.indice)
    expect(host.textContent).toContain('Primera vuelta terminada')
    await click('Practicar los errores')
    expect(host.textContent).toContain('Corrección · 1 pendientes')
    await responder('alfa')
    expect(api.estado.progreso['QA-002'].intentos[1]).toMatchObject({ resultado: 'correcta', modo: 'repaso', explicacion_previa: true })
    await click('Siguiente pregunta', true)
    expect(host.textContent).toContain('Has completado 2 preguntas')
    expect(host.textContent).toContain('1 de 1 errores iniciales corregidos en 1 reintentos')
    expect(host.textContent).toContain('0 sin ayuda')
  })

  it('la cola de correcciones no revela los fallos mientras continúa la primera vuelta sin ayuda', async () => {
    const cola = { ...nuevaCola('examen'), conceptos: [opciones, { ...opciones, concept_id: 'QA-003' }] }
    await render(cola)
    await responder('beta')
    await click('Siguiente pregunta')
    expect(host.textContent).toContain('Pregunta 2 de 2')
    expect(host.textContent).not.toMatch(/errores para corregir|Incorrecto|Corrección ·/)
    expect(host.querySelectorAll('.avance i')).toHaveLength(2)
    expect(host.querySelector('.avance')?.getAttribute('aria-label')).toBe('Pregunta 2 de 2')
    expect(api.estado.reanudable?.conceptIds).toEqual(['QA-002', 'QA-003', 'QA-002'])
  })

  it('repite un fallo después de otros conceptos, vuelve a repetirlo si falla y restaura todos los intentos', async () => {
    const cola = { ...nuevaCola(), conceptos: [concepto, opciones] }
    await render(cola)
    await responder('beta')
    await click('Siguiente pregunta', true)
    expect(api.estado.reanudable?.conceptIds).toEqual(['QA-001', 'QA-002', 'QA-001'])
    await responder('alfa')
    await click('Siguiente pregunta')
    expect(host.textContent).toContain('Corrección · 1 pendientes')
    await responder('beta')
    await click('Siguiente pregunta', true)
    await click('Necesito una pausa')
    const saved = clone(api.estado.reanudable!)
    expect(saved).toMatchObject({ indice: 3, cantidadInicial: 2, conceptIds: ['QA-001', 'QA-002', 'QA-001', 'QA-001'] })
    const intentosAntes = api.estado.progreso['QA-001'].intentos
    expect(intentosAntes).toHaveLength(2)
    expect(new Set(intentosAntes.map(t => t.pregunta_id)).size).toBe(2)
    expect(new Set(intentosAntes.map(t => t.attempt_id)).size).toBe(2)
    expect(new Set(intentosAntes.map(t => t.session_id)).size).toBe(1)
    await act(async () => root.unmount())
    root = createRoot(host)
    await render({ ...cola, conceptos: [concepto, opciones, concepto, concepto], sessionId: saved.sessionId }, saved.indice)
    expect(host.textContent).toContain('Corrección · 1 pendientes')
    await responder('alfa')
    await click('Siguiente pregunta', true)
    const intentos = api.estado.progreso['QA-001'].intentos
    expect(intentos).toHaveLength(3)
    expect(intentos[2]).toMatchObject({ resultado: 'correcta', explicacion_previa: true })
    expect(intentos[2].ts).toBeGreaterThan(intentos[1].ts)
    expect(host.textContent).toContain('Has completado 4 preguntas')
    expect(host.textContent).toContain('2 conceptos · 1 aciertos en la primera vuelta')
    expect(host.textContent).toContain('1 de 1 errores iniciales corregidos en 2 reintentos')
    expect(api.estado.progreso['QA-001'].estado).not.toBe('dominado')
    await act(async () => { expect(await api.sincronizarAhora()).toBe(true) })
    expect(row!.state.reanudable?.conceptIds).toEqual(saved.conceptIds)
    expect(row!.state.progreso['QA-001'].intentos).toHaveLength(3)
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
    await click('Siguiente pregunta')
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

  it('la enseñanza voluntaria registra explicación previa y una sola sesión con StrictMode', async () => {
    await render(nuevaCola('guiada'))
    expect(host.textContent).not.toContain('EXPLICACIÓN SINTÉTICA')
    await click('Necesito aprenderlo')
    expect(host.textContent).toContain('EXPLICACIÓN SINTÉTICA')
    expect(api.estado.sesiones).toHaveLength(1)
    await click('Ahora recupéralo')
    await responder('alfa')
    expect(api.estado.progreso['QA-001'].intentos[0]).toMatchObject({ explicacion_previa: true, tipo_error: 'correcta_con_pistas' })
  })

  it('permite responder una pregunta guiada nueva sin enseñanza ni calificación extra', async () => {
    await render(nuevaCola('guiada'))
    expect(host.textContent).not.toContain('EXPLICACIÓN SINTÉTICA')
    await responder('alfa')
    const t = clone(api.estado.progreso['QA-001'].intentos[0])
    expect(t).toMatchObject({ explicacion_previa: false, fuente_consultada: false, calificacion: 3 })
    await click('Siguiente pregunta', true)
    expect(api.estado.progreso['QA-001'].intentos).toEqual([t])
  })

  it('abrir enseñanza conserva el borrador, y reanudar conserva que se utilizó ayuda', async () => {
    const cola = nuevaCola('guiada')
    await render(cola)
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Tu respuesta"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'alfa')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Necesito aprenderlo')
    expect(input.isConnected).toBe(true)
    expect(input.disabled).toBe(true)
    await click('Ahora recupéralo')
    expect(input.value).toBe('alfa')
    await click('Necesito aprenderlo')
    await click('Necesito una pausa')
    const saved = clone(api.estado.reanudable!)
    expect(saved.paso).toMatchObject({ explicacionPrevia: true, ensenanzaAbierta: true })
    await render(cola, 0, false)
    await render({ ...cola, sessionId: saved.sessionId }, saved.indice)
    expect(host.textContent).toContain('EXPLICACIÓN SINTÉTICA')
    await click('Ahora recupéralo')
    await responder('alfa')
    expect(api.estado.progreso['QA-001'].intentos[0].explicacion_previa).toBe(true)
  })

  it('preserva una presentación V/F respondida en 1.4, incluidos su veredicto y revisión final', async () => {
    const cola = { ...nuevaCola(), conceptos: [concepto, concepto, opciones] }
    await render(cola, 0, false)
    const id = 'legacy-vf-2', questionId = `${id}:2:QA-002`
    const antigua = ConceptoZ.parse({ ...opciones, interaccion: { ...opciones.interaccion, recomendada: 'verdadero_falso' },
      evaluacion: { ...opciones.evaluacion, pregunta: `${opciones.evaluacion.pregunta}\n\nPropuesta: «beta»\n¿Esta propuesta responde correctamente a la pregunta?`, opciones: [
        { texto: 'Verdadero', correcta: false, por_que: 'DISTRACTOR SINTÉTICO: es el segundo.' },
        { texto: 'Falso', correcta: true, por_que: '' },
      ] } })
    await act(async () => {
      api.registrarIntento('QA-002', { attempt_id: 'legacy-attempt', session_id: id, ts: Date.now(), pregunta_id: questionId, pregunta_version: versionPregunta(antigua), resultado: 'correcta', calificacion: 3,
        interaccion: 'verdadero_falso', recuperacion_activa: false, respuesta_dada: 'Falso', pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false, ms: 4000, tipo_error: 'ninguno', confianza_declarada: null })
      api.guardarReanudable({ modulo: 'QA-MOD', sesion: 'repaso', indice: 2, ts: Date.now(), sessionId: id, conceptIds: ['QA-001', 'QA-001', 'QA-002'], cantidadInicial: 3, msVisibles: 4000 })
    })
    await render({ ...cola, sessionId: id }, 2)
    expect(host.textContent).toContain('Propuesta: «beta»')
    expect(host.textContent).toContain('Tu respuesta: Falso')
    expect(host.textContent).not.toContain('otra presentación')
    expect(api.estado.reanudable?.versionFormato).toBe(1)
    await click('Siguiente pregunta')
    expect(host.textContent).toContain('Propuesta: «beta»')
    expect(api.estado.progreso['QA-002'].intentos).toHaveLength(1)
    expect(api.estado.progreso['QA-002'].intentos[0]).toMatchObject({ attempt_id: 'legacy-attempt', resultado: 'correcta', respuesta_dada: 'Falso' })
  })

  it.each([false, true])('una errata reconocida histórica permite omitir la transcripción; práctica voluntaria=%s', async practicar => {
    const c = ConceptoZ.parse({ ...concepto, escritura_correctiva: { elegible: true, termino: 'alfa' } })
    const cola = { ...nuevaCola(), conceptos: [c] }
    await render(cola, 0, false)
    const id = 'legacy-ortografia'
    await act(async () => {
      api.registrarIntento(c.concept_id, { attempt_id: 'typo-attempt', session_id: id, ts: Date.now(), pregunta_id: `${id}:0:QA-001`, pregunta_version: versionPregunta(c),
        resultado: 'ortografia', calificacion: 2, interaccion: 'recuperacion_libre', recuperacion_activa: true, respuesta_dada: 'alfaa', pistas_usadas: 0,
        fuente_consultada: false, explicacion_previa: false, ms: 4000, tipo_error: 'error_ortografico', confianza_declarada: null })
      api.guardarReanudable({ modulo: 'QA-MOD', sesion: 'repaso', indice: 0, ts: Date.now(), sessionId: id, conceptIds: ['QA-001'] })
    })
    await render({ ...cola, sessionId: id })
    if (practicar) { await click('Practicar escritura (opcional)'); await click('Continuar sin practicar escritura') }
    else await click('Siguiente pregunta')
    expect(host.textContent).toContain('Sesión terminada')
    expect(api.estado.progreso['QA-001']).toMatchObject({ aciertos: 1, fallos: 0 })
    expect(api.estado.progreso['QA-001'].intentos).toHaveLength(1)
  })

  it('endurecer criterios conserva el hito y los intentos aunque retire el dominio vigente', async () => {
    await render(nuevaCola('guiada'))
    await responder('alfa')
    await act(async () => api.actualizarCriterios({ ...api.estado.criterios, recuperaciones: 1, sesiones: 1, separacionHoras: 0 }))
    const antes = clone(api.estado.progreso['QA-001'])
    expect(antes.dominado_en).not.toBeNull()
    await act(async () => api.actualizarCriterios({ ...api.estado.criterios, recuperaciones: 10, sesiones: 6 }))
    expect(api.estado.progreso['QA-001'].estado).not.toBe('dominado')
    expect(api.estado.progreso['QA-001'].dominado_en).toBe(antes.dominado_en)
    expect(api.estado.progreso['QA-001'].intentos).toEqual(antes.intentos)
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

  it('permite resolver una escritura no reconocida dentro de la sesión sin convertirla en un fallo', async () => {
    await render(nuevaCola())
    await responder('alfaa')
    await click('Volver a responder', true)
    expect(api.estado.reanudable?.conceptIds).toEqual(['QA-001', 'QA-001'])
    await responder('alfa')
    await click('Siguiente pregunta')
    const p = api.estado.progreso['QA-001']
    expect(p.intentos.map(t => t.resultado)).toEqual(['revision', 'correcta'])
    expect(p.fallos).toBe(0)
    expect(p.intentos[1].explicacion_previa).toBe(true)
    expect(host.textContent).toContain('Sesión terminada')
  })

  it('restaura una sesión finalizada en el resumen y salir elimina su reanudación', async () => {
    const cola = nuevaCola()
    await render(cola)
    await responder('alfa')
    await click('Siguiente pregunta')
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


describe('presupuesto de tiempo y continuidad', () => {
  it('cuenta explicación visible, excluye pestaña oculta y conserva fallos al pausar por tiempo', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setInterval', 'clearInterval'] })
    const cola: Cola = { ...nuevaCola('guiada'), presupuestoMinutos: 10 }
    await render(cola)
    await click('Necesito aprenderlo')
    expect(host.textContent).toContain('EXPLICACIÓN SINTÉTICA')
    await act(async () => { vi.advanceTimersByTime(599000) })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); vi.advanceTimersByTime(120000) })
    expect(api.estado.reanudable!.msVisibles).toBe(599000)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await click('Ahora recupéralo')
    await act(async () => { vi.advanceTimersByTime(2000) })
    await responder('beta')
    await click('Siguiente pregunta')
    expect(host.textContent).toContain('Objetivo de tiempo alcanzado')
    const saved = clone(api.estado.reanudable!)
    expect(saved).toMatchObject({ indice: 1, conceptIds: ['QA-001', 'QA-001'], pausaPorTiempoPendiente: true, msVisibles: 601000 })
    await act(async () => { vi.advanceTimersByTime(120000) })
    await click('Pausar y guardar')
    await render(cola, 0, false)
    await render({ ...cola, conceptos: [concepto, concepto], sessionId: saved.sessionId }, saved.indice)
    expect(host.textContent).toContain('Objetivo de tiempo alcanzado')
    expect(api.estado.reanudable!.msVisibles).toBe(601000)
    await click('Continuar sin límite')
    expect(api.estado.reanudable!.continuarSinLimite).toBe(true)
    await responder('alfa')
    await click('Siguiente pregunta')
    expect(host.textContent).toContain('Sesión terminada')
  })
  it('no resucita una reanudación borrada por otra ventana al guardar o desmontar', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setInterval', 'clearInterval'] })
    const cola = nuevaCola()
    await render(cola)
    await act(async () => api.guardarReanudable(null))
    await act(async () => { vi.advanceTimersByTime(16000) })
    expect(api.estado.reanudable).toBeNull()
    await render(cola, 0, false)
    expect(api.estado.reanudable).toBeNull()
  })
})
