import type { ConceptMetadata } from './catalog'
import type { EstadoApp } from '../store/model'
import type { NbmeCatalog, NbmeState } from '../nbme/types'
import { questionProgress } from '../nbme/model'
import { ultimoIntentoResuelto, construirPlanDiario } from '../lib/plan-estudio'
import { intentoCorrecto } from '../srs/tipos'
import type { EligibleItem, Pool, Material } from './contracts'
import type { BlockEntry } from './blocks'
import { awaitingRecall, learningExposures } from './learning'
import { normalizarBusqueda } from '../lib/busqueda'
import { itemSystems, systemKey, systemLabel } from './taxonomy'
export interface BankItem extends EligibleItem { revision: string; concept?: ConceptMetadata; firstCorrect: boolean | null; seen: boolean; form?: string; searchText?: string }
export function bankItems(concepts: ConceptMetadata[], catalog: NbmeCatalog | null, study: EstadoApp, nbme: NbmeState): BankItem[] {
  const learning = learningExposures(study.myqbankBlocks)
  const marks = new Map<string, { flagged: boolean; skipped: boolean; flagTime: number; skipTime: number }>()
  for (const block of Object.values(study.myqbankBlocks ?? {})) block.entries.forEach((entry, i) => {
    const key = `${entry.kind}:${entry.id}`, previous = marks.get(key) ?? { flagged: false, skipped: false, flagTime: -1, skipTime: -1 }
    const flag = block.flags[i], skip = block.skipped[i]
    if (flag && flag.changedAt >= previous.flagTime) { previous.flagged = flag.value; previous.flagTime = flag.changedAt }
    if (skip && skip.changedAt >= previous.skipTime) { previous.skipped = skip.value; previous.skipTime = skip.changedAt }
    marks.set(key, previous)
  })
  const pool = (kind: string, id: string, seen: boolean, incorrect: boolean): Pool[] => {
    const mark = marks.get(`${kind}:${id}`)
    return [...(!seen ? ['unused' as const] : []), ...(incorrect ? ['incorrect' as const] : []), ...(mark?.flagged ? ['flagged' as const] : []), ...(mark?.skipped ? ['skipped' as const] : [])]
  }
  const questions: BankItem[] = (catalog?.questions ?? []).filter(q => q.status === 'ready').map(q => {
    const progress = questionProgress(nbme, q.id)
    // Missing taxonomy must not make a ready question impossible to select. This
    // is a presentation bucket only; the source classification stays untouched.
    const systems = itemSystems(q.systems)
    return { id: q.id, kind: 'nbme', revision: q.revision, systems, form: q.form, seen: progress.seen,
      searchText: [q.topic, q.objective, ...q.disciplines].filter(Boolean).join(' '),
      firstCorrect: progress.firstCorrect, pools: pool('nbme', q.id, progress.seen, progress.pendingError) }
  })
  return [...questions, ...concepts.filter(c => c.calidad.estado === 'aprobado').map(c => {
    const progress = study.progreso[c.concept_id]
    // An unfinished Test must not clear a previously visible error or disclose a new one.
    const last = ultimoIntentoResuelto(progress && { ...progress, intentos: progress.intentos.filter(attempt =>
      !attempt.session_id || study.myqbankBlocks?.[attempt.session_id]?.mode !== 'test' || study.myqbankBlocks[attempt.session_id].completedAt !== undefined) })
    const viewedAt = learning.get(c.concept_id)
    const seen = viewedAt !== undefined || !!progress?.intentos.length || !!study.conceptosVistos?.[c.concept_id]
    return { id: c.concept_id, kind: 'concept' as const, revision: 'prepared-on-start', concept: c, seen, firstCorrect: null,
      systems: itemSystems([c.clasificacion.sistema_primario, ...c.clasificacion.sistemas_secundarios]), pools: [...pool('concept', c.concept_id, seen, !!last && !intentoCorrecto(last)),
        ...(viewedAt !== undefined && awaitingRecall(study, c.concept_id, viewedAt) ? ['learning' as const] : [])] }
  })]
}
export function selectBankItems(items: BankItem[], options: { material: Material; systems: string[]; pools: Pool[]; form: string; search: string }, study: EstadoApp, now = Date.now()): BankItem[] {
  const search = normalizarBusqueda(options.search)
  const systems = new Set(options.systems.map(systemKey))
  const eligible = [...new Map(items.filter(item => (options.material === 'mixed' || item.kind === (options.material === 'nbme' ? 'nbme' : 'concept'))
    && item.systems.some(s => systems.has(systemKey(s))) && item.pools.some(p => options.pools.includes(p))
    && (item.kind !== 'nbme' || options.form === 'all' || item.form === options.form)
    && (!search || normalizarBusqueda(`${item.id} ${item.systems.join(' ')} ${item.systems.map(systemLabel).join(' ')} ${item.searchText ?? ''} ${item.concept?.objetivo ?? ''} ${item.concept?.clasificacion.tema ?? ''}`).includes(search)))
    .map(item => [`${item.kind}:${item.id}`, item])).values()]
  const concepts = eligible.filter(i => i.kind === 'concept'), questions = eligible.filter(i => i.kind === 'nbme')
  const ranked = construirPlanDiario(concepts.map(i => i.concept!), study.progreso, concepts.length, now).conceptos
  const byId = new Map(concepts.map(i => [i.id, i]))
  const ordered = [...ranked.map(c => byId.get(c.concept_id)!), ...concepts.filter(c => !ranked.some(r => r.concept_id === c.id))]
  if (options.material !== 'mixed') return options.material === 'nbme' ? questions : ordered
  const result: BankItem[] = []
  while (ordered.length || questions.length) {
    result.push(...ordered.splice(0, 3))
    const q = questions.shift(); if (q) result.push(q)
  }
  return result
}
export function nbmePosition(entries: BlockEntry[], position: number): number { return entries.slice(0, position).filter(e => e.kind === 'nbme').length }
