import { z } from 'zod'

/**
 * Lo que el navegador puede decirle a las ayudas de sesión de Claude (`/api/ia/sesion`).
 * Sólo viajan identificadores, etiquetas cortas del propio ítem y lo que la persona escribe;
 * nunca texto de preguntas NBME ni enunciados del corpus.
 */

export const SENALES_INVENTARIO = ['fallo_reciente', 'fallo_repetido', 'acierto_con_ayuda'] as const

export const MAX_ETIQUETA = 160

const ItemHiloZ = z.object({
  tipo: z.enum(['concepto', 'pregunta']),
  id: z.string().min(1).max(120).regex(/^[\w.:-]+$/),
  etiqueta: z.string().max(MAX_ETIQUETA),
  senales: z.array(z.enum(SENALES_INVENTARIO)).min(1).max(3),
}).strict()
export type ItemHilo = z.infer<typeof ItemHiloZ>

export const PeticionSesionZ = z.discriminatedUnion('fase', [
  /** Una frase con el hilo común de las cinco sugeridas del día. */
  z.object({ fase: z.literal('hilo'), items: z.array(ItemHiloZ).min(1).max(5) }).strict(),
])
export type PeticionSesion = z.infer<typeof PeticionSesionZ>
