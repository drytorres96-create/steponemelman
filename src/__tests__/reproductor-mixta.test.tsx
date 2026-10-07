// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ } from '../schema/concept'
import { ESTADO_INICIAL, leerEstadoDesconocido, reconstruirProgreso, type EstadoApp } from '../store/model'
import { nuevoProgreso } from '../srs/fsrs'
import { evaluarDominio } from '../srs/mastery'
import type { Intento } from '../srs/tipos'
import type { SesionSemanal } from '../semana/tipos'
import type { ResultadoCalificacion } from '../lib/calificacion-ia'
import { activateNbmeSession, deriveNbmeSession, emptyNbmeState, parseNbmeState, reviewNbmeAnswer, startNbmeSession, submitNbmeAnswer } from '../nbme/model'
import type { NbmeQuestion, NbmeState } from '../nbme/types'

const mock = vi.hoisted(() => ({
  estado: null as EstadoApp | null,
  nbmeState: null as NbmeState | null,
  oyentes: new Set<() => void>(),
  guardados: [] as EstadoApp['reanudable'][],
  registrados: [] as Intento[],
  cargarConceptos: vi.fn(), calificarConIA: vi.fn(), nextQuestion: vi.fn(),
  vista: vi.fn(),
  resumeSession: vi.fn(), startSession: vi.fn(), guardarAvance: vi.fn(),
}))
vi.mock('../store/estado', async () => {
  const { useSyncExternalStore } = await import('react')
  const indice = { modulos: [] }
  const publicar = () => mock.oyentes.forEach(o => o())
  const suscribir = (o: () => void) => { mock.oyentes.add(o); return () => { mock.oyentes.delete(o) } }
  const leer = () => mock.estado!
  const acciones = {
    indice,
    registrarVistaConcepto: mock.vista,
    progresoDe: (id: string) => mock.estado!.progreso[id] ?? nuevoProgreso(id),
    registrarIntento: (id: string, t: Intento) => {
      mock.registrados.push(t)
      const p = mock.estado!.progreso[id]
      mock.estado = { ...mock.estado!, progreso: { ...mock.estado!.progreso,
        [id]: reconstruirProgreso(id, [...(p?.intentos ?? []), t], mock.estado!.criterios) } }
      publicar()
    },
    guardarReanudable: (r: EstadoApp['reanudable']) => {
      mock.guardados.push(r)
      mock.estado = { ...mock.estado!, reanudable: r }
      publicar()
    },
    iniciarSesion: () => 'S', cerrarSesion: () => {},
  }
  return { useApp: () => ({ ...acciones, estado: useSyncExternalStore(suscribir, leer) }) }
})
vi.mock('../data/corpus', () => ({ cargarConceptos: mock.cargarConceptos }))
vi.mock('../semana/api', () => ({ guardarAvance: mock.guardarAvance }))
vi.mock('../lib/calificacion-ia', () => ({ calificarConIA: mock.calificarConIA }))
vi.mock('../components/ConfusionIA', () => ({ ConfusionIA: () => null }))
vi.mock('../components/AyudaIA', () => ({ AyudaIA: () => null }))
vi.mock('../components/ExamenIA', () => ({ ExamenIA: () => null }))
vi.mock('../components/ChatConcepto', () => ({ ChatConcepto: () => null }))
vi.mock('../nbme/NbmePlayer', () => ({ NbmePlayer: () => <p>Pregunta NBME siguiente</p> }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({ state: mock.nbmeState!, loading: false, busy: false,
  resumeSession: mock.resumeSession, startSession: mock.startSession, nextQuestion: mock.nextQuestion }) }))

import { SesionMixta } from '../semana/SesionMixta'
import { Reproductor } from '../screens/Reproductor'

const conceptos = [1, 2, 3].map(n => ConceptoZ.parse({
  concept_id: `QA-${n}`,
  source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: `QA-${n}`, fragment: 'Alfa va primero.' },
  objetivo: 'Recuperar un ejemplo sintético', afirmacion: 'Alfa va primero.',
  respuesta_canonica: 'alfa', sinonimos: [], explicacion: 'Alfa precede a beta.',
  distractores_cercanos: [{ texto: 'beta', por_que_incorrecto: 'Beta va después.' }],
  clasificacion: { disciplina_primaria: 'Bioquímica', sistema_primario: 'Multisistémico', tema: 'Ejemplo', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] },
  evaluacion: { pregunta: `¿Cuál va primero en el ejemplo ${n}?` }, pistas: ['La primera letra.', 'Precede a beta.', 'Empieza por a.'],
  calidad: { estado: 'aprobado', confianza: 1 },
}))
const sesion: SesionSemanal = {
  id: 'S', semana: 'S1', semanaInicio: '2026-09-28', dia: 1, orden: 1,
  titulo: 'Mixta sintética', subtitulo: null,
  guion: [...conceptos.map(c => ({ kind: 'concepto' as const, id: c.concept_id })), { kind: 'pregunta', id: 'Q1', revision: 'r1' }],
  presupuestoMin: 30, estado: 'en_curso', cursor: 0, nbmeSessionId: 'nbme-S', completadaEn: null,
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  mock.estado = { ...ESTADO_INICIAL }
  mock.nbmeState = startNbmeSession(emptyNbmeState('sintetico-r1'), {
    id: 'nbme-S', title: 'Mixta', refs: [{ id: 'Q1', revision: 'r1' }],
  }, 1)
  mock.oyentes.clear(); mock.guardados = []; mock.registrados = []
  mock.cargarConceptos.mockResolvedValue(new Map(conceptos.map(c => [c.concept_id, c])))
  mock.calificarConIA.mockResolvedValue({ estado: 'sin_ia', motivo: 'Sin IA en pruebas.' })
  mock.resumeSession.mockResolvedValue(true)
  mock.guardarAvance.mockResolvedValue({ ok: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent === texto)!
const avanzar = () => act(async () => boton('Siguiente pregunta').click())
async function escribir(texto: string) {
  const input = host.querySelector<HTMLInputElement>('input[type="text"]')!
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function responder(texto: string) {
  await escribir(texto)
  await act(async () => boton('Comprobar').click())
}
const pintar = () => act(async () => root.render(<SesionMixta sesion={sesion} onSalir={vi.fn()} efimera />))

describe('neurocognición: tramo mixto finito', () => {
  it('abrir el historial semanal de un bloque borrado conserva el progreso y no crea otro bloque con sus referencias antiguas', async () => {
    mock.nbmeState = { ...mock.nbmeState!, archivedSessions: { 'nbme-S': Date.now() } }
    const antes = structuredClone(mock.nbmeState)
    await pintar()
    expect(host.textContent).toContain('El bloque NBME de esta sesión se borró de la biblioteca')
    expect(mock.startSession).not.toHaveBeenCalled()
    expect(mock.resumeSession).not.toHaveBeenCalled()
    expect(mock.nbmeState).toEqual(antes)
    expect(mock.guardados).toHaveLength(0)
    expect(mock.registrados).toHaveLength(0)
  })

  it('borrar el bloque en otra ventana mientras cargan los conceptos tampoco lo recrea', async () => {
    let liberar!: (mapa: Map<string, typeof conceptos[number]>) => void
    mock.cargarConceptos.mockReturnValue(new Promise<Map<string, typeof conceptos[number]>>(resolve => { liberar = resolve }))
    await pintar()
    mock.nbmeState = { ...mock.nbmeState!, archivedSessions: { 'nbme-S': Date.now() } }
    await pintar()
    await act(async () => liberar(new Map(conceptos.map(c => [c.concept_id, c]))))
    expect(host.textContent).toContain('El bloque NBME de esta sesión se borró de la biblioteca')
    expect(mock.startSession).not.toHaveBeenCalled()
    expect(mock.resumeSession).not.toHaveBeenCalled()
    expect(mock.guardados).toHaveLength(0)
  })

  const conOpciones = () => ConceptoZ.parse({ ...conceptos[0],
    interaccion: { recomendada: 'opcion_multiple', permitidas: ['opcion_multiple', 'recuperacion_libre'] },
    evaluacion: { ...conceptos[0].evaluacion, opciones: [
      { texto: 'alfa', correcta: true }, { texto: 'beta', correcta: false },
    ] },
  })
  it('una visita V3 puede recuperar sin alternativas y se reanuda con la misma presentación y respuesta', async () => {
    const c = conOpciones()
    const antes = Date.now()
    const anteriores: Intento[] = [5, 2].map(d => ({
      attempt_id: `reconocimiento-${d}`, session_id: `anterior-${d}`, ts: antes - d * 86_400_000,
      calificacion: 3, resultado: 'correcta', interaccion: 'opcion_multiple', recuperacion_activa: false,
      tipo_evidencia: 'discriminacion', respuesta_dada: 'alfa', pistas_usadas: 0, ms: 1000,
      fuente_consultada: false, explicacion_previa: false, confianza_declarada: 2, tipo_error: 'ninguno',
    }))
    mock.estado = { ...ESTADO_INICIAL, progreso: {
      [c.concept_id]: reconstruirProgreso(c.concept_id, anteriores, ESTADO_INICIAL.criterios),
    } }
    // La semilla persistida elige recuerdo en esta visita, incluso con un único concepto.
    const cola = { titulo: 'Recuperación', subtitulo: '', ruta: 'repaso', modulo: 'QA', conceptos: [c], sessionId: 'opciones' }
    await act(async () => root.render(<Reproductor cola={cola} onSalir={vi.fn()} />))
    expect(host.querySelector('[role="radiogroup"]')).toBeNull()
    expect(host.querySelector('input[type="text"]')).not.toBeNull()
    expect(mock.estado!.reanudable?.versionFormato).toBe(3)
    await responder('alfa')
    expect(mock.registrados).toHaveLength(1)
    expect(mock.registrados[0]).toMatchObject({ interaccion: 'recuperacion_libre', recuperacion_activa: true,
      tipo_evidencia: 'recuerdo', resultado: 'correcta', fuente_consultada: false, explicacion_previa: false, evaluador_version: '2.4.0' })
    expect(evaluarDominio(mock.estado!.progreso[c.concept_id], mock.estado!.criterios).cumple).toBe(true)
    const preguntaVersion = mock.registrados[0].pregunta_version
    const guardado = leerEstadoDesconocido(JSON.parse(JSON.stringify(mock.estado)))!
    expect(guardado).not.toBeNull()
    await act(async () => root.unmount())
    mock.estado = guardado
    root = createRoot(host)
    await act(async () => root.render(<Reproductor cola={cola} onSalir={vi.fn()} />))
    expect(host.querySelector('[role="radiogroup"]')).toBeNull()
    expect(host.querySelector<HTMLInputElement>('input[type="text"]')?.disabled).toBe(true)
    expect(host.textContent).toContain('Tu respuesta: alfa')
    expect(host.textContent).not.toContain('otra presentación')
    expect(mock.registrados).toHaveLength(1)
    expect(mock.estado!.progreso[c.concept_id].intentos.at(-1)!.pregunta_version).toBe(preguntaVersion)
  })

  it('una sesión V2 con recuerdo permitido conserva sus opciones al restaurarse', async () => {
    const c = conOpciones()
    const sessionId = 'legacy-v2'
    mock.estado = leerEstadoDesconocido(JSON.parse(JSON.stringify({ ...ESTADO_INICIAL,
      reanudable: { modulo: 'QA', sesion: 'repaso', indice: 0, ts: 1, sessionId, versionFormato: 2,
        conceptIds: [c.concept_id], cantidadInicial: 1 },
    })))!
    const cola = { titulo: 'Legada', subtitulo: '', ruta: 'repaso', modulo: 'QA', conceptos: [c], sessionId }
    await act(async () => root.render(<Reproductor cola={cola} onSalir={vi.fn()} />))
    expect(host.querySelector('input[type="text"]')).toBeNull()
    expect(host.querySelector('[role="radiogroup"]')).not.toBeNull()
    expect(mock.estado!.reanudable?.versionFormato).toBe(2)
    const alfa = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b => b.lastElementChild?.textContent === 'alfa')!
    await act(async () => alfa.click())
    await act(async () => boton('Comprobar respuesta').click())
    expect(mock.registrados).toHaveLength(1)
    expect(mock.registrados[0]).toMatchObject({ interaccion: 'opcion_multiple', recuperacion_activa: false, tipo_evidencia: 'discriminacion' })
  })

  it('tres fallos consecutivos llegan a NBME sin ampliar el guion ni pedir otra vuelta', async () => {
    await pintar()
    for (let n = 0; n < 3; n++) {
      await responder('beta')
      expect(host.textContent).toContain('volverá en las cajas de los próximos días')
      expect(host.textContent).not.toContain('hasta que lo aciertes')
      const actual = leerEstadoDesconocido(JSON.parse(JSON.stringify(mock.estado)))
      expect(actual?.reanudable).toMatchObject({ versionFormato: 3, indice: n, conceptIds: ['QA-1', 'QA-2', 'QA-3'] })
      await avanzar()
    }
    expect(host.textContent).toContain('Pregunta NBME siguiente')
    expect(host.textContent).toContain('3 de 4')
    expect(mock.registrados.map(t => t.pregunta_id)).toEqual(['S:0:QA-1', 'S:1:QA-2', 'S:2:QA-3'])
    expect(mock.guardados.every(r => !r || r.conceptIds!.length === 3)).toBe(true)
    expect(mock.guardarAvance).not.toHaveBeenCalled()
  })

  it.each([3, undefined])('retoma una cola antigua con cantidadInicial=%s, conserva ambos estados y termina sin añadir reintentos', async cantidadInicial => {
    const ids = ['QA-1', 'QA-2', 'QA-3', 'QA-1', 'QA-2']
    const intentos: Intento[] = ids.slice(0, 4).map((id, n) => ({
      attempt_id: `antiguo-${n}`, session_id: 'S', pregunta_id: `S:${n}:${id}`, ts: n + 1,
      calificacion: 1, resultado: 'incorrecta', interaccion: 'recuperacion_libre', recuperacion_activa: true,
      pistas_usadas: 0, ms: 1000, tipo_error: 'desconocimiento', confianza_declarada: 2,
      fuente_consultada: false, explicacion_previa: n >= 3, respuesta_dada: 'beta',
    }))
    const antigua = { ...ESTADO_INICIAL, progreso: Object.fromEntries(conceptos.map(c => [c.concept_id,
      reconstruirProgreso(c.concept_id, intentos.filter(t => t.pregunta_id?.endsWith(c.concept_id)), ESTADO_INICIAL.criterios)])),
      reanudable: { modulo: 'semana:S', sesion: 'repaso', indice: 3, ts: 10, sessionId: 'S', conceptIds: ids, cantidadInicial,
        paso: { indice: 3, pistas: 0, fuenteConsultada: false, explicacionPrevia: true, confianza: 2, msActivo: 1000 } },
    }
    // Fixture anterior a versionFormato: pasa por el lector público, como una sesión importada.
    mock.estado = leerEstadoDesconocido(JSON.parse(JSON.stringify(antigua)))
    expect(mock.estado).not.toBeNull()
    const historial = structuredClone(mock.estado!.progreso)
    const pregunta: NbmeQuestion = {
      id: 'Q-anterior', revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [],
      topic: 'Ejemplo sintético', objective: null, status: 'ready', reasons: [], figureRequired: false, conceptLinks: [],
      stem: 'Synthetic question', options: [{ id: 'A', text: 'First' }, { id: 'B', text: 'Second' }],
      answer: 'A', explanation: 'Synthetic explanation', figures: [], provenance: { sourceFile: 'QA', sourceRecordId: 'QA', notes: [] },
    }
    let banco = startNbmeSession(mock.nbmeState!, { id: 'nbme-anterior', title: 'Historial', refs: [{ id: pregunta.id, revision: 'r1' }] }, 2)
    banco = submitNbmeAnswer(banco, 'nbme-anterior', 0, pregunta, 'B', 100, 3)
    banco = reviewNbmeAnswer(banco, 'nbme-anterior', 0, 4)
    banco = activateNbmeSession(banco, 'nbme-S', 5)
    mock.nbmeState = parseNbmeState(JSON.parse(JSON.stringify(banco)))
    expect(mock.nbmeState).not.toBeNull()
    const nbmeAntes = structuredClone(mock.nbmeState!)
    const colaNbmeAntes = deriveNbmeSession(nbmeAntes, 'nbme-S')!.queue
    await pintar()
    expect(host.textContent).toContain('Tu respuesta: beta')
    expect(host.querySelector('input')?.disabled).toBe(true)
    expect(mock.registrados).toHaveLength(0)
    expect(mock.estado!.reanudable).toMatchObject({ indice: 3, conceptIds: ids, cantidadInicial: 3, versionFormato: 1 })
    await avanzar()
    expect(mock.estado!.reanudable?.indice).toBe(4)
    await responder('beta')
    expect(mock.registrados).toHaveLength(1)
    expect(mock.registrados[0]).toMatchObject({ pregunta_id: 'S:4:QA-2', explicacion_previa: true, resultado: 'incorrecta' })
    await avanzar()
    expect(host.textContent).toContain('Pregunta NBME siguiente')
    expect(mock.guardados.every(r => !r || r.conceptIds?.join('|') === ids.join('|'))).toBe(true)
    for (const c of conceptos) expect(mock.estado!.progreso[c.concept_id].intentos.slice(0, historial[c.concept_id].intentos.length))
      .toEqual(historial[c.concept_id].intentos)
    expect(leerEstadoDesconocido(JSON.parse(JSON.stringify(mock.estado)))).not.toBeNull()
    expect(parseNbmeState(JSON.parse(JSON.stringify(mock.nbmeState)))).toEqual(nbmeAntes)
    expect(deriveNbmeSession(mock.nbmeState!, 'nbme-S')!.queue).toEqual(colaNbmeAntes)
    expect(mock.nbmeState!.activeSessionId).toBe('nbme-S')
    expect(mock.nextQuestion).not.toHaveBeenCalled()
  })

  it('la práctica independiente conserva su política de reinserción cuando no recibe unaVuelta', async () => {
    const cola = { titulo: 'Independiente', subtitulo: '', ruta: 'repaso', modulo: 'M', conceptos: [conceptos[0]], sessionId: 'S' }
    await act(async () => root.render(<Reproductor cola={cola} onSalir={vi.fn()} />))
    await responder('beta')
    expect(host.textContent).toContain('hasta que lo aciertes')
    await avanzar()
    expect(mock.estado!.reanudable?.conceptIds).toEqual(['QA-1', 'QA-1'])
    expect(mock.estado!.reanudable?.indice).toBe(1)
  })
})

describe('neurocognición: confianza previa y contexto visible', () => {
  it('durante IA bloquea confianza y ayudas y registra sólo las elegidas antes del envío', async () => {
    let resolver!: (r: ResultadoCalificacion) => void
    mock.calificarConIA.mockImplementation(() => new Promise<ResultadoCalificacion>(r => { resolver = r }))
    await pintar()
    await act(async () => { boton('Media').click(); boton('Necesito una pista').click() })
    await responder('alfa')
    expect(mock.registrados).toHaveLength(0)
    expect(host.textContent).toContain('Comprobando tu respuesta con la IA')
    for (const texto of ['Poca', 'Media', 'Mucha', 'Necesito aprenderlo', 'Otra pista (1/3)', 'Ver la fuente'])
      expect(boton(texto).disabled, texto).toBe(true)
    await act(async () => { boton('Mucha').click(); boton('Necesito aprenderlo').click(); boton('Ver la fuente').click() })
    expect(host.textContent).not.toContain('Ahora recupéralo')
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => resolver({ estado: 'ok', veredicto: 'correcta', motivo: 'Correcto.' }))
    expect(mock.registrados[0]).toMatchObject({ confianza_declarada: 2, pistas_usadas: 1, fuente_consultada: false,
      explicacion_previa: false, tipo_error: 'correcta_con_pistas' })
    await avanzar()
    expect(boton('Mucha').disabled).toBe(false)
    expect(boton('Necesito aprenderlo').disabled).toBe(false)
  })

  it('lleva cada enunciado nuevo a la vista sin desplazar el feedback ni al cambiar confianza', async () => {
    const desplazados: (string | null)[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function () { desplazados.push(this.textContent) }
    try {
      await pintar()
      expect(desplazados).toEqual(['¿Cuál va primero en el ejemplo 1?'])
      await act(async () => boton('Poca').click())
      expect(desplazados).toHaveLength(1)
      await responder('alfa')
      expect(desplazados).toHaveLength(1)
      expect(document.activeElement?.textContent).toBe('Siguiente pregunta')
      await avanzar()
      expect(desplazados).toEqual(['¿Cuál va primero en el ejemplo 1?', '¿Cuál va primero en el ejemplo 2?'])
      expect(document.activeElement).toBe(host.querySelector('input[type="text"]'))
    } finally {
      if (original) Element.prototype.scrollIntoView = original
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })
})
