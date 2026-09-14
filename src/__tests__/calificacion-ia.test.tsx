// @vitest-environment jsdom
// La IA corrige las respuestas de una palabra al pulsar «Comprobar». Su veredicto cuenta como
// acierto o fallo, queda marcado como suyo y Yoel puede rectificarlo.
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import { ConceptoZ, type Concepto } from '../schema/concept'
import type { Intento } from '../srs/tipos'
import type { ResultadoCalificacion } from '../lib/calificacion-ia'

const mock = vi.hoisted(() => ({ app: vi.fn(), calificar: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../components/AyudaIA', () => ({ AyudaIA: () => <div>ayuda</div> }))
vi.mock('../lib/calificacion-ia', () => ({ calificarConIA: mock.calificar }))
vi.mock('../lib/confusion-ia', () => ({ conQueSeConfundio: async () => null, ORIGEN_PARECIDO: {} }))

import { Reproductor } from '../screens/Reproductor'

const concepto = ConceptoZ.parse({
  concept_id: 'QA-1',
  source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: 'QA-1', fragment: 'Alfa es el primero.' },
  objetivo: 'Reconocer', afirmacion: 'Alfa es el primero.',
  respuesta_canonica: 'alfa', sinonimos: [], explicacion: 'Porque sí.',
  distractores_cercanos: [{ texto: 'beta', por_que_incorrecto: 'No.' }],
  clasificacion: { disciplina_primaria: 'Bioquímica', sistema_primario: 'Multisistémico', tema: 'Ejemplo', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] },
  evaluacion: { pregunta: '¿Cuál es el primero?' }, pistas: ['una', 'dos', 'tres'],
  calidad: { estado: 'aprobado', confianza: 1 },
})

let host: HTMLDivElement
let root: Root
let estado: Record<string, unknown>
let registrados: Intento[]
const forzar = { fn: (() => {}) as (f: (n: number) => number) => void }

function Envoltura({ conceptos }: { conceptos: Concepto[] }) {
  const [, set] = useState(0)
  forzar.fn = set
  return <Reproductor cola={{ titulo: 'QA', subtitulo: '', ruta: 'aprendizaje', modulo: 'mod-qa', conceptos }} onSalir={vi.fn()} />
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  estado = { ...ESTADO_INICIAL, reanudable: null, progreso: {} }
  registrados = []
  mock.app.mockImplementation(() => ({
    estado,
    registrarIntento: (_id: string, intento: Intento) => { registrados.push(intento) },
    cerrarSesion: vi.fn(),
    iniciarSesion: () => 'sesion-qa',
    progresoDe: (id: string) => ({ concept_id: id, intentos: [], estado: 'nuevo' }),
    guardarReanudable: (r: { indice: number }) => {
      const previo = estado.reanudable as { indice?: number } | null
      estado.reanudable = r
      if (!previo || previo.indice !== r.indice) forzar.fn(n => n + 1)
    },
  }))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === texto)

async function responder(texto: string) {
  await act(async () => root.render(<Envoltura conceptos={[concepto]} />))
  const input = host.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => boton('Comprobar')!.click())
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

const ultimo = () => registrados.at(-1)!

describe('la IA corrige las respuestas breves', () => {
  it('un sinónimo que el corrector propio no conoce cuenta como acierto y queda marcado', async () => {
    mock.calificar.mockResolvedValue({ estado: 'ok', veredicto: 'correcta', motivo: 'Es el mismo concepto.' } satisfies ResultadoCalificacion)
    await responder('el primer elemento')

    expect(mock.calificar).toHaveBeenCalledTimes(1)
    expect(mock.calificar.mock.calls[0][0]).toMatchObject({ conceptId: 'QA-1', answer: 'el primer elemento', route: 'aprendizaje' })
    expect(ultimo()).toMatchObject({ resultado: 'correcta', tipo_error: 'ninguno', calificacion: 3, calificado_por_ia: true })
    expect(host.textContent).toContain('Este veredicto lo decidió la IA')
    expect(host.textContent).toContain('Es el mismo concepto.')
  })

  it('sin IA decide el corrector propio, sin marcar el intento ni callar el motivo', async () => {
    mock.calificar.mockResolvedValue({ estado: 'sin_ia', motivo: 'La cuota de hoy se ha agotado.' } satisfies ResultadoCalificacion)
    await responder('beta')

    expect(ultimo().resultado).toBe('incorrecta')
    expect(ultimo().calificado_por_ia).toBeUndefined()
    expect(host.textContent).toContain('La cuota de hoy se ha agotado.')
    expect(host.textContent).not.toContain('Este veredicto lo decidió la IA')
  })

  it('rectificar el veredicto reescribe el mismo intento y manda sobre la IA', async () => {
    mock.calificar.mockResolvedValue({ estado: 'ok', veredicto: 'incorrecta', motivo: 'Nombra otro concepto.' } satisfies ResultadoCalificacion)
    await responder('alfa')
    expect(ultimo()).toMatchObject({ resultado: 'incorrecta', calificado_por_ia: true })
    const registrado = ultimo().attempt_id

    await act(async () => boton('Mi respuesta sí era correcta')!.click())

    expect(ultimo().attempt_id).toBe(registrado)
    expect(ultimo()).toMatchObject({ resultado: 'correcta', calificacion: 3, tipo_error: 'ninguno', correccion_manual: true })
    expect(ultimo().calificacion_actualizada_en).toBeGreaterThan(0)
    expect(host.textContent).toContain('Vale tu corrección')
    // Ya rectificado, no se ofrece rectificar otra vez.
    expect(boton('No, mi respuesta era incorrecta')).toBeUndefined()
  })

  /**
   * Una respuesta escrita que el corrector propio no supo decidir queda «en revisión»: ni
   * acierto ni fallo, no acredita nada. Casi siempre porque la IA no estaba disponible en
   * ese momento. Poder pedírselo después recupera el intento en vez de perderlo.
   */
  it('una respuesta sin evaluar la puede juzgar la IA, reescribiendo el mismo intento', async () => {
    mock.calificar.mockResolvedValue({ estado: 'sin_ia', motivo: 'La cuota de hoy se ha agotado.' } satisfies ResultadoCalificacion)
    await responder('gamma')
    expect(ultimo()).toMatchObject({ resultado: 'revision', tipo_error: 'error_por_revisar' })
    const registrado = ultimo().attempt_id
    expect(registrados).toHaveLength(1)

    mock.calificar.mockResolvedValue({ estado: 'ok', veredicto: 'parcial', motivo: 'Nombra solo una parte.' } satisfies ResultadoCalificacion)
    await act(async () => boton('Que la IA juzgue mi respuesta')!.click())

    expect(mock.calificar.mock.calls.at(-1)![0]).toMatchObject({ conceptId: 'QA-1', answer: 'gamma' })
    expect(registrados).toHaveLength(2)
    expect(ultimo().attempt_id).toBe(registrado)
    expect(ultimo()).toMatchObject({ resultado: 'parcial', calificacion: 2, tipo_error: 'recuerdo_incompleto', calificado_por_ia: true })
    expect(ultimo().calificacion_actualizada_en).toBeGreaterThan(0)
    expect(host.textContent).toContain('Nombra solo una parte.')
    expect(boton('Que la IA juzgue mi respuesta')).toBeUndefined()
  })

  it('si la IA sigue sin poder, la respuesta se queda como estaba y se dice por qué', async () => {
    mock.calificar.mockResolvedValue({ estado: 'sin_ia', motivo: 'La cuota de hoy se ha agotado.' } satisfies ResultadoCalificacion)
    await responder('gamma')
    await act(async () => boton('Que la IA juzgue mi respuesta')!.click())

    expect(registrados).toHaveLength(1)
    expect(ultimo().resultado).toBe('revision')
    expect(host.textContent).toContain('La cuota de hoy se ha agotado.')
    expect(boton('Que la IA juzgue mi respuesta')).toBeTruthy()
  })

  it('mientras la IA responde, la pregunta queda bloqueada y no se registra dos veces', async () => {
    let resolver: (r: ResultadoCalificacion) => void = () => {}
    mock.calificar.mockReturnValue(new Promise<ResultadoCalificacion>(r => { resolver = r }))
    await act(async () => root.render(<Envoltura conceptos={[concepto]} />))
    const input = host.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'alfa')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => boton('Comprobar')!.click())

    expect(host.textContent).toContain('Comprobando tu respuesta con la IA…')
    expect(host.querySelector('input')!.disabled).toBe(true)
    expect(registrados).toHaveLength(0)

    await act(async () => { resolver({ estado: 'ok', veredicto: 'correcta', motivo: 'Correcta.' }); await Promise.resolve() })
    expect(registrados).toHaveLength(1)
    expect(host.textContent).not.toContain('Comprobando tu respuesta con la IA…')
  })
})
