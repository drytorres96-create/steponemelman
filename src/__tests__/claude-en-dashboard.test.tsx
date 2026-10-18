// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FichaInventario } from '../lib/inventario'
import { emptyNbmeState } from '../nbme/model'
import type { NbmeQuestionMeta } from '../nbme/types'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import type { Intento } from '../srs/tipos'
import { reconstruirProgreso } from '../store/model'
import type { DatosAsistente } from '../myqbank/AsistenteDashboard'

/**
 * El dashboard de MyQBank enseña dos cosas bajo «Your next step»: la sugerencia del día y un botón que abre
 * el chat de sesiones en un diálogo. Lo que se comprueba es lo que la persona toca: que el diálogo abre y
 * cierra bien (Escape, clic fuera, foco), que la página de detrás no se desplaza mientras está abierto,
 * que cerrar no borra la conversación y que «Empezar la sesión» entrega el material y se quita de en medio.
 */
const concepto = (id: string, sistema: string, tema: string) => ({
  concept_id: id, objetivo: `Objetivo de ${tema}`,
  clasificacion: { sistema_primario: sistema, sistemas_secundarios: [], disciplina_primaria: 'Patología', disciplinas_secundarias: [], tema },
})
const mock = vi.hoisted(() => ({
  cargarTodo: vi.fn(), cargarConceptos: vi.fn(), pedirEntender: vi.fn(), pedirRevision: vi.fn(), pedirHilo: vi.fn(),
}))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargarTodo, cargarConceptos: mock.cargarConceptos }))
vi.mock('../lib/sesion-claude', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/sesion-claude')>()),
  pedirEntender: mock.pedirEntender, pedirRevision: mock.pedirRevision, pedirHilo: mock.pedirHilo,
}))

import { ClaudeEnDashboard } from '../myqbank/ClaudeEnDashboard'

const SABADO = Date.parse('2026-10-17T10:00:00-04:00')
const CORPUS = [concepto('C-ENDO-1', 'Endocrino', 'Cushing'), concepto('C-ENDO-2', 'Endocrino', 'Addison')]
const ficha = (id: string): FichaInventario => ({
  tipo: 'concepto', id, intentos: 1, fallos: 1, ultimoFallo: SABADO - 2 * 86_400_000, ultimaVez: SABADO - 2 * 86_400_000, senales: ['fallo_reciente'], puntos: 3,
})
const fallo = (ts: number): Intento => ({
  attempt_id: 'a-1', session_id: 's-1', ts, calificacion: 1, resultado: 'incorrecta', interaccion: 'recuperacion_libre',
  recuperacion_activa: true, tipo_evidencia: 'recuerdo', pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'desconocimiento', confianza_declarada: null,
})
const FALLADO = { 'C-ENDO-1': reconstruirProgreso('C-ENDO-1', [fallo(Date.now() - 86_400_000)], CRITERIOS_POR_DEFECTO) }
const consulta = { fuente: 'mixto', sistemas: ['Endocrino'], disciplinas: [], terminos: [], estados: ['falladas'], minutos: 10, titulo: 'Endocrino · falladas' }

const onNuevo = vi.fn()
let raiz: Root, contenedor: HTMLDivElement
const montar = async (extra: Partial<DatosAsistente> = {}) => {
  const datos: DatosAsistente = {
    usuario: 'u1', ahora: SABADO, listo: true, candidatas: [], onNuevo, ocupado: false,
    progreso: {}, criterios: CRITERIOS_POR_DEFECTO, nbme: emptyNbmeState('b'), listas: new Map<string, NbmeQuestionMeta>(),
    publicados: new Set(CORPUS.map(c => c.concept_id)), modulos: [], enCajasHoy: new Set(), ...extra,
  }
  await act(async () => { raiz.render(<ClaudeEnDashboard {...datos} />) })
  await act(async () => { await Promise.resolve() })
}
const fondo = () => contenedor.querySelector<HTMLElement>('.mq-claude-fondo')!
const dialogo = () => contenedor.querySelector<HTMLElement>('[role="dialog"]')!
const campo = () => contenedor.querySelector<HTMLInputElement>('input.tutor-entrada-campo')!
const boton = (texto: RegExp | string) => [...contenedor.querySelectorAll('button')].find(b => (typeof texto === 'string' ? b.textContent === texto : texto.test(b.textContent ?? '')))
const clic = async (texto: RegExp | string) => { const b = boton(texto); if (!b) throw new Error(`No hay botón «${texto}»`); await act(async () => { b.click() }) }
/** Como una persona: el botón recibe el foco y después el clic. */
const abrirComoPersona = async () => { const b = boton('Open chat')!; b.focus(); await act(async () => { b.click() }) }
const tecla = async (key: string, opciones: KeyboardEventInit = {}, en: Element = document.activeElement ?? document.body) => {
  const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opciones })
  await act(async () => { en.dispatchEvent(evento) })
  return evento
}
const decir = async (texto: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(campo(), texto)
    campo().dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { contenedor.querySelector<HTMLFormElement>('form.tutor-entrada')!.requestSubmit() })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  document.documentElement.style.overflow = ''
  mock.cargarTodo.mockReset().mockResolvedValue(CORPUS)
  mock.cargarConceptos.mockReset().mockImplementation(async (ids: string[]) => new Map(ids.map(id => [id, CORPUS.find(c => c.concept_id === id) ?? CORPUS[0]])))
  mock.pedirEntender.mockReset().mockResolvedValue({ estado: 'ok', tipo: 'consulta', consulta })
  mock.pedirRevision.mockReset().mockResolvedValue({ estado: 'ok', ids: [], sinRevisar: 0 })
  mock.pedirHilo.mockReset().mockResolvedValue({ estado: 'ok', hilo: 'Hormonas de la suprarrenal.' })
  onNuevo.mockReset()
  // jsdom no calcula diseño: sin esto ningún elemento «se ve» y no habría a qué llevar el foco con Tab.
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode } })
  contenedor = document.createElement('div'); document.body.appendChild(contenedor); raiz = createRoot(contenedor)
})
afterEach(() => {
  act(() => raiz.unmount()); contenedor.remove()
  delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent
  document.documentElement.style.overflow = ''
})

describe('la tarjeta «Ask Claude for a session»', () => {
  it('es una entrada discreta en inglés: el diálogo está montado pero oculto y no llama a nadie', async () => {
    await montar()
    expect(contenedor.querySelector('#mq-claude-titulo')!.textContent).toBe('Ask Claude for a session')
    expect(boton('Open chat')!.getAttribute('aria-haspopup')).toBe('dialog')
    expect(fondo().hidden).toBe(true)
    expect(document.documentElement.style.overflow).toBe('')
    expect(mock.pedirEntender).not.toHaveBeenCalled()
    expect(mock.cargarTodo).not.toHaveBeenCalled()
  })
  it('sin lo frágil mantiene ambas entradas y explica que no hay refuerzo; con ello ofrece la lista', async () => {
    await montar()
    expect(contenedor.textContent).toContain('Reinforce today')
    expect(contenedor.textContent).toContain('No extra review suggested right now.')
    await montar({ candidatas: [ficha('C-ENDO-1'), ficha('C-ENDO-2')] })
    expect(contenedor.textContent).toContain('Reinforce today')
    expect(contenedor.textContent).toContain('Hormonas de la suprarrenal.')
  })
  it('«Review these 2» entrega el material al dashboard', async () => {
    await montar({ candidatas: [ficha('C-ENDO-1'), ficha('C-ENDO-2')] })
    await clic(/Review these 2/)
    expect(onNuevo).toHaveBeenCalledTimes(1)
    expect(onNuevo.mock.calls[0][0]).toMatchObject({ conceptIds: ['C-ENDO-1', 'C-ENDO-2'], titulo: 'Para reforzar · hoy' })
  })
})

describe('el diálogo del chat', () => {
  it('abre como diálogo modal en español, bloquea el desplazamiento de detrás y enfoca el campo', async () => {
    document.documentElement.style.overflow = 'auto'
    await montar(); await abrirComoPersona()
    expect(fondo().hidden).toBe(false)
    expect(dialogo().getAttribute('aria-modal')).toBe('true')
    expect(dialogo().getAttribute('aria-label')).toBe('Pídele a Claude una sesión')
    expect(dialogo().getAttribute('lang')).toBe('es')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(campo())
    expect(boton('Continue chat')).toBeTruthy()
    expect(boton('Open chat')).toBeUndefined()
  })
  it('Escape cierra, devuelve el desplazamiento tal como estaba y el foco al botón que lo abrió', async () => {
    document.documentElement.style.overflow = 'auto'
    await montar(); await abrirComoPersona()
    const evento = await tecla('Escape')
    expect(evento.defaultPrevented || fondo().hidden).toBe(true)
    expect(fondo().hidden).toBe(true)
    expect(document.documentElement.style.overflow).toBe('auto')
    expect(document.activeElement).toBe(boton('Continue chat'))
  })
  it('si el botón no recibió el foco al pulsarlo (Safari), al cerrar el foco vuelve igualmente al botón de la tarjeta', async () => {
    await montar()
    ;(document.activeElement as HTMLElement | null)?.blur()
    await clic('Open chat')
    await tecla('Escape')
    expect(document.activeElement).toBe(boton('Continue chat'))
  })
  it('la cruz y el clic en el fondo cierran; el clic dentro del diálogo no', async () => {
    await montar(); await abrirComoPersona()
    await act(async () => { dialogo().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(fondo().hidden).toBe(false)
    await act(async () => { fondo().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(fondo().hidden).toBe(true)
    await clic('Continue chat')
    expect(fondo().hidden).toBe(false)
    await act(async () => { contenedor.querySelector<HTMLButtonElement>('button[aria-label="Cerrar el chat"]')!.click() })
    expect(fondo().hidden).toBe(true)
    expect(document.documentElement.style.overflow).toBe('')
  })
  it('Tab no se sale del diálogo: del último pasa al primero y Mayús+Tab del primero al último', async () => {
    await montar(); await abrirComoPersona()
    const enfocables = [...dialogo().querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    expect(enfocables.length).toBeGreaterThan(2)
    const primero = enfocables[0], ultimo = enfocables[enfocables.length - 1]
    ultimo.focus()
    expect((await tecla('Tab')).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(primero)
    expect((await tecla('Tab', { shiftKey: true })).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(ultimo)
    // En medio, Tab sigue su camino natural.
    enfocables[1].focus()
    expect((await tecla('Tab')).defaultPrevented).toBe(false)
  })
  it('si el foco se cae a la página (el botón de enviar se desactiva), Escape cierra igual y Tab vuelve al diálogo', async () => {
    await montar(); await abrirComoPersona()
    ;(document.activeElement as HTMLElement).blur()
    expect(dialogo().contains(document.activeElement)).toBe(false)
    expect((await tecla('Tab', {}, document.body)).defaultPrevented).toBe(true)
    expect(dialogo().contains(document.activeElement)).toBe(true)
    ;(document.activeElement as HTMLElement).blur()
    expect((await tecla('Tab', { shiftKey: true }, document.body)).defaultPrevented).toBe(true)
    expect(dialogo().contains(document.activeElement)).toBe(true)
    ;(document.activeElement as HTMLElement).blur()
    await tecla('Escape', {}, document.body)
    expect(fondo().hidden).toBe(true)
  })
  it('Escape no hace nada con el diálogo cerrado', async () => {
    await montar()
    const evento = await tecla('Escape', {}, document.body)
    expect(evento.defaultPrevented).toBe(false)
    expect(fondo().hidden).toBe(true)
  })
  it('cerrar no borra la conversación: al volver, sigue donde estaba y no se pide de nuevo', async () => {
    mock.pedirEntender.mockResolvedValueOnce({ estado: 'ok', tipo: 'pregunta', texto: '¿Con qué quieres practicar?', opciones: ['Solo NBME', 'Mixto'] })
    await montar(); await abrirComoPersona()
    await decir('endocrino')
    expect(dialogo().textContent).toContain('¿Con qué quieres practicar?')
    await tecla('Escape')
    expect(fondo().hidden).toBe(true)
    await clic('Continue chat')
    expect(dialogo().textContent).toContain('endocrino')
    expect(dialogo().textContent).toContain('¿Con qué quieres practicar?')
    expect(mock.pedirEntender).toHaveBeenCalledTimes(1)
  })
  it('«Empezar la sesión» entrega el material, cierra el diálogo y deja la página como estaba', async () => {
    await montar({ progreso: FALLADO }); await abrirComoPersona()
    await decir('endocrino que he fallado')
    await clic('Empezar la sesión')
    expect(onNuevo).toHaveBeenCalledTimes(1)
    expect(onNuevo.mock.calls[0][0]).toMatchObject({ conceptIds: ['C-ENDO-1'], preguntas: [], titulo: 'Endocrino · falladas', nbmeSessionId: null })
    expect(fondo().hidden).toBe(true)
    expect(document.documentElement.style.overflow).toBe('')
  })
  it('un catálogo pendiente no se presenta como banco vacío y permite reintentar cuando llega', async () => {
    await montar({ progreso: FALLADO, bancoDisponible: false }); await abrirComoPersona()
    await decir('endocrino que he fallado')
    expect(dialogo().textContent).toContain('El banco de preguntas aún no está disponible')
    expect(boton('Empezar la sesión')).toBeUndefined()
    await montar({ progreso: FALLADO, bancoDisponible: true })
    await clic('Reintentar')
    expect(boton('Empezar la sesión')).toBeDefined()
    expect(mock.pedirEntender).toHaveBeenCalledTimes(1)
  })
  it('si el dashboard se desmonta con el diálogo abierto, el desplazamiento de la página se devuelve', async () => {
    document.documentElement.style.overflow = 'scroll'
    await montar(); await abrirComoPersona()
    expect(document.documentElement.style.overflow).toBe('hidden')
    act(() => raiz.unmount())
    expect(document.documentElement.style.overflow).toBe('scroll')
    raiz = createRoot(contenedor)
  })
})
