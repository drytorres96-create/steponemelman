import { validarIndicePublicado, validarModuloPublicado } from '../data/integridad'
import { parseNbmeCatalog, parseNbmeQuestion } from '../nbme/api'
import { aplicarVariante } from '../lib/variantes'
import { prepararConcepto, type ContextoFormato } from '../lib/formatos'
import { canonicalJson, sourceIdentity, type EditorialExplanation } from './editorial'

export type EditorialTable = 'corpus_assets' | 'nbme_assets'
export interface SourceAssertion { table: EditorialTable; path: string; md5: string }
export interface SourceSnapshot extends SourceAssertion { payload: unknown }
export type PresentationContext = { kind: 'base' } | { kind: 'variant'; variantId: string }
  | ({ kind: 'prepared' } & ContextoFormato) | { kind: 'nbme' }
export interface SourceProof {
  original: SourceSnapshot
  index: SourceSnapshot
  context: PresentationContext
}
export const validMd5 = (value: string) => /^[a-f0-9]{32}$/.test(value)

/** Resolves the actual original and presentation, never a caller-supplied identity alone. */
export async function resolveEditorialSource(proof: SourceProof, expected: EditorialExplanation['source']) {
  const { original, index, context } = proof
  const table = expected.kind === 'concept' ? 'corpus_assets' : 'nbme_assets'
  if (original.table !== table || index.table !== table || !validMd5(original.md5) || !validMd5(index.md5)) throw Error('Invalid source snapshot.')
  let source
  if (expected.kind === 'concept') {
    if (index.path !== 'index.json') throw Error('The corpus index is required.')
    const catalog = validarIndicePublicado(index.payload)
    const meta = catalog.modulos.find(m => `modules/${m.module_id}.json` === original.path)
    if (!meta) throw Error('Unknown source module.')
    const concept = validarModuloPublicado(original.payload, meta, catalog.corpus_version).find(c => c.concept_id === expected.id)
    if (!concept) throw Error('The concept does not belong to this module.')
    if (context.kind === 'base') source = concept
    else if (context.kind === 'variant') {
      if (!concept.variantes?.some(v => v.variant_id === context.variantId)) throw Error('Unknown variant.')
      source = aplicarVariante(concept, context.variantId)
    } else if (context.kind === 'prepared') {
      if (context.version !== 3 || typeof context.semilla !== 'string' || !Number.isInteger(context.indice) || context.indice < 0) throw Error('Unsupported presentation context.')
      source = prepararConcepto(concept, context)
    } else throw Error('Wrong presentation kind.')
  } else {
    if (index.path !== 'catalog-index.json' || context.kind !== 'nbme') throw Error('The NBME catalog and presentation are required.')
    const catalog = parseNbmeCatalog(index.payload)
    if (!catalog?.questions.some(q => q.id === expected.id && q.revision === expected.revision && q.status === 'ready')) throw Error('This NBME revision is not enabled.')
    source = parseNbmeQuestion(original.payload)
    if (!source || original.path !== `questions/${source.id}/${source.revision}.json`) throw Error('Invalid NBME source.')
  }
  const identity = await sourceIdentity(source)
  if (canonicalJson(identity) !== canonicalJson(expected)) throw Error('The exact source presentation changed.')
  return { source, identity }
}
