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

export const PeticionErrorIAZ = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('concepto'), presentacion: PresentacionIAZ,
    resultado: z.enum(['incorrecta', 'parcial', 'ortografia']), razonamiento: z.string().max(500).optional() }).strict(),
  z.object({ tipo: z.literal('nbme'), questionId: z.string().regex(/^NBME(?:27|28|29)-P\d{4}$/),
    revision: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/), optionId: z.string().min(1).max(10),
    razonamiento: z.string().max(500).optional() }).strict(),
])
export type PeticionErrorIA = z.infer<typeof PeticionErrorIAZ>
