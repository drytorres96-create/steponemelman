// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Concepto } from '../schema/concept'
import type { Intento, ProgresoConcepto } from '../srs/tipos'

/**
 * La lectura de la semana es lo único de Progreso que sale a la red, así que la tarjeta
 * tiene que comportarse como el resto de la ayuda: bajo demanda, sin bloquear nada, y sin
 * mandar más que identificadores y cifras. Si la IA no responde, la pantalla sigue viva.
 */
const mock = vi.hoisted(() => ({ app: vi.fn(), analizar: vi.fn(), cuota: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../lib/analisis-ia', async () => ({
  ...await vi.importActual<typeof import('../lib/analisis-ia')>('../lib/analisis-ia'),
  analizarSemana: mock.analizar, cuotaIA: mock.cuota,
}))

import { LecturaSemana } from '../screens/LecturaSemana'

const HORA = 3_600_000
const AHORA = Date.now()
const fallo = (ts: number): Intento => ({
  attempt_id: `a-${ts}`, session_id: 's', ts, calificacion: 1, resultado: 'incorrecta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0, ms: 900,
  tipo_error: 'confusion_conceptos', confianza_declarada: null,
})
const progreso = (id: string): ProgresoConcepto => ({
  concept_id: id, estado: 'en_aprendizaje', dificultad: 5, estabilidad: 1, ultimo: null,
  proxima: null, intentos: [fallo(AHORA - HORA)], aciertos: 0, fallos: 1, dominado_en: null,
})
const concepto = (id: string, afirmacion: string) => ({ concept_id: id, afirmacion } as unknown as Concepto)
const CONCEPTOS = [concepto('QA-1', 'La glucólisis produce dos ATP netos.'), concepto('QA-2', 'La gluconeogénesis consume seis ATP.')]

let host: HTMLDivElement, root: Root
const estudiar = vi.fn()
const pintar = (conceptos = CONCEPTOS) => act(() => { root.render(<LecturaSemana conceptos={conceptos} onEstudiar={estudiar} />) })
const pulsar = async (texto: string) => {
  const boton = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(texto))
  expect(boton, `falta el botón «${texto}»`).toBeTruthy()
  await act(async () => { boton!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  estudiar.mockClear()
  mock.cuota.mockResolvedValue({ presupuesto: 8500, gastadas: 850, restantes: 7650, llamadas: 3, activa: true })
  mock.app.mockReturnValue({ estado: { progreso: { 'QA-1': progreso('QA-1'), 'QA-2': progreso('QA-2') } } })
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks() })

describe('lectura de la semana', () => {
  it('no pide nada hasta que se pulsa, y enseña antes lo que enviaría', async () => {
    await act(async () => { pintar() })
    expect(mock.analizar).not.toHaveBeenCalled()
    // La cuota sí se consulta al entrar: no gasta IA y decide si merece la pena pulsar.
    expect(host.textContent).toContain('Queda el 90 % de la cuota gratuita de hoy.')
    expect(host.textContent).toContain('Ver los fallos que se enviarían')
    expect(host.textContent).toContain('Tus respuestas escritas no se envían.')
    expect(host.textContent).toContain('La glucólisis produce dos ATP netos.')
  })

  it('agrupa lo devuelto y ofrece repasar ese grupo', async () => {
    mock.analizar.mockResolvedValue({ estado: 'ok', cacheado: false, enfoque: 'Empieza por las enzimas irreversibles.',
      patrones: [{ titulo: 'Vías opuestas', porque: 'Comparten intermediarios.', conceptos: ['QA-1', 'QA-2'], accion: 'Repasa las tres irreversibles.' }] })
    pintar()
    await pulsar('Leer mi semana con IA')
    expect(mock.analizar.mock.calls[0][0]).toEqual([
      { id: 'QA-1', fallos: 1, aciertos: 0, error: 'confusion_conceptos' },
      { id: 'QA-2', fallos: 1, aciertos: 0, error: 'confusion_conceptos' },
    ])
    expect(host.textContent).toContain('Vías opuestas')
    expect(host.textContent).toContain('Empieza por las enzimas irreversibles.')
    await pulsar('Repasar estos 2')
    expect(estudiar).toHaveBeenCalledWith(['QA-1', 'QA-2'])
  })

  it('si la IA no puede, lo dice y no rompe la pantalla', async () => {
    mock.analizar.mockResolvedValue({ estado: 'sin_ia', motivo: 'La cuota de análisis gratuito de hoy se ha agotado.' })
    pintar()
    await pulsar('Leer mi semana con IA')
    expect(host.textContent).toContain('La cuota de análisis gratuito de hoy se ha agotado.')
    expect(host.textContent).toContain('Leer mi semana con IA')
  })

  it('un fallo del modelo llega con su detalle, para saber qué pasó sin mirar logs', async () => {
    mock.analizar.mockResolvedValue({ estado: 'sin_ia', motivo: 'La ayuda no pudo respaldar su respuesta en la fuente, así que se descartó. (ningún patrón citaba conceptos de esta semana)' })
    pintar()
    await pulsar('Leer mi semana con IA')
    expect(host.textContent).toContain('ningún patrón citaba conceptos de esta semana')
  })

  it('sin fallos esta semana la tarjeta no aparece', () => {
    mock.app.mockReturnValue({ estado: { progreso: {} } })
    pintar()
    expect(host.textContent).toBe('')
  })
})
