import { DIAS_META, type ResumenMeta } from './meta'
import type { EstadoDia } from './dia'
import type { ItemCaja } from './cajas'
import type { MaterialNuevo } from './nuevo-hoy'
export interface EntradaRecuperacion { meta: ResumenMeta; dia: EstadoDia; datosListos: boolean; semanaLista: boolean; sesionPendiente: boolean; cajas: ItemCaja[]; nuevo: MaterialNuevo }
export type AccionRecuperacion = { tipo: 'cajas'; items: ItemCaja[] } | { tipo: 'nuevo'; material: MaterialNuevo }
export function recuperacionMeta(e: EntradaRecuperacion): { faltaDominio: number; faltanPreguntas: number; accion: AccionRecuperacion | null; retomar: boolean; motivo: string } {
  const faltaDominio = Math.max(0, e.meta.conceptos.linea - e.meta.conceptos.hechos)
  const faltanPreguntas = Math.max(0, e.meta.preguntas.linea - e.meta.preguntas.hechos)
  const sinAccion = (motivo: string, retomar = false) => ({ faltaDominio, faltanPreguntas, accion: null, retomar, motivo })
  if (e.meta.dia < 1 || e.meta.dia > DIAS_META) return sinAccion(e.meta.dia < 1 ? 'La ventana todavía no empezó.' : 'La ventana terminó. Hoy sigue disponible para consolidar y mantener lo aprendido.')
  if (!e.datosListos) return sinAccion('Espera a que termine de cargar tu progreso y el material disponible.')
  if (e.dia.tipo === 'vacio') return sinAccion('El viernes queda libre. Lo pendiente se revisa en el siguiente día de estudio.')
  if (e.meta.conceptos.rumbo !== 'debajo' && e.meta.preguntas.rumbo !== 'debajo') return sinAccion('Estás dentro del margen de planificación. Sigue con tu día habitual.')
  if (e.sesionPendiente) return sinAccion('Tienes una sesión pendiente. Retómala antes de abrir otro recorrido.', true)
  const limite = Math.max(0, e.dia.cajas.techo - e.dia.cajas.hechos)
  const vistos = new Set<string>()
  const items = e.cajas.filter(i => !i.hecho && !vistos.has(`${i.tipo}:${i.id}`) && !!vistos.add(`${i.tipo}:${i.id}`)).slice(0, limite)
  if (items.length) return { faltaDominio, faltanPreguntas, accion: { tipo: 'cajas', items }, retomar: false, motivo: 'Primero los repasos vencidos de Hoy, en su orden y dentro del techo disponible.' }
  if (!e.semanaLista) return sinAccion('Es necesario cargar el material de esta semana antes de continuar con lo nuevo.')
  const conceptIds = [...new Set(e.nuevo.conceptIds)].slice(0, Math.max(0, e.dia.nuevo.techoConceptos - e.dia.nuevo.conceptos))
  const preguntas = e.nuevo.preguntas.filter((q, i, todas) => todas.findIndex(p => p.id === q.id) === i)
    .slice(0, Math.max(0, e.dia.nuevo.techoPreguntas - e.dia.nuevo.preguntas))
  // La selección viene del mismo constructor que Hoy. Si cambia la cola NBME,
  // su sesión no se reutiliza con referencias distintas.
  const mismo = preguntas.length === e.nuevo.preguntas.length
  if (!e.dia.nuevo.cerrada && conceptIds.length + preguntas.length > 0) return { faltaDominio, faltanPreguntas,
    accion: { tipo: 'nuevo', material: { ...e.nuevo, conceptIds, preguntas, nbmeSessionId: mismo ? e.nuevo.nbmeSessionId : null } }, retomar: false,
    motivo: 'Los repasos de Hoy están hechos. Continúa el material nuevo de esta semana dentro del techo diario.' }
  return sinAccion('Hoy no queda un bloque elegible. El dominio requiere evidencia y separación temporal: retoma cuando vuelva a tocar.')
}
