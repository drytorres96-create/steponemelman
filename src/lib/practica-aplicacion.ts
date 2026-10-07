import type { Concepto, Interaccion } from '../schema/concept'
import type { ProgresoConcepto } from '../srs/tipos'
import { aciertosVigentes, evidenciaActiva, type CriteriosDominio } from '../srs/mastery'
import { esRespuestaBreve, tieneOpcionesValidas, VERSION_FORMATO_ACTUAL, type VersionFormato } from './formatos'
import { aplicarVariante, siguienteVariante } from './variantes'

const BASES_CON_ALTERNATIVAS = new Set<Interaccion>([
  'opcion_multiple', 'recuperacion_libre', 'completar', 'tarjeta', 'escritura_correctiva',
])

interface ContextoPractica {
  ruta?: string
  versionFormato?: VersionFormato
  restaurando?: boolean
  ahora?: number
}

/** Sólo al crear una cola: ofrece una aplicación revisada cuando aún falta evidencia activa. */
export function prepararPracticaConcepto(c: Concepto, p: ProgresoConcepto | undefined,
  criterios: Pick<CriteriosDominio, 'exigirRecuperacionActiva'>, contexto: ContextoPractica = {}): Concepto {
  if (contexto.restaurando || c.variante_id !== undefined || contexto.ruta === 'examen'
      || (contexto.versionFormato !== undefined && contexto.versionFormato !== VERSION_FORMATO_ACTUAL)
      || !criterios.exigirRecuperacionActiva || c.calidad.estado !== 'aprobado'
      || !BASES_CON_ALTERNATIVAS.has(c.interaccion.recomendada)
      || esRespuestaBreve(c.respuesta_canonica) || !tieneOpcionesValidas(c) || !p) return c
  const ahora = contexto.ahora ?? Date.now()
  if (!p.intentos.some(i => i.ts <= ahora && i.resultado !== 'revision')
      || aciertosVigentes(p, ahora).some(evidenciaActiva)) return c
  return aplicarVariante(c, siguienteVariante(c, p, 'aplicacion'))
}
