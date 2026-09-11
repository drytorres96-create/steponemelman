import { describe, expect, it } from 'vitest'
import type { Intento } from '../srs/tipos'
import { DIA, nuevoProgreso, programar } from '../srs/fsrs'
import { ESTADO_INICIAL, leerEstadoDesconocido } from '../store/model'
import { buscarIntentoPaso, conAyuda, diasParaCalificacion, identificarPregunta, resumirCorrecciones, resumirIntentos, RelojActividad, siguienteCola } from './sesion'

const intento = (datos: Partial<Intento> = {}): Intento => ({
  attempt_id: 'a1', session_id: 'session1', pregunta_id: 'session1:0:concept1',
  ts: 1_000_000, calificacion: 3, resultado: 'correcta', interaccion: 'recuperacion_libre',
  recuperacion_activa: true, pistas_usadas: 0, ms: 2000, tipo_error: 'ninguno', confianza_declarada: null,
  fuente_consultada: false, explicacion_previa: false,
  ...datos,
})

describe('Sesión recuperable con correcciones', () => {
  it('coloca los fallos y parciales al final, tantas veces como sea necesario hasta acertar', () => {
    let cola = ['a', 'b']
    cola = siguienteCola(cola, 0, 'incorrecta')
    expect(cola).toEqual(['a', 'b', 'a'])
    cola = siguienteCola(cola, 1, 'correcta')
    cola = siguienteCola(cola, 2, 'parcial')
    expect(cola).toEqual(['a', 'b', 'a', 'a'])
    expect(siguienteCola(cola, 3, 'correcta')).toBe(cola)
    expect(siguienteCola(cola, 3, 'ortografia')).toBe(cola)
    expect(siguienteCola(cola, 3, 'revision')).toBe(cola)
  })

  it('conserva la cola con duplicados y el límite inicial en un respaldo compatible', () => {
    const reanudable = { modulo: 'm', sesion: 'examen', indice: 2, ts: 1,
      conceptIds: ['a', 'b', 'a'], cantidadInicial: 2, revisionInicialHecha: false }
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, reanudable })?.reanudable).toEqual(reanudable)
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, reanudable: { ...reanudable, cantidadInicial: 4 } })).toBeNull()
    const { cantidadInicial: _n, revisionInicialHecha: _r, ...antigua } = reanudable
    expect(leerEstadoDesconocido({ ...ESTADO_INICIAL, reanudable: antigua })?.reanudable).toEqual(antigua)
  })

  it('separa aciertos iniciales y errores corregidos, sin esconder un error aún pendiente', () => {
    const pasos = [
      { conceptId: 'a', intento: intento({ resultado: 'incorrecta' }) },
      { conceptId: 'b', intento: intento({ resultado: 'correcta' }) },
      { conceptId: 'c', intento: intento({ resultado: 'parcial' }) },
      { conceptId: 'a', intento: intento({ resultado: 'incorrecta' }) },
      { conceptId: 'c', intento: intento({ resultado: 'correcta', explicacion_previa: true }) },
      { conceptId: 'a', intento: intento({ resultado: 'revision' }) },
    ]
    expect(resumirCorrecciones(pasos, 3)).toEqual({ conceptos: 3, aciertosIniciales: 1, recuperados: 1,
      erroresIniciales: 2, pendientes: 1, reintentos: 3 })
  })
  it('recupera la respuesta del paso exacto sin confundir un concepto repetido o una sesión distinta', () => {
    const primero = intento()
    const segundo = intento({ attempt_id: 'a2', pregunta_id: identificarPregunta('session1', 1, 'concept1') })
    const otraSesion = intento({ attempt_id: 'a3', session_id: 'session2', pregunta_id: identificarPregunta('session2', 0, 'concept1') })
    const p = { ...nuevoProgreso('concept1'), intentos: [primero, segundo, otraSesion] }
    expect(buscarIntentoPaso(p, 'session1', identificarPregunta('session1', 1, 'concept1'))).toBe(segundo)
    expect(buscarIntentoPaso(p, 'session1', identificarPregunta('session1', 2, 'concept1'))).toBeUndefined()
  })

  it('no cuenta otra respuesta ni otros minutos por actualizar la autoevaluación del mismo intento', () => {
    const original = intento()
    const actualizado = { ...original, calificacion: 4 as const, calificacion_actualizada_en: original.ts + 10 }
    const pendiente = intento({ attempt_id: 'a2', pregunta_id: 'session1:1:concept1', resultado: 'revision', tipo_error: 'error_por_revisar' })
    const asistido = intento({ attempt_id: 'a3', pregunta_id: 'session1:2:concept1', explicacion_previa: true })
    const resumen = resumirIntentos([original, pendiente, asistido, actualizado])
    expect(resumen).toMatchObject({ vistos: 3, correctos: 2, independientes: 1, ayudas: 1, porRevisar: 1, fallos: 0, ms: 6000 })
    expect(conAyuda(intento({ fuente_consultada: true }))).toBe(true)
    expect(conAyuda(intento({ pistas_usadas: 1 }))).toBe(true)
  })

  it('la vista previa coincide con reemplazar la calificación y ejecutar el planificador una sola vez', () => {
    const p1 = programar(nuevoProgreso('concept1'), intento({ attempt_id: 'antiguo', session_id: 'sesionPrevia', pregunta_id: 'sesionPrevia:0:concept1', ts: 1_000 }), 1_000)
    const actual = intento({ ts: 5 * DIA })
    const provisional = programar(p1, actual, actual.ts)
    for (const nota of [1, 2, 3, 4] as const) {
      const esperado = programar(p1, { ...actual, calificacion: nota }, actual.ts)
      expect(diasParaCalificacion(provisional, actual, nota)).toBeCloseTo((esperado.proxima! - actual.ts) / DIA)
    }
  })

  it('no presenta un acierto antiguo sin registro de ayudas como evidencia independiente', () => {
    const antiguo = intento({ fuente_consultada: undefined, explicacion_previa: undefined })
    const actual = intento({ attempt_id: 'a2', pregunta_id: 'session1:1:concept1' })
    expect(resumirIntentos([antiguo, actual])).toMatchObject({ vistos: 2, correctos: 2, independientes: 1 })
  })
})

describe('Tiempo activo de respuesta', () => {
  it('excluye enseñanza, fuente, pausa, pestaña oculta y feedback; conserva lo acumulado al retomar', () => {
    let ahora = 0
    const reloj = new RelojActividad(() => ahora)
    ahora += 30_000 // enseñanza: no está activo
    reloj.activar(true)
    ahora += 2000
    reloj.activar(false) // abre fuente
    ahora += 60_000
    reloj.activar(true)
    ahora += 1000
    reloj.activar(false) // pestaña oculta
    ahora += 120_000
    expect(reloj.leer()).toBe(3000)
    const otroDispositivo = new RelojActividad(() => ahora)
    otroDispositivo.reiniciar(reloj.leer())
    otroDispositivo.activar(true)
    ahora += 4000
    otroDispositivo.activar(false) // responde, comienza feedback
    ahora += 90_000
    expect(otroDispositivo.leer()).toBe(7000)
  })

  it('activar o parar dos veces no duplica intervalos', () => {
    let ahora = 10
    const reloj = new RelojActividad(() => ahora)
    reloj.activar(true); ahora += 100; reloj.activar(true); ahora += 100
    reloj.activar(false); reloj.activar(false)
    expect(reloj.leer()).toBe(200)
  })
})
