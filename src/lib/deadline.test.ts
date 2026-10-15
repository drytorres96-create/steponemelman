import { afterEach, expect, it, vi } from 'vitest'
import { deadlineFetch, withDeadline } from './deadline'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('bounds SDK calls, clears successful timers and does not accept late results', async () => {
  vi.useFakeTimers()
  await expect(withDeadline(Promise.resolve('ok'))).resolves.toBe('ok')
  expect(vi.getTimerCount()).toBe(0)
  let finish!: (value: string) => void
  const work = withDeadline(new Promise<string>(resolve => { finish = resolve }), 50)
  const result = expect(work).rejects.toThrow('Connection timeout')
  await vi.advanceTimersByTimeAsync(50)
  await result
  finish('too late')
  expect(vi.getTimerCount()).toBe(0)
})

it('aborts a stalled HTTP request and preserves caller cancellation', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
  }))
  vi.stubGlobal('fetch', fetcher)
  const first = deadlineFetch('https://example.test/auth')
  const result = expect(first).rejects.toThrow('Connection timeout')
  await vi.advanceTimersByTimeAsync(30_000)
  await result
  expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true)
  const parent = new AbortController()
  const second = deadlineFetch('https://example.test/rest', { signal: parent.signal })
  parent.abort(new Error('caller stopped'))
  await expect(second).rejects.toThrow('caller stopped')
  expect(vi.getTimerCount()).toBe(0)
})

it('retains response status, headers and JSON while bounding the response body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: 'ok' }, { status: 201, headers: { 'x-test': 'yes' } })))
  const response = await deadlineFetch('https://example.test/rest')
  expect(response.status).toBe(201)
  expect(response.headers.get('x-test')).toBe('yes')
  await expect(response.json()).resolves.toEqual({ data: 'ok' })
})
