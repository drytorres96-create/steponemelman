import { acceptedExplanation, editorialPath, type EditorialExplanation } from './editorial'
import { resolveEditorialSource, validMd5, type EditorialTable, type SourceAssertion, type SourceProof } from './source-proof'

export interface EditorialCandidate {
  explanation: EditorialExplanation
  proof: SourceProof
  sourceAssertions: SourceAssertion[]
  previous: { payload: unknown; md5: string } | null
  unresolvedIssues: string[]
}
const sqlText = (value: string) => `'${value.replaceAll("'", "''")}'`
const json = (value: unknown) => `${sqlText(JSON.stringify(value))}::jsonb`

/** Produces an inspectable transaction. It never approves text or connects to a database. */
export async function prepareEditorialRelease(releaseId: string, candidates: EditorialCandidate[]) {
  if (!/^[a-z0-9-]{6,80}$/.test(releaseId) || !candidates.length) throw Error('A named, non-empty release is required.')
  const keys = new Set<string>(), assertions = new Map<string, SourceAssertion>()
  const snapshotChecks: string[] = []
  const changes: { table: EditorialTable; path: string; before: unknown; beforeMd5: string | null; after: EditorialExplanation }[] = []
  for (const candidate of candidates) {
    const resolved = await resolveEditorialSource(candidate.proof, candidate.explanation.source)
    const accepted = await acceptedExplanation(candidate.explanation, resolved.identity)
    if (!accepted || accepted.language !== 'es' || candidate.unresolvedIssues.length) throw Error('Every item requires Spanish content, an exact independent review and no unresolved issues.')
    const table = accepted.source.kind === 'nbme' ? 'nbme_assets' : 'corpus_assets'
    const path = editorialPath(accepted.source), key = `${table}:${path}`
    if (keys.has(key)) throw Error('Duplicate publication target.')
    keys.add(key)
    const figures = 'figures' in resolved.source ? resolved.source.figures : []
    const reviewedFigures = accepted.independentReview!.figures ?? []
    if (new Set(reviewedFigures.map(f => f.assetId)).size !== reviewedFigures.length
      || reviewedFigures.length !== new Set(figures.map(f => f.assetId)).size
      || figures.some(f => !reviewedFigures.some(r => r.assetId === f.assetId && candidate.sourceAssertions.some(a =>
        a.table === 'nbme_assets' && a.path === `assets/${f.assetId}` && a.md5 === r.md5)))) {
      throw Error('Every figure needs its exact independently reviewed snapshot and CAS.')
    }
    for (const snapshot of [candidate.proof.original, candidate.proof.index]) {
      snapshotChecks.push(`if md5((${json(snapshot.payload)})::text)<>${sqlText(snapshot.md5)} then raise exception 'Snapshot payload does not match its hash'; end if;`)
    }
    for (const assertion of [candidate.proof.original, candidate.proof.index, ...candidate.sourceAssertions]) {
      if (!['corpus_assets', 'nbme_assets'].includes(assertion.table) || !validMd5(assertion.md5)
        || !/^(?:modules\/[^/]+\.json|questions\/[^/]+\/[^/]+\.json|assets\/[^/]+|index\.json|catalog-index\.json)$/.test(assertion.path)) {
        throw Error('Invalid source assertion.')
      }
      const assertionKey = `${assertion.table}:${assertion.path}`, previous = assertions.get(assertionKey)
      if (previous && previous.md5 !== assertion.md5) throw Error('Conflicting source snapshots.')
      assertions.set(assertionKey, { table: assertion.table, path: assertion.path, md5: assertion.md5 })
    }
    if (candidate.previous && !validMd5(candidate.previous.md5)) throw Error('The previous adaptation needs an exact CAS hash.')
    if (candidate.previous) snapshotChecks.push(`if md5((${json(candidate.previous.payload)})::text)<>${sqlText(candidate.previous.md5)} then raise exception 'Rollback payload does not match its hash'; end if;`)
    changes.push({ table, path, before: candidate.previous?.payload ?? null, beforeMd5: candidate.previous?.md5 ?? null, after: accepted })
  }
  const auditPath = `audits/myqbank/releases/${releaseId}.json`
  const begin = ['begin;', 'set local lock_timeout = \'5s\';', 'set local statement_timeout = \'30s\';',
    'set local standard_conforming_strings = on;',
    'lock table public.corpus_assets, public.nbme_assets in share row exclusive mode;']
  const check = (table: EditorialTable, path: string, md5: string | null) => md5 === null
    ? `if exists (select 1 from public.${table} where path=${sqlText(path)}) then raise exception 'Target already exists'; end if;`
    : `if not exists (select 1 from public.${table} where path=${sqlText(path)} and md5(payload::text)=${sqlText(md5)}) then raise exception 'Source or target changed'; end if;`
  const publish = [...new Set(snapshotChecks), ...[...assertions.values()].map(a => check(a.table, a.path, a.md5))]
  const auditChecks: string[] = []
  for (const table of ['corpus_assets', 'nbme_assets'] as const) {
    const scoped = changes.filter(c => c.table === table)
    if (!scoped.length) continue
    publish.push(check(table, auditPath, null))
    for (const change of scoped) publish.push(check(table, change.path, change.beforeMd5))
    const audit = json({ schemaVersion: 1, releaseId, changes: scoped, sourceAssertions: [...assertions.values()].filter(a => a.table === table) })
    publish.push(`insert into public.${table}(path,payload) values (${sqlText(auditPath)},${audit});`)
    auditChecks.push(`if not exists (select 1 from public.${table} where path=${sqlText(auditPath)} and payload=${audit}) then raise exception 'Exact publication audit missing; rollback refused'; end if;`)
    for (const change of scoped) publish.push(change.beforeMd5 === null
      ? `insert into public.${table}(path,payload) values (${sqlText(change.path)},${json(change.after)});`
      : `update public.${table} set payload=${json(change.after)},updated_at=now() where path=${sqlText(change.path)};`)
  }
  const rollback: string[] = [...auditChecks]
  for (const change of changes) rollback.push(`if not exists (select 1 from public.${change.table} where path=${sqlText(change.path)} and payload=${json(change.after)}) then raise exception 'Published adaptation changed; rollback refused'; end if;`)
  for (const change of changes) rollback.push(change.beforeMd5 === null
    ? `delete from public.${change.table} where path=${sqlText(change.path)};`
    : `update public.${change.table} set payload=${json(change.before)},updated_at=now() where path=${sqlText(change.path)};`)
  const transaction = (statements: string[]) => {
    const body = statements.join('\n')
    let n = 0, delimiter = '$myqbank_release_0$'
    while (body.includes(delimiter)) delimiter = `$myqbank_release_${++n}$`
    return [...begin, `do ${delimiter} begin`, body, `end ${delimiter};`, 'commit;'].join('\n')
  }
  return { releaseId, count: changes.length, changes, publishSql: transaction(publish), rollbackSql: transaction(rollback) }
}
