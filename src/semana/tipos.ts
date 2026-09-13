export type PasoConcepto = { kind: 'concepto'; id: string }
export type PasoPregunta = { kind: 'pregunta'; id: string; revision: string }
export type Paso = PasoConcepto | PasoPregunta

export type PresupuestoSesion = 10 | 20 | 30 | 45
export type EstadoSesion = 'pendiente' | 'en_curso' | 'completada' | 'auditada'

export interface SesionSemanal {
  id: string
  semana: string
  semanaInicio: string          // ISO date
  dia: number
  orden: number
  titulo: string
  subtitulo: string | null
  guion: Paso[]
  presupuestoMin: PresupuestoSesion
  estado: EstadoSesion
  cursor: number
  nbmeSessionId: string | null
  completadaEn: string | null
}

/** Avance persistible de una sesión; se envía sólo lo que cambió. */
export interface AvanceSesion {
  cursor?: number
  estado?: EstadoSesion
  nbmeSessionId?: string | null
  completadaEn?: string | null
}
