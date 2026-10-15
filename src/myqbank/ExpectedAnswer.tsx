import type { Concepto } from '../schema/concept'
import { normalizar } from '../lib/normalize'
import { HighlightText, type HighlightSource } from './HighlightText'

/** Literal grading contract, not a generated paraphrase of the explanation. */
export function ExpectedAnswer({ concept, source }: { concept: Concepto; source: HighlightSource }) {
  const seen = new Set([normalizar(concept.respuesta_canonica)])
  const alternatives = (concept.interaccion.recomendada === 'numerico' ? [] : [...concept.sinonimos, ...concept.evaluacion.respuestas_aceptadas]).filter(answer => {
    const key = normalizar(answer)
    if (!key || seen.has(key)) return false
    seen.add(key); return true
  })
  return <section className="mq-expected-answer mq-card" aria-label="Expected answer">
    <h2>Expected answer</h2>
    <p className="mq-expected-wording"><HighlightText text={concept.respuesta_canonica} source={source} region="expected:canonical"/></p>
    <p className="mq-small mq-muted">You can enter this exact wording.</p>
    {alternatives.length > 0 && <><h3>Also accepted</h3><p className="mq-small mq-muted">Any one of these alternatives is enough.</p>
      <ul>{alternatives.map((answer, i) => <li key={answer}><HighlightText text={answer} source={source} region={`expected:alternative:${i}`}/></li>)}</ul></>}
  </section>
}
