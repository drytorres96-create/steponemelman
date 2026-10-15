import { z } from 'zod'
import { ConceptoZ, type Concepto, type Indice } from '../schema/concept'
import { supabase } from '../lib/supabase'
import { leer, escribir } from '../store/db'
import { cargarTodo } from '../data/corpus'

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
const pending = new Map<string, Promise<ConceptMetadata[]>>()
export async function loadConceptCatalog(index: Indice): Promise<ConceptMetadata[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw Error('Sign in to load the concept catalog.')
  const path = conceptCatalogPath(index.corpus_version), key = `myqbank-catalog:${session.user.id}:${index.corpus_version}`
  const existing = pending.get(key)
  if (existing) return existing
  const work = (async () => {
    // Versioned metadata is immutable, like the versioned modules. AuthGate has
    // already checked this account; never share a cache between accounts.
    const cached = await leer(key).catch(() => null)
    if (cached) { try { return validateConceptCatalog(cached, index) } catch { /* Fetch a valid copy. */ } }
    if (!navigator.onLine) throw Error('Connect to load the concept catalog for this version.')
    const { data, error } = await supabase.from('corpus_assets').select('payload').eq('path', path).maybeSingle()
    if (error) throw Error('Could not load the concept catalog. Check your connection and retry.')
    // Corpus releases may precede their optional lightweight selector catalog.
    // Derive metadata from the same validated private modules in that case only;
    // do not replace network denials with cached or older material.
    const payload = data ? data.payload : buildConceptCatalog(index, await cargarTodo(index.modulos))
    const items = validateConceptCatalog(payload, index)
    await escribir(key, payload).catch(() => undefined)
    return items
  })()
  pending.set(key, work)
  try { return await work } finally { if (pending.get(key) === work) pending.delete(key) }
}
