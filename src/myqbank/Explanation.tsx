import { useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabase'
import { leer, escribir } from '../store/db'
import { useAuth } from '../auth/AuthProvider'
import type { Concepto } from '../schema/concept'
import type { NbmeQuestion } from '../nbme/types'
import { availableSections, type ExplanationSection } from './contracts'
import { acceptedExplanation, editorialPath, fallbackSections, reviewedFiguresMatch, sourceIdentity, type EditorialExplanation } from './editorial'
import { Button, Card, Tabs } from './components'
import { HighlightText, type HighlightSource } from './HighlightText'
import { explanationPreview } from './summary'
import { versionPregunta } from '../screens/sesion'
function Section({ section, source, language }: { section: ExplanationSection; source: HighlightSource; language?: 'en' | 'es' }) {
  const [answer, setAnswer] = useState(false), [expanded, setExpanded] = useState(false)
  const answerId = useId()
  const paragraphs = section.paragraphs ?? [], initial = paragraphs[0] ?? ''
  // Progressive disclosure preserves complete sentences, negations, units and the original text.
  const short = explanationPreview(initial)
  const long = paragraphs.length > 1 || short.length < initial.length || (section.bullets?.length ?? 0) > 3
  const visibleParagraphs = expanded ? paragraphs : short ? [short] : []
  return <div className="mq-explanation-content" lang={language}><h3>{section.heading}</h3>
    {visibleParagraphs.map((p, i) => <p key={i}><HighlightText text={p} source={source} region={`${section.id}:paragraph:${i}`}/></p>)}
    {!!section.bullets?.length && <ul>{section.bullets.slice(0, expanded ? undefined : 3).map((b, i) => <li key={i}><HighlightText text={b} source={source} region={`${section.id}:bullet:${i}`}/></li>)}</ul>}
    {long && <Button lang="en" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Show less' : 'Read full explanation'}</Button>}
    {section.drill && <><p><HighlightText text={section.drill.prompt} source={source} region={`${section.id}:drill:prompt`}/></p><Button lang="en" aria-expanded={answer} aria-controls={answerId} onClick={() => setAnswer(v => !v)}>{answer ? 'Hide answer' : 'Reveal answer'}</Button><div id={answerId} hidden={!answer}><p className="mq-drill-answer"><HighlightText text={section.drill.answer} source={source} region={`${section.id}:drill:answer`}/></p></div><p lang="en" className="mq-small mq-muted">This practice does not change your original score.</p></>}
  </div>
}
// Keep a failed persistent revocation effective across remounts in this browser session.
const revokedCacheKeys = new Set<string>()
type ExplanationResult = { status: 'approved'; editorial: EditorialExplanation } | { status: 'missing' | 'unavailable' }
export function Explanation({ source, highlightSource, figures = [] }: { source: Concepto | NbmeQuestion; highlightSource: HighlightSource; figures?: { assetId: string; sha256?: string }[] }) {
  const { user } = useAuth()
  const userId = user?.id
  const [loaded, setLoaded] = useState<{ source: typeof source; userId: string | undefined; attempt: number; result: ExplanationResult } | null>(null)
  const [activeId, setActiveId] = useState(''), [attempt, setAttempt] = useState(0)
  // Guard the render itself: effects cannot prevent a previous account/source flashing first.
  const result = loaded?.source === source && loaded.userId === userId && loaded.attempt === attempt ? loaded.result : null
  const candidate = result?.status === 'approved' ? result.editorial : null
  const editorial = candidate?.language === 'es' && reviewedFiguresMatch(candidate, 'figures' in source ? source.figures : [], figures) ? candidate : null
  useEffect(() => {
    let alive = true
    setLoaded(null); setActiveId('')
    const finish = (result: ExplanationResult) => { if (alive) setLoaded({ source, userId, attempt, result }) }
    void (async () => {
      if (!userId) { finish({ status: 'unavailable' }); return }
      const identity = await sourceIdentity(source), path = editorialPath(identity), key = `myqbank-explanation:${userId}:${identity.sourceHash}`
      const fromCache = async () => {
        if (revokedCacheKeys.has(key)) { finish({ status: 'unavailable' }); return }
        const cached = await leer(key).catch(() => null)
        const accepted = await acceptedExplanation(cached, identity)
        finish(accepted ? { status: 'approved', editorial: accepted } : { status: 'unavailable' })
      }
      if (!alive) return
      if (!navigator.onLine) { await fromCache(); return }
      // A failed request is not proof that a companion does not exist.
      const response = await supabase.from(identity.kind === 'nbme' ? 'nbme_assets' : 'corpus_assets').select('payload').eq('path', path).maybeSingle()
        .then(value => value, () => null)
      if (!alive) return
      if (!response || response.error || !navigator.onLine) { await fromCache(); return }
      // An incomplete response proves neither absence nor revocation.
      if (response.data === undefined) { finish({ status: 'unavailable' }); return }
      const accepted = response.data === null ? null : await acceptedExplanation(response.data.payload, identity)
      if (!alive) return
      if (!accepted) {
        // Authoritative removal or rejection revokes older copies; transport errors do not.
        revokedCacheKeys.add(key)
        await escribir(key, null, { estricto: true })
        finish({ status: response.data === null ? 'missing' : 'unavailable' })
        return
      }
      finish({ status: 'approved', editorial: accepted })
      await escribir(key, accepted, { estricto: true }).then(() => { revokedCacheKeys.delete(key) }, () => undefined)
    })().catch(() => finish({ status: 'unavailable' }))
    return () => { alive = false }
  }, [source, userId, attempt])
  const sections = availableSections(editorial?.sections ?? (result?.status === 'missing' ? fallbackSections(source) : []))
  const section = sections.find(s => s.id === activeId) ?? sections[0]
  const evidence = editorial?.evidence.filter(e => e.sectionId === section?.id) ?? []
  if (!result) return <Card className="mq-explanation-card" lang="en"><p role="status">Loading explanation…</p></Card>
  if (!editorial && result.status !== 'missing') return <Card className="mq-explanation-card" lang="en">
    <p role="status">Explanation unavailable. Your answer is saved.</p>
    <Button onClick={() => setAttempt(value => value + 1)}>Retry explanation</Button>
  </Card>
  return <><Tabs label="Explanation sections" items={sections} activeId={section?.id ?? ''} onChange={setActiveId}>
    <Card className="mq-explanation-card">{section && <Section key={`${sourceIdentityKey(source)}:${editorial?.version ?? 'original'}:${section.id}`} section={section} language={editorial?.language ?? 'en'} source={{ ...highlightSource, editorialVersion: editorial?.version ?? 'original' }}/>}</Card>
  </Tabs>{!sections.length && <Card lang="en"><p role="status">Explanation pending. Your answer is saved.</p></Card>}
    {!!evidence.length && <details className="mq-sources"><summary>Sources for this section</summary><ul>{evidence.map((e, i) => <li key={`${e.sourceRef}:${i}`}><a href={e.sourceRef} target="_blank" rel="noopener noreferrer">{new URL(e.sourceRef).hostname}</a><span>{e.locator}</span></li>)}</ul></details>}
    <p className="mq-small mq-muted" lang="en">{editorial ? 'Explanation' : sections.length ? 'Original explanation' : 'Explanation pending'}</p>
  </>
}
function sourceIdentityKey(source: Concepto | NbmeQuestion) { return 'concept_id' in source ? `${source.concept_id}:${versionPregunta(source)}:${source.variante_id ?? ''}` : `${source.id}:${source.revision}` }
