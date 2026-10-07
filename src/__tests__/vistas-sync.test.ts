import { describe, expect, it } from 'vitest'
import { ESTADO_INICIAL, leerEstadoDesconocido, registrarVistaConceptoEstado, type EstadoApp } from '../store/model'
import { StudySyncEngine, type CloudSnapshot, type SyncTransport } from '../store/sync'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const snapshot = (state: EstadoApp, generation = 'generacion-1', revision = 1): CloudSnapshot => ({
  state: clone(state), generation, revision, updated_at: '2026-10-07T12:00:00Z',
})

function nube(inicial: CloudSnapshot) {
  let row = inicial
  const transport: SyncTransport = {
    load: async () => clone(row),
    save: async input => {
      if (input.generation !== row.generation) return { ok: false, kind: 'reset', row: clone(row) }
      if (input.expectedRevision !== row.revision) return { ok: false, kind: 'conflict', row: clone(row) }
      row = snapshot(leerEstadoDesconocido(input.state)!, row.generation, row.revision + 1)
      return { ok: true, kind: 'saved', row: clone(row) }
    },
  }
  return { transport, get row() { return row }, reset() { row = snapshot(ESTADO_INICIAL, 'generacion-2', row.revision + 1) } }
}

describe('vistas en la sincronización normal de conceptos', () => {
  it('conserva exposiciones locales y remotas al fusionar un estado anterior compatible', async () => {
    const base = snapshot(ESTADO_INICIAL)
    const cloud = nube(snapshot(registrarVistaConceptoEstado(ESTADO_INICIAL, 'REMOTO', 'paso:R', 1000), base.generation, 2))
    let local = registrarVistaConceptoEstado(clone(ESTADO_INICIAL), 'LOCAL', 'paso:L', 2000)
    const engine = new StudySyncEngine(cloud.transport, { getLocal: () => local, setLocal: state => { local = state } }, base)
    expect((await engine.flush()).kind).toBe('synced')
    expect(Object.keys(local.conceptosVistos ?? {}).sort()).toEqual(['LOCAL', 'REMOTO'])
    expect(cloud.row.state.conceptosVistos).toEqual(local.conceptosVistos)
    expect(local.progreso).toEqual({})
    expect(local.sesiones).toEqual([])
  })

  it('un reinicio remoto no resucita las vistas de la generación anterior', async () => {
    const base = snapshot(registrarVistaConceptoEstado(ESTADO_INICIAL, 'ANTERIOR', 'paso:A', 1000))
    const cloud = nube(base)
    let local = registrarVistaConceptoEstado(clone(base.state), 'SIN-SUBIR', 'paso:B', 2000)
    const engine = new StudySyncEngine(cloud.transport, { getLocal: () => local, setLocal: state => { local = state } }, base)
    cloud.reset()
    expect((await engine.flush()).kind).toBe('reset')
    expect(local.conceptosVistos).toBeUndefined()
    expect(cloud.row.state.conceptosVistos).toBeUndefined()
    local = registrarVistaConceptoEstado(local, 'NUEVO', 'paso:N', 3000)
    expect((await engine.flush()).kind).toBe('synced')
    expect(Object.keys(cloud.row.state.conceptosVistos ?? {})).toEqual(['NUEVO'])
  })
})
