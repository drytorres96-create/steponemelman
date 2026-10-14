import { useEffect, type ReactNode } from 'react'
import { usePielEstudio } from '../components/PielEstudio'
import { Brand, Button, Card, Icon } from './components'
import './workspace.css'
export function MyQBankAuthFrame({ children }: { children: ReactNode }) {
  const theme = usePielEstudio()
  useEffect(() => { document.title = 'My Q Bank'; document.documentElement.lang = 'en' }, [])
  return <main className="mq-root mq-auth mq-workspace" data-theme={theme.piel === 'claro' ? 'light' : 'dark'}>
    <header className="mq-auth-header"><Brand/><Button aria-label="Change theme" onClick={theme.alternar}><Icon name={theme.piel === 'claro' ? 'moon' : 'sun'}/></Button></header>
    <Card className="mq-auth-card"><p className="mq-eyebrow">ONE FOCUSED BLOCK AT A TIME</p>{children}</Card>
    <p className="mq-small mq-muted">Your study, your pace. Resume on any device.</p>
  </main>
}
