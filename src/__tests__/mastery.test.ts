import { describe, it, expect } from 'vitest'
import { nuevoProgreso, programar, DIA } from '../srs/fsrs'
import { CRITERIOS_POR_DEFECTO, CRITERIOS_HEREDADOS, sonCriteriosHeredados, evaluarDominio, calcularEstado, dominioVigente, evidenciaIndependiente, etapa, resumenDominio } from '../srs/mastery'
import type { Intento } from '../srs/tipos'

const it3 = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  ts, calificacion: 3, interaccion: 'recuperacion_libre', recuperacion_activa: true,
  pistas_usadas: 0, ms: 3000, tipo_error: 'ninguno', confianza_declarada: 3,
  resultado: 'correcta', fuente_consultada: false, explicacion_previa: false, ...extra,
})

describe('criterios de dominio', () => {
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
  it('el reconocimiento puro exige un acierto más que el recuerdo libre', () => {
    const t = Date.now()
    const mcq = { recuperacion_activa: false, interaccion: 'opcion_multiple' }
    let p = nuevoProgreso('X')
    for (const d of [0, 2, 5]) p = programar(p, it3(t + d * DIA, mcq), t + d * DIA)
    // Tres aciertos entre tres opciones se consiguen por azar 1 de cada 27 veces; cuatro, 1 de 81.
    const tres = evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)
    expect(tres.requeridas).toBe(4)
    expect(tres.cumple).toBe(false)
    p = programar(p, it3(t + 7 * DIA, mcq), t + 7 * DIA)
    expect(evaluarDominio(p, CRITERIOS_POR_DEFECTO, t + 7 * DIA).cumple).toBe(true)
  })
  it('un solo recuerdo libre devuelve el umbral normal de tres aciertos', () => {
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
    const p = programar(nuevoProgreso('X'), it3(t), t)
    const laxos = { ...CRITERIOS_POR_DEFECTO, recuperaciones: 1, sesiones: 1, separacionHoras: 0 }
    expect(evaluarDominio(p, laxos, t).cumple).toBe(true)
  })
  it('las etapas visibles progresan', () => {
    const t = Date.now()
    let p = nuevoProgreso('X')
    expect(etapa(p)).toBe('exposicion')
    p = programar(p, { ...it3(t), resultado: 'incorrecta', calificacion: 1, tipo_error: 'desconocimiento' }, t)
    expect(etapa(p)).toBe('comprension')
    p = programar(p, it3(t + DIA), t + DIA)
    expect(etapa(p)).toBe('recuperacion')
    p = programar(p, it3(t + 2 * DIA), t + 2 * DIA)
    expect(etapa(p)).toBe('consolidacion')
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
    expect(resumen.texto).toBe('Dominio: 0/3 aciertos independientes · 0/2 sesiones')
    expect(resumen.pendientes).toContain('separadas ≥ 96 h')
  })
  it('términos breves y selección múltiple pueden acreditar dominio con evidencia independiente', () => {
    const t = Date.now()
    let p = nuevoProgreso('FORMATOS')
    for (const [n, interaccion] of ['completar', 'opcion_multiple', 'recuperacion_libre'].entries()) {
      const ts = t + n * 2.5 * DIA
      p = programar(p, it3(ts, { session_id: `sesion-${n}`, interaccion,
        recuperacion_activa: interaccion !== 'opcion_multiple' }), ts)
    }
    expect(resumenDominio(p, CRITERIOS_POR_DEFECTO, t + 5 * DIA)).toEqual({ texto: 'Dominio acreditado', pendientes: [] })
    expect(resumenDominio(p, CRITERIOS_POR_DEFECTO, p.proxima! + 1).texto).toContain('repaso pendiente')
  })
})

describe('migración de los criterios guardados', () => {
  it('los criterios heredados se reconocen exactamente', () => {
    expect(sonCriteriosHeredados(CRITERIOS_HEREDADOS)).toBe(true)
    expect(sonCriteriosHeredados(CRITERIOS_POR_DEFECTO)).toBe(false)
    // Un valor tocado a mano ya no es «heredado» y no se debe pisar.
    expect(sonCriteriosHeredados({ ...CRITERIOS_HEREDADOS, separacionHoras: 48 })).toBe(false)
    expect(sonCriteriosHeredados({ ...CRITERIOS_HEREDADOS, recuperaciones: 4 })).toBe(false)
  })
  it('los criterios endurecidos no son los heredados', () => {
    expect(CRITERIOS_POR_DEFECTO.separacionHoras).toBe(96)
    expect(CRITERIOS_POR_DEFECTO.ventanaConfusionDias).toBe(7)
    expect(CRITERIOS_HEREDADOS.separacionHoras).toBe(20)
    expect(CRITERIOS_HEREDADOS.ventanaConfusionDias).toBe(14)
  })
})
