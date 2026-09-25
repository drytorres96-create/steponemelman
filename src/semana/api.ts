import { z } from 'zod'
import { supabase } from '../lib/supabase'
import type { AvanceSesion, Paso, SesionSemanal } from './tipos'

/**
 * Lectura y escritura de `weekly_sessions`. La tabla la siembra la planificación
 * desde fuera; aquí sólo se recorre. Una fila mal formada se descarta con un aviso
 * en la consola: una semana con un guion roto no puede tumbar la pantalla entera,
 * porque el resto de las sesiones sí son estudiables.
 */

const texto = z.string()
const pasoSchema: z.ZodType<Paso> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('concepto'), id: texto.min(1) }),
  z.object({ kind: z.literal('pregunta'), id: texto.min(1), revision: texto.min(1) }),
])
const guionSchema = z.array(pasoSchema).min(1).max(60)
const presupuestoSchema = z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(45)])
const estadoSchema = z.enum(['pendiente', 'en_curso', 'completada', 'auditada'])

const filaSchema = z.object({
  id: texto.uuid(),
  semana: texto.min(1),
  semana_inicio: texto.regex(/^\d{4}-\d{2}-\d{2}$/),
  dia: z.number().int().min(1).max(7),
  orden: z.number().int().min(1),
  titulo: texto.min(1),
  subtitulo: texto.nullable().optional(),
  guion: guionSchema,
  presupuesto_min: z.number().int(),
  estado: estadoSchema,
  cursor: z.number().int().min(0),
  nbme_session_id: texto.nullable().optional(),
  completada_en: texto.nullable().optional(),
})

/** Convierte una fila cruda en sesión; `null` si no supera la validación. */
export function leerSesionSemanal(fila: unknown): SesionSemanal | null {
  const resultado = filaSchema.safeParse(fila)
  if (!resultado.success) return null
  const f = resultado.data
  const presupuesto = presupuestoSchema.safeParse(f.presupuesto_min)
  return {
    id: f.id,
    semana: f.semana,
    semanaInicio: f.semana_inicio,
    dia: f.dia,
    orden: f.orden,
    titulo: f.titulo,
    subtitulo: f.subtitulo ?? null,
    guion: f.guion,
    // Un presupuesto fuera de la escala es informativo, no estructural: se muestra el de referencia.
    presupuestoMin: presupuesto.success ? presupuesto.data : 30,
    estado: f.estado,
    // El cursor no puede señalar fuera del guion aunque la fila venga adelantada.
    cursor: Math.min(f.cursor, f.guion.length),
    nbmeSessionId: f.nbme_session_id ?? null,
    completadaEn: f.completada_en ?? null,
  }
}

export interface ResultadoAvance { ok: boolean; aviso?: string }

/**
 * Guarda el avance puntual de una sesión. Un fallo aquí no borra nada estudiado:
 * el progreso real vive en `study_state` y `nbme_state`, así que se reintenta una
 * vez y después se avisa sin tocar el avance local.
 */
export async function guardarAvance(id: string, avance: AvanceSesion): Promise<ResultadoAvance> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (avance.cursor !== undefined) patch.cursor = avance.cursor
  if (avance.estado !== undefined) patch.estado = avance.estado
  if (avance.nbmeSessionId !== undefined) patch.nbme_session_id = avance.nbmeSessionId
  if (avance.completadaEn !== undefined) patch.completada_en = avance.completadaEn
  for (let intento = 0; intento < 2; intento++) {
    const { error } = await supabase.from('weekly_sessions').update(patch).eq('id', id)
    if (!error) return { ok: true }
  }
  return { ok: false, aviso: 'No se pudo guardar la posición de esta sesión. Lo estudiado sí quedó registrado.' }
}

/**
 * Todas las sesiones planificadas, auditadas incluidas, en orden de calendario. Hoy
 * saca de ellas el tema de la semana y las cifras miden con ellas el ritmo real.
 */
export async function cargarHistorialSesiones(): Promise<SesionSemanal[]> {
  const { data, error } = await supabase.from('weekly_sessions').select('*')
    .order('semana_inicio', { ascending: true })
    .order('dia', { ascending: true })
    .order('orden', { ascending: true })
  if (error) throw new Error('No se pudo cargar el historial de sesiones planificadas.')
  const sesiones: SesionSemanal[] = []
  for (const fila of data ?? []) {
    const sesion = leerSesionSemanal(fila)
    if (sesion) sesiones.push(sesion)
    else console.warn('Sesión semanal descartada: el guion no tiene un formato válido.', (fila as { id?: unknown })?.id)
  }
  return sesiones
}
