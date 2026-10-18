import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Card, Chip, Icon, Progress, Rings, Segmented } from './components'
import { safePercent, type BlockMode, type Material, type Pool } from './contracts'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { loadConceptCatalog, type ConceptMetadata } from './catalog'
import { resumenProgresoAprendizaje } from '../lib/progreso-aprendizaje'
import { reconstruirProgreso } from '../store/model'
import { fechaEstudio, fechaISOEstudio, desplazarFechaEstudio } from '../lib/calendario-estudio'
import { bankItems, selectBankItems, type BankItem } from './selection'
import type { StudyBlock } from './blocks'
import { awaitingRecall, learningExposures } from './learning'

const materials = [{ value: 'nbme', label: 'NBME' }, { value: 'concepts', label: 'Mehlman Concepts' }, { value: 'mixed', label: 'Mixed' }] as const
const pools = [{ value: 'unused', label: 'Unused' }, { value: 'incorrect', label: 'Incorrect' }, { value: 'flagged', label: 'Flagged' }, { value: 'skipped', label: 'Skipped' }, { value: 'learning', label: 'Learning' }] as const
export function Dashboard({ onStart, onResume, dailyGoal, legacyResume, assistant, busy, error }: {
  onStart: (items: BankItem[], mode: BlockMode) => Promise<void>; onResume: (block: StudyBlock) => Promise<void>;
  dailyGoal: ReactNode; legacyResume: ReactNode; busy: boolean; error: string | null
  /** Lo que Claude aporta, justo bajo «Your next step» (sugerencia del día y chat de sesiones). */
  assistant?: ReactNode
}) {
  const { estado, indice, sincronizacion } = useApp(), nbme = useNbme()
  const [material, setMaterial] = useState<Material>('nbme'), [mode, setMode] = useState<BlockMode>('tutor')
  const [catalog, setCatalog] = useState<{ version: string; items: ConceptMetadata[] } | null>(null), [loadError, setLoadError] = useState(false), [reload, setReload] = useState(0)
  const [selectedSystems, setSystems] = useState<string[] | null>(null), [selectedPools, setPools] = useState<Pool[]>(['unused'])
  const [size, setSize] = useState(5), [sort, setSort] = useState('az'), [form, setForm] = useState('all'), [search, setSearch] = useState('')
  const concepts = catalog?.version === indice?.corpus_version ? catalog?.items ?? null : null
  useEffect(() => {
    if (concepts || !indice) return
    let active = true; setLoadError(false)
    loadConceptCatalog(indice).then(value => { if (active) setCatalog({ version: indice.corpus_version, items: value }) }).catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [concepts, indice, reload])
  const now = Date.now()
  const items = useMemo(() => bankItems(concepts ?? [], nbme.catalog, estado, nbme.state), [concepts, nbme.catalog, estado, nbme.state])
  const bank = items.filter(item => material === 'mixed' || item.kind === (material === 'nbme' ? 'nbme' : 'concept'))
  const systems = [...new Set(bank.flatMap(i => [...i.systems]))].sort(), selected = selectedSystems ?? systems
  const selection = { material, systems: selected, pools: selectedPools, form, search }
  const eligible = selectBankItems(items, selection, estado, now), count = Math.min(size, eligible.length)
  const blocks = Object.values(estado.myqbankBlocks ?? {}).filter(b => b.archivedAt === undefined).sort((a, b) => b.changedAt - a.changedAt)
  const pending = blocks.filter(b => b.completedAt === undefined)
  // A Test attempt may already be synchronized but cannot affect any visible result until closure.
  const visibleProgress = useMemo(() => Object.fromEntries(Object.entries(estado.progreso).map(([id, p]) => {
    const attempts = p.intentos.filter(t => !t.session_id || estado.myqbankBlocks?.[t.session_id]?.mode !== 'test' || estado.myqbankBlocks[t.session_id].completedAt !== undefined)
    return [id, attempts.length === p.intentos.length ? p : reconstruirProgreso(id, attempts, estado.criterios)]
  })), [estado])
  const conceptIds = [...new Set(indice?.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos)) ?? [])]
  const publishedIds = new Set(conceptIds)
  const awaiting = [...learningExposures(estado.myqbankBlocks)].filter(([id, at]) => publishedIds.has(id) && awaitingRecall(estado, id, at)).length
  const mastery = resumenProgresoAprendizaje(conceptIds, visibleProgress, estado.criterios, now, estado.conceptosVistos)
  const used = bank.filter(i => i.seen).length, scored = bank.filter(i => i.kind === 'nbme' && i.firstCorrect !== null), correct = scored.filter(i => i.firstCorrect).length
  const rows = systems.map(id => {
    const group = bank.filter(i => i.systems.includes(id)), scored = group.filter(i => i.kind === 'nbme' && i.firstCorrect !== null)
    return { id, total: group.length, seen: group.filter(i => i.seen).length, n: scored.length, accuracy: safePercent(scored.filter(i => i.firstCorrect).length, scored.length) }
  }).sort((a, b) => sort === 'used' ? b.seen - a.seen : sort === 'weakest' ? (a.n >= 10 ? a.accuracy! : 101) - (b.n >= 10 ? b.accuracy! : 101) : a.id.localeCompare(b.id))
  const activity = [...Object.values(estado.progreso).flatMap(p => p.intentos.map(i => i.ts)), ...Object.values(nbme.state.attempts).map(a => a.submittedAt)]
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = desplazarFechaEstudio(fechaEstudio(now), i - 6), day = fechaISOEstudio(date)
    return { day, label: new Date(`${day}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }), n: activity.filter(t => fechaISOEstudio(fechaEstudio(t)) === day).length }
  })
  const eligibleNbmeIds = new Set(nbme.catalog?.questions.filter(q => q.status === 'ready').map(q => q.id) ?? [])
  const measured = Object.values(nbme.state.attempts).filter(a => a.durationMs > 0 && eligibleNbmeIds.has(a.questionId))
  const seconds = measured.length ? Math.round(measured.reduce((n, a) => n + a.durationMs, 0) / measured.length / 1000) : null
  const needsConcepts = material !== 'nbme', needsNbme = material !== 'concepts'
  const loading = (needsConcepts && !concepts && !loadError) || (needsNbme && nbme.loading)
  const unavailable = (needsConcepts && !concepts) || (needsNbme && !nbme.catalog)
  const waiting = loading || unavailable
  return <main id="mq-main" tabIndex={-1} className="mq-dashboard">
    <div className="mq-top"><Card className="mq-resume"><div><span className="mq-eyebrow">{pending.length ? 'CONTINUE' : 'YOUR NEXT STEP'}</span><h1>{pending[0]?.title ?? 'Make room for one focused block'}</h1><p className="mq-muted">{pending.length ? 'Your answers and place are saved.' : 'Start with five items or follow your daily goal.'}</p></div>
      {pending[0] && <Button variant="primary" disabled={busy} onClick={() => void onResume(pending[0])}><Icon name="play"/>Resume block</Button>}{legacyResume}
    </Card>{assistant}</div>
    <Card className="mq-activity"><div className="mq-heading"><h2>Last 7 days</h2><span>{week.reduce((n, d) => n + d.n, 0)} answers</span></div>
      <div className="mq-week" role="img" aria-label={week.map(d => `${d.day}: ${d.n} answers`).join(', ')}>{week.map(d => <div key={d.day} title={`${d.day}: ${d.n}`}><span style={{ height: `${d.n / Math.max(1, ...week.map(x => x.n)) * 70}px` }}/><small>{d.label}</small></div>)}</div>{dailyGoal}
    </Card>
    <Card className="mq-builder"><h2>Build a block</h2><div className="mq-builder-scroll">
      <div className="mq-field"><h3>Material</h3><Segmented label="Material" value={material} onChange={value => { setMaterial(value); setSystems(null) }} options={materials}/></div>
      <div className="mq-suggestion"><strong>Five items. One clear next step.</strong><p>Your daily goal stays in place.</p><Button onClick={() => setSize(5)}>Use this</Button></div>
      <div className="mq-field"><h3>Mode</h3><Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: 'tutor', label: 'Tutor' }, { value: 'test', label: 'Test' }]}/><p className="mq-small mq-muted">{mode === 'tutor' ? 'Explanation after each answer.' : 'Results and help stay hidden until you end the block.'}</p></div>
      <div className="mq-field"><h3>Questions to draw from</h3><div className="mq-pool-grid">{pools.filter(pool => pool.value !== 'learning' || material !== 'nbme').map(pool => <Chip key={pool.value} selected={selectedPools.includes(pool.value)} onClick={() => setPools(selectedPools.includes(pool.value) ? selectedPools.filter(p => p !== pool.value) : [...selectedPools, pool.value])}>{pool.label}<span>{waiting ? '—' : selectBankItems(items, { ...selection, pools: [pool.value] }, estado, now).length}</span></Chip>)}</div></div>
      {material !== 'nbme' && <p className="mq-small mq-muted">Learning: studied with help, awaiting a correct answer without help.{selectedPools.includes('learning') && ` Practice within ${estado.criterios.separacionHoras} hours of reading counts as assisted.`}</p>}
      <div className="mq-field"><h3>Number of questions</h3><div className="mq-count-row"><div className="mq-stepper"><Button aria-label="Fewer questions" disabled={size <= 5} onClick={() => setSize(n => n - 5)}><Icon name="minus"/></Button><output>{size}</output><Button aria-label="More questions" disabled={size >= 80} onClick={() => setSize(n => n + 5)}><Icon name="plus"/></Button></div>{[5,10,20,40,80].map(n => <Chip key={n} selected={size === n} onClick={() => setSize(n)}>{n}</Chip>)}</div></div>
      <details><summary>More filters</summary><div className="mq-field"><label>Search concepts or ID<input value={search} onChange={e => setSearch(e.target.value)}/></label><label>NBME form<select value={form} onChange={e => setForm(e.target.value)}><option value="all">All forms</option>{['27','28','29'].map(f => <option key={f}>{f}</option>)}</select></label></div></details>
      <dl className="mq-summary"><div><dt>Block</dt><dd>{waiting ? '—' : count} items · {mode === 'test' ? 'Test' : 'Tutor'}</dd></div><div><dt>Available</dt><dd aria-live="polite">{waiting ? (loading ? 'Loading material…' : 'Material unavailable') : `${eligible.length} unique items`}</dd></div><div><dt>Time</dt><dd>{material === 'nbme' && mode === 'test' ? (waiting ? '—' : `${Math.ceil(count * 1.5)} min target`) : 'Untimed'}</dd></div></dl>
      {!waiting && size > count && <p className="mq-small" role="status">{count ? `Your block will contain the ${count} available items.` : 'Select systems and a pool with available items.'}</p>}
      {(error || nbme.error) && <p role="alert">{error ?? nbme.error}</p>}
      </div><Button variant="primary" disabled={!count || waiting || busy} onClick={() => void onStart(eligible.slice(0, count), mode)}><Icon name="play"/>{busy ? 'Preparing block…' : waiting ? (loading ? 'Loading material…' : 'Material unavailable') : `Start ${count}-question block`}</Button>
    </Card>    <Card className="mq-systems"><h2>Performance by system</h2><p className="mq-small mq-muted">NBME accuracy · Mehlman coverage. Fewer than 10 graded answers: limited sample.</p>
      <Segmented label="Sort systems" value={sort} onChange={setSort} options={[{ value: 'az', label: 'A–Z' }, { value: 'weakest', label: 'Weakest' }, { value: 'used', label: 'Most used' }]}/>
      <div className="mq-inline"><Button onClick={() => setSystems(systems)}>Select all</Button><Button onClick={() => setSystems([])}>Clear</Button></div>
      <div className="mq-system-list">{rows.map(row => <label className="mq-system-row" key={row.id}><input type="checkbox" checked={selected.includes(row.id)} onChange={() => setSystems(selected.includes(row.id) ? selected.filter(s => s !== row.id) : [...selected, row.id])}/><span>{row.id}</span><small>{row.seen} / {row.total}</small><Progress value={row.seen} max={row.total} label={`${row.id} coverage`}/><strong className="mq-system-metric" title={`${row.n} graded NBME answers${row.n < 10 ? ' · limited sample' : ''}`}>{material !== 'concepts' && <span>{row.accuracy === null ? '—' : `${row.accuracy}%`}<span className="mq-sr-only"> NBME accuracy</span></span>}{material !== 'nbme' && <span className="mq-coverage">{row.seen}/{row.total}<span> seen</span></span>}</strong></label>)}</div>
      {loading && <p role="status">Loading available material…</p>}{needsConcepts && loadError && <p role="alert">Could not load concepts. <Button onClick={() => setReload(n => n + 1)}>Retry concepts</Button></p>}{needsNbme && !nbme.catalog && !nbme.loading && <p role="alert">Questions unavailable. <Button onClick={() => void nbme.reloadCatalog()}>Retry questions</Button></p>}
    </Card>
    <Card className="mq-overall"><h2>Overall progress</h2>{waiting ? <p role="status">{loading ? 'Loading material…' : 'Material unavailable'}</p> : <Rings used={used} total={bank.length} correct={null}/>}
      {sincronizacion.ultima === null && sincronizacion.estado !== 'sincronizado' && <p role="status">{sincronizacion.estado === 'error' ? 'Saved progress could not sync. Showing this device’s copy; retry in Settings.' : 'Restoring saved progress. Counts may update when sync finishes.'}</p>}
      <div className="mq-stat-grid">{[['Answered / seen', waiting ? '—' : used], ['NBME accuracy', !waiting && scored.length ? `${safePercent(correct, scored.length)}%` : '—'], ['Mehlman mastered', mastery.dominioDemostrado], ['Maintenance current', mastery.mantenimientoAlDia]].map(([label, value]) => <div className="mq-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p className="mq-muted mq-small">NBME: first graded answers ({scored.length}). Mehlman: demonstrated mastery.</p>
      <dl className="mq-pace"><div><dt>NBME average time</dt><dd>{seconds === null ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`} <span>/ 1:30</span></dd></div>
        <div><dt>Blocks completed</dt><dd>{blocks.filter(b => b.completedAt !== undefined).length}</dd></div><div><dt>Awaiting recall</dt><dd>{awaiting}</dd></div><div><dt>Mehlman seen</dt><dd>{mastery.vistos} / {mastery.total}</dd></div></dl>
      <details><summary>Saved blocks</summary><div className="mq-block-history">{blocks.map(b => <Button key={b.id} disabled={busy} onClick={() => void onResume(b)}>{b.title} · {b.completedAt === undefined ? 'Resume' : 'Review'}</Button>)}{!blocks.length && <p>No blocks yet.</p>}</div></details>
    </Card>

  </main>
}
