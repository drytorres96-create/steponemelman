import { afterEach, expect, it, vi } from 'vitest'
import { escribir, leer } from '../store/db'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('la persistencia estricta informa los errores de cuota y lectura, manteniendo compatible el resto de consumidores', async () => {
  vi.stubGlobal('indexedDB', undefined)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cuota') })
  await expect(escribir('nota', {}, { estricto: true })).rejects.toThrow('cuota')
  await expect(escribir('progreso', {})).resolves.toBeUndefined()
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('json corrupto')
  await expect(leer('nota', { estricto: true })).rejects.toThrow()
})
