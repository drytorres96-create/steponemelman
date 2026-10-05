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
  it('reconoce errores de PostgREST que llegan como objetos planos', () => {
    expect(diagnosticoSync({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }).codigo).toBe('red')
    expect(diagnosticoSync({ message: 'Servicio temporalmente indisponible', status: 503 }).codigo).toBe('servidor')
    expect(diagnosticoSync({ message: 'Fallo temporal', status: '500' }).codigo).toBe('servidor')
    expect(diagnosticoSync({ message: 'Permiso denegado', status: 403, code: '42501' }).codigo).toBe('desconocido')
    expect(diagnosticoSync({ message: null, status: null }).codigo).toBe('desconocido')
    expect(diagnosticoSync(null).codigo).toBe('desconocido')
  })
  it('identifica el fallo de conexión de PostgREST aunque el SDK no incluya status', () => {
    for (const code of ['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']) {
      expect(diagnosticoSync({ code, message: 'Timeout acquiring a connection', details: '', hint: '' }).codigo).toBe('servidor')
    }
    expect(diagnosticoSync({ code: 'PGRST202', message: 'Missing function' }).codigo).toBe('desconocido')
  })
  it('conserva el diagnóstico de causas primitivas sin llamar a toString de objetos', () => {
    expect(diagnosticoSync(503).codigo).toBe('servidor')
    expect(diagnosticoSync('Failed to fetch').codigo).toBe('red')
    expect(diagnosticoSync({ toString: () => { throw new Error('No debe llamarse') } }).codigo).toBe('desconocido')
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
