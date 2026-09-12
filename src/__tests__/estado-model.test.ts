import { describe, expect, it } from 'vitest'
import { nuevoProgreso, programar } from '../srs/fsrs'
import { evidenciaIndependiente, CRITERIOS_HEREDADOS } from '../srs/mastery'
import type { Intento } from '../srs/tipos'
import {
  CORPUS_VERSION, ESTADO_INICIAL, crearUUID, leerEstadoDesconocido, migrarConceptIds, reconstruirProgreso, combinarEstados,
  type EstadoApp,
} from '../store/model'

const intento = (id: string, ts: number): Intento => ({
  attempt_id: id, session_id: '11111111-1111-4111-8111-111111111111', ts,
  resultado: 'correcta', calificacion: 3, interaccion: 'recuperacion_libre',
  recuperacion_activa: true, pistas_usadas: 0, ms: 1200, tipo_error: 'ninguno', confianza_declarada: 2,
})

const estadoCon = (progreso: EstadoApp['progreso']): EstadoApp => ({ ...ESTADO_INICIAL, progreso, vistoAlguna: true })

describe('estado persistido compatible', () => {
  it('preserva el hito histórico al fusionar sin certificar independencia antigua', () => {
    const p = { ...reconstruirProgreso('A', [intento('legacy', 1000)], ESTADO_INICIAL.criterios), dominado_en: 1000 }
    const fusion = combinarEstados(estadoCon({ A: p }), estadoCon({}))
    expect(fusion.progreso.A.dominado_en).toBe(1000)
    expect(fusion.progreso.A.estado).not.toBe('dominado')
    expect(reconstruirProgreso('A', p.intentos, ESTADO_INICIAL.criterios, p.dominado_en).dominado_en).toBe(1000)
  })

  it('guarda evidencia y actualiza la calificación del mismo envío sin duplicar contadores', () => {
    const enviado: Intento = { ...intento('a', 1000), respuesta_dada: 'Respuesta conservada',
      pregunta_id: 'session:0:A', pregunta_version: 'v1', evaluador_version: 'v2',
      fuente_consultada: true, explicacion_previa: false, modo: 'repaso', tipo_evidencia: 'recuerdo' }
    const actualizado = { ...enviado, calificacion: 2 as const, calificacion_actualizada_en: 2000 }
    const p = reconstruirProgreso('A', [enviado, actualizado, enviado], ESTADO_INICIAL.criterios)
    expect(p.intentos).toHaveLength(1)
    expect(p.aciertos).toBe(1)
    expect(p.intentos[0].calificacion).toBe(2)
    expect(leerEstadoDesconocido(estadoCon({ A: p }))?.progreso.A.intentos[0]).toEqual(actualizado)
  })

  it('fusiona dos dispositivos sin perder la calificación nueva ni la evidencia de ayuda', () => {
    const a = { ...intento('a', 1000), pregunta_id: 'q1', fuente_consultada: true }
    const b = { ...intento('b', 1001), pregunta_id: 'q1', fuente_consultada: false, calificacion: 2 as const, calificacion_actualizada_en: 3000 }
    const ea = estadoCon({ A: reconstruirProgreso('A', [a], ESTADO_INICIAL.criterios) })
    const eb = estadoCon({ A: reconstruirProgreso('A', [b], ESTADO_INICIAL.criterios) })
    const ab = combinarEstados(ea, eb)
    expect(ab).toEqual(combinarEstados(eb, ea))
    expect(ab.progreso.A.intentos).toHaveLength(1)
    expect(ab.progreso.A.intentos[0]).toMatchObject({ calificacion: 2, fuente_consultada: true })
    expect(leerEstadoDesconocido(ab)).not.toBeNull()
  })

  it('fusionar copias de un paso antiguo no inventa que se respondió sin ayuda', () => {
    const antiguo = { ...intento('a', 1000), pregunta_id: 'q1' }
    for (const otra of [antiguo, { ...antiguo, fuente_consultada: false, explicacion_previa: false }]) {
      const ea = estadoCon({ A: reconstruirProgreso('A', [antiguo], ESTADO_INICIAL.criterios) })
      const eb = estadoCon({ A: reconstruirProgreso('A', [otra], ESTADO_INICIAL.criterios) })
      const ab = combinarEstados(ea, eb)
      expect(ab).toEqual(combinarEstados(eb, ea))
      const unido = ab.progreso.A.intentos[0]
      expect(unido.fuente_consultada).toBeUndefined()
      expect(unido.explicacion_previa).toBeUndefined()
      expect(evidenciaIndependiente(unido)).toBe(false)
      expect(evidenciaIndependiente(leerEstadoDesconocido(JSON.parse(JSON.stringify(ab)))!.progreso.A.intentos[0])).toBe(false)
    }
  })

  it('conserva una respuesta por revisar sin convertirla en fallo ni en repaso vencido', () => {
    const pendiente = { ...intento('r', 1000), resultado: 'revision' as const, tipo_error: 'error_por_revisar' as const }
    const p = reconstruirProgreso('A', [pendiente], ESTADO_INICIAL.criterios)
    expect(p.aciertos).toBe(0)
    expect(p.fallos).toBe(0)
    expect(p.proxima).toBeNull()
    expect(leerEstadoDesconocido(estadoCon({ A: p }))?.progreso.A.intentos).toHaveLength(1)
  })

  it('restaura ayudas del paso y admite el resumen final, rechazando evidencia corrupta', () => {
    const r = { modulo: 'M', sesion: 'repaso', indice: 1, ts: 1000, conceptIds: ['A'],
      paso: { indice: 1, pistas: 2, fuenteConsultada: true, explicacionPrevia: false, confianza: null, msActivo: 1234 } }
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, reanudable: r })?.reanudable).toEqual(r)
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, reanudable: { ...r, paso: { ...r.paso, pistas: -1 } } })).toBeNull()
  })
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
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: '1.0.1' })?.corpus_version).toBe(CORPUS_VERSION)
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: '1.0.2' })?.corpus_version).toBe(CORPUS_VERSION)
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: '1.0.3' })?.corpus_version).toBe(CORPUS_VERSION)
    // Cualquier versión ya publicada se lee, sin lista literal que haya que mantener a mano.
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: '1.0.4' })?.corpus_version).toBe(CORPUS_VERSION)
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: CORPUS_VERSION })?.corpus_version).toBe(CORPUS_VERSION)
    // Una versión futura la escribió una aplicación más nueva: no se degrada a ciegas.
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: '9.0.0' })).toBeNull()
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: '1.1.0' })).toBeNull()
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, corpus_version: '1.0' })).toBeNull()
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

describe('migración de criterios al leer el estado guardado', () => {
  it('un estado con los criterios heredados adopta los endurecidos', () => {
    const guardado = { ...ESTADO_INICIAL, criterios: { ...CRITERIOS_HEREDADOS } }
    const leido = leerEstadoDesconocido(guardado)
    expect(leido?.criterios.separacionHoras).toBe(96)
    expect(leido?.criterios.ventanaConfusionDias).toBe(7)
  })
  it('unos criterios ajustados a mano se conservan intactos', () => {
    const propios = { ...CRITERIOS_HEREDADOS, separacionHoras: 48, recuperaciones: 4 }
    const leido = leerEstadoDesconocido({ ...ESTADO_INICIAL, criterios: propios })
    expect(leido?.criterios.separacionHoras).toBe(48)
    expect(leido?.criterios.recuperaciones).toBe(4)
  })
})
