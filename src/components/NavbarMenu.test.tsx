// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavbarMenu } from './NavbarMenu'

const items = [
  { id: 'modulos', txt: 'Biblioteca' }, { id: 'progreso', txt: 'Progreso' },
  { id: 'ajustes', txt: 'Ajustes y respaldo' }, { id: 'auditoria', txt: 'Calidad del material' },
  { id: 'inicio', txt: 'Plan diario clásico' },
] as const
let host: HTMLDivElement, root: Root, outside: HTMLButtonElement
let fine: boolean, visibility: DocumentVisibilityState
let onNavigate: ReturnType<typeof vi.fn>, onSignOut: ReturnType<typeof vi.fn>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  fine = true; visibility = 'visible'; onNavigate = vi.fn(); onSignOut = vi.fn()
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(hover: hover) and (pointer: fine)' && fine, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  host = document.createElement('div'); outside = document.createElement('button')
  outside.textContent = 'Fuera'; document.body.append(host, outside); root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); outside.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

const details = () => host.querySelector('details')!
const summary = () => host.querySelector('summary')!
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const render = async (active = 'hoy') => {
  await act(async () => root.render(<NavbarMenu active={active} items={items} onNavigate={onNavigate} onSignOut={onSignOut} />))
}
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms) }) }
const click = async (el: HTMLElement) => { await act(async () => el.click()) }
const pointer = async (type: 'pointerover' | 'pointerout', pointerType = 'mouse') => {
  await act(async () => {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget: outside })
    Object.defineProperty(event, 'pointerType', { value: pointerType })
    details().dispatchEvent(event)
  })
}
const key = async (value: string, target: EventTarget = document) => {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })) })
}

describe('NavbarMenu: navegación discreta y segura', () => {
  it('conserva el orden, los nombres y el destino activo con el menú inicialmente cerrado', async () => {
    await render('progreso')
    expect(details().open).toBe(false)
    expect(summary().getAttribute('aria-expanded')).toBe('false')
    expect(summary().textContent).toContain('Biblioteca, progreso y cuenta')
    expect([...host.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))).toEqual([...items.map(i => i.txt), 'Salir'])
    expect(button('Progreso').getAttribute('aria-current')).toBe('page')
    expect(button('Biblioteca').getAttribute('aria-current')).toBeNull()
    expect(onNavigate).not.toHaveBeenCalled(); expect(onSignOut).not.toHaveBeenCalled()
  })

  it('espera intención, no roba el foco y cancela un roce breve', async () => {
    await render(); outside.focus()
    await pointer('pointerover'); await advance(80)
    expect(details().open).toBe(false)
    await pointer('pointerout'); await advance(300)
    expect(details().open).toBe(false)
    await pointer('pointerover'); await advance(119)
    expect(details().open).toBe(false)
    await advance(1)
    expect(details().open).toBe(true)
    expect(summary().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(outside)
    expect(onNavigate).not.toHaveBeenCalled(); expect(onSignOut).not.toHaveBeenCalled()
  })

  it.each(['touch', 'pen', 'coarse'])('no abre por hover de %s', async kind => {
    fine = kind !== 'coarse'; await render()
    await pointer('pointerover', kind === 'coarse' ? 'mouse' : kind); await advance(500)
    expect(details().open).toBe(false)
    await click(summary())
    expect(details().open).toBe(true)
  })

  it('da margen para salir y volver al panel, pero no deja una vista previa huérfana', async () => {
    await render(); outside.focus()
    await pointer('pointerover'); await advance(120)
    await pointer('pointerout'); await advance(100)
    expect(details().open).toBe(true)
    await pointer('pointerover'); await advance(250)
    expect(details().open).toBe(true)
    await pointer('pointerout'); await advance(179)
    expect(details().open).toBe(true)
    await advance(1)
    expect(details().open).toBe(false)
  })

  it('el primer clic fija la vista previa y el segundo la cierra', async () => {
    await render()
    await pointer('pointerover'); await advance(120)
    await click(summary())
    await pointer('pointerout'); await advance(500)
    expect(details().open).toBe(true)
    await click(summary())
    expect(details().open).toBe(false)
    expect(summary().getAttribute('aria-expanded')).toBe('false')
  })

  it('el clic abre directamente y un clic fuera cierra sin navegar', async () => {
    await render(); await click(summary())
    expect(details().open).toBe(true)
    await act(async () => { outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(details().open).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('Escape cierra una vista previa incluso con foco fuera y lo devuelve al resumen', async () => {
    await render(); outside.focus()
    await pointer('pointerover'); await advance(120)
    await key('Escape')
    expect(details().open).toBe(false)
    expect(document.activeElement).toBe(summary())
    await advance(500)
    expect(details().open).toBe(false)
  })

  it('ArrowDown abre y enfoca el primer destino; abandonar el menú con el teclado lo cierra', async () => {
    await render(); summary().focus()
    await key('ArrowDown', summary())
    expect(details().open).toBe(true)
    expect(document.activeElement).toBe(button('Biblioteca'))
    await act(async () => button('Progreso').focus())
    expect(details().open).toBe(true)
    await act(async () => outside.focus())
    expect(details().open).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it.each(items)('el destino $txt cierra el panel y llama una sola vez a su ruta', async item => {
    await render(); await click(summary()); await click(button(item.txt))
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(item.id)
    expect(details().open).toBe(false)
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('Salir sólo delega en el flujo existente de cierre de sesión', async () => {
    await render(); await click(summary())
    expect(onSignOut).not.toHaveBeenCalled()
    await click(button('Salir'))
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(onNavigate).not.toHaveBeenCalled()
    expect(details().open).toBe(false)
  })

  it('al ocultar la pestaña cancela la apertura pendiente y cierra el panel', async () => {
    await render()
    await pointer('pointerover')
    await act(async () => { visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')) })
    await advance(500)
    expect(details().open).toBe(false)
    await act(async () => { visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')) })
    await click(summary())
    expect(details().open).toBe(true)
    await act(async () => { visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')) })
    expect(details().open).toBe(false)
  })

  it('desmontar cancela el temporizador y retira los listeners globales', async () => {
    const added = vi.spyOn(document, 'addEventListener')
    const removed = vi.spyOn(document, 'removeEventListener')
    await render(); await pointer('pointerover')
    const element = details()
    const handlers = added.mock.calls.filter(([type]) => ['pointerdown', 'keydown', 'visibilitychange'].includes(type))
    await act(async () => root.render(null))
    await advance(1000)
    expect(element.open).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
    for (const [type, listener] of handlers) {
      expect(removed.mock.calls.some(([removedType, removedListener]) => removedType === type && removedListener === listener)).toBe(true)
    }
  })
})
