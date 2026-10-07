import { ConceptoZ } from '../schema/concept'
import { nuevoProgreso } from '../srs/fsrs'
import type { Intento } from '../srs/tipos'

/** Reglas inventadas: prueban continuidad y selección, sin incorporar material privado. */
export function conceptoConAplicacion(id: string) {
  const respuesta = 'A gate permits the signal only when the input reaches its configured threshold'
  return ConceptoZ.parse({ concept_id: id, objetivo: 'Apply a synthetic gate rule',
    source: { doc: 'QA', doc_title: 'Synthetic gate rules', page: 1, item_id: id, fragment: respuesta },
    afirmacion: respuesta, respuesta_canonica: respuesta, explicacion: respuesta,
    interaccion: { recomendada: 'opcion_multiple' },
    evaluacion: { pregunta: 'Which rule governs the synthetic gate?', opciones: [
      { texto: respuesta, correcta: true }, { texto: 'The gate ignores its input', correcta: false },
      { texto: 'The gate changes its threshold after every signal', correcta: false },
    ] }, pistas: ['Compare the rule', 'Compare the input', 'Compare the threshold'],
    step: 'step1', calidad: { confianza: .9, estado: 'aprobado' },
    clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Renal', tema: 'Synthetic', tipo_conocimiento: 'Mecanismo', dificultad: 1 },
    variantes: [1, 2].map(n => ({ variant_id: `${id}-APP-${n}`, nivel: 'aplicacion',
      pregunta: `A synthetic gate requires an input of at least 8. The recorded input is ${n === 1 ? 10 : 6}. Predict the output.`,
      opciones: [{ texto: 'Signal passes', correcta: n === 1 }, { texto: 'Signal blocked', correcta: n === 2 },
        { texto: 'Threshold changes spontaneously', correcta: false }],
      explicacion: `The input is ${n === 1 ? 'above' : 'below'} the fixed threshold.` })),
  })
}

export function intentoSintetico(extra: Partial<Intento> = {}): Intento {
  return { ts: Date.now() - 86_400_000, ms: 1000, resultado: 'incorrecta', calificacion: 1,
    interaccion: 'opcion_multiple', recuperacion_activa: false, pistas_usadas: 0,
    tipo_error: 'desconocimiento', fuente_consultada: false, explicacion_previa: false,
    confianza_declarada: null, ...extra }
}
export const progresoConIntentos = (id: string, intentos: Intento[] = [intentoSintetico()]) => ({
  ...nuevoProgreso(id), intentos,
})
