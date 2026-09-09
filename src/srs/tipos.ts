export type EstadoDominio =
  | 'nuevo' | 'en_aprendizaje' | 'en_consolidacion' | 'proximo_dominio'
  | 'dominado' | 'requiere_repaso' | 'reaprendizaje'

export const NOMBRE_ESTADO: Record<EstadoDominio, string> = {
  nuevo: 'Nuevo', en_aprendizaje: 'En aprendizaje', en_consolidacion: 'En consolidación',
  proximo_dominio: 'Próximo a dominarse', dominado: 'Dominado',
  requiere_repaso: 'Requiere repaso', reaprendizaje: 'Reaprendizaje',
}

/** Taxonomía de errores: la adaptación posterior depende de esta clasificación. */
export type TipoError =
  | 'desconocimiento' | 'recuerdo_incompleto' | 'confusion_conceptos' | 'interpretacion_incorrecta'
  | 'error_mecanistico' | 'error_secuencia' | 'error_numerico' | 'error_unidad' | 'error_ortografico'
  | 'correcta_con_pistas' | 'correcta_baja_confianza' | 'incorrecta_exceso_confianza' | 'ninguno'

export const NOMBRE_ERROR: Record<TipoError, string> = {
  desconocimiento: 'Desconocimiento', recuerdo_incompleto: 'Recuerdo incompleto',
  confusion_conceptos: 'Confusión entre conceptos', interpretacion_incorrecta: 'Interpretación incorrecta',
  error_mecanistico: 'Error mecanístico', error_secuencia: 'Error de secuencia',
  error_numerico: 'Error numérico', error_unidad: 'Error de unidad', error_ortografico: 'Error ortográfico',
  correcta_con_pistas: 'Correcta con demasiadas pistas', correcta_baja_confianza: 'Correcta con baja confianza',
  incorrecta_exceso_confianza: 'Incorrecta con exceso de confianza', ninguno: 'Sin error',
}

export interface Intento {
  /** Identificadores opcionales para poder leer historiales anteriores a 1.0.1. */
  attempt_id?: string
  session_id?: string | null
  ts: number
  calificacion: 1 | 2 | 3 | 4          // otra vez / difícil / bien / fácil
  /** El resultado comprobable manda sobre la autoevaluación al programar. */
  resultado?: 'correcta' | 'parcial' | 'incorrecta' | 'ortografia'
  interaccion: string
  recuperacion_activa: boolean          // recuperación libre / escritura, frente a reconocimiento
  pistas_usadas: number
  ms: number
  tipo_error: TipoError
  confianza_declarada: 1 | 2 | 3 | null
}

/** Compatibilidad: los intentos antiguos no guardaban un veredicto objetivo. */
export function intentoCorrecto(i: Intento): boolean {
  return i.resultado
    ? i.resultado === 'correcta' || i.resultado === 'ortografia'
    : i.calificacion >= 3
}

export interface ProgresoConcepto {
  concept_id: string
  estado: EstadoDominio
  dificultad: number      // D del modelo, 1..10
  estabilidad: number     // S del modelo, en días
  ultimo: number | null   // timestamp
  proxima: number | null  // timestamp de la próxima revisión
  intentos: Intento[]
  aciertos: number
  fallos: number
  dominado_en: number | null
}
