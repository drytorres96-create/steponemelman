import { describe, it, expect } from 'vitest'
import { SyncError, diagnosticoSync } from './sync'

describe('diagnóstico de sincronización', () => {
  it('conserva el motivo concreto que ya traía SyncError', () => {
    for (const code of ['missing', 'conflict', 'invalid'] as const) {
      const d = diagnosticoSync(new SyncError(code, `mensaje de ${code}`))
      expect(d.codigo).toBe(code)
      expect(d.mensaje).toBe(`mensaje de ${code}`)
    }
  })
  it('distingue un fallo de red de un fallo del servidor', () => {
    expect(diagnosticoSync(new TypeError('Failed to fetch')).codigo).toBe('red')
    expect(diagnosticoSync(new Error('NetworkError al intentar cargar')).codigo).toBe('red')
    expect(diagnosticoSync(new Error('el servidor devolvió 503')).codigo).toBe('servidor')
  })
  it('los cinco motivos no comparten el mismo texto', () => {
    const mensajes = [
      diagnosticoSync(new SyncError('missing', 'a')).mensaje,
      diagnosticoSync(new SyncError('conflict', 'b')).mensaje,
      diagnosticoSync(new TypeError('Failed to fetch')).mensaje,
      diagnosticoSync(new Error('500 server')).mensaje,
      diagnosticoSync('algo raro').mensaje,
    ]
    expect(new Set(mensajes).size).toBe(mensajes.length)
  })
  it('un fallo sin firma reconocible conserva el texto histórico', () => {
    const d = diagnosticoSync('algo raro')
    expect(d.codigo).toBe('desconocido')
    expect(d.mensaje).toBe('Cambios en este dispositivo; falta sincronizar')
  })
})
