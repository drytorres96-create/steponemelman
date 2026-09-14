// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import { reconstruirProgreso } from '../store/model'
import type { Intento } from '../srs/tipos'
import type { Concepto } from '../schema/concept'

/**
 * El caso real que lo destapó: tres aciertos limpios en dieciséis horas. El conteo
 * ya está, pero el umbral pide 96 h de separación, así que el concepto no puede
 * cerrarse hoy por mucho que se acierte. La pantalla no debe ofrecerlo como «un
 * acierto y lo cierras».
 */
const mock = vi.hoisted(() => ({ app: vi.fn(), cargarTodo: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargarTodo }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({
  state: { attempts: {}, sessions: {} }, catalog: null, busy: false, loading: false,
}) }))

import { Recuperacion } from '../screens/Recuperacion'

const HORA = 3_600_000
// Relativo al reloj real: la prueba no debe depender del día en que se ejecute.
const AHORA = Date.now()
const T0 = AHORA - 16 * HORA
const DISPONIBLE = new Date(T0 + 96 * HORA)
  .toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })

const acierto = (ts: number, sesion: string): Intento => ({
  attempt_id: `a-${sesion}`, session_id: sesion, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null,
})
const concepto = (id: string, objetivo: string) => ({
  concept_id: id, objetivo,
  clasificacion: { disciplina_primaria: 'Farmacología', sistema_primario: 'Endocrino', tema: 'Tiroides' },
  interaccion: { recomendada: 'recuperacion_libre' },
} as unknown as Concepto)

let host: HTMLDivElement, root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const conceptos = [concepto('C-espera', 'Wolff-Chaikoff'), concepto('C-cerca', 'Eje HHS')]
  mock.cargarTodo.mockResolvedValue(conceptos)
  mock.app.mockImplementation(() => ({
    indice: { modulos: [] }, criterios: CRITERIOS_POR_DEFECTO,
    estado: {
      criterios: CRITERIOS_POR_DEFECTO,
      progreso: {
        // Tres aciertos limpios en 16 h: el conteo está, la separación no.
        'C-espera': reconstruirProgreso('C-espera', [
          acierto(T0, 's1'), acierto(T0 + 2 * HORA, 's2'), acierto(T0 + 15 * HORA, 's3'),
        ], CRITERIOS_POR_DEFECTO),
        // Dos aciertos ya separados 96 h: a este sí le falta sólo un acierto.
        'C-cerca': reconstruirProgreso('C-cerca', [
          acierto(T0 - 200 * HORA, 's4'), acierto(T0 - 100 * HORA, 's5'),
        ], CRITERIOS_POR_DEFECTO),
      },
    },
  }))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const seccion = (id: string) => host.querySelector(`[aria-labelledby="recuperacion-${id}"]`)

describe('Recuperación distingue lo que cierra hoy de lo que sólo espera', () => {
  it('no ofrece como «cerca de dominio» lo que sólo necesita que pase el tiempo', async () => {
    await act(async () => { root.render(<Recuperacion onEstudiar={vi.fn()} onPreguntas={vi.fn()} onMezclar={vi.fn()} />) })

    const cerca = seccion('cerca')!
    expect(cerca.textContent).toContain('Cerca de dominio (1)')
    expect(cerca.textContent).toContain('Consolidar ahora (1)')
    // El que espera separación no entra en el grupo accionable ni en su cuenta.
    expect(cerca.textContent).not.toContain('Wolff-Chaikoff')

    const espera = seccion('esperando')!
    expect(espera.textContent).toContain('Esperando separación (1)')
    expect(espera.textContent).toContain('Wolff-Chaikoff')
    expect(espera.textContent).toContain('Acertarlos hoy no los acredita')
    // 96 h desde el primer acierto vigente, no desde el último.
    expect(espera.textContent).toContain(DISPONIBLE)
  })

  it('un acierto de más no adelanta el reloj: sigue esperando', async () => {
    mock.app.mockImplementation(() => ({
      indice: { modulos: [] }, criterios: CRITERIOS_POR_DEFECTO,
      estado: {
        criterios: CRITERIOS_POR_DEFECTO,
        progreso: {
          'C-espera': reconstruirProgreso('C-espera', [
            acierto(T0, 's1'), acierto(T0 + 2 * HORA, 's2'),
            acierto(T0 + 15 * HORA, 's3'), acierto(T0 + 15.9 * HORA, 's6'),
          ], CRITERIOS_POR_DEFECTO),
        },
      },
    }))
    mock.cargarTodo.mockResolvedValue([concepto('C-espera', 'Wolff-Chaikoff')])
    await act(async () => { root.render(<Recuperacion onEstudiar={vi.fn()} onPreguntas={vi.fn()} onMezclar={vi.fn()} />) })

    expect(seccion('cerca')!.textContent).toContain('Cerca de dominio (0)')
    expect(seccion('esperando')!.textContent).toContain('Wolff-Chaikoff')
    expect(host.textContent).toContain('lo único que falta es que pase el tiempo de separación')
  })
})
