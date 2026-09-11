import type { Concepto } from '../schema/concept'
import type { ProgresoConcepto } from '../srs/tipos'
import { evidenciaIndependiente } from '../srs/mastery'

export function aplicarVariante(c: Concepto, id?: string | null): Concepto {
  if (!id) return c
  const v = c.variantes?.find(x => x.variant_id === id)
  if (!v) throw new Error('Esta variante ya no está disponible. Tu historial se conserva.')
  return { ...c, variante_id: id, respuesta_canonica: v.opciones.find(o => o.correcta)!.texto,
    sinonimos: [], explicacion: v.explicacion, contexto: null, patron: null,
    pistas: [c.objetivo, 'Identifica el mecanismo que conecta los datos de la pregunta.', 'Compara cada opción con el mecanismo del concepto.'],
    interaccion: { recomendada: v.nivel === 'aplicacion' ? 'caso_clinico' : 'opcion_multiple', permitidas: [], prohibidas: [] },
    evaluacion: { pregunta: v.pregunta, opciones: v.opciones, respuestas_aceptadas: [] },
    escritura_correctiva: { elegible: false, termino: null } }
}
export function siguienteVariante(c: Concepto, p?: ProgresoConcepto, nivel: 'aplicacion' | 'discriminacion' = 'aplicacion'): string | null {
  const variants = c.variantes?.filter(v => v.nivel === nivel) ?? []
  const intentos = p?.intentos ?? []
  return [...variants].sort((a, b) => intentos.filter(t => t.variante_id === a.variant_id).length - intentos.filter(t => t.variante_id === b.variant_id).length)[0]?.variant_id ?? null
}
export function priorizarVariantes(conceptos: Concepto[], progreso: Record<string, ProgresoConcepto>, nivel: 'aplicacion' | 'discriminacion' = 'aplicacion'): Concepto[] {
  const exposiciones = (c: Concepto) => {
    const id = siguienteVariante(c, progreso[c.concept_id], nivel)
    return (progreso[c.concept_id]?.intentos ?? []).filter(t => t.variante_id === id).length
  }
  return [...conceptos].sort((a, b) => exposiciones(a) - exposiciones(b))
}
export function aplicacionComprobada(c: Concepto, p?: ProgresoConcepto): boolean {
  if (!p) return false
  const intentos = [...p.intentos].sort((a, b) => a.ts - b.ts)
  const ultimoFallo = intentos.reduce((pos, t, n) => ['incorrecta', 'parcial'].includes(t.resultado ?? '') ? n : pos, -1)
  return intentos.slice(ultimoFallo + 1).some(t => t.primera_presentacion === true && evidenciaIndependiente(t)
    && c.variantes?.some(v => v.variant_id === t.variante_id && v.nivel === 'aplicacion'))
}
export function resumenTransferencia(conceptos: Concepto[], progreso: Record<string, ProgresoConcepto>) {
  const ids = new Set(conceptos.flatMap(c => c.variantes?.filter(v => v.nivel === 'aplicacion').map(v => v.variant_id) ?? []))
  const primeros = new Map<string, NonNullable<ProgresoConcepto['intentos'][number]>>()
  for (const c of conceptos) for (const t of progreso[c.concept_id]?.intentos ?? []) {
    if (!t.variante_id || !ids.has(t.variante_id) || !t.primera_presentacion) continue
    const prev = primeros.get(t.variante_id)
    if (!prev || t.ts < prev.ts) primeros.set(t.variante_id, t)
  }
  const sinAyuda = [...primeros.values()].filter(t => t.pistas_usadas === 0 && t.fuente_consultada === false && t.explicacion_previa === false && t.resultado !== 'revision')
  return { disponibles: ids.size, vistos: primeros.size, evaluados: sinAyuda.length, correctos: sinAyuda.filter(evidenciaIndependiente).length }
}
