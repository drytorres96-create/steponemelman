import { z } from 'zod'
import type { NbmeCatalog, NbmeQuestion } from './types'
import { preguntaConLecturasDudosas } from './texto'

const text = z.string()
const conceptLink = z.object({ conceptId: text, relation: z.enum(['tested', 'foundation']),
  confidence: z.number().finite(), review: z.enum(['suggested', 'reviewed']) })
const meta = z.object({
  id: text.min(1), revision: text.min(1), form: z.enum(['27', '28', '29']),
  section: z.number().int(), item: z.number().int(), page: z.number().int(),
  systems: z.array(text), disciplines: z.array(text), topic: text, objective: text.nullable(),
  status: z.enum(['ready', 'blocked']), reasons: z.array(text), figureRequired: z.boolean(),
  conceptLinks: z.array(conceptLink),
  taxonomy: z.object({ method: text, confidence: z.number().finite(), review: z.enum(['suggested', 'reviewed']) }).optional(),
})
const catalogSchema = z.object({ schemaVersion: z.literal(1), bankVersion: text.min(1),
  total: z.number().int().nonnegative(), questions: z.array(meta) })
const questionSchema = meta.extend({ stem: text.min(1), options: z.array(z.object({ id: text.min(1), text: text.min(1) })),
  answer: text.nullable(), explanation: text.nullable(), distractorExplanations: z.record(text).optional(),
  figures: z.array(z.object({ assetId: text.min(1), alt: text })),
  provenance: z.object({ sourceFile: text, sourceRecordId: text, notes: z.array(text) }).passthrough(),
})

export function parseNbmeCatalog(value: unknown): NbmeCatalog | null {
  const result = catalogSchema.safeParse(value)
  if (!result.success || result.data.questions.length !== result.data.total
    || new Set(result.data.questions.map(q => q.id)).size !== result.data.total) return null
  return result.data
}
export function parseNbmeQuestion(value: unknown): NbmeQuestion | null {
  const result = questionSchema.safeParse(value)
  if (!result.success) return null
  const question = result.data
  if (question.status !== 'ready' || question.options.length < 2 || question.answer === null
    || !question.options.some(option => option.id === question.answer)
    || new Set(question.options.map(option => option.id)).size !== question.options.length
    || (question.figureRequired && !question.figures.length) || preguntaConLecturasDudosas(question)) return null
  return question
}
