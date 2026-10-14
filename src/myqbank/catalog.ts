import { z } from 'zod'
import { ConceptoZ, type Concepto, type Indice } from '../schema/concept'
import { supabase } from '../lib/supabase'
import { leer, escribir } from '../store/db'

const MetadataZ = z.object({ concept_id: z.string().min(3), objetivo: z.string().min(1),
  clasificacion: ConceptoZ.shape.clasificacion.pick({ sistema_primario: true, sistemas_secundarios: true, tema: true, tipo_conocimiento: true, dificultad: true }),
  calidad: z.object({ estado: z.enum(['aprobado', 'cuarentena']) }) })
const CatalogZ = z.object({ schemaVersion: z.literal(1), corpusVersion: z.string(), items: z.array(MetadataZ) })
export type ConceptMetadata = z.infer<typeof MetadataZ>
export function conceptCatalogPath(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid corpus version.')
  return `myqbank/catalogs/${version}.json`
}
export function validateConceptCatalog(raw: unknown, index: Indice): ConceptMetadata[] {
  const catalog = CatalogZ.parse(raw)
  const expected = new Set(index.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos)))
  if (catalog.corpusVersion !== index.corpus_version || catalog.items.length !== expected.size
    || new Set(catalog.items.map(c => c.concept_id)).size !== expected.size
    || catalog.items.some(c => !expected.has(c.concept_id) || c.calidad.estado !== 'aprobado')) throw Error('The concept catalog changed. Reload to get the current version.')
  return catalog.items
}
/** Removes questions, answers and explanations from the selector's data transfer. */
export function buildConceptCatalog(index: Indice, concepts: Concepto[]) {
  const catalog = { schemaVersion: 1 as const, corpusVersion: index.corpus_version, items: concepts.map(c => MetadataZ.parse(c)) }
  validateConceptCatalog(catalog, index)
  return catalog
}
export async function loadConceptCatalog(index: Indice): Promise<ConceptMetadata[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw Error('Sign in to load the concept catalog.')
  const path = conceptCatalogPath(index.corpus_version), key = `myqbank-catalog:${session.user.id}:${index.corpus_version}`
  if (!navigator.onLine) return validateConceptCatalog(await leer(key), index)
  const { data, error } = await supabase.from('corpus_assets').select('payload').eq('path', path).maybeSingle()
  if (error || !data) throw Error('Could not load the concept catalog. Check your connection and retry.')
  const items = validateConceptCatalog(data.payload, index)
  await escribir(key, data.payload).catch(() => undefined)
  return items
}
