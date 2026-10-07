// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clasificarErrorCloudflare } from './error-cloudflare'

describe('diagnóstico privado de Workers AI', () => {
  it('lee el prefijo de InferenceUpstreamError sin depender de .code ni estado compartido', () => {
    const e = new Error('3040: No capacity available')
    e.name = 'InferenceUpstreamError'
    expect(clasificarErrorCloudflare(e)).toEqual({ codigo: 'capacidad', codigoProveedor: 3040 })
  })
  it('no confunde números dentro del material con códigos del proveedor', () => {
    for (const causa of [new Error('Question contains 3036: literal text.'), new Error('30360: Unknown.'),
      new Error('3036:material without a code delimiter'), { code: 3036, message: 'arbitrary object' }, null]) {
      expect(clasificarErrorCloudflare(causa)).toEqual({ codigo: 'proveedor' })
    }
  })
})
