import { describe, it, expect } from 'vitest'
import { nuevoProgreso, programar, DIA } from '../srs/fsrs'
import { CRITERIOS_POR_DEFECTO, CRITERIOS_HEREDADOS, CRITERIOS_96H, sonCriteriosHeredados, aciertosVigentes, evaluarDominio, calcularEstado, dominioVigente, evidenciaActiva, evidenciaIndependiente, etapa, resumenDominio, tipoEvidenciaDeIntento } from '../srs/mastery'
import { reconstruirProgreso } from '../store/model'
import type { Intento } from '../srs/tipos'

const it3 = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  ts, calificacion: 3, interaccion: 'recuperacion_libre', recuperacion_activa: true,
  pistas_usadas: 0, ms: 3000, tipo_error: 'ninguno', confianza_declarada: 3,
  resultado: 'correcta', fuente_consultada: false, explicacion_previa: false, ...extra,
})

describe('criterios de dominio', () => {
  it('el mismo concepto acumula evidencia entre Hoy, meta y repaso NBME sin duplicar un envío', () => {
    const t = Date.parse('2026-10-01T12:00:00-04:00')
    const envios = [
      it3(t, { attempt_id: 'hoy-1', session_id: 'hoy' }),
      it3(t + 2 * DIA, { attempt_id: 'meta-1', session_id: 'meta' }),
      it3(t + 5 * DIA, { attempt_id: 'nbme-1', session_id: 'nbme-relacionado' }),
    ]
    const p = reconstruirProgreso('CONCEPTO-UNICO', [...envios, envios[2]], CRITERIOS_POR_DEFECTO)
    expect(p.intentos).toHaveLength(3)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(true)
    const guiado = reconstruirProgreso('CONCEPTO-UNICO', [...envios.slice(0, 2),
      { ...envios[2], explicacion_previa: true }], CRITERIOS_POR_DEFECTO)
    expect(evaluarDominio(guiado, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(false)
  })
  it('consultar una fecha no acredita intentos del futuro ni modifica el historial', () => {
    const t = Date.parse('2026-10-01T12:00:00-04:00')
    const intentos = [1, 3, 5].map(d => it3(t + d * DIA))
    const p = reconstruirProgreso('FUTURO', intentos, CRITERIOS_POR_DEFECTO)
    const antes = structuredClone(p)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t).cumple).toBe(false)
    expect(calcularEstado(p, CRITERIOS_POR_DEFECTO, t)).toBe('nuevo')
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t)).toBe('exposicion')
    expect(aciertosVigentes(p, t + 3 * DIA)).toHaveLength(2)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(true)
    expect(p).toEqual(antes)
  })
  it('un fallo y una confusión futuros no retiran evidencia de una fecha anterior', () => {
    const t = Date.parse('2026-10-01T12:00:00-04:00')
    const intentos = [0, 2, 4].map(d => it3(t + d * DIA))
    intentos.push(it3(t + 5 * DIA, { resultado: 'incorrecta', tipo_error: 'confusion_conceptos' }))
    const p = reconstruirProgreso('PASADO', intentos, CRITERIOS_POR_DEFECTO)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 4 * DIA).cumple).toBe(true)
    expect(calcularEstado(p, CRITERIOS_POR_DEFECTO, t + 4 * DIA)).not.toBe('reaprendizaje')
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(false)
  })
  it('un último fallo con evidencia anterior suficiente pide recuperación, no declara mantenimiento al día', () => {
    const t = Date.parse('2026-10-01T12:00:00-04:00')
    const intentos = [0, 2, 4, 6, 8].map(d => it3(t + d * DIA))
    intentos.push(it3(t + 9 * DIA, { resultado: 'incorrecta', tipo_error: 'desconocimiento' }))
    const p = reconstruirProgreso('ERROR-NUEVO', intentos, CRITERIOS_POR_DEFECTO)
    const antes = structuredClone(p)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 9 * DIA).cumple).toBe(true)
    expect(dominioVigente(p, CRITERIOS_POR_DEFECTO, t + 9 * DIA)).toBe(false)
    expect(resumenDominio(p, CRITERIOS_POR_DEFECTO, t + 9 * DIA)).toMatchObject({
      texto: expect.stringContaining('recuperación pendiente'),
      pendientes: ['Recuperar el concepto tras la última respuesta fallada'],
    })
    expect(p).toEqual(antes)
  })
  it('sin agenda explica que falta comprobar mantenimiento sin inventar una fecha', () => {
    const t = Date.parse('2026-10-01T12:00:00-04:00')
    const p = { ...reconstruirProgreso('AGENDA', [0, 2, 4].map(d => it3(t + d * DIA)), CRITERIOS_POR_DEFECTO), proxima: null }
    expect(resumenDominio(p, CRITERIOS_POR_DEFECTO, t + 4 * DIA)).toMatchObject({
      texto: expect.stringContaining('mantenimiento por comprobar'),
      pendientes: ['Completar un repaso para comprobar el mantenimiento y su próxima fecha'],
    })
    expect(p.proxima).toBeNull()
  })
  it('la espera por confusión puede terminar por tiempo, sin crear una respuesta ni un primer hito', () => {
    const t = Date.parse('2026-10-01T12:00:00-04:00')
    const intentos = [it3(t, { resultado: 'incorrecta', tipo_error: 'confusion_conceptos' }),
      ...[1, 2, 3].map(d => it3(t + d * DIA))]
    const p = reconstruirProgreso('ESPERA', intentos, CRITERIOS_POR_DEFECTO)
    const antes = structuredClone(p)
    expect(p.dominado_en).toBeNull()
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 7 * DIA - 1).cumple).toBe(false)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 7 * DIA).cumple).toBe(true)
    expect(p).toEqual(antes)
    expect(p.dominado_en).toBeNull()
  })
  it('un solo acierto no basta para dominar', () => {
    const t = Date.now()
    const p = programar(nuevoProgreso('X'), it3(t), t)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t).cumple).toBe(false)
    expect(calcularEstado(p, CRITERIOS_POR_DEFECTO, t)).not.toBe('dominado')
  })
  it('tres recuperaciones en dos sesiones separadas y sin pistas sí bastan', () => {
    const t = Date.now()
    let p = programar(nuevoProgreso('X'), it3(t), t)
    p = programar(p, it3(t + 2 * DIA), t + 2 * DIA)
    p = programar(p, it3(t + 5 * DIA), t + 5 * DIA)
    const ev = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)
    expect(ev.cumple).toBe(true)
    expect(ev.detalle.every(d => d.cumplido)).toBe(true)
  })
  it('el reconocimiento puro necesita recuperación o aplicación aunque acumule más aciertos', () => {
    const t = Date.now()
    const mcq = { recuperacion_activa: false, interaccion: 'opcion_multiple' }
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA, mcq), t + d * DIA)
    const tres = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)
    expect(tres.requeridas).toBe(3)
    expect(tres.cumple).toBe(false)
    expect(tres.detalle.find(d => d.clave === 'recuperacion')).toMatchObject({ cumplido: false, valor: 'pendiente' })

    p = programar(p, it3(t + 7 * DIA, mcq), t + 7 * DIA)
    const cuatro = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 7 * DIA)
    expect(cuatro.cumple).toBe(false)
    expect(cuatro.detalle.find(d => d.clave === 'recuperacion')).toMatchObject({ cumplido: false, valor: 'pendiente' })

    p = programar(p, it3(t + 9 * DIA), t + 9 * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 9 * DIA).cumple).toBe(true)
  })

  it('respeta un criterio personalizado de dos recuerdos sin alternativas', () => {
    const t = Date.now()
    let p = nuevoProgreso('LIBRE')
    for (const d of [0, 3]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    const ev = evaluarDominio(p, { ...CRITERIOS_POR_DEFECTO, recuperaciones: 2 }, t + 3 * DIA)
    expect(ev.detalle.find(d => d.clave === 'recuperacion')).toMatchObject({ cumplido: true, valor: 'sí' })
    expect(ev.cumple).toBe(true)
  })

  it('la retención se enseña como cifra continua pero no bloquea el dominio', () => {
    const t = Date.now()
    let p = nuevoProgreso('R')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    const recien = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)
    expect(recien.detalle.find(d => d.clave === 'retencion')).toMatchObject({ cumplido: true, valor: '100 %' })

    // Pasado el vencimiento la retención cae, pero la evidencia acreditada sigue acreditada:
    // el concepto pide repaso, no vuelve a «nunca lo dominaste».
    const vencido = evaluarDominio(p, CRITERIOS_POR_DEFECTO, p.proxima! + 30 * DIA)
    expect(vencido.detalle.find(d => d.clave === 'retencion')!.cumplido).toBe(false)
    expect(vencido.cumple).toBe(true)
    expect(calcularEstado(p, CRITERIOS_POR_DEFECTO, p.proxima! + 30 * DIA)).toBe('requiere_repaso')
  })
  it('sin agenda conocida conserva la evidencia demostrada pero no declara dominio al día', () => {
    const t = Date.now()
    let p = nuevoProgreso('SIN-FECHA')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    p = { ...p, proxima: null, dominado_en: t + 5 * DIA }
    const antes = structuredClone(p)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(true)
    expect(dominioVigente(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)).toBe(false)
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)).not.toBe('dominio')
    expect(p).toEqual(antes)
  })
  it('dos discriminaciones y un recuerdo libre acreditan los tres aciertos requeridos', () => {
    const t = Date.now()
    let p = nuevoProgreso('MIXTO')
    p = programar(p, it3(t, { recuperacion_activa: false, interaccion: 'opcion_multiple' }), t)
    p = programar(p, it3(t + 2 * DIA, { recuperacion_activa: false, interaccion: 'opcion_multiple' }), t + 2 * DIA)
    p = programar(p, it3(t + 5 * DIA, { session_id: 'libre' }), t + 5 * DIA)
    const ev = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)
    expect(ev.requeridas).toBe(3)
    expect(ev.cumple).toBe(true)
  })
  it('la aplicación de un caso clínico cuenta como evidencia activa', () => {
    const t = Date.now()
    let p = nuevoProgreso('CASO')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA, {
      recuperacion_activa: false, interaccion: 'caso_clinico', tipo_evidencia: 'aplicacion',
    }), t + d * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).requeridas).toBe(3)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(true)
  })
  it.each(['prediccion_direccional', 'secuencia', 'relacionar', 'clasificar', 'opcion_multiple', 'verdadero_falso'])(
    '%s conserva la discriminación histórica aunque el flag diga recuperación', interaccion => {
      const t = Date.now()
      let p = nuevoProgreso('ALTERNATIVAS')
      for (const d of [0, 2, 5, 7]) p = programar(p, it3(t + d * DIA, {
        interaccion, recuperacion_activa: true, tipo_evidencia: 'recuerdo', evaluador_version: '2.2.0',
      }), t + d * DIA)
      const antes = structuredClone(p.intentos)
      expect(tipoEvidenciaDeIntento(p.intentos[0])).toBe('discriminacion')
      expect(evidenciaActiva(p.intentos[0])).toBe(false)
      const ev = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 7 * DIA)
      expect(ev.detalle.find(d => d.clave === 'aciertos')!.cumplido).toBe(true)
      expect(ev.detalle.find(d => d.clave === 'recuperacion')!.cumplido).toBe(false)
      expect(ev.cumple).toBe(false)
      expect(p.intentos).toEqual(antes)
    })
  it('un formato desconocido, un caso sin aplicación y flags contradictorios no prueban recuperación', () => {
    for (const extra of [
      { interaccion: 'formato-antiguo', tipo_evidencia: 'recuerdo' as const },
      { interaccion: 'caso_clinico', tipo_evidencia: undefined },
      { interaccion: 'recuperacion_libre', tipo_evidencia: 'discriminacion' as const },
      { interaccion: 'recuperacion_libre', recuperacion_activa: false, tipo_evidencia: 'recuerdo' as const },
      { interaccion: 'clasificar', tipo_evidencia: 'aplicacion' as const },
    ]) expect(tipoEvidenciaDeIntento(it3(1000, extra))).toBe('discriminacion')
    expect(tipoEvidenciaDeIntento(it3(1000))).toBe('recuerdo')
  })
  it.each([
    { pistas_usadas: 1 }, { fuente_consultada: true }, { explicacion_previa: true },
    { fuente_consultada: undefined }, { explicacion_previa: undefined },
    { resultado: 'parcial' as const }, { resultado: 'revision' as const }, { resultado: undefined },
  ])('la recuperación con ayuda o sin resultado comprobado no acredita la puerta: %j', ayuda => {
    const t = Date.now()
    const intentos = [0, 2, 5].map(d => it3(t + d * DIA, { interaccion: 'opcion_multiple', recuperacion_activa: false }))
    intentos.push(it3(t + 6 * DIA, ayuda))
    const p = { ...nuevoProgreso('GUIADA'), intentos }
    const ev = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 6 * DIA)
    expect(ev.detalle.find(d => d.clave === 'recuperacion')!.cumplido).toBe(false)
    expect(ev.cumple).toBe(false)
  })
  it('si un fallo descuenta el único recuerdo, los aciertos entre opciones no lo sustituyen', () => {
    const t = Date.now()
    const opcion = { interaccion: 'opcion_multiple', recuperacion_activa: false }
    const intentos = [0, 2, 4].map(d => it3(t + d * DIA, opcion))
    intentos.push(it3(t + 5 * DIA), it3(t + 6 * DIA, { resultado: 'incorrecta' }), it3(t + 8 * DIA, opcion))
    const ev = evaluarDominio({ ...nuevoProgreso('VIGENTE'), intentos }, CRITERIOS_POR_DEFECTO, t + 8 * DIA)
    expect(ev.detalle.find(d => d.clave === 'aciertos')!.valor).toBe('3')
    expect(ev.detalle.find(d => d.clave === 'recuperacion')!.cumplido).toBe(false)
    expect(ev.cumple).toBe(false)
  })
  it('los límites de 48 horas y siete días de confusión conservan sus fronteras', () => {
    const t = Date.now()
    const fallo = it3(t, { resultado: 'incorrecta', tipo_error: 'confusion_conceptos' })
    const intentos = [fallo, it3(t + DIA), it3(t + 2 * DIA), it3(t + 3 * DIA)]
    const p = { ...nuevoProgreso('FRONTERA'), intentos }
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 7 * DIA - 1).cumple).toBe(false)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 7 * DIA).cumple).toBe(true)
    const separacion = { ...p, intentos: [it3(t), it3(t + DIA), it3(t + 2 * DIA - 1)] }
    expect(evaluarDominio(separacion, CRITERIOS_POR_DEFECTO, t + 2 * DIA).detalle.find(d => d.clave === 'separacion')!.cumplido).toBe(false)
    separacion.intentos[2] = it3(t + 2 * DIA)
    expect(evaluarDominio(separacion, CRITERIOS_POR_DEFECTO, t + 2 * DIA).cumple).toBe(true)
  })
  it('acertar siempre con pistas impide el dominio', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA, { pistas_usadas: 2 }), t + d * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(false)
  })
  it('una confusión reciente bloquea el dominio', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    p = programar(p, { ...it3(t + 6 * DIA), resultado: 'incorrecta', calificacion: 1, tipo_error: 'confusion_conceptos' }, t + 6 * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 6 * DIA).cumple).toBe(false)
  })
  it('un concepto dominado que después falla pasa a reaprendizaje', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    p = { ...p, dominado_en: t + 5 * DIA }
    p = programar(p, { ...it3(t + 40 * DIA), resultado: 'incorrecta', calificacion: 1, tipo_error: 'desconocimiento' }, t + 40 * DIA)
    expect(calcularEstado(p, CRITERIOS_POR_DEFECTO, t + 40 * DIA)).toBe('reaprendizaje')
  })
  it('los criterios son configurables', () => {
    const t = Date.now()
    const p = programar(nuevoProgreso('X'), it3(t, { interaccion: 'opcion_multiple', recuperacion_activa: false }), t)
    // Desactivar la exigencia de recuperación permite acreditar sólo discriminación.
    const laxos = { ...CRITERIOS_POR_DEFECTO, exigirRecuperacionActiva: false,
      recuperaciones: 1, sesiones: 1, separacionHoras: 0 }
    expect(evaluarDominio(p, laxos, t).cumple).toBe(true)
    expect(evaluarDominio(p, laxos, t).detalle.some(d => d.clave === 'recuperacion')).toBe(false)
  })
  it('las etapas visibles progresan', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t)).toBe('exposicion')
    p = programar(p, { ...it3(t), resultado: 'incorrecta', calificacion: 1, tipo_error: 'desconocimiento' }, t)
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t)).toBe('comprension')
    p = programar(p, it3(t + DIA), t + DIA)
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t + DIA)).toBe('recuperacion')
    p = programar(p, it3(t + 2 * DIA), t + 2 * DIA)
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t + 2 * DIA)).toBe('consolidacion')
  })
  it('cuenta sesiones reales por UUID aunque ocurran el mismo día', () => {
    const t = Date.now()
    const criterios = { ...CRITERIOS_POR_DEFECTO, recuperaciones: 2, sesiones: 2, separacionHoras: 0 }
    let p = programar(nuevoProgreso('SES'), it3(t, { session_id: 'sesion-a', resultado: 'correcta' }), t)
    p = programar(p, it3(t + 1000, { session_id: 'sesion-b', resultado: 'correcta' }), t + 1000)
    expect(evaluarDominio(p, criterios, t + 1000).cumple).toBe(true)

    let misma = programar(nuevoProgreso('UNA'), it3(t, { session_id: 'sesion-a', resultado: 'correcta' }), t)
    misma = programar(misma, it3(t + 2 * DIA, { session_id: 'sesion-a', resultado: 'correcta' }), t + 2 * DIA)
    expect(evaluarDominio(misma, criterios, t + 2 * DIA).cumple).toBe(false)
  })
  it('consultar la fuente o la explicación impide acreditar independencia', () => {
    const t = Date.now()
    for (const ayuda of [{ fuente_consultada: true }, { explicacion_previa: true }, { pistas_usadas: 1 }]) {
      let p = nuevoProgreso('GUIADO')
      for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA, ayuda), t + d * DIA)
      expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(false)
    }
  })
  it('conserva los aciertos antiguos sin inventar que no hubo ayuda', () => {
    const t = Date.now()
    let p = nuevoProgreso('LEGADO')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA, {
      fuente_consultada: undefined, explicacion_previa: undefined,
    }), t + d * DIA)
    expect(p.aciertos).toBe(3)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA).cumple).toBe(false)
    expect(evidenciaIndependiente(it3(t, { resultado: undefined }))).toBe(false)
  })
  it('un hito histórico no oculta un fallo ni se restablece con un único acierto', () => {
    const t = Date.now()
    let p = nuevoProgreso('VIGENTE')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    p = { ...p, dominado_en: t + 5 * DIA }
    expect(dominioVigente(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)).toBe(true)
    p = programar(p, it3(t + 6 * DIA, { resultado: 'incorrecta', tipo_error: 'interpretacion_incorrecta' }), t + 6 * DIA)
    expect(dominioVigente(p, CRITERIOS_POR_DEFECTO, t + 6 * DIA)).toBe(false)
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t + 6 * DIA)).not.toBe('dominio')
    p = programar(p, it3(t + 7 * DIA), t + 7 * DIA)
    expect(dominioVigente(p, CRITERIOS_POR_DEFECTO, t + 7 * DIA)).toBe(false)
    expect(p.dominado_en).toBe(t + 5 * DIA)
  })
  it('una respuesta pendiente de revisión no se cuenta como éxito ni como fallo nuevo', () => {
    const t = Date.now()
    let p = nuevoProgreso('REVISION')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    p = { ...p, dominado_en: t + 5 * DIA }
    p = programar(p, it3(t + 5 * DIA + 1000, { resultado: 'revision', tipo_error: 'error_por_revisar' }), t + 5 * DIA + 1000)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA + 1000).cumple).toBe(true)
    expect(calcularEstado(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA + 1000)).toBe('dominado')
  })
  it('la etapa visible se reconstruye tras un fallo sin borrar los aciertos históricos', () => {
    const t = Date.now()
    let p = nuevoProgreso('ETAPA-VIGENTE')
    for (const d of [0, 2]) p = programar(p, it3(t + d * DIA), t + d * DIA)
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t + 2 * DIA)).toBe('consolidacion')
    p = programar(p, it3(t + 3 * DIA, { resultado: 'incorrecta', tipo_error: 'desconocimiento' }), t + 3 * DIA)
    expect(etapa(p, CRITERIOS_POR_DEFECTO, t + 3 * DIA)).toBe('comprension')
    expect(p.aciertos).toBe(2)
    expect(resumenDominio(p, CRITERIOS_POR_DEFECTO, t + 3 * DIA).texto).toContain('0/3 aciertos independientes')
  })
  it('cero aciertos independientes nunca se muestran como próximo dominio', () => {
    const t = Date.now()
    const laxos = { ...CRITERIOS_POR_DEFECTO, recuperaciones: 1, sesiones: 1, separacionHoras: 0 }
    const p = programar(nuevoProgreso('CERO'), it3(t, { explicacion_previa: true }), t)
    expect(calcularEstado(p, laxos, t)).toBe('en_aprendizaje')
  })
  it('los reintentos tras ver la solución no inflan el dominio y el resumen muestra qué falta', () => {
    const t = Date.now()
    let p = programar(nuevoProgreso('REINTENTOS'), it3(t, {
      session_id: 'misma-sesion', resultado: 'incorrecta', tipo_error: 'desconocimiento',
    }), t)
    for (const minuto of [1, 2, 3]) p = programar(p, it3(t + minuto * 60_000, {
      session_id: 'misma-sesion', explicacion_previa: true,
    }), t + minuto * 60_000)
    expect(p.aciertos).toBe(3)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 180_000).cumple).toBe(false)
    const resumen = resumenDominio(p, CRITERIOS_POR_DEFECTO, t + 180_000)
    expect(resumen.texto).toBe('Dominio: 0/3 aciertos independientes · 0/2 sesiones · retención estimada hoy 100 %')
    expect(resumen.pendientes).toContain('separadas ≥ 48 h')
  })
  it('términos breves y selección múltiple pueden acreditar dominio con evidencia independiente', () => {
    const t = Date.now()
    let p = nuevoProgreso('FORMATOS')
    for (const [n, interaccion] of ['completar', 'opcion_multiple', 'recuperacion_libre'].entries()) {
      const ts = t + n * 2.5 * DIA
      p = programar(p, it3(ts, { session_id: `sesion-${n}`, interaccion,
        recuperacion_activa: interaccion !== 'opcion_multiple' }), ts)
    }
    expect(resumenDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)).toEqual({
      texto: 'Dominio acreditado · retención estimada hoy 100 %', pendientes: [] })
    expect(resumenDominio(p, CRITERIOS_POR_DEFECTO, p.proxima! + 1).texto).toContain('repaso pendiente')
  })
})

describe('migración de los criterios guardados', () => {
  it('cada generación anterior se reconoce exactamente', () => {
    expect(sonCriteriosHeredados(CRITERIOS_HEREDADOS)).toBe(true)
    expect(sonCriteriosHeredados(CRITERIOS_96H)).toBe(true)
    expect(sonCriteriosHeredados(CRITERIOS_POR_DEFECTO)).toBe(false)
    // Un valor tocado a mano ya no es «heredado» y no se debe pisar.
    expect(sonCriteriosHeredados({ ...CRITERIOS_HEREDADOS, separacionHoras: 48 })).toBe(false)
    expect(sonCriteriosHeredados({ ...CRITERIOS_HEREDADOS, recuperaciones: 4 })).toBe(false)
    expect(sonCriteriosHeredados({ ...CRITERIOS_96H, recuperaciones: 4 })).toBe(false)
  })
  it('los criterios vigentes piden 48 h de separación', () => {
    expect(CRITERIOS_POR_DEFECTO.separacionHoras).toBe(48)
    expect(CRITERIOS_POR_DEFECTO.ventanaConfusionDias).toBe(7)
    expect(CRITERIOS_HEREDADOS.separacionHoras).toBe(20)
    expect(CRITERIOS_96H.separacionHoras).toBe(96)
  })
})
