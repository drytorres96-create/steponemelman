// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Concepto } from '../schema/concept'

/**
 * Las dos piezas que llevan un concepto a la práctica: cómo se preguntaría y hacia dónde
 * te fuiste al fallarlo. Una escribe contenido nuevo y tiene que avisarlo; la otra no
 * inventa nada pero debe callarse cuando no está segura.
 */
const mock = vi.hoisted(() => ({ examen: vi.fn(), confusion: vi.fn() }))
vi.mock('../lib/examen-ia', () => ({ comoCaeEnElExamen: mock.examen }))
vi.mock('../lib/confusion-ia', async () => ({
  ...await vi.importActual<typeof import('../lib/confusion-ia')>('../lib/confusion-ia'),
  conQueSeConfundio: mock.confusion,
}))

import { ExamenIA } from '../components/ExamenIA'
import { ConfusionIA } from '../components/ConfusionIA'

const concepto = { concept_id: 'QA-1', afirmacion: 'Alfa es el primero.' } as unknown as Concepto
const EXAMEN = {
  vineta: 'Una mujer de 34 años acude por debilidad de seis meses, hiperpigmentación de pliegues y presión de 86/54 mmHg. ¿Cuál es el mecanismo?',
  dato_clave: 'La hiperpigmentación apunta al fallo primario.',
  trampas: [{ opcion: 'Fallo secundario', por_que: 'No pigmenta.' }, { opcion: 'SIADH', por_que: 'No explica el potasio.' }],
  patron: 'Si ves hiperpigmentación + hiperpotasemia, piensa en fallo suprarrenal primario.',
  utilidad: 'Cambia la reposición inicial.',
}

let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

const pulsar = async (texto: string) => {
  const boton = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(texto))
  expect(boton, `falta el botón «${texto}»`).toBeTruthy()
  await act(async () => { boton!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('cómo caería en el examen', () => {
  it('no pide nada hasta que se pulsa, y avisa de que no está verificado', async () => {
    mock.examen.mockResolvedValue({ estado: 'ok', cacheado: false, examen: EXAMEN })
    await act(async () => { root.render(<ExamenIA concepto={concepto} />) })
    expect(mock.examen).not.toHaveBeenCalled()

    await pulsar('Muéstrame cómo caería en el examen')
    expect(mock.examen).toHaveBeenCalledWith('QA-1', expect.anything())
    expect(host.textContent).toContain('hiperpigmentación de pliegues')
    expect(host.textContent).toContain('Si ves hiperpigmentación + hiperpotasemia')
    expect(host.textContent).toContain('Fallo secundario')
    expect(host.textContent).toContain('no está verificada contra la fuente')
    expect(host.textContent).toContain('No cuenta como intento')
  })

  it('si no se puede, lo dice y deja volver a intentarlo', async () => {
    mock.examen.mockResolvedValue({ estado: 'sin_ia', motivo: 'La cuota de viñetas de hoy se ha agotado.' })
    await act(async () => { root.render(<ExamenIA concepto={concepto} />) })
    await pulsar('Muéstrame cómo caería en el examen')
    expect(host.textContent).toContain('La cuota de viñetas de hoy se ha agotado.')
    expect(host.textContent).toContain('Muéstrame cómo caería en el examen')
  })
})

describe('con qué se confundió la respuesta', () => {
  it('nombra el texto más cercano y de dónde sale', async () => {
    mock.confusion.mockResolvedValue({ mejor: { texto: 'elastina', origen: 'distractor', similitud: 0.87 }, candidatos: [] })
    await act(async () => { root.render(<ConfusionIA conceptId="QA-1" respuesta="elastine" />) })
    expect(mock.confusion).toHaveBeenCalledWith('QA-1', 'elastine', expect.anything())
    expect(host.textContent).toContain('elastina')
    expect(host.textContent).toContain('distractor cercano')
    expect(host.textContent).toContain('87 %')
  })

  it('calla cuando nada se parece lo bastante, y cuando no hay respuesta', async () => {
    mock.confusion.mockResolvedValue({ mejor: null, candidatos: [] })
    await act(async () => { root.render(<ConfusionIA conceptId="QA-1" respuesta="algo" />) })
    expect(host.textContent).toBe('')

    mock.confusion.mockResolvedValue(null)
    await act(async () => { root.render(<ConfusionIA conceptId="QA-1" respuesta="otra" />) })
    expect(host.textContent).toBe('')
  })
})
