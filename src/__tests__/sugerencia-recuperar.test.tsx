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

describe('«Reinforce today» en el dashboard de MyQBank', () => {
  it('va en inglés, compacta, con la lista plegada; los nombres y la frase de Claude siguen en español', async () => {
    await montar({ variante: 'myqbank', candidatas: [
      ficha('C1'), ficha('C2', { senales: ['fallo_repetido'], puntos: 2 }),
      ficha('NBME28-P0001', { tipo: 'pregunta', revision: 'r3', senales: ['acierto_con_ayuda'], puntos: 1 })] })
    const seccion = contenedor.querySelector('section')!
    expect(seccion.getAttribute('lang')).toBe('en')
    expect(seccion.textContent).toContain('Optional · once a day')
    expect(seccion.querySelector('h2')!.textContent).toBe('Reinforce today')
    expect(seccion.textContent).not.toContain('Para reforzar hoy')
    // La frase de Claude y los temas conservan su idioma.
    expect(seccion.querySelector('.sugerencia-hilo')!.getAttribute('lang')).toBe('es')
    expect(seccion.querySelector('.sugerencia-hilo')!.textContent).toBe('Giran en torno a las hormonas.')
    expect(seccion.querySelector('.sugerencia-texto')!.getAttribute('lang')).toBe('es')
    // La lista va dentro de un desplegable cerrado.
    const detalle = seccion.querySelector('details')!
    expect(detalle.open).toBe(false)
    expect(detalle.querySelector('summary')!.textContent).toBe('See the 3 items')
    expect(detalle.querySelectorAll('li')).toHaveLength(3)
    expect([...detalle.querySelectorAll('.sugerencia-senal')].map(s => s.textContent)).toEqual(['Missed this week', 'Missed more than once', 'Right, but with help'])
    expect(detalle.textContent).toContain('What you skip today doesn’t pile up.')
    // Sin cifras de deuda, igual que en Hoy.
    expect(seccion.textContent).not.toMatch(/overdue|backlog|behind/i)
  })
  it('«Review these 3» abre la misma sesión y conserva el estado usado sin ofrecerla otra vez', async () => {
    const { onRecuperar, dibujar } = await montar({ variante: 'myqbank' })
    await act(async () => { boton(/Review these 3/).click() })
    expect(onRecuperar).toHaveBeenCalledTimes(1)
    expect(onRecuperar).toHaveBeenCalledWith(expect.objectContaining({
      conceptIds: ['C1', 'C2'], preguntas: [{ id: 'NBME28-P0001', revision: 'r3' }], titulo: 'Para reforzar · hoy', nbmeSessionId: null, cada: 2,
    }))
    expect(leerSugerencia('u1')?.estado).toBe('usada')
    expect(contenedor.textContent).toContain('Today’s optional review has already been opened.')
    expect(contenedor.querySelector('h2')!.textContent).toBe('Reinforce today')
    expect(contenedor.querySelectorAll('button')).toHaveLength(0)
    await act(async () => { dibujar() })
    expect(contenedor.querySelector('h2')!.textContent).toBe('Reinforce today')
    expect(contenedor.querySelectorAll('button')).toHaveLength(0)
  })
  it('«Not today» conserva el estado descartado sin abrir nada; con un ítem usa el singular', async () => {
    const { onRecuperar } = await montar({ variante: 'myqbank', candidatas: [ficha('C1')] })
    expect(boton(/Review this one/)).toBeTruthy()
    expect(contenedor.querySelector('summary')!.textContent).toBe('See the item')
    await act(async () => { boton(/Not today/).click() })
    expect(onRecuperar).not.toHaveBeenCalled()
    expect(leerSugerencia('u1')?.estado).toBe('descartada')
    expect(contenedor.textContent).toContain('Skipped for today.')
    expect(contenedor.querySelector('h2')!.textContent).toBe('Reinforce today')
    expect(contenedor.querySelectorAll('button')).toHaveLength(0)
  })
  it('viernes, carga pendiente o sin candidatas: tarjeta visible sin consumir el refuerzo', async () => {
    await montar({ variante: 'myqbank', ahora: VIERNES })
    expect(contenedor.querySelector('h2')!.textContent).toBe('Reinforce today')
    expect(contenedor.querySelectorAll('button')).toHaveLength(0)
    await montar({ variante: 'myqbank', listo: false })
    expect(contenedor.textContent).toContain('Preparing your optional review…')
    expect(contenedor.querySelector('h2')!.textContent).toBe('Reinforce today')
    expect(contenedor.querySelectorAll('button')).toHaveLength(0)
    await montar({ variante: 'myqbank', candidatas: [] })
    expect(contenedor.textContent).toContain('No extra review suggested right now.')
    expect(contenedor.querySelector('h2')!.textContent).toBe('Reinforce today')
    expect(contenedor.querySelectorAll('button')).toHaveLength(0)
    expect(mock.pedirHilo).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })
  it('la versión de Hoy sigue sin cambios: lista visible, sin desplegable, en español', async () => {
    await montar()
    const seccion = contenedor.querySelector('section')!
    expect(seccion.getAttribute('lang')).toBeNull()
    expect(seccion.querySelector('details')).toBeNull()
    expect(seccion.querySelector('h2')!.textContent).toBe('Para reforzar hoy')
  })
})
