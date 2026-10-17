// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FichaInventario } from '../lib/inventario'
import type { NbmeQuestionMeta } from '../nbme/types'
import { leerSugerencia } from '../lib/sugerencia-diaria'

const mock = vi.hoisted(() => ({
  cargarConceptos: vi.fn(async (ids: string[]) => new Map(ids.map(id => [id, { concept_id: id, objetivo: `Objetivo de ${id}`, clasificacion: { tema: `Tema ${id}` } }]))),
  pedirHilo: vi.fn(async () => ({ estado: 'ok' as const, hilo: 'Giran en torno a las hormonas.' })),
}))
vi.mock('../data/corpus', () => ({ cargarConceptos: mock.cargarConceptos }))
vi.mock('../lib/sesion-claude', async importOriginal => ({ ...(await importOriginal<typeof import('../lib/sesion-claude')>()), pedirHilo: mock.pedirHilo }))

import { SugerenciaRecuperar } from '../screens/SugerenciaRecuperar'

const F = (d: number, h: number) => Date.parse(`2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-04:00`)
const SABADO = F(17, 10), VIERNES = F(16, 10)
const ficha = (id: string, extra: Partial<FichaInventario> = {}): FichaInventario => ({
  tipo: 'concepto', id, intentos: 1, fallos: 1, ultimoFallo: F(15, 9), ultimaVez: F(15, 9), senales: ['fallo_reciente'], puntos: 3, ...extra,
})
const listas = new Map<string, NbmeQuestionMeta>([['NBME28-P0001', { id: 'NBME28-P0001', revision: 'r3', topic: 'Hiperplasia suprarrenal', systems: ['Endocrino'] } as NbmeQuestionMeta]])

let raiz: Root, contenedor: HTMLDivElement
const montar = async (props: Partial<Parameters<typeof SugerenciaRecuperar>[0]> = {}) => {
  const onRecuperar = vi.fn()
  const dibujar = (extra: typeof props = {}) => raiz.render(<SugerenciaRecuperar usuario="u1" ahora={SABADO} listo modulos={[]} listas={listas} onRecuperar={onRecuperar}
    candidatas={[ficha('C1'), ficha('C2', { senales: ['fallo_repetido', 'fallo_reciente'] }), ficha('NBME28-P0001', { tipo: 'pregunta', revision: 'r3', senales: ['acierto_con_ayuda'] })]}
    {...props} {...extra} />)
  await act(async () => { dibujar() })
  await act(async () => { await Promise.resolve() })
  return { onRecuperar, dibujar }
}
const boton = (texto: RegExp) => [...contenedor.querySelectorAll('button')].find(b => texto.test(b.textContent ?? ''))!

beforeEach(() => {
  localStorage.clear(); mock.cargarConceptos.mockClear(); mock.pedirHilo.mockClear()
  contenedor = document.createElement('div'); document.body.appendChild(contenedor); raiz = createRoot(contenedor)
})
afterEach(() => { act(() => raiz.unmount()); contenedor.remove() })

describe('«Para reforzar hoy»', () => {
  it('enseña lo frágil con su motivo principal y una frase de Claude, sin cifras de deuda', async () => {
    await montar()
    const texto = contenedor.textContent ?? ''
    expect(texto).toContain('Para reforzar hoy')
    expect(texto).toContain('Tema C1')
    expect(texto).toContain('Hiperplasia suprarrenal')
    expect(texto).toContain('Fallada esta semana')
    expect(texto).toContain('Acertada con ayuda')
    expect(texto).toContain('Giran en torno a las hormonas.')
    expect(texto).not.toMatch(/atrasad|pendientes de/i)
    expect(contenedor.querySelectorAll('li')).toHaveLength(3)
  })
  it('«Repasar» abre la sesión con los conceptos y las preguntas con su revisión, y no vuelve a salir', async () => {
    const { onRecuperar, dibujar } = await montar()
    await act(async () => { boton(/Repasar estos 3/).click() })
    expect(onRecuperar).toHaveBeenCalledWith(expect.objectContaining({
      conceptIds: ['C1', 'C2'], preguntas: [{ id: 'NBME28-P0001', revision: 'r3' }], titulo: 'Para reforzar · hoy', nbmeSessionId: null, cada: 2,
    }))
    expect(leerSugerencia('u1')?.estado).toBe('usada')
    expect(contenedor.querySelector('section')).toBeNull()
    await act(async () => { dibujar() })
    expect(contenedor.querySelector('section')).toBeNull()
  })
  it('«Hoy no» la cierra por hoy y no se pide ni se guarda nada más', async () => {
    const { onRecuperar } = await montar()
    await act(async () => { boton(/Hoy no/).click() })
    expect(onRecuperar).not.toHaveBeenCalled()
    expect(leerSugerencia('u1')?.estado).toBe('descartada')
    expect(contenedor.querySelector('section')).toBeNull()
  })
  it('la frase de Claude se pide una sola vez al día y se recuerda aunque se recargue', async () => {
    await montar()
    expect(mock.pedirHilo).toHaveBeenCalledTimes(1)
    expect(leerSugerencia('u1')).toMatchObject({ hilo: 'Giran en torno a las hormonas.', hiloIntentado: true })
    act(() => raiz.unmount()); raiz = createRoot(contenedor)
    await montar()
    expect(mock.pedirHilo).toHaveBeenCalledTimes(1)
    expect(contenedor.textContent).toContain('Giran en torno a las hormonas.')
  })
  it('si Claude no responde la tarjeta queda completa y no se vuelve a pedir ese día', async () => {
    mock.pedirHilo.mockResolvedValueOnce({ estado: 'sin_ia', motivo: 'Sin clave' } as never)
    await montar()
    expect(contenedor.textContent).toContain('Tema C1')
    expect(contenedor.querySelector('.sugerencia-hilo')).toBeNull()
    expect(leerSugerencia('u1')).toMatchObject({ hiloIntentado: true })
    expect(leerSugerencia('u1')?.hilo).toBeUndefined()
  })
  it('a Claude sólo van etiquetas y señales, nunca respuestas ni texto de preguntas', async () => {
    await montar()
    const [items] = mock.pedirHilo.mock.calls[0] as unknown as [Record<string, unknown>[]]
    expect(items).toHaveLength(3)
    for (const i of items) expect(Object.keys(i).sort()).toEqual(['etiqueta', 'id', 'senales', 'tipo'])
  })
  it('el viernes no sale tarjeta, ni se llama a Claude', async () => {
    await montar({ ahora: VIERNES })
    expect(contenedor.querySelector('section')).toBeNull()
    expect(mock.pedirHilo).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
  it('sin el progreso de la cuenta todavía no se muestra ni se congela nada', async () => {
    await montar({ listo: false })
    expect(contenedor.querySelector('section')).toBeNull()
    expect(localStorage.length).toBe(0)
  })
  it('sin candidatas no hay tarjeta', async () => {
    await montar({ candidatas: [] })
    expect(contenedor.querySelector('section')).toBeNull()
    expect(mock.pedirHilo).not.toHaveBeenCalled()
  })
})
