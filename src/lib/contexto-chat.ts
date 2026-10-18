import { z } from 'zod'
import { PresentacionIAZ, type PresentacionIA } from './contexto-ia'

/**
 * Lo único que el navegador puede decir al chat: de qué pregunta se trata (identificadores), qué
 * respondió y lo que escribe. El material médico lo lee siempre el servidor de su propia fuente.
 */
export const MAX_MENSAJE = 400
export const MAX_TURNO = 1500
export const MAX_HISTORIAL = 8

export const TurnoChatZ = z.object({ rol: z.enum(['yo', 'ia']), texto: z.string().min(1).max(MAX_TURNO) }).strict()
export type TurnoChat = z.infer<typeof TurnoChatZ>

const comunes = {
  accion: z.enum(['mensaje', 'practica']),
  /** Sólo la acción explícita de revisar una explicación permite Sonnet. */
  revisionSonnet: z.literal(true).optional(),
  mensaje: z.string().max(MAX_MENSAJE).optional(),
  historial: z.array(TurnoChatZ).max(MAX_HISTORIAL).default([]),
  /** Enunciados de rondas anteriores, para que «más ejercicios» no repita los mismos. */
  evitar: z.array(z.string().min(1).max(100)).max(12).default([]),
}

export const PeticionChatZ = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('concepto'), presentacion: PresentacionIAZ,
    resultado: z.enum(['correcta', 'parcial', 'incorrecta', 'ortografia', 'revision']), ...comunes }).strict(),
  z.object({ tipo: z.literal('nbme'), questionId: z.string().regex(/^NBME(?:27|28|29)-P\d{4}$/),
    revision: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/), optionId: z.string().min(1).max(10), ...comunes }).strict(),
]).superRefine((p, ctx) => {
  if (p.accion === 'mensaje' && !p.mensaje?.trim()) ctx.addIssue({ code: 'custom', message: 'Falta el mensaje.', path: ['mensaje'] })
  if (p.revisionSonnet && (p.accion !== 'mensaje' || !p.historial.some((t, i) => t.rol === 'ia' && i > 0 && p.historial[i - 1].rol === 'yo')))
    ctx.addIssue({ code: 'custom', message: 'La revisión necesita una explicación previa.', path: ['revisionSonnet'] })
})
export type PeticionChat = z.infer<typeof PeticionChatZ>

/** La pregunta a la que se refiere el chat, sin ningún texto médico. */
export type OrigenChat =
  | { tipo: 'concepto'; presentacion: PresentacionIA; resultado: 'correcta' | 'parcial' | 'incorrecta' | 'ortografia' | 'revision' }
  | { tipo: 'nbme'; questionId: string; revision: string; optionId: string }
