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
export function Explanation({ source, highlightSource, figures = [] }: { source: Concepto | NbmeQuestion; highlightSource: HighlightSource; figures?: { assetId: string; sha256?: string }[] }) {
  const { user } = useAuth()
  const [loaded, setLoaded] = useState<{ source: typeof source; userId: string; editorial: EditorialExplanation | null } | null>(null)
  const [activeId, setActiveId] = useState(''), [pending, setPending] = useState(true)
  // A new source must never render the previous source's explanation before the effect runs.
  const candidate = loaded?.source === source && loaded.userId === user?.id ? loaded.editorial : null
  const editorial = candidate?.language === 'es' && reviewedFiguresMatch(candidate, 'figures' in source ? source.figures : [], figures) ? candidate : null
  useEffect(() => {
    let alive = true
    setLoaded(null); setActiveId(''); setPending(true)
    void (async () => {
      if (!user) return
      const identity = await sourceIdentity(source), path = editorialPath(identity), key = `myqbank-explanation:${user.id}:${identity.sourceHash}`
      if (!navigator.onLine) { const cached = await leer(key).catch(() => null); const accepted = await acceptedExplanation(cached, identity); if (alive) setLoaded({ source, userId: user.id, editorial: accepted }); return }
      const { data, error } = await supabase.from(identity.kind === 'nbme' ? 'nbme_assets' : 'corpus_assets').select('payload').eq('path', path).maybeSingle()
      if (!alive || error) return
      const accepted = await acceptedExplanation(data?.payload, identity)
      if (!alive) return
      setLoaded({ source, userId: user.id, editorial: accepted })
      await escribir(key, accepted).catch(() => undefined)
    })().catch(() => undefined).finally(() => { if (alive) setPending(false) })
    return () => { alive = false }
  }, [source, user?.id])
  const sections = availableSections(editorial?.sections ?? fallbackSections(source))
  const section = sections.find(s => s.id === activeId) ?? sections[0]
  const evidence = editorial?.evidence.filter(e => e.sectionId === section?.id) ?? []
  return <><Tabs label="Explanation sections" items={sections} activeId={section?.id ?? ''} onChange={setActiveId}>
    <Card className="mq-explanation-card">{section && <Section key={`${sourceIdentityKey(source)}:${editorial?.version ?? 'original'}:${section.id}`} section={section} language={editorial?.language ?? 'en'} source={{ ...highlightSource, editorialVersion: editorial?.version ?? 'original' }}/>}</Card>
  </Tabs>{!sections.length && <Card><p>Explanation pending. Your answer is saved.</p></Card>}
    {!!evidence.length && <details className="mq-sources"><summary>Sources for this section</summary><ul>{evidence.map((e, i) => <li key={`${e.sourceRef}:${i}`}><a href={e.sourceRef} target="_blank" rel="noopener noreferrer">{new URL(e.sourceRef).hostname}</a><span>{e.locator}</span></li>)}</ul></details>}
    <p className="mq-small mq-muted">{pending ? 'Loading explanation…' : editorial ? `Explanation · ${editorial.independentReview?.kind === 'ai' ? 'independent AI review' : 'independent human review'}` : sections.length ? 'Original explanation' : 'Explanation pending'}</p>
  </>
}
function sourceIdentityKey(source: Concepto | NbmeQuestion) { return 'concept_id' in source ? `${source.concept_id}:${versionPregunta(source)}:${source.variante_id ?? ''}` : `${source.id}:${source.revision}` }
