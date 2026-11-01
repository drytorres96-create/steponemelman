import { afterEach, expect, it, vi } from 'vitest'

const write = vi.hoisted(() => vi.fn())
vi.mock('./db', () => ({ escribir: write, borrar: vi.fn() }))
import { conservarCopiaSinVersion } from './apartar'

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear() })

it.each([false, true])('archives without crypto.randomUUID, including the localStorage fallback (IndexedDB failure=%s)', async dbFailure => {
  vi.stubGlobal('crypto', undefined)
  if (dbFailure) write.mockRejectedValue(new Error('IndexedDB unavailable'))
  else write.mockResolvedValue(undefined)
  const copy = { state: { sessions: ['before-reset'] }, snapshot: null, savedAt: 100 }
  expect(await conservarCopiaSinVersion('cuenta:synthetic-owner', copy)).toBe(true)
  const [key, record, options] = write.mock.calls[0]
  expect(key).toMatch(/^apartada:cuenta:synthetic-owner:\d+:[0-9a-f-]{36}$/)
  expect(options).toEqual({ estricto: true })
  expect(record).toMatchObject({ copia: copy, motivo: 'sin-version' })
  if (dbFailure) expect(JSON.parse(localStorage.getItem(`step1-progreso:${key}`)!)).toEqual(record)
})
