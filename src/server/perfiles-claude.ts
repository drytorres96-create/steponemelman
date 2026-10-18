import type { SolicitudClaude } from './claude'

/** Configuración de coste por función. Sólo el Worker elige modelos y límites.
 * maxTokens incluye razonamiento y respuesta; esfuerzo no es un presupuesto en dólares.
 * Aprobado por Yoel: Haiku habitual, entender en medium, Sonnet sólo a petición explícita.
 */
type Perfil = Pick<SolicitudClaude, 'modelo' | 'esfuerzo' | 'pensamiento' | 'maxTokens' | 'tiempoMs'>
export const PERFILES_CLAUDE = {
  hilo: { modelo: 'claude-haiku-5-5', esfuerzo: 'low', pensamiento: 'sin_pensar', maxTokens: 500, tiempoMs: 12_000 },
  entender: { modelo: 'claude-haiku-5-5', esfuerzo: 'medium', pensamiento: 'adaptativo', maxTokens: 2000, tiempoMs: 20_000 },
  revisar: { modelo: 'claude-haiku-5-5', esfuerzo: 'low', pensamiento: 'adaptativo', maxTokens: 3500, tiempoMs: 40_000 },
  chat: { modelo: 'claude-haiku-5-5', esfuerzo: 'medium', pensamiento: 'adaptativo', maxTokens: 3500, tiempoMs: 50_000 },
  practica: { modelo: 'claude-haiku-5-5', esfuerzo: 'medium', pensamiento: 'adaptativo', maxTokens: 6000, tiempoMs: 75_000 },
  calificar: { modelo: 'claude-haiku-5-5', esfuerzo: 'medium', pensamiento: 'adaptativo', maxTokens: 2000, tiempoMs: 10_000 },
  revisionSonnet: { modelo: 'claude-sonnet-5-5', esfuerzo: 'medium', pensamiento: 'adaptativo', maxTokens: 3500, tiempoMs: 50_000 },
} as const satisfies Record<string, Perfil>

/** Un cambio de modelo, esfuerzo o límites no reutiliza respuestas de otro perfil. */
export function clavePerfil(s: Perfil): unknown[] {
  return [s.modelo, s.esfuerzo, s.pensamiento ?? 'adaptativo', s.maxTokens, s.tiempoMs]
}
