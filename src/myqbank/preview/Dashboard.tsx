import { useMemo, useState } from 'react'
import { Button, Card, Chip, Icon, Progress, Rings, Segmented } from '../components'
import { safePercent, selectUniqueItems, type BlockMode, type Material, type Pool } from '../contracts'
import { items, systems, type DemoItem } from './fixtures'

const materials = [{ value: 'nbme', label: 'NBME' }, { value: 'concepts', label: 'Mehlman Concepts' }, { value: 'mixed', label: 'Mixed' }] as const
const pools = [{ value: 'unused', label: 'Unused' }, { value: 'incorrect', label: 'Incorrect' }, { value: 'flagged', label: 'Flagged' }, { value: 'skipped', label: 'Skipped' }] as const
export const modes = [{ value: 'tutor', label: 'Tutor' }, { value: 'test', label: 'Test' }] as const
export default function Dashboard({ onStart, onResume, progress }: {
  onStart: (items: DemoItem[], mode: BlockMode) => void; onResume: () => void; progress: { answered: number; total: number; mode: BlockMode }
}) {
  const [material, setMaterial] = useState<Material>('nbme')
  const [selectedSystems, setSelectedSystems] = useState<string[]>(systems.map(([id]) => id))
  const [selectedPools, setSelectedPools] = useState<Pool[]>(['unused'])
  const [mode, setMode] = useState<BlockMode>('tutor')
  const [size, setSize] = useState(20)
  const [sort, setSort] = useState('weakest')
  const bank = useMemo(() => items.filter(item => material === 'mixed' || item.kind === (material === 'nbme' ? 'nbme' : 'concept')), [material])
  const eligible = selectUniqueItems(items, material, selectedSystems, selectedPools)
  const used = bank.filter(item => item.firstCorrect !== null).length
  const correct = bank.filter(item => item.firstCorrect === true).length
  const metricsAreNbme = material === 'nbme'
  const rows = systems.map(([id, label]) => {
    const group = bank.filter(item => item.systems.includes(id))
    const answered = group.filter(item => item.firstCorrect !== null).length
    return { id, label, total: group.length, answered, accuracy: safePercent(group.filter(item => item.firstCorrect === true).length, answered) }
  }).sort((a, b) => sort === 'az' ? a.label.localeCompare(b.label) : sort === 'used' ? b.answered - a.answered : (a.accuracy ?? 101) - (b.accuracy ?? 101))
  function toggleSystem(id: string) { setSelectedSystems(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]) }
  const count = Math.min(size, eligible.length)
  return <main id="mq-main" className="mq-dashboard" tabIndex={-1}>
    <Card className="mq-overall"><div className="mq-heading"><h2>Overall progress</h2><span>{bank.length} items</span></div>
      <Rings used={used} total={bank.length} correct={metricsAreNbme ? correct : null}/>
      <div className="mq-ring-legend"><span>● {safePercent(used, bank.length) ?? '—'}% used</span><span>{metricsAreNbme ? `● ${safePercent(correct, used) ?? '—'}% correct` : 'Mastery tracked separately'}</span></div>
      <div className="mq-stat-grid">{[
        [metricsAreNbme ? 'Correct' : 'Seen', metricsAreNbme ? correct : used, 'ok'],
        [metricsAreNbme ? 'Incorrect' : 'Mastered', metricsAreNbme ? used - correct : '—', 'bad'],
        ['Flagged', bank.filter(item => item.pools.includes('flagged')).length, 'bad'], ['Unused', bank.length - used, ''],
      ].map(([label, number, tone]) => <div className={`mq-stat mq-tone-${tone}`} key={label}><span>{label}</span><strong>{number}</strong></div>)}</div>
      <dl className="mq-pace"><div><dt>Avg time per question</dt><dd>1:18 <span>/ {metricsAreNbme ? '1:30' : '—'}</span></dd></div><div><dt>Study streak</dt><dd>3 days</dd></div><div><dt>Blocks completed</dt><dd>4</dd></div></dl>
    </Card>
    <Card className="mq-resume"><div><span className="mq-eyebrow">CONTINUE</span><h1>Your study block</h1><p className="mq-muted">{progress.mode === 'tutor' ? 'Tutor' : 'Test'} · mixed systems</p><div className="mq-resume-progress"><Progress value={progress.answered} max={progress.total} label="Current block answered"/><span>{progress.answered} / {progress.total} answered</span></div></div><Button variant="primary" onClick={onResume}><Icon name="play"/>Resume block</Button></Card>
    <Card className="mq-activity"><div className="mq-heading"><h2>Last 7 days</h2><span>84 items</span></div><div className="mq-week" role="img" aria-label="Illustrative activity: Monday 8, Tuesday 12, Wednesday 18, Thursday 10, Friday 14, Saturday 10, Sunday 12. Daily goal 20.">{[8,12,18,10,14,10,12].map((n, i) => <div key={i}><span style={{ height: `${n * 4}px` }}/><small>{['M','T','W','T','F','S','S'][i]}</small></div>)}</div><div className="mq-goal"><div className="mq-heading"><strong>Today's goal</strong><span>12 / 20</span></div><Progress value={12} max={20} label="Today's goal"/><p>8 items left · your daily target stays the same.</p></div></Card>
    <Card className="mq-systems"><h2>Performance by system</h2><p className="mq-muted mq-small">Select systems to include in your block. {metricsAreNbme ? 'Accuracy uses first answers.' : 'Coverage is separate from mastery.'}</p>
      <Segmented label="Sort systems" value={sort} onChange={setSort} options={[{ value: 'weakest', label: 'Weakest' }, { value: 'used', label: 'Most used' }, { value: 'az', label: 'A–Z' }]}/>
      <div className="mq-system-list">{rows.map(row => <label className="mq-system-row" key={row.id}><input type="checkbox" checked={selectedSystems.includes(row.id)} onChange={() => toggleSystem(row.id)}/><span>{row.label}</span><small>{row.answered} / {row.total}</small><Progress value={row.answered} max={row.total} label={`${row.label} coverage`}/><strong className={metricsAreNbme && row.accuracy !== null && row.accuracy < 65 ? 'mq-text-bad' : 'mq-text-ok'}>{metricsAreNbme && row.accuracy !== null ? `${row.accuracy}%` : '—'}</strong></label>)}</div>
      <p className="mq-small mq-muted">{selectedSystems.length} systems selected</p>
    </Card>
    <Card className="mq-builder"><h1>Build a block</h1><div className="mq-builder-scroll"><p className="mq-muted mq-small">Choose your material, then make room for one focused block.</p>
      <div className="mq-field"><h3>Material</h3><Segmented label="Material" value={material} onChange={setMaterial} options={materials}/></div>
      <div className="mq-suggestion"><span className="mq-eyebrow">A SMALL START</span><strong>Five questions. One clear next step.</strong><p>Keep the first block short. Your daily goal stays in place.</p><Button onClick={() => { setSize(5); setMode('tutor'); setSelectedPools(['unused']); setSelectedSystems(systems.map(([id]) => id)) }}>Use this</Button></div>
      <div className="mq-field"><h3>Mode</h3><Segmented label="Mode" value={mode} onChange={setMode} options={modes}/><p className="mq-small mq-muted">{mode === 'tutor' ? 'See the explanation after each answer.' : 'Answers stay hidden until you end the block.'}</p></div>
      <div className="mq-field"><h3>Questions to draw from</h3><div className="mq-pool-grid">{pools.map(pool => <Chip key={pool.value} selected={selectedPools.includes(pool.value)} onClick={() => setSelectedPools(current => current.includes(pool.value) ? current.length > 1 ? current.filter(p => p !== pool.value) : current : [...current, pool.value])}><span>{pool.label}</span><span className="mq-mono">{selectUniqueItems(items, material, selectedSystems, [pool.value]).length}</span></Chip>)}</div></div>
      <div className="mq-field"><h3>Number of questions</h3><div className="mq-count-row"><div className="mq-stepper"><Button aria-label="Fewer questions" disabled={size <= 5} onClick={() => setSize(n => Math.max(5, n - 5))}>−</Button><output aria-live="polite">{size}</output><Button aria-label="More questions" disabled={size >= 80} onClick={() => setSize(n => Math.min(80, n + 5))}>+</Button></div>{[5,10,20,40].map(n => <Chip key={n} selected={size === n} onClick={() => setSize(n)}>{n}</Chip>)}</div></div>
      <dl className="mq-summary"><div><dt>Block</dt><dd>{count} items · {mode === 'tutor' ? 'Tutor' : 'Test'}</dd></div><div><dt>Systems</dt><dd>{selectedSystems.length} selected</dd></div><div><dt>Available</dt><dd aria-live="polite">{eligible.length}</dd></div><div><dt>Time</dt><dd>{mode === 'test' && material === 'nbme' ? `${Math.ceil(count * 1.5)} min` : 'Untimed'}</dd></div></dl>
      {size > eligible.length && <p className="mq-small mq-text-bad" role="status">{eligible.length ? `Your block will use the ${eligible.length} available items.` : 'Select a system and a pool with available items.'}</p>}
      </div><Button variant="primary" disabled={!count} onClick={() => onStart(eligible.slice(0, count), mode)}><Icon name="play"/>Start {count}-question block</Button>
    </Card>
  </main>
}
