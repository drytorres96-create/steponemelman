import { describe, expect, it } from 'vitest'
import { ConceptoZ, type Concepto, type Interaccion } from '../schema/concept'
import { nuevoProgreso } from '../srs/fsrs'
import { CRITERIOS_POR_DEFECTO, aciertosVigentes } from '../srs/mastery'
import type { Intento } from '../srs/tipos'
import { aplicarVariante } from './variantes'
import { prepararPracticaConcepto } from './practica-aplicacion'

const concepto = ConceptoZ.parse({
  concept_id: 'QA-LONG', source: { doc: 'QA', doc_title: 'Synthetic fixture', page: 1, item_id: 'QA-LONG', fragment: 'Synthetic mechanism only.' },
  objetivo: 'Apply a synthetic mechanism', afirmacion: 'Substrate binding activates a downstream signal.',
  respuesta_canonica: 'Binding of substrate activates a downstream intracellular signal',
  explicacion: 'This synthetic question compares three mechanisms.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'QA', tipo_conocimiento: 'Mecanismo', dificultad: 2 },
  step: 'step1', interaccion: { recomendada: 'opcion_multiple', permitidas: ['opcion_multiple', 'recuperacion_libre'] },
  evaluacion: { pregunta: 'Which mechanism follows binding of the synthetic substrate?', opciones: [
    { texto: 'Binding of substrate activates a downstream intracellular signal', correcta: true },
    { texto: 'Substrate binding blocks all intracellular signals', correcta: false },
    { texto: 'Substrate binding removes the synthetic receptor', correcta: false },
  ] }, pistas: ['Compare signals', 'Consider the receptor', 'Follow the downstream effect'],
  calidad: { estado: 'aprobado', confianza: 1 },
  variantes: ['a1', 'a2'].map(id => ({ variant_id: `QA-LONG-${id}`, nivel: 'aplicacion',
    pregunta: `A synthetic downstream signal is lost after receptor blockade (${id}). What explains this result?`,
    opciones: [{ texto: 'Loss of receptor signaling', correcta: true }, { texto: 'Excess receptor signaling', correcta: false }, { texto: 'Unaffected receptor signaling', correcta: false }],
    explicacion: 'The synthetic receptor is required for the downstream signal.' })),
})

const intento = (extra: Partial<Intento> = {}): Intento => ({
  ts: 1000, calificacion: 3, resultado: 'correcta', interaccion: 'opcion_multiple',
  recuperacion_activa: false, pistas_usadas: 0, ms: 1000, tipo_error: 'ninguno', confianza_declarada: null,
  fuente_consultada: false, explicacion_previa: false, ...extra,
})
const progreso = (intentos: Intento[] = [intento()]) => ({ ...nuevoProgreso(concepto.concept_id), intentos })
const activa = (extra: Partial<Intento> = {}) => intento({ interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo', ...extra })

describe('aplicación de mecanismos largos al crear una práctica', () => {
  it('ofrece una variante revisada sin modificar concepto, historial, créditos ni criterios', () => {
    const p = progreso()
    const antes = JSON.stringify({ concepto, p, criterios: CRITERIOS_POR_DEFECTO })
    const preparada = prepararPracticaConcepto(concepto, p, CRITERIOS_POR_DEFECTO, { ruta: 'repaso' })
    expect(preparada).toMatchObject({ concept_id: concepto.concept_id, variante_id: 'QA-LONG-a1', interaccion: { recomendada: 'caso_clinico' } })
    expect(preparada.source).toBe(concepto.source)
    expect(preparada.evaluacion.pregunta).toBe(concepto.variantes![0].pregunta)
    expect(JSON.stringify({ concepto, p, criterios: CRITERIOS_POR_DEFECTO })).toBe(antes)
  })

  it.each([undefined, progreso([]), progreso([intento({ resultado: 'revision' })])])('conserva la primera exposición o una respuesta todavía por revisar', p => {
    expect(prepararPracticaConcepto(concepto, p, CRITERIOS_POR_DEFECTO)).toBe(concepto)
  })

  it.each(['incorrecta', 'parcial'] as const)('una respuesta resuelta %s permite aplicar en la próxima práctica', resultado => {
    expect(prepararPracticaConcepto(concepto, progreso([intento({ resultado })]), CRITERIOS_POR_DEFECTO).variante_id).toBe('QA-LONG-a1')
  })

  it('respeta el criterio guardado y mantiene las respuestas breves en su práctica habitual', () => {
    expect(prepararPracticaConcepto(concepto, progreso(), { exigirRecuperacionActiva: false })).toBe(concepto)
    for (const respuesta_canonica of ['Short synthetic answer', 'one two three four five six']) {
      const breve = { ...concepto, respuesta_canonica }
      expect(prepararPracticaConcepto(breve, progreso(), CRITERIOS_POR_DEFECTO)).toBe(breve)
    }
  })

  it('respeta evidencia activa vigente sin convertir el flag antiguo de MCQ en recuerdo', () => {
    expect(prepararPracticaConcepto(concepto, progreso([activa()]), CRITERIOS_POR_DEFECTO)).toBe(concepto)
    expect(prepararPracticaConcepto(concepto, progreso([intento({ recuperacion_activa: true })]), CRITERIOS_POR_DEFECTO).variante_id).toBe('QA-LONG-a1')
    expect(prepararPracticaConcepto(concepto, progreso([intento({ interaccion: 'caso_clinico', tipo_evidencia: 'aplicacion' })]), CRITERIOS_POR_DEFECTO)).toBe(concepto)
  })

  it.each([{ pistas_usadas: 1 }, { fuente_consultada: true }, { explicacion_previa: true }])('un recuerdo asistido no sustituye evidencia activa independiente: %j', ayuda => {
    expect(prepararPracticaConcepto(concepto, progreso([activa(ayuda)]), CRITERIOS_POR_DEFECTO).variante_id).toBe('QA-LONG-a1')
  })

  it('usa el descuento vigente de dos aciertos al fallar, conservando la evidencia antigua que aún cuenta', () => {
    const conservada = progreso([activa(), intento({ ts: 2000 }), intento({ ts: 3000 }), intento({ ts: 4000, resultado: 'incorrecta' })])
    expect(aciertosVigentes(conservada)).toHaveLength(1)
    expect(prepararPracticaConcepto(concepto, conservada, CRITERIOS_POR_DEFECTO)).toBe(concepto)
    const descontada = progreso([activa(), intento({ ts: 2000 }), intento({ ts: 3000, resultado: 'incorrecta' })])
    expect(aciertosVigentes(descontada)).toHaveLength(0)
    expect(prepararPracticaConcepto(concepto, descontada, CRITERIOS_POR_DEFECTO).variante_id).toBe('QA-LONG-a1')
  })

  it('elige aplicación menos vista y conserva el orden editorial en empates', () => {
    const p = progreso([intento({ variante_id: 'QA-LONG-a1' }), intento({ ts: 2000, variante_id: 'QA-LONG-a1' })])
    expect(prepararPracticaConcepto(concepto, p, CRITERIOS_POR_DEFECTO).variante_id).toBe('QA-LONG-a2')
    expect(prepararPracticaConcepto(concepto, progreso(), CRITERIOS_POR_DEFECTO).variante_id).toBe('QA-LONG-a1')
  })

  it('conserva las variantes ya seleccionadas y toda restauración, incluidas versiones antiguas', () => {
    const seleccionada = aplicarVariante(concepto, 'QA-LONG-a2')
    expect(prepararPracticaConcepto(seleccionada, progreso(), CRITERIOS_POR_DEFECTO)).toBe(seleccionada)
    for (const contexto of [{ restaurando: true }, { versionFormato: 1 as const }, { versionFormato: 2 as const }, { ruta: 'examen' }]) {
      expect(prepararPracticaConcepto(concepto, progreso(), CRITERIOS_POR_DEFECTO, contexto)).toBe(concepto)
    }
    expect(prepararPracticaConcepto(concepto, progreso(), CRITERIOS_POR_DEFECTO, { versionFormato: 3 }).variante_id).toBe('QA-LONG-a1')
  })

  it.each(['caso_clinico', 'relacionar', 'secuencia', 'clasificar', 'numerico', 'prediccion_direccional', 'visual', 'simulador', 'verdadero_falso'] as Interaccion[])('preserva la actividad propia %s', recomendada => {
    const propia: Concepto = { ...concepto, interaccion: { ...concepto.interaccion, recomendada } }
    expect(prepararPracticaConcepto(propia, progreso(), CRITERIOS_POR_DEFECTO)).toBe(propia)
  })

  it.each(['recuperacion_libre', 'completar', 'tarjeta', 'escritura_correctiva'] as Interaccion[])('un formato escrito convertido con alternativas válidas puede aplicar: %s', recomendada => {
    const convertida: Concepto = { ...concepto, interaccion: { ...concepto.interaccion, recomendada } }
    expect(prepararPracticaConcepto(convertida, progreso(), CRITERIOS_POR_DEFECTO).variante_id).toBe('QA-LONG-a1')
  })

  it('mantiene la base cuando no existen aplicación revisada, alternativas válidas o calidad aprobada', () => {
    const sinCaso = { ...concepto, variantes: concepto.variantes!.map(v => ({ ...v, nivel: 'discriminacion' as const })) }
    const sinOpciones = { ...concepto, evaluacion: { ...concepto.evaluacion, opciones: null } }
    const pendiente = { ...concepto, calidad: { ...concepto.calidad, estado: 'cuarentena' as const } }
    for (const c of [sinCaso, sinOpciones, pendiente]) expect(prepararPracticaConcepto(c, progreso(), CRITERIOS_POR_DEFECTO)).toBe(c)
  })

  it('no usa intentos futuros al consultar una práctica en una fecha explícita', () => {
    expect(prepararPracticaConcepto(concepto, progreso([intento({ ts: 2000 })]), CRITERIOS_POR_DEFECTO, { ahora: 1000 })).toBe(concepto)
    const p = progreso([intento(), activa({ ts: 3000 })])
    expect(prepararPracticaConcepto(concepto, p, CRITERIOS_POR_DEFECTO, { ahora: 2000 }).variante_id).toBe('QA-LONG-a1')
    expect(prepararPracticaConcepto(concepto, p, CRITERIOS_POR_DEFECTO, { ahora: 3000 })).toBe(concepto)
  })

  it('por omisión no usa un intento futuro como exposición previa ni como evidencia activa vigente', () => {
    const futura = Date.now() + 3_600_000
    expect(prepararPracticaConcepto(concepto, progreso([intento({ ts: futura })]), CRITERIOS_POR_DEFECTO)).toBe(concepto)
    expect(prepararPracticaConcepto(concepto, progreso([intento(), activa({ ts: futura })]), CRITERIOS_POR_DEFECTO).variante_id).toBe('QA-LONG-a1')
  })
})
