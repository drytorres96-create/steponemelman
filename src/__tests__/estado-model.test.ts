import { describe, expect, it } from 'vitest'
import { nuevoProgreso, programar } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'
import {
  CORPUS_VERSION, ESTADO_INICIAL, crearUUID, leerEstadoDesconocido, migrarConceptIds,
  type EstadoApp,
} from '../store/model'

const intento = (id: string, ts: number): Intento => ({
  attempt_id: id, session_id: '11111111-1111-4111-8111-111111111111', ts,
  resultado: 'correcta', calificacion: 3, interaccion: 'recuperacion_libre',
  recuperacion_activa: true, pistas_usadas: 0, ms: 1200, tipo_error: 'ninguno', confianza_declarada: 2,
})

const estadoCon = (progreso: EstadoApp['progreso']): EstadoApp => ({ ...ESTADO_INICIAL, progreso, vistoAlguna: true })

describe('estado persistido 1.0.1', () => {
  it('preserva el orden exacto de la cola, incluso IDs repetidos', () => {
    const crudo = {
      ...ESTADO_INICIAL,
      reanudable: {
        modulo: 'MOD', sesion: 'guiada', indice: 2, ts: 123,
        conceptIds: ['C-A', 'C-B', 'C-A'], titulo: 'Cola', subtitulo: 'Exacta',
      },
    }
    expect(leerEstadoDesconocido(crudo)?.reanudable?.conceptIds).toEqual(['C-A', 'C-B', 'C-A'])
  })

  it('rechaza importaciones anidadas corruptas y versiones futuras', () => {
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, progreso: null })).toBeNull()
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: '9.0.0' })).toBeNull()
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, sesiones: null })).toBeNull()
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, sesiones: [null] })).toBeNull()
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, progreso: { A: { ...nuevoProgreso('B') } } })).toBeNull()
  })

  it('migra clave, concept_id interno y cola de forma idempotente', () => {
    const p = programar(nuevoProgreso('OLD'), intento('a', 1000), 1000)
    const base = estadoCon({ OLD: p })
    base.reanudable = { modulo: 'M', sesion: 'r', indice: 0, ts: 1000, conceptIds: ['OLD', 'OLD'] }
    const una = migrarConceptIds(base, { OLD: 'NEW' })
    const dos = migrarConceptIds(una, { OLD: 'NEW' })
    expect(Object.keys(dos.progreso)).toEqual(['NEW'])
    expect(dos.progreso.NEW.concept_id).toBe('NEW')
    expect(dos.reanudable?.conceptIds).toEqual(['NEW', 'NEW'])
    expect(dos.progreso.NEW.intentos).toHaveLength(1)
    expect(dos.corpus_version).toBe(CORPUS_VERSION)
  })

  it('fusiona colisiones sin duplicar intentos', () => {
    const old = programar(nuevoProgreso('OLD'), intento('a', 1000), 1000)
    const actual = programar(nuevoProgreso('NEW'), intento('b', 2000), 2000)
    const migrado = migrarConceptIds(estadoCon({ OLD: old, NEW: actual }), { OLD: 'NEW' })
    expect(migrado.progreso.NEW.intentos.map(i => i.attempt_id)).toEqual(['a', 'b'])
    expect(migrado.progreso.NEW.aciertos).toBe(2)
  })

  it('genera UUID v4 distintos para sesiones e intentos', () => {
    const ids = Array.from({ length: 20 }, crearUUID)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))).toBe(true)
  })
})
