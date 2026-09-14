// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ } from '../schema/concept'
import { sugerenciasDePregunta } from '../lib/sugerencias-chat'

/**
 * El chat del ítem. Dos cosas importan: que las sugerencias salgan del propio ítem —no de
 * la IA— para que la primera pregunta esté a un toque, y que cada respuesta diga de dónde
 * sale, porque no es lo mismo leer el material que leer fisiología general.
 */
const mock = vi.hoisted(() => ({ preguntar: vi.fn() }))
vi.mock('../lib/chat-ia', async () => ({
  ...await vi.importActual<typeof import('../lib/chat-ia')>('../lib/chat-ia'),
  preguntarSobreConcepto: mock.preguntar,
}))

import { ChatConcepto } from '../components/ChatConcepto'

const base = {
  concept_id: 'QA-1',
  source: { doc: 'QA', doc_title: 'Fuente', page: 1, item_id: 'QA-1', fragment: 'Alfa.' },
  objetivo: 'Reconocer', afirmacion: 'Tirotoxicosis facticia.', respuesta_canonica: 'facticia',
  explicacion: 'Porque sí.', confusiones: ['enfermedad de Graves'],
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Endocrino', tema: 'Tiroides', tipo_conocimiento: 'Mecanismo', dificultad: 2 },
  step: 'step1', interaccion: { recomendada: 'prediccion_direccional' },
  evaluacion: { pregunta: '¿Cómo están?', flechas: [{ variable: 'Captación de yodo', direccion: 'baja' }, { variable: 'TSH', direccion: 'baja' }] },
  pistas: ['a', 'b', 'c'], calidad: { estado: 'aprobado', confianza: 1 },
}
const concepto = ConceptoZ.parse(base)

let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

const pulsar = async (texto: string) => {
  const boton = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(texto))
  expect(boton, `falta «${texto}»`).toBeTruthy()
  await act(async () => { boton!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('sugerencias del ítem', () => {
  it('convierte cada fila, opción y confusión del material en una pregunta', () => {
    const conOpciones = ConceptoZ.parse({ ...base, interaccion: { recomendada: 'opcion_multiple' },
      evaluacion: { pregunta: '¿Cuál?', opciones: [{ texto: 'facticia', correcta: true }, { texto: 'Graves', correcta: false }] } })
    expect(sugerenciasDePregunta(concepto)).toEqual([
      '¿Por qué Captación de yodo baja en este caso?',
      '¿Por qué TSH baja en este caso?',
      '¿Cómo lo distingo de enfermedad de Graves?',
      'Explícame el mecanismo paso a paso',
    ])
    expect(sugerenciasDePregunta(conOpciones)).toContain('¿Por qué no es «Graves»?')
    expect(sugerenciasDePregunta(concepto, 2)).toHaveLength(2)
  })
})

describe('chat del concepto', () => {
  it('pregunta con un toque y dice de dónde sale la respuesta', async () => {
    mock.preguntar.mockResolvedValue({ estado: 'ok', respuesta: {
      respuesta: 'La tiroxina exógena frena la TSH y la glándula deja de captar.',
      apoyo: 'material', patron: 'Si ves T4 alta con captación baja, piensa en facticia.' } })
    await act(async () => { root.render(<ChatConcepto concepto={concepto} />) })
    expect(mock.preguntar).not.toHaveBeenCalled()

    await pulsar('¿Por qué Captación de yodo baja')
    expect(mock.preguntar).toHaveBeenCalledWith('QA-1', '¿Por qué Captación de yodo baja en este caso?', [], expect.anything())
    expect(host.textContent).toContain('la glándula deja de captar')
    expect(host.textContent).toContain('Si ves T4 alta con captación baja')
    expect(host.textContent).toContain('Apoyado en el material')
  })

  it('lo que sale de fisiología general se marca distinto', async () => {
    mock.preguntar.mockResolvedValue({ estado: 'ok', respuesta: { respuesta: 'Depende del eje hipotálamo-hipófisis.', apoyo: 'conocimiento' } })
    await act(async () => { root.render(<ChatConcepto concepto={concepto} />) })
    await pulsar('Explícame el mecanismo')
    expect(host.textContent).toContain('Fisiología general, fuera del material')
    expect(host.textContent).not.toContain('Apoyado en el material')
  })

  it('la segunda pregunta lleva la conversación anterior', async () => {
    mock.preguntar.mockResolvedValue({ estado: 'ok', respuesta: { respuesta: 'Primera respuesta.', apoyo: 'material' } })
    await act(async () => { root.render(<ChatConcepto concepto={concepto} />) })
    await pulsar('¿Por qué TSH baja')
    await pulsar('Explícame el mecanismo')
    expect(mock.preguntar.mock.calls[1][2]).toEqual([
      { rol: 'yo', texto: '¿Por qué TSH baja en este caso?' },
      { rol: 'ia', texto: 'Primera respuesta.' },
    ])
  })

  it('un fallo se ve como un turno más y no viaja en el historial siguiente', async () => {
    mock.preguntar.mockResolvedValue({ estado: 'sin_ia', motivo: 'La cuota de preguntas de hoy se ha agotado.' })
    await act(async () => { root.render(<ChatConcepto concepto={concepto} />) })
    await pulsar('¿Por qué TSH baja')
    expect(host.textContent).toContain('La cuota de preguntas de hoy se ha agotado.')

    mock.preguntar.mockResolvedValue({ estado: 'ok', respuesta: { respuesta: 'Ya va.', apoyo: 'material' } })
    await pulsar('Explícame el mecanismo')
    expect(mock.preguntar.mock.calls[1][2]).toEqual([{ rol: 'yo', texto: '¿Por qué TSH baja en este caso?' }])
  })
})
