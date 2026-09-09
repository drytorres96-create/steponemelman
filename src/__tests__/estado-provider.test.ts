// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL, type EstadoApp } from '../store/model'
import type { CloudSnapshot, SyncReply } from '../store/sync'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), load: vi.fn(), rpc: vi.fn() }))
vi.mock('../store/db', () => ({ leer: mocks.read, escribir: mocks.write }))
vi.mock('../data/corpus', () => ({ cargarIndice: async () => null, cargarMigraciones: async () => ({}) }))
vi.mock('../lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.load }) }) }), rpc: mocks.rpc,
} }))

import { ProveedorEstado, useApp } from '../store/estado'

let root: Root
let host: HTMLDivElement
let api: ReturnType<typeof useApp>
let row: CloudSnapshot | null
let failure: boolean
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function Probe() { api = useApp(); return null }
const render = async (strict = false) => {
  await act(async () => {
    const tree = createElement(ProveedorEstado, { userId: 'user-a', children: createElement(Probe) })
    root.render(strict ? createElement(StrictMode, null, tree) : tree)
  })
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  localStorage.clear()
  row = null
  failure = false
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  mocks.read.mockResolvedValue(null)
  mocks.write.mockResolvedValue(undefined)
  mocks.load.mockImplementation(async () => ({ data: clone(row), error: failure ? new Error('offline') : null }))
  mocks.rpc.mockImplementation(async (_name: string, params: { p_state: EstadoApp; p_generation: string | null }) => {
    if (failure) return { data: null, error: new Error('offline') }
    row = { state: clone(params.p_state), generation: params.p_generation ?? 'generation-1', revision: (row?.revision ?? 0) + 1,
      user_id: 'user-a', updated_at: '2026-09-09T00:00:00Z' }
    return { data: { ok: true, kind: 'saved', row: clone(row) } satisfies SyncReply, error: null }
  })
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  vi.restoreAllMocks()
})

describe('proveedor de progreso', () => {
  it('crea sólo un motor activo durante el montaje doble de StrictMode', async () => {
    await render(true)
    expect(api.listo).toBe(true)
    expect(api.errorCarga).toBeNull()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(api.sincronizacion.estado).toBe('sincronizado')
  })

  it('comparte una sincronización concurrente y devuelve false cuando falla la red', async () => {
    await render()
    const original = mocks.rpc.mock.calls.length
    await act(async () => {
      const first = api.sincronizarAhora()
      const second = api.sincronizarAhora()
      expect(first).toBe(second)
      expect(await first).toBe(true)
    })
    expect(mocks.rpc.mock.calls.length).toBe(original + 1)
    failure = true
    await act(async () => { expect(await api.sincronizarAhora()).toBe(false) })
    expect(api.sincronizacion.estado).toBe('error')
    await act(async () => { await expect(api.reiniciar()).rejects.toThrow('sincroniza') })
    expect(mocks.rpc.mock.calls.every(([name]) => name === 'sync_study_state')).toBe(true)
  })

  it('no escribe progreso de una petición que acaba después del desmontaje', async () => {
    const pending = deferred<{ data: CloudSnapshot | null; error: null }>()
    mocks.load.mockReturnValue(pending.promise)
    await render()
    expect(api.listo).toBe(true)
    await act(async () => { root.unmount() })
    const writes = mocks.write.mock.calls.length
    await act(async () => { pending.resolve({ data: null, error: null }); await pending.promise })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.write.mock.calls.length).toBe(writes)
    // Crear otra raíz permite que afterEach limpie sin desmontar dos veces la anterior.
    root = createRoot(host)
  })

  it('no transforma una generación de caché corrupta en un progreso nuevo', async () => {
    mocks.read.mockResolvedValue({ state: ESTADO_INICIAL, snapshot: { state: ESTADO_INICIAL, revision: -1 }, savedAt: 100 })
    await render()
    expect(api.errorCarga).not.toBeNull()
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.write).not.toHaveBeenCalled()
  })
})
