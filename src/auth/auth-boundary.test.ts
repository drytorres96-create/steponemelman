import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { AuthProvider } from './AuthProvider'
import { AuthGate } from './AuthGate'

const mock = vi.hoisted(() => ({
  callback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  getUser: vi.fn(), getSession: vi.fn(), signOut: vi.fn(), maybeSingle: vi.fn(), from: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mock.getUser,
      getSession: mock.getSession,
      signOut: mock.signOut,
      onAuthStateChange: (callback: typeof mock.callback) => {
        mock.callback = callback
        return { data: { subscription: { unsubscribe: () => { mock.callback = null } } } }
      },
    },
    from: mock.from,
  },
}))

const userA = { id: 'user-a', email: 'estudiante@example.com' } as User
const userB = { id: 'user-b', email: 'segunda@example.com' } as User
const sessionFor = (user: User) => ({ access_token: `token-${user.id}`, user }) as Session
let root: Root
let host: HTMLDivElement

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  window.history.replaceState(null, '', '/')
  mock.getUser.mockResolvedValue({ data: { user: userA }, error: null })
  mock.maybeSingle.mockResolvedValue({ data: { user_id: userA.id }, error: null })
  mock.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mock.maybeSingle }) }) })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(createElement(AuthProvider, null,
    createElement(AuthGate, { children: (user: User) => createElement('div', { 'data-private': user.id }, 'Private study') }),
  )))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

async function emit(event: AuthChangeEvent, session: Session | null) {
  await act(async () => {
    mock.callback?.(event, session)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function refocus() {
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

describe('private account boundary', () => {
  it('recovers one transient verification failure without trusting the local session', async () => {
    mock.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 503, message: 'Unavailable' } })
    await emit('SIGNED_IN', sessionFor(userA))
    expect(mock.getUser).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[data-private="user-a"]')).not.toBeNull()
  })

  it('keeps a verified study session through a transient token recheck but closes it on rejection', async () => {
    await emit('SIGNED_IN', sessionFor(userA))
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503, message: 'Unavailable' } })
    await emit('TOKEN_REFRESHED', sessionFor(userA))
    expect(host.querySelector('[data-private="user-a"]')).not.toBeNull()
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, code: 'bad_jwt' } })
    await emit('TOKEN_REFRESHED', sessionFor(userA))
    expect(host.querySelector('[data-private]')).toBeNull()
  })
  it('offers retry if SDK initialization never emits a session event', async () => {
    // Remount so the initialization deadline is controlled by this test.
    act(() => root.unmount())
    vi.useFakeTimers()
    root = createRoot(host)
    act(() => root.render(createElement(AuthProvider, null,
      createElement(AuthGate, { children: () => createElement('div', { 'data-private': true }) }))))
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(host.textContent).toContain('No pudimos abrir tu sesión')
    expect(host.textContent).toContain('No se pudo conectar')
    expect(host.querySelector('[data-private]')).toBeNull()
  })

  it('stops waiting for a stalled verification and ignores its late success', async () => {
    let resolve!: (value: unknown) => void
    mock.getUser.mockImplementation(() => new Promise(done => { resolve = done }))
    vi.useFakeTimers()
    act(() => mock.callback?.('SIGNED_IN', sessionFor(userA)))
    await act(async () => { await vi.advanceTimersByTimeAsync(20_001) })
    expect(host.textContent).toContain('No se pudo conectar')
    await act(async () => { resolve({ data: { user: userA }, error: null }) })
    expect(host.querySelector('[data-private]')).toBeNull()
  })

  it('describes plain SDK network errors instead of hiding them behind a generic error', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Failed to fetch', status: 0 } })
    await emit('SIGNED_IN', sessionFor(userA))
    expect(host.textContent).toContain('No se pudo conectar')
    expect(host.querySelector('[data-private]')).toBeNull()
  })
  it('shows login without querying membership when there is no session', async () => {
    await emit('INITIAL_SESSION', null)
    expect(host.textContent).toContain('Vuelve a tu estudio')
    expect(host.querySelector('[data-private]')).toBeNull()
    expect(mock.getUser).not.toHaveBeenCalled()
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('requires server verification and membership before mounting study state', async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: null })
    await emit('SIGNED_IN', sessionFor(userA))
    expect(mock.getUser).toHaveBeenCalledWith('token-user-a')
    expect(host.textContent).toContain('Tu cuenta está creada; falta habilitar acceso')
    expect(host.textContent).toContain(userA.email)
    expect(host.querySelector('[data-private]')).toBeNull()
  })

  it('does not trust a locally cached user if verification fails', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { code: 'bad_jwt' } })
    await emit('INITIAL_SESSION', sessionFor(userA))
    expect(host.textContent).toContain('No pudimos abrir tu sesión')
    expect(mock.from).not.toHaveBeenCalled()
    expect(host.querySelector('[data-private]')).toBeNull()
  })

  it('ignores verification that resolves after sign out', async () => {
    let resolveVerification!: (value: { data: { user: User }; error: null }) => void
    mock.getUser.mockImplementation(() => new Promise(resolve => { resolveVerification = resolve }))
    await emit('SIGNED_IN', sessionFor(userA))
    await emit('SIGNED_OUT', null)
    await act(async () => { resolveVerification({ data: { user: userA }, error: null }) })
    expect(host.textContent).toContain('Vuelve a tu estudio')
    expect(host.querySelector('[data-private]')).toBeNull()
  })

  it('does not carry a former account membership into another account', async () => {
    await emit('SIGNED_IN', sessionFor(userA))
    expect(host.querySelector('[data-private="user-a"]')).not.toBeNull()
    mock.getUser.mockResolvedValue({ data: { user: userB }, error: null })
    mock.maybeSingle.mockResolvedValue({ data: null, error: null })
    await emit('SIGNED_IN', sessionFor(userB))
    expect(host.querySelector('[data-private]')).toBeNull()
    expect(host.textContent).toContain(userB.email)
  })

  it('keeps the study mounted when a focus re-check fails on the network', async () => {
    await emit('SIGNED_IN', sessionFor(userA))
    expect(host.querySelector('[data-private="user-a"]')).not.toBeNull()
    mock.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await refocus()
    expect(mock.maybeSingle).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[data-private="user-a"]')).not.toBeNull()
    expect(host.textContent).not.toContain('No pudimos comprobar tu acceso')
  })

  it('still blocks when access was never verified and the check fails', async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await emit('SIGNED_IN', sessionFor(userA))
    expect(host.textContent).toContain('No pudimos comprobar tu acceso')
    expect(host.querySelector('[data-private]')).toBeNull()
  })

  it('closes the study when a re-check says access was revoked', async () => {
    await emit('SIGNED_IN', sessionFor(userA))
    mock.maybeSingle.mockResolvedValue({ data: null, error: null })
    await refocus()
    expect(host.querySelector('[data-private]')).toBeNull()
    expect(host.textContent).toContain('falta habilitar acceso')
  })

  it('does not keep a verified access across a sign out', async () => {
    await emit('SIGNED_IN', sessionFor(userA))
    await emit('SIGNED_OUT', null)
    mock.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await emit('SIGNED_IN', sessionFor(userA))
    expect(host.textContent).toContain('No pudimos comprobar tu acceso')
    expect(host.querySelector('[data-private]')).toBeNull()
  })

  it('opens password recovery before the private study application', async () => {
    await emit('PASSWORD_RECOVERY', sessionFor(userA))
    expect(host.textContent).toContain('Elige tu nueva contraseña')
    expect(host.querySelector('[data-private]')).toBeNull()
  })
})
