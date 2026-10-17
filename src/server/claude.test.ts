import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { costeDeError, costeReservaUSD, costeUSD, ErrorClaude, llamarClaude, tokensDeTexto, type SolicitudClaude } from './claude'

const CLAVE = 'sk-ant-api03-clave-de-prueba-0123456789'
const solicitud = (extra: Partial<SolicitudClaude> = {}): SolicitudClaude => ({
  modelo: 'claude-sonnet-5-5', sistema: 'Eres un tutor.', mensajes: [{ role: 'user', content: 'Hola' }],
  maxTokens: 500, esfuerzo: 'low', tiempoMs: 10_000, ...extra })
const ok = (cuerpo: unknown = {}, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } })
const texto = (t: string, extra: Record<string, unknown> = {}) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn', model: 'claude-sonnet-5-5',
  usage: { input_tokens: 1000, output_tokens: 200 }, ...extra })
const fallo = (estado: number, error: Record<string, unknown> = {}) => ok({ type: 'error', error }, estado)

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('contabilidad', () => {
  it('Sonnet 5.5 cuesta 2 USD por millón de entrada y 10 de salida', () => {
    expect(costeUSD('claude-sonnet-5-5', { entrada: 1_000_000, salida: 1_000_000, cacheEscritura: 0, cacheLectura: 0 })).toBeCloseTo(12, 6)
  })
  it('la escritura en caché pesa el doble y la lectura una décima parte de la entrada', () => {
    expect(costeUSD('claude-sonnet-5-5', { entrada: 0, salida: 0, cacheEscritura: 1_000_000, cacheLectura: 0 })).toBeCloseTo(4, 6)
    expect(costeUSD('claude-sonnet-5-5', { entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 1_000_000 })).toBeCloseTo(0.2, 6)
  })
  it('un modelo desconocido se cobra a la tarifa más cara, nunca a cero', () => {
    const uso = { entrada: 1_000_000, salida: 0, cacheEscritura: 0, cacheLectura: 0 }
    expect(costeUSD('modelo-nuevo' as never, uso)).toBe(costeUSD('claude-opus-5-5', uso))
  })
  it('la reserva cuenta toda la entrada estimada por exceso y la salida completa', () => {
    const s = solicitud({ sistema: 'x'.repeat(300), mensajes: [{ role: 'user', content: 'y'.repeat(600) }], maxTokens: 1000 })
    expect(tokensDeTexto('x'.repeat(300))).toBe(100)
    expect(costeReservaUSD(s)).toBeCloseTo((300 * 2 + 1000 * 10) / 1_000_000, 9)
  })
})

describe('llamarClaude', () => {
  it('sin clave falla antes de tocar la red', async () => {
    const red = vi.fn()
    await expect(llamarClaude(undefined, solicitud(), { fetch: red })).rejects.toMatchObject({ codigo: 'sin_clave' })
    expect(red).not.toHaveBeenCalled()
  })

  it('envía la clave solo en la cabecera, sin temperature ni prefill, y lee el texto tras los bloques de pensamiento', async () => {
    const red = vi.fn(async () => ok(texto('', { content: [{ type: 'thinking', thinking: 'razono…' }, { type: 'text', text: ' Primera parte. ' }, { type: 'text', text: 'Segunda.' }],
      usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })))
    const r = await llamarClaude(CLAVE, solicitud(), { fetch: red as never })
    expect(r.texto).toBe('Primera parte. Segunda.')
    expect(r.uso).toEqual({ entrada: 1000, salida: 200, cacheEscritura: 0, cacheLectura: 0 })
    expect(r.costeUSD).toBeCloseTo((1000 * 2 + 200 * 10) / 1_000_000, 9)
    const [url, init] = red.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers).toMatchObject({ 'x-api-key': CLAVE, 'anthropic-version': '2023-06-01' })
    const cuerpo = JSON.parse(init.body as string)
    expect(JSON.stringify(cuerpo)).not.toContain(CLAVE)
    expect(cuerpo).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 500, system: 'Eres un tutor.', output_config: { effort: 'low' } })
    expect(cuerpo).not.toHaveProperty('temperature')
    expect(cuerpo).not.toHaveProperty('thinking')
    expect(cuerpo.messages.at(-1).role).toBe('user')
  })

  it('«sin_pensar» apaga el pensamiento previo con el valor que admite Sonnet 5.5', async () => {
    const red = vi.fn(async () => ok(texto('Listo, esto es una respuesta.')))
    await llamarClaude(CLAVE, solicitud({ pensamiento: 'sin_pensar' }), { fetch: red as never })
    expect(JSON.parse((red.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).thinking).toEqual({ type: 'between_tools' })
  })

  it('un rechazo (HTTP 200) y una respuesta vacía son errores, y conservan su coste', async () => {
    const rechazo = llamarClaude(CLAVE, solicitud(), { fetch: (async () => ok(texto('', { content: [], stop_reason: 'refusal' }))) as never })
    await expect(rechazo).rejects.toMatchObject({ codigo: 'rechazo', pudoFacturarse: true })
    const vacia = await llamarClaude(CLAVE, solicitud(), { fetch: (async () => ok(texto('   ', { content: [{ type: 'text', text: '   ' }] }))) as never }).catch(e => e)
    expect(vacia).toBeInstanceOf(ErrorClaude)
    expect(vacia.codigo).toBe('respuesta')
    expect(costeDeError(vacia)).toBeCloseTo((1000 * 2 + 200 * 10) / 1_000_000, 9)
    expect(costeDeError(new Error('otro'))).toBeNull()
  })

  it.each([
    ['clave revocada', 401, { type: 'authentication_error' }, 'clave'],
    ['permiso', 403, { type: 'permission_error' }, 'clave'],
    ['saldo agotado por tipo', 400, { type: 'billing_error', message: 'x' }, 'credito'],
    ['pago requerido', 402, { type: 'billing_error' }, 'credito'],
    ['saldo agotado por texto', 400, { type: 'invalid_request_error', message: 'Your credit balance is too low to access the API.' }, 'credito'],
    ['tope de gasto del nivel', 429, { type: 'rate_limit_error', details: { error_code: 'enforced_spend_limit_reached' } }, 'credito'],
    ['ritmo', 429, { type: 'rate_limit_error' }, 'limite'],
    ['saturación', 529, { type: 'overloaded_error' }, 'sobrecarga'],
    ['fallo interno', 500, { type: 'api_error' }, 'proveedor'],
  ])('clasifica %s', async (_nombre, estado, error, esperado) => {
    const red = vi.fn(async () => fallo(estado as number, error as Record<string, unknown>))
    const e = await llamarClaude(CLAVE, solicitud(), { fetch: red as never, esperaReintentoMs: 0 }).catch(x => x)
    expect(e).toBeInstanceOf(ErrorClaude)
    expect(e.codigo).toBe(esperado)
    expect(e.pudoFacturarse).toBe(false)
  })

  it('reintenta una vez ante saturación y se recupera; no reintenta clave ni crédito', async () => {
    const red = vi.fn().mockResolvedValueOnce(fallo(529, { type: 'overloaded_error' })).mockResolvedValueOnce(ok(texto('Ya funciona, aquí tienes.')))
    expect((await llamarClaude(CLAVE, solicitud(), { fetch: red as never, esperaReintentoMs: 0 })).texto).toBe('Ya funciona, aquí tienes.')
    expect(red).toHaveBeenCalledTimes(2)
    const sinSaldo = vi.fn(async () => fallo(402, { type: 'billing_error' }))
    await expect(llamarClaude(CLAVE, solicitud(), { fetch: sinSaldo as never, esperaReintentoMs: 0 })).rejects.toMatchObject({ codigo: 'credito' })
    expect(sinSaldo).toHaveBeenCalledTimes(1)
  })

  it('un fallo persistente se reintenta una sola vez', async () => {
    const red = vi.fn(async () => fallo(500, { type: 'api_error' }))
    await expect(llamarClaude(CLAVE, solicitud(), { fetch: red as never, esperaReintentoMs: 0 })).rejects.toMatchObject({ codigo: 'proveedor' })
    expect(red).toHaveBeenCalledTimes(2)
  })

  it('si la API rechaza esfuerzo o pensamiento, repite sin ellos', async () => {
    const red = vi.fn()
      .mockResolvedValueOnce(fallo(400, { type: 'invalid_request_error', message: 'thinking.type: between_tools is not supported' }))
      .mockResolvedValueOnce(ok(texto('Respondido sin parámetros opcionales.')))
    const r = await llamarClaude(CLAVE, solicitud({ pensamiento: 'sin_pensar' }), { fetch: red as never, esperaReintentoMs: 0 })
    expect(r.texto).toContain('sin parámetros')
    const segundo = JSON.parse((red.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)
    expect(segundo).not.toHaveProperty('thinking')
    expect(segundo).not.toHaveProperty('output_config')
  })

  it('sin conexión es un fallo del proveedor y el mensaje no arrastra la clave', async () => {
    const red = vi.fn(async () => { throw new TypeError(`fetch failed (x-api-key ${CLAVE})`) })
    const e = await llamarClaude(CLAVE, solicitud(), { fetch: red as never, esperaReintentoMs: 0 }).catch(x => x)
    expect(e.codigo).toBe('proveedor')
    expect(e.message).not.toContain(CLAVE)
    for (const llamada of (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls) expect(String(llamada[0])).not.toContain(CLAVE)
  })

  it('agotado el plazo corta la espera y avisa de que pudo facturarse', async () => {
    vi.useFakeTimers()
    const colgada = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rechazar) => {
      init.signal!.addEventListener('abort', () => rechazar(new DOMException('abortado', 'AbortError')))
    }))
    const pendiente = llamarClaude(CLAVE, solicitud({ tiempoMs: 1000 }), { fetch: colgada as never, esperaReintentoMs: 0 }).catch(e => e)
    await vi.advanceTimersByTimeAsync(1100)
    const e = await pendiente
    expect(e).toMatchObject({ codigo: 'tiempo', pudoFacturarse: true })
    expect(colgada).toHaveBeenCalledTimes(1)
  })
})
