import { z } from 'zod'

/** Identidad de la presentación; nunca se acepta material médico enviado por el cliente. */
export const PresentacionIAZ = z.object({
  conceptId: z.string().min(1).max(200), answer: z.string().max(500),
  questionId: z.string().max(512), version: z.string().max(256),
  formatVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  variantId: z.string().max(200).optional(), index: z.number().int().min(0).max(100000),
  route: z.enum(['guiada', 'sistemas', 'disciplinas', 'repaso', 'debiles', 'confusiones', 'direccional', 'terminos', 'examen', 'mixta', 'aplicacion']),
  retry: z.boolean(),
})
export type PresentacionIA = z.infer<typeof PresentacionIAZ>
