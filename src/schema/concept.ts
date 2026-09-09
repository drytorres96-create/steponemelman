import { z } from 'zod'

export const DISCIPLINAS = ['Anatomía','Bioquímica','Bioestadística','Ciencias del comportamiento','Embriología',
  'Farmacología','Fisiología','Genética','Histología','Inmunología','Microbiología','Patología','Ética médica'] as const
export const SISTEMAS = ['Cardiovascular','Endocrino','Gastrointestinal','Hematológico y oncológico',
  'Musculoesquelético','Neurológico','Renal','Reproductivo','Respiratorio','Multisistémico'] as const
export const TIPOS = ['Definición','Asociación','Mecanismo','Secuencia','Comparación','Diagnóstico','Hallazgo clínico',
  'Tratamiento','Efecto adverso','Relación estructura-función','Relación causa-efecto','Dato cuantitativo','Cálculo',
  'Patrón visual','Algoritmo','Terminología'] as const
export const INTERACCIONES = ['recuperacion_libre','tarjeta','opcion_multiple','caso_clinico','verdadero_falso',
  'completar','relacionar','secuencia','clasificar','numerico','prediccion_direccional','simulador','visual',
  'escritura_correctiva'] as const

export type Interaccion = (typeof INTERACCIONES)[number]
export type Disciplina = (typeof DISCIPLINAS)[number]
export type Sistema = (typeof SISTEMAS)[number]

export const NOMBRE_INTERACCION: Record<Interaccion, string> = {
  recuperacion_libre: 'Recuperación libre', tarjeta: 'Tarjeta conceptual', opcion_multiple: 'Opción múltiple',
  caso_clinico: 'Caso clínico', verdadero_falso: 'Verdadero o falso', completar: 'Completar',
  relacionar: 'Relacionar columnas', secuencia: 'Ordenar secuencia', clasificar: 'Clasificar',
  numerico: 'Respuesta numérica', prediccion_direccional: 'Predicción direccional', simulador: 'Simulador',
  visual: 'Interacción visual', escritura_correctiva: 'Escritura correctiva',
}

const OpcionZ = z.object({
  texto: z.string().min(1),
  correcta: z.boolean(),
  por_que: z.string().nullish().transform(v => v ?? ''),
})
const FlechaZ = z.object({ variable: z.string().min(1), direccion: z.enum(['sube','baja','sin_cambio']) })

export const ConceptoZ = z.object({
  concept_id: z.string().min(3),
  source: z.object({
    doc: z.string(), doc_title: z.string(), page: z.number().int().positive(),
    item_id: z.string(), fragment: z.string().min(1),
  }),
  fuentes_adicionales: z.array(z.object({ doc: z.string(), page: z.number(), item_id: z.string() })).optional(),
  objetivo: z.string().min(1),
  afirmacion: z.string().min(1),
  respuesta_canonica: z.string().min(1),
  sinonimos: z.array(z.string()).default([]),
  distractores_cercanos: z.array(z.object({ texto: z.string(), por_que_incorrecto: z.string().optional().default('') })).default([]),
  explicacion: z.string().min(1),
  contexto: z.string().nullable().optional(),
  confusiones: z.array(z.string()).default([]),
  prerrequisitos: z.array(z.string()).default([]),
  relacionados: z.array(z.string()).default([]),
  clasificacion: z.object({
    disciplina_primaria: z.enum(DISCIPLINAS),
    disciplinas_secundarias: z.array(z.enum(DISCIPLINAS)).default([]),
    sistema_primario: z.enum(SISTEMAS),
    sistemas_secundarios: z.array(z.enum(SISTEMAS)).default([]),
    tema: z.string(), subtema: z.string().nullish().transform(v => v ?? ''),
    tipo_conocimiento: z.enum(TIPOS),
    dificultad: z.number().int().min(1).max(3),
  }),
  step: z.enum(['step1','step1_2','step2']),
  interaccion: z.object({
    recomendada: z.enum(INTERACCIONES),
    permitidas: z.array(z.enum(INTERACCIONES)).default([]),
    prohibidas: z.array(z.enum(INTERACCIONES)).default([]),
  }),
  evaluacion: z.object({
    pregunta: z.string().min(1),
    opciones: z.array(OpcionZ).nullable().optional(),
    respuestas_aceptadas: z.array(z.string()).default([]),
    unidad: z.string().nullable().optional(),
    tolerancia: z.number().nullable().optional(),
    flechas: z.array(FlechaZ).nullable().optional(),
    pasos: z.array(z.string()).nullable().optional(),
    pares: z.array(z.object({ izquierda: z.string(), derecha: z.string() })).nullable().optional(),
    grupos: z.array(z.object({ nombre: z.string(), elementos: z.array(z.string()) })).nullable().optional(),
  }),
  pistas: z.array(z.string()).length(3),
  patron: z.string().nullable().optional(),
  escritura_correctiva: z.object({ elegible: z.boolean(), termino: z.string().nullable() }).default({ elegible: false, termino: null }),
  calidad: z.object({
    confianza: z.number().min(0).max(1),
    estado: z.enum(['aprobado','cuarentena']),
    alertas: z.array(z.string()).default([]),
    motivo: z.string().nullable().optional(),
  }),
})
export type Concepto = z.infer<typeof ConceptoZ>

export const SesionZ = z.object({ session_id: z.string(), titulo: z.string(), objetivo: z.string(), conceptos: z.array(z.string()) })
export const ModuloZ = z.object({
  module_id: z.string(), nombre: z.string(), proposito: z.string(), prerrequisitos: z.array(z.string()),
  disciplinas: z.array(z.string()), sistemas: z.array(z.string()), temas: z.array(z.string()),
  n_conceptos: z.number(), minutos_estimados: z.number(), cobertura_documental: z.array(z.string()),
  sesiones: z.array(SesionZ), orden: z.number(),
})
export type Modulo = z.infer<typeof ModuloZ>

export const IndiceZ = z.object({
  schema_version: z.string(), corpus_version: z.string().default('1.0.0'), n_conceptos: z.number(), modulos: z.array(ModuloZ),
  glosario: z.array(z.object({ sigla: z.string(), termino: z.string(), concept_id: z.string(), disciplina: z.string() })),
  documentos: z.array(z.string()), cuarentena: z.number(),
})
export type Indice = z.infer<typeof IndiceZ>
