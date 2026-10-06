// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL, reconstruirProgreso } from '../store/model'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import { emptyNbmeState, startNbmeSession } from '../nbme/model'
import type { Intento } from '../srs/tipos'
import type { SesionSemanal } from '../semana/tipos'

const mocks = vi.hoisted(() => ({ app: vi.fn(), nbme: vi.fn(), semana: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mocks.app }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: mocks.nbme }))
vi.mock('../semana/api', () => ({ cargarHistorialSesiones: mocks.semana }))
import { RecuperarMeta } from '../screens/RecuperarMeta'

const lunes = new Date(2026, 9, 5, 10).getTime()
const intento: Intento = { attempt_id: 'sintetico:0', session_id: 'sintetica', ts: lunes - 2 * 86_400_000, calificacion: 1, resultado: 'incorrecta', interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo', pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false, ms: 5000, tipo_error: 'desconocimiento', confianza_declarada: null }
const sesion = { id: 'semana', semana: 'S4', semanaInicio: '2026-10-05', dia: 1, orden: 1, titulo: 'Synthetic', subtitulo: null,
  guion: [{ kind: 'concepto', id: 'C2' }, { kind: 'concepto', id: 'C3' }, { kind: 'pregunta', id: 'Q1', revision: 'r2' }, { kind: 'pregunta', id: 'Q2', revision: 'r1' }], presupuestoMin: 30, estado: 'pendiente', cursor: 0, nbmeSessionId: null, completadaEn: null } as SesionSemanal
let host: HTMLDivElement, root: Root, app: any, banco: any
const onNuevo = vi.fn(), onCajas = vi.fn(), onRetomar = vi.fn()
const render = () => act(async () => { root.render(<RecuperarMeta onNuevo={onNuevo} onCajas={onCajas} onRetomar={onRetomar} />) })
const boton = (texto: string) => [...host.querySelectorAll('button')].find(b => b.textContent === texto)

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }); vi.setSystemTime(lunes)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  onNuevo.mockReset(); onCajas.mockReset(); onRetomar.mockReset().mockResolvedValue(true)
  app = { indice: { modulos: [{ sesiones: [{ conceptos: Array.from({ length: 600 }, (_, i) => `C${i + 1}`) }] }] },
    estado: { ...ESTADO_INICIAL, progreso: { C1: reconstruirProgreso('C1', [intento], CRITERIOS_POR_DEFECTO) } }, sincronizacion: { estado: 'sincronizado', ultima: lunes } }
  banco = { state: emptyNbmeState(), catalog: { questions: Array.from({ length: 300 }, (_, i) => ({ id: `Q${i + 1}`, revision: 'r2', status: i === 1 ? 'withdrawn' : 'ready' })) }, syncStatus: { state: 'synced', lastSyncedAt: lunes } }
  mocks.app.mockImplementation(() => app); mocks.nbme.mockImplementation(() => banco); mocks.semana.mockReset().mockResolvedValue([sesion])
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

describe('la recuperación valida el progreso y el día al empezar', () => {
  it('reutiliza la cola real de cajas sin alterar intentos ni cargar contenido médico', async () => {
    await render()
    expect(host.textContent).toContain('dominio demostrado')
    const previo = JSON.stringify(app.estado)
    await act(async () => boton('Empezar recuperación de Hoy')!.click())
    expect(onCajas).toHaveBeenCalledWith([expect.objectContaining({ id: 'C1', tipo: 'concepto', hecho: false })], 'Cajas de hoy · 5 oct')
    expect(onNuevo).not.toHaveBeenCalled()
    expect(JSON.stringify(app.estado)).toBe(previo)
  })

  it('lo nuevo respeta el orden publicado y la revisión vigente, excluyendo preguntas retiradas', async () => {
    app.estado.progreso = {}
    await render()
    await act(async () => boton('Empezar recuperación de Hoy')!.click())
    expect(onNuevo).toHaveBeenCalledWith({ conceptIds: ['C2', 'C3'], preguntas: [{ id: 'Q1', revision: 'r2' }], titulo: 'Nuevo de hoy · 5 oct', nbmeSessionId: null })
    expect(onCajas).not.toHaveBeenCalled()
  })

  it('un fallo en la primera sincronización bloquea la recuperación sobre una copia incompleta', async () => {
    app.sincronizacion = { estado: 'error', ultima: null }
    await render()
    expect(host.textContent).toContain('termine de cargar')
    expect(boton('Empezar recuperación de Hoy')).toBeUndefined()
    app.sincronizacion = { estado: 'sincronizado', ultima: lunes }
    banco.syncStatus = { state: 'error', lastSyncedAt: null }
    await render()
    expect(boton('Empezar recuperación de Hoy')).toBeUndefined()
  })

  it('detecta incluso una sesión NBME pausada que no es la activa y ofrece retomarla', async () => {
    banco.state = { ...startNbmeSession(banco.state, { id: 'pausada', title: 'Sesión pendiente', refs: [{ id: 'Q1', revision: 'r2' }] }, lunes), activeSessionId: null }
    await render()
    expect(boton('Empezar recuperación de Hoy')).toBeUndefined()
    await act(async () => boton('Retomar mi sesión pendiente')!.click())
    expect(onRetomar).toHaveBeenCalledOnce()
    expect(onNuevo).not.toHaveBeenCalled()
  })

  it('muestra la carga, bloquea dobles toques y enseña el error NBME actualizado junto al botón', async () => {
    banco.state = { ...startNbmeSession(banco.state, { id: 'pausada', title: 'Sesión pendiente', refs: [{ id: 'Q1', revision: 'r2' }] }, lunes), activeSessionId: null }
    let terminar!: (ok: boolean) => void
    onRetomar.mockImplementation(() => new Promise<boolean>(resolve => { terminar = resolve }))
    await render()
    const retomar = boton('Retomar mi sesión pendiente')!
    await act(async () => { retomar.click(); retomar.click() })
    expect(onRetomar).toHaveBeenCalledOnce()
    expect(retomar.disabled).toBe(true)
    expect(retomar.getAttribute('aria-busy')).toBe('true')
    expect(host.textContent).toContain('Abriendo tu sesión guardada')
    banco.error = 'Una pregunta de este bloque se retiró del banco.'
    await act(async () => { terminar(false) })
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(banco.error)
    expect(retomar.disabled).toBe(false)
    banco.error = null; onRetomar.mockResolvedValue(true)
    await act(async () => retomar.click())
    expect(onRetomar).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('un fallo de carga de conceptos conserva el panel y la continuación para reintentar', async () => {
    app.estado.reanudable = { modulo: 'M', sesion: 'repaso', indice: 0, ts: lunes, conceptIds: ['C1'], sessionId: 'guardada' }
    const previo = JSON.stringify(app.estado)
    onRetomar.mockRejectedValue(new Error('No se pudo cargar tu sesión. Comprueba la conexión.'))
    await render()
    await act(async () => boton('Retomar mi sesión pendiente')!.click())
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Comprueba la conexión')
    expect(boton('Retomar mi sesión pendiente')?.disabled).toBe(false)
    expect(JSON.stringify(app.estado)).toBe(previo)
    expect(onNuevo).not.toHaveBeenCalled(); expect(onCajas).not.toHaveBeenCalled()
  })

  it('si NBME devuelve false sin motivo muestra una salida visible', async () => {
    banco.state = startNbmeSession(banco.state, { id: 'pausada', title: 'Sesión pendiente', refs: [{ id: 'Q1', revision: 'r2' }] }, lunes)
    onRetomar.mockResolvedValue(false)
    await render()
    await act(async () => boton('Retomar mi sesión pendiente')!.click())
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Vuelve a intentarlo')
    expect(boton('Retomar mi sesión pendiente')?.disabled).toBe(false)
  })

  it('revalida el día también al retomar una sesión pendiente', async () => {
    vi.setSystemTime(new Date(2026, 9, 8, 23))
    banco.state = startNbmeSession(banco.state, { id: 'pausada', title: 'Sesión pendiente', refs: [{ id: 'Q1', revision: 'r2' }] }, lunes)
    await render()
    const retomar = boton('Retomar mi sesión pendiente')!
    vi.setSystemTime(new Date(2026, 9, 9, 4))
    await act(async () => retomar.click())
    expect(onRetomar).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('El viernes queda libre')
  })

  it('revalida el viernes al tocar un botón dibujado el jueves y actualiza la línea sin reabrir la pantalla', async () => {
    vi.setSystemTime(new Date(2026, 9, 8, 23))
    await render()
    const empezar = boton('Empezar recuperación de Hoy')!
    expect(empezar).toBeDefined()
    vi.setSystemTime(new Date(2026, 9, 9, 4))
    await act(async () => empezar.click())
    expect(onCajas).not.toHaveBeenCalled(); expect(onNuevo).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(host.textContent).toContain('El viernes queda libre')
    expect(boton('Empezar recuperación de Hoy')).toBeUndefined()
  })

  it('al cambiar de semana comprueba sus metadatos antes de ofrecer material nuevo', async () => {
    app.estado.progreso = {}
    await render()
    expect(boton('Empezar recuperación de Hoy')).toBeDefined()
    mocks.semana.mockImplementation(() => new Promise(() => {}))
    vi.setSystemTime(new Date(2026, 9, 12, 10))
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(mocks.semana).toHaveBeenCalledTimes(2)
    expect(boton('Empezar recuperación de Hoy')).toBeUndefined()
  })

  it('si falla la carga semanal conserva los repasos válidos y no inventa material nuevo', async () => {
    mocks.semana.mockRejectedValue(new Error('Synthetic network failure'))
    await render()
    expect(boton('Empezar recuperación de Hoy')).toBeDefined()
    app.estado.progreso = {}; await render()
    expect(boton('Empezar recuperación de Hoy')).toBeUndefined()
    expect(host.textContent).toContain('cargar el material de esta semana')
  })
})
