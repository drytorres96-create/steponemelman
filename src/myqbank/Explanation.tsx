import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { leer, escribir } from '../store/db'
import { useAuth } from '../auth/AuthProvider'
import type { Concepto } from '../schema/concept'
import type { NbmeQuestion } from '../nbme/types'
import { availableSections, type ExplanationSection } from './contracts'
import { acceptedExplanation, editorialPath, fallbackSections, sourceIdentity, type EditorialExplanation } from './editorial'
import { Button, Card, Tabs } from './components'
import { HighlightText, type HighlightSource } from './HighlightText'
function Section({ section, source, language }: { section: ExplanationSection; source: HighlightSource; language?: 'en' | 'es' }) {
  const [answer, setAnswer] = useState(false), [expanded, setExpanded] = useState(false)
  const paragraphs = section.paragraphs ?? [], initial = paragraphs[0] ?? ''
  // Progressive disclosure preserves complete sentences, negations, units and the original text.
  const sentences = initial.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [initial]
  let words = 0, short = ''
  for (const sentence of sentences) { const count = sentence.trim().split(/\s+/).length; if (short && words + count > 80) break; short += sentence; words += count }
  const long = paragraphs.length > 1 || short.length < initial.length || (section.bullets?.length ?? 0) > 3
  const visibleParagraphs = expanded ? paragraphs : short ? [short] : []
  return <div className="mq-explanation-content" lang={language}><h3>{section.heading}</h3>
    {visibleParagraphs.map((p, i) => <p key={i}><HighlightText text={p} source={source} region={`${section.id}:paragraph:${i}`}/></p>)}
    {!!section.bullets?.length && <ul>{section.bullets.slice(0, expanded ? undefined : 3).map((b, i) => <li key={i}><HighlightText text={b} source={source} region={`${section.id}:bullet:${i}`}/></li>)}</ul>}
    {long && <Button aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Show less' : 'Read full explanation'}</Button>}
    {section.drill && <><p><HighlightText text={section.drill.prompt} source={source} region={`${section.id}:drill:prompt`}/></p><Button aria-expanded={answer} onClick={() => setAnswer(v => !v)}>{answer ? 'Hide answer' : 'Reveal answer'}</Button>{answer && <p className="mq-drill-answer"><HighlightText text={section.drill.answer} source={source} region={`${section.id}:drill:answer`}/></p>}<p className="mq-small mq-muted">This practice does not change your original score.</p></>}
  </div>
}
export function Explanation({ source, highlightSource }: { source: Concepto | NbmeQuestion; highlightSource: HighlightSource }) {
  const { user } = useAuth()
  const [editorial, setEditorial] = useState<EditorialExplanation | null>(null), [activeId, setActiveId] = useState(''), [pending, setPending] = useState(true)
  useEffect(() => {
    let alive = true
    setEditorial(null); setActiveId(''); setPending(true)
    void (async () => {
      if (!user) return
      const identity = await sourceIdentity(source), path = editorialPath(identity), key = `myqbank-explanation:${user.id}:${identity.sourceHash}`
      if (!navigator.onLine) { const cached = await leer(key).catch(() => null); if (alive) setEditorial(acceptedExplanation(cached, identity)); return }
      const { data, error } = await supabase.from(identity.kind === 'nbme' ? 'nbme_assets' : 'corpus_assets').select('payload').eq('path', path).maybeSingle()
      if (!alive || error) return
      const accepted = acceptedExplanation(data?.payload, identity)
      setEditorial(accepted)
      if (accepted) await escribir(key, accepted).catch(() => undefined)
    })().catch(() => undefined).finally(() => { if (alive) setPending(false) })
    return () => { alive = false }
  }, [source, user?.id])
  const sections = availableSections(editorial?.sections ?? fallbackSections(source))
  const section = sections.find(s => s.id === activeId) ?? sections[0]
  return <><Tabs label="Explanation sections" items={sections} activeId={section?.id ?? ''} onChange={setActiveId}>
    <Card className="mq-explanation-card">{section && <Section key={`${sourceIdentityKey(source)}:${section.id}`} section={section} language={editorial ? 'es' : 'concept_id' in source ? undefined : 'en'} source={{ ...highlightSource, editorialVersion: editorial?.version ?? 'original' }}/>}</Card>
  </Tabs>{!sections.length && <Card><p>Explanation pending. Your answer is saved.</p></Card>}
    <p className="mq-small mq-muted">{pending ? 'Checking the Spanish adaptation…' : editorial ? 'Spanish adaptation · source matched' : 'Spanish adaptation pending · existing explanation available'}</p>
  </>
}
function sourceIdentityKey(source: Concepto | NbmeQuestion) { return 'concept_id' in source ? `${source.concept_id}:${source.variante_id ?? ''}` : `${source.id}:${source.revision}` }
