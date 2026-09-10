import { ConceptoZ, IndiceZ, type Concepto, type Indice, type Modulo } from '../schema/concept'

const ACTUALIZAR = 'El material cambió o está incompleto. Recarga la página para cargar la versión actual.'

export function validarIndicePublicado(crudo: unknown): Indice {
  const indice = IndiceZ.parse(crudo)
  const ids = indice.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos))
  if (new Set(indice.modulos.map(m => m.module_id)).size !== indice.modulos.length
    || ids.length !== indice.n_conceptos || new Set(ids).size !== ids.length
    || indice.modulos.some(m => m.n_conceptos !== m.sesiones.reduce((n, s) => n + s.conceptos.length, 0))) {
    throw new Error(ACTUALIZAR)
  }
  return indice
}

export function validarModuloPublicado(crudo: unknown, modulo: Modulo, version: string): Concepto[] {
  if (!crudo || typeof crudo !== 'object') throw new Error(ACTUALIZAR)
  const datos = crudo as Record<string, unknown>
  if (datos.module_id !== modulo.module_id || !Array.isArray(datos.conceptos)
    || (datos.corpus_version !== undefined && datos.corpus_version !== version)) throw new Error(ACTUALIZAR)
  const conceptos = datos.conceptos.map(c => ConceptoZ.parse(c))
  const esperados = new Set(modulo.sesiones.flatMap(s => s.conceptos))
  if (conceptos.length !== esperados.size || new Set(conceptos.map(c => c.concept_id)).size !== conceptos.length
    || conceptos.some(c => !esperados.has(c.concept_id) || c.step === 'step2'
      || c.calidad.estado !== 'aprobado' || c.calidad.confianza < 0.7)) throw new Error(ACTUALIZAR)
  return conceptos
}
