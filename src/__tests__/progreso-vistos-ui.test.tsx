// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL, registrarVistaConceptoEstado } from '../store/model'
import { nuevoProgreso } from '../srs/fsrs'

const mock = vi.hoisted(() => ({ app: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../screens/ProgresoCifras', () => ({ BandaDeCifras: () => null }))
vi.mock('../screens/ProgresoMeta', () => ({ ProgresoMeta: () => null }))
vi.mock('../screens/ProgresoAdherencia', () => ({ BandaAdherencia: () => null }))
vi.mock('../screens/CalendarioSemana', () => ({ CalendarioSemana: () => null }))

import { ResumenProgreso } from '../screens/Progreso'

let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('progreso visible separado de dominio', () => {
  it('muestra el concepto presentado en la barra de vistos y conserva práctica y dominio separados', async () => {
    const estado = registrarVistaConceptoEstado({ ...ESTADO_INICIAL, progreso: { PRACTICA: {
      ...nuevoProgreso('PRACTICA'), intentos: [{ ts: 1000, calificacion: 1, resultado: 'incorrecta',
        interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0, ms: 50,
        tipo_error: 'desconocimiento', confianza_declarada: null }],
    } } }, 'VISTO', 'paso:V', 2000)
    mock.app.mockReturnValue({ estado, indice: { modulos: [{ sesiones: [{ conceptos: ['VISTO', 'PRACTICA', 'NUEVO'] }] }] } })
    await act(async () => root.render(<ResumenProgreso />))
    const barra = host.querySelector<HTMLProgressElement>('progress[aria-label="Progreso de conceptos vistos"]')!
    expect(barra.value).toBe(2)
    expect(barra.max).toBe(3)
    expect(host.textContent).toContain('1 con práctica registrada.')
    expect([...host.querySelectorAll('article')].find(card => card.querySelector('h2')?.textContent === 'Dominio demostrado')?.querySelector('strong')?.textContent).toBe('0')
    expect(estado.progreso.VISTO).toBeUndefined()
  })
})
