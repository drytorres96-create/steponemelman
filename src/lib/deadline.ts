/** Bounds SDK work as well as HTTP work; a failed connection must leave a retry path. */
export async function withDeadline<T>(work: PromiseLike<T>, milliseconds = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Promise.resolve(work), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Connection timeout')), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

/** Preserve caller cancellation and abort stalled requests, including response bodies. */
export const deadlineFetch: typeof fetch = async (input, init) => {
  const parent = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const controller = new AbortController()
  const cancel = () => controller.abort(parent?.reason)
  if (parent?.aborted) cancel()
  else parent?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Connection timeout', 'TimeoutError')), 30_000)
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    // Supabase consumes JSON responses, so retain the deadline through body transfer.
    const body = await response.arrayBuffer()
    return new Response(body.byteLength ? body : null, { status: response.status, statusText: response.statusText, headers: response.headers })
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', cancel)
  }
}
