import { ConceptoZ, type Concepto } from '../../src/schema/concept'

/** Gate rules are invented for UI integration; there is no medical source here. */
export const IDS_APLICACION = ['QA-APLICACION', 'QA-NUEVO', 'QA-CORTO']
export const CANONICA_LARGA = 'The blue token opens gate one only after the amber counter reaches its threshold.'
export const PREGUNTA_BASE = 'In the demonstration protocol, which complete rule governs the blue token?'
export const PREGUNTA_NUEVA = 'For your first demonstration trial, which complete rule governs the blue token?'
export const PREGUNTA_CASO = 'A simulated operator has a blue token and an amber counter below its threshold. Which gate action follows from the demonstration rule?'
export const RESPUESTA_CASO = 'Keep gate one closed until the amber counter reaches its threshold.'
export const VARIANTE_NUEVA = 'QA-APLICACION-caso-2'

export function conceptoAplicacionSintetico(id: string): Concepto {
  const corto = id === 'QA-CORTO'
  return ConceptoZ.parse({
    concept_id: id,
    source: { doc: 'QA', doc_title: 'Invented gate rules', page: 1, item_id: id, fragment: 'An invented token protocol for browser testing.' },
    objetivo: corto ? 'Recall the synthetic first token' : id === 'QA-NUEVO' ? 'Learn the synthetic gate rule' : 'Apply the synthetic gate rule',
    afirmacion: corto ? 'The first synthetic token is alpha.' : CANONICA_LARGA,
    respuesta_canonica: corto ? 'alpha' : CANONICA_LARGA,
    explicacion: corto ? 'Alpha is the first token in this invented list.' : 'The invented rule requires a blue token and a counter at its threshold before gate one can open.',
    distractores_cercanos: [],
    clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Renal', tema: 'Invented gate protocol', tipo_conocimiento: 'Relación causa-efecto', dificultad: 1 },
    step: 'step1',
    interaccion: { recomendada: corto ? 'recuperacion_libre' : 'opcion_multiple', permitidas: corto ? ['recuperacion_libre'] : ['opcion_multiple'] },
    evaluacion: corto ? { pregunta: 'Which token is first in the invented list?' } : {
      pregunta: id === 'QA-NUEVO' ? PREGUNTA_NUEVA : PREGUNTA_BASE,
      opciones: [
        { texto: CANONICA_LARGA, correcta: true },
        { texto: 'The blue token opens gate one before the amber counter reaches its threshold.', correcta: false, por_que: 'The counter must first reach its threshold.' },
        { texto: 'The blue token opens gate two only after the amber counter reaches its threshold.', correcta: false, por_que: 'The rule names gate one.' },
        { texto: 'The red token opens gate one only after the amber counter reaches its threshold.', correcta: false, por_que: 'The rule requires a blue token.' },
      ],
    },
    pistas: ['Identify the token.', 'Check the counter.', 'Check the gate.'],
    calidad: { confianza: 1, estado: 'aprobado' },
    ...(!corto ? { variantes: [
      { variant_id: `${id}-caso-1`, nivel: 'aplicacion',
        pregunta: 'A simulated operator has a blue token and an amber counter at its threshold. Which gate may open under the demonstration rule?',
        opciones: [{ texto: 'Gate one may open.', correcta: true }, { texto: 'Only gate two may open.', correcta: false }, { texto: 'Both gates must remain closed.', correcta: false }],
        explicacion: 'The blue token and the reached threshold meet both conditions for gate one.' },
      { variant_id: `${id}-caso-2`, nivel: 'aplicacion', pregunta: PREGUNTA_CASO,
        opciones: [{ texto: RESPUESTA_CASO, correcta: true }, { texto: 'Open gate one before the counter reaches its threshold.', correcta: false }, { texto: 'Open gate two as soon as the blue token is presented.', correcta: false }],
        explicacion: 'The blue token alone is insufficient: the amber counter must reach its threshold before gate one can open.' },
    ] } : {}),
  })
}
