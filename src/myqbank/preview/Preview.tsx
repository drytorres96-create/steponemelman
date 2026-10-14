import { useEffect, useRef, useState } from 'react'
import { Brand, Button, Card, Icon, StateMessage } from '../components'
import type { BlockMode, Theme } from '../contracts'
import Dashboard from './Dashboard'
import Study, { type PreviewBlock } from './Study'
import { items, type DemoItem } from './fixtures'
import './preview.css'

export default function Preview() {
  const [theme, setTheme] = useState<Theme>(() => window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  const [view, setView] = useState<'dashboard' | 'study' | 'components'>('dashboard')
  const [settings, setSettings] = useState(false)
  const settingsDialog = useRef<HTMLDialogElement>(null)
  const [block, setBlock] = useState<PreviewBlock>({ items: items.slice(0, 5), mode: 'tutor', answers: {}, drafts: {}, position: 0, flags: [], completed: false })
  const [state, setState] = useState<'loading' | 'empty' | 'error'>('loading')
  useEffect(() => { if (settings) settingsDialog.current?.showModal(); else settingsDialog.current?.close() }, [settings])
  useEffect(() => { document.getElementById('mq-main')?.focus() }, [view])
  const start = (selected: DemoItem[], mode: BlockMode) => {
    if (!selected.length) return
    setBlock({ items: selected, mode, answers: {}, drafts: {}, position: 0, flags: [], completed: false }); setView('study')
  }
  return <div className="mq-root mq-preview" data-theme={theme} lang="en">
    <a className="mq-skip-link" href="#mq-main">Skip to content</a>
    <header className="mq-header"><Brand/><Button className="mq-dashboard-link" aria-current={view === 'dashboard' ? 'page' : undefined} onClick={() => setView('dashboard')}>Dashboard</Button>
      <span className="mq-preview-badge">Design preview · sample data</span><div className="mq-header-actions"><Button aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'}/><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></Button><Button aria-label="Settings" onClick={() => setSettings(true)}><Icon name="settings"/><span>Settings</span></Button></div>
    </header>
    {view === 'dashboard' && <Dashboard onStart={start} onResume={() => setView('study')} progress={{ answered: Object.keys(block.answers).length, total: block.items.length, mode: block.mode }}/ >}
    {view === 'study' && <Study block={block} setBlock={setBlock} onPause={() => setView('dashboard')}/>}
    {view === 'components' && <main id="mq-main" className="mq-gallery" tabIndex={-1}><Card><h1>Component states</h1><p className="mq-muted">Preview controls only. Study data is not connected.</p><div className="mq-inline">{(['loading','empty','error'] as const).map(s => <Button key={s} aria-pressed={state === s} onClick={() => setState(s)}>{s}</Button>)}</div><StateMessage state={state} title={state === 'loading' ? 'Loading your block' : state === 'empty' ? 'No matching items' : 'Could not load this block'} action={state === 'error' ? <Button onClick={() => setState('loading')}>Try again</Button> : undefined}>{state === 'loading' ? 'Your place is saved while the content loads.' : state === 'empty' ? 'Try another system or question pool.' : 'Check your connection and try again.'}</StateMessage><div className="mq-inline"><Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="danger">End block</Button><Button disabled>Unavailable</Button></div></Card></main>}
    <dialog ref={settingsDialog} className="mq-dialog" onCancel={() => setSettings(false)} onClose={() => setSettings(false)}><div className="mq-heading"><h2>Settings</h2><Button aria-label="Close settings" onClick={() => setSettings(false)}><Icon name="close"/></Button></div><p>Choose the appearance for this preview.</p><Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Use {theme === 'dark' ? 'light' : 'dark'} theme</Button><hr/><p className="mq-small mq-muted">Sample data resets on reload. Your account, daily goal and study history are unchanged.</p><Button onClick={() => { setSettings(false); setView('components') }}>View component states</Button></dialog>
  </div>
}
