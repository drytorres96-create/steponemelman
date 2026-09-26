import { describe, expect, it } from 'vitest'
import { nuevoProgreso, programar } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'
import { combinarEstados, ESTADO_INICIAL, leerEstadoDesconocido, type EstadoApp } from '../store/model'
import { StudySyncEngine, type CloudSnapshot, type SyncReply, type SyncTransport } from '../store/sync'

const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const empty = (): EstadoApp => copy(ESTADO_INICIAL)
const intento = (id: string, ts: number, ms = 100): Intento => ({
  attempt_id: id, session_id: 'session-1', ts, resultado: 'correcta', calificacion: 3,
  interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0,
  ms, tipo_error: 'ninguno', confianza_declarada: 2,
})
function add(state: EstadoApp, id: string, ts: number): EstadoApp {
  const p = programar(state.progreso.A ?? nuevoProgreso('A'), intento(id, ts), ts)
  return { ...state, progreso: { ...state.progreso, A: p }, msEstudio: state.msEstudio + 100, vistoAlguna: true }
}
const snapshot = (state = empty(), generation = 'generation-1', revision = 1): CloudSnapshot => ({
  state: copy(state), generation, revision, updated_at: '2026-09-09T00:00:00Z',
})

function server(initial: CloudSnapshot | null = null) {
  let row = initial === null ? null : copy(initial)
  let requests = 0
  const transport: SyncTransport = {
    load: async () => copy(row),
    save: async ({ state, expectedRevision, generation }): Promise<SyncReply> => {
      requests++
      if (!row) {
        if (expectedRevision !== 0 || generation !== null) return { ok: false, kind: 'missing', row: null }
        row = snapshot(state)
        return { ok: true, kind: 'saved', row: copy(row) }
      }
      if (generation !== null && generation !== row.generation) return { ok: false, kind: 'reset', row: copy(row) }
      if (generation === null || expectedRevision !== row.revision) return { ok: false, kind: 'conflict', row: copy(row) }
      row = snapshot(state, row.generation, row.revision + 1)
      return { ok: true, kind: 'saved', row: copy(row) }
    },
  }
  return { transport, get row() { return row }, get requests() { return requests },
    reset() { row = snapshot(empty(), 'generation-2', (row?.revision ?? 0) + 1); return copy(row) },
    remove() { row = null } }
}

function device(transport: SyncTransport, state = empty(), initial: CloudSnapshot | null = null) {
  let local = state
  const engine = new StudySyncEngine(transport, { getLocal: () => local, setLocal: s => { local = s } }, initial)
  return { engine, get local() { return local }, edit(id: string, ts: number) { local = add(local, id, ts) } }
}

describe('fusión determinista del progreso', () => {
  it('conserva intentos distintos y deduplica el historial común con independencia del dispositivo', () => {
    const shared = add(empty(), 'common', 1000)
    const a = add(shared, 'device-a', 2000)
    const b = add(shared, 'device-b', 2000)
    const merged = combinarEstados(a, b)
    expect(merged).toEqual(combinarEstados(b, a))
    expect(merged.progreso.A.intentos.map(i => i.attempt_id)).toEqual(['common', 'device-a', 'device-b'])
    expect(merged.progreso.A.aciertos).toBe(3)
    expect(merged.msEstudio).toBe(300)
    expect(combinarEstados(merged, a)).toEqual(merged)
    expect(leerEstadoDesconocido(merged)).not.toBeNull()
  })

  it('reproduce FSRS en orden estable incluso con marcas de tiempo idénticas', () => {
    const a = add(empty(), 'a', 2000)
    const b = add(empty(), 'b', 2000)
    b.progreso.A = programar(nuevoProgreso('A'), { ...intento('b', 2000), resultado: 'incorrecta', calificacion: 1 }, 2000)
    const merged = combinarEstados(a, b)
    const expected = programar(programar(nuevoProgreso('A'), intento('a', 2000), 2000), b.progreso.A.intentos[0], 2000)
    expect(merged.progreso.A.estabilidad).toBe(expected.estabilidad)
    expect(merged.progreso.A.dificultad).toBe(expected.dificultad)
    expect(merged.progreso.A.fallos).toBe(1)
    expect(combinarEstados(a, b)).toEqual(combinarEstados(b, a))
  })

  it('conserva un intento antiguo una vez y permite otros intentos sin UUID en el mismo instante', () => {
    const a = add(empty(), 'old', 1000)
    delete a.progreso.A.intentos[0].attempt_id
    const b = copy(a)
    b.progreso.A.intentos[0].ms = 200
    expect(combinarEstados(a, a).progreso.A.intentos).toHaveLength(1)
    expect(combinarEstados(a, b).progreso.A.intentos).toHaveLength(2)
  })

  it('evita duplicar sesiones y mantiene el máximo de tiempo histórico sin sumarlo', () => {
    const a = empty()
    a.sesiones = [{ id: 's', inicio: 1, fin: null, modulo: 'm', ruta: 'r', vistos: 1, correctos: 1, ms: 100 }]
    a.msEstudio = 5000
    const b = copy(a)
    b.sesiones[0] = { ...b.sesiones[0], fin: 3, vistos: 2, correctos: 2, ms: 200 }
    b.msEstudio = 6000
    const merged = combinarEstados(a, b)
    expect(merged.sesiones).toHaveLength(1)
    expect(merged.sesiones[0].vistos).toBe(2)
    expect(merged.sesiones[0].fin).toBe(3)
    expect(merged.msEstudio).toBe(6000)
  })

  it('respeta el borrado de una sesión reanudable y la preferencia modificada más recientemente', () => {
    const a = empty()
    a.reanudable = { modulo: 'm', sesion: 'r', sessionId: 'real-session', indice: 0, ts: 100, conceptIds: ['A'] }
    a.fieldUpdatedAt = { criterios: 5, reanudable: 100 }
    const b = empty()
    b.fieldUpdatedAt = { criterios: 200, reanudable: 200 }
    b.criterios = { ...b.criterios, recuperaciones: 9 }
    const merged = combinarEstados(a, b)
    expect(merged.reanudable).toBeNull()
    expect(merged.criterios.recuperaciones).toBe(9)
    expect(combinarEstados(merged, a).reanudable).toBeNull()
    expect(leerEstadoDesconocido(a)?.reanudable?.sessionId).toBe('real-session')
  })

  it('rechaza contadores, colas, sesiones y claves de objeto corruptos', () => {
    const base = add(empty(), 'a', 10)
    base.progreso.A.aciertos = 99
    expect(leerEstadoDesconocido(base)).toBeNull()
    expect(leerEstadoDesconocido({ ...empty(), reanudable: {
      modulo: 'm', sesion: 'r', indice: 2, ts: 1, conceptIds: ['A'],
    } })).toBeNull()
    expect(leerEstadoDesconocido({ ...empty(), fieldUpdatedAt: { criterios: -1, reanudable: 0 } })).toBeNull()
    const hostile = JSON.parse(JSON.stringify(empty()))
    hostile.progreso = JSON.parse('{"__proto__":{"concept_id":"__proto__"}}')
    expect(leerEstadoDesconocido(hostile)).toBeNull()
  })
})

describe('sincronización entre dispositivos', () => {
  it('fusiona dos escrituras simultáneas mediante revisión sin perder ni duplicar respuestas', async () => {
    const base = snapshot(add(empty(), 'common', 1000))
    const cloud = server(base)
    const a = device(cloud.transport, copy(base.state), base)
    const b = device(cloud.transport, copy(base.state), base)
    a.edit('device-a', 2000)
    b.edit('device-b', 2000)
    await Promise.all([a.engine.flush(), b.engine.flush()])
    await a.engine.fetchAndMerge()
    expect(cloud.row?.state.progreso.A.intentos).toHaveLength(3)
    expect(a.local).toEqual(b.local)
    expect(a.local.msEstudio).toBe(300)
  })

  it('fusiona una instalación nueva con el progreso remoto antes de su primera escritura', async () => {
    const cloud = server(snapshot(add(empty(), 'cloud', 1000)))
    const client = device(cloud.transport, add(empty(), 'offline-import', 2000))
    expect((await client.engine.flush()).kind).toBe('synced')
    expect(cloud.row?.state.progreso.A.intentos.map(i => i.attempt_id)).toEqual(['cloud', 'offline-import'])
    expect(cloud.requests).toBe(2)
  })

  it('conserva y guarda cambios locales que ocurren durante una petición lenta', async () => {
    const cloud = server()
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const waiting = new Promise<void>(resolve => { started = resolve })
    let first = true
    const transport: SyncTransport = { ...cloud.transport, save: async input => {
      const result = await cloud.transport.save(input)
      if (first) { first = false; started(); await gate }
      return result
    } }
    const client = device(transport, add(empty(), 'first', 1000))
    const saving = client.engine.flush()
    await waiting
    client.edit('during-request', 2000)
    expect(client.engine.flush()).toBe(saving)
    release()
    expect((await saving).kind).toBe('synced')
    expect(client.local.progreso.A.intentos).toHaveLength(2)
    expect(cloud.row?.state.progreso.A.intentos).toHaveLength(2)
    expect(cloud.requests).toBe(2)
  })

  it('un dispositivo antiguo no resucita el historial después de un reinicio remoto', async () => {
    const base = snapshot(add(empty(), 'old', 1000))
    const cloud = server(base)
    const stale = device(cloud.transport, copy(base.state), base)
    stale.edit('unsynced-old-generation', 2000)
    cloud.reset()
    expect((await stale.engine.flush()).kind).toBe('reset')
    expect(stale.local.progreso).toEqual({})
    expect(cloud.row?.state.progreso).toEqual({})
    stale.edit('after-reset', 3000)
    await stale.engine.flush()
    expect(cloud.row?.state.progreso.A.intentos.map(i => i.attempt_id)).toEqual(['after-reset'])
  })

  it('detecta el reinicio al leer y descarta la generación anterior', async () => {
    const base = snapshot(add(empty(), 'old', 1000))
    const cloud = server(base)
    const stale = device(cloud.transport, copy(base.state), base)
    cloud.reset()
    expect((await stale.engine.fetchAndMerge()).kind).toBe('reset')
    expect(stale.local.progreso).toEqual({})
  })

  it('ignora una respuesta antigua que llega después del reinicio aceptado localmente', async () => {
    const base = snapshot(add(empty(), 'old', 1000))
    const cloud = server(base)
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const waiting = new Promise<void>(resolve => { started = resolve })
    const client = device({ ...cloud.transport, save: async input => {
      const result = await cloud.transport.save(input)
      started()
      await gate
      return result
    } }, copy(base.state), base)
    const pending = client.engine.flush()
    await waiting
    client.engine.acceptReset(cloud.reset())
    release()
    expect((await pending).kind).toBe('reset')
    expect(client.local.progreso).toEqual({})
    expect(client.engine.snapshot?.generation).toBe('generation-2')
  })

  it('no recrea una fila eliminada usando un dispositivo antiguo', async () => {
    const base = snapshot(add(empty(), 'old', 1000))
    const cloud = server(base)
    const client = device(cloud.transport, copy(base.state), base)
    cloud.remove()
    await expect(client.engine.flush()).rejects.toMatchObject({ code: 'missing' })
    expect(cloud.row).toBeNull()
    expect(client.local.progreso.A.intentos).toHaveLength(1)
  })

  it('limita reintentos y conserva la copia local ante conflictos persistentes', async () => {
    let calls = 0
    const row = snapshot()
    const client = device({ load: async () => row, save: async () => {
      calls++
      return { ok: false, kind: 'conflict', row: { ...row, revision: calls } }
    } }, add(empty(), 'pending', 1000))
    await expect(client.engine.flush()).rejects.toMatchObject({ code: 'conflict' })
    expect(calls).toBe(5)
    expect(client.local.progreso.A.intentos).toHaveLength(1)
  })
})

/** El mismo servidor, contando cuántas veces se baja el progreso entero y con consulta ligera. */
function conConsultaLigera(cloud: ReturnType<typeof server>) {
  let loads = 0
  const transport: SyncTransport = {
    load: async () => { loads++; return cloud.transport.load() },
    save: input => cloud.transport.save(input),
    peek: async () => cloud.row ? { revision: cloud.row.revision, generation: cloud.row.generation } : null,
  }
  return { transport, get loads() { return loads } }
}

describe('sin cambios no se transfiere el progreso', () => {
  it('no sube nada si la copia local ya coincide con la nube, y sube en cuanto hay una respuesta nueva', async () => {
    const cloud = server(snapshot(add(empty(), 'old', 1000)))
    const client = device(cloud.transport)
    await client.engine.fetchAndMerge()
    await client.engine.flush()
    const antes = cloud.requests
    expect((await client.engine.flush()).kind).toBe('unchanged')
    expect(cloud.requests).toBe(antes)
    client.edit('new', 2000)
    expect((await client.engine.flush()).kind).toBe('synced')
    expect(cloud.requests).toBe(antes + 1)
    expect(cloud.row?.state.progreso.A.intentos.map(i => i.attempt_id)).toEqual(['old', 'new'])
    expect((await client.engine.flush()).kind).toBe('unchanged')
    expect(cloud.requests).toBe(antes + 1)
  })

  it('no baja el progreso entero mientras la revisión de la nube no cambie', async () => {
    const cloud = server(snapshot(add(empty(), 'old', 1000)))
    const red = conConsultaLigera(cloud)
    const a = device(red.transport)
    const b = device(cloud.transport)
    await a.engine.fetchAndMerge()
    expect(red.loads).toBe(1)
    expect((await a.engine.fetchAndMerge()).kind).toBe('unchanged')
    expect(red.loads).toBe(1)
    // Otro dispositivo guarda una respuesta: la revisión cambia y entonces sí se baja.
    await b.engine.fetchAndMerge()
    b.edit('otro', 3000)
    await b.engine.flush()
    expect((await a.engine.fetchAndMerge()).kind).toBe('merged')
    expect(red.loads).toBe(2)
    expect(a.local.progreso.A.intentos.map(i => i.attempt_id)).toContain('otro')
  })

  it('un reinicio hecho en otro dispositivo se aplica aunque se consulte sólo la revisión', async () => {
    const cloud = server(snapshot(add(empty(), 'old', 1000)))
    const red = conConsultaLigera(cloud)
    const a = device(red.transport)
    await a.engine.fetchAndMerge()
    expect(a.local.progreso.A.intentos).toHaveLength(1)
    cloud.reset()
    expect((await a.engine.fetchAndMerge()).kind).toBe('reset')
    expect(a.local.progreso).toEqual({})
    expect(a.engine.snapshot?.generation).toBe('generation-2')
  })
})
