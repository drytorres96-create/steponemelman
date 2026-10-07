import { useEffect, useRef, useState } from 'react'
import type { Concepto } from '../schema/concept'
import { explicarRespuesta } from '../lib/explicacion-ia'
import type { PresentacionIA } from '../lib/contexto-ia'
import { versionPregunta } from '../screens/sesion'
import type { CoachAnswer } from '../server/worker'
import { referenciaPagina } from '../lib/fuente'
import { referenciaDocente } from '../lib/fuente-docente'

export function AyudaIA({ concepto, respuesta, preguntaId, indice, ruta, reintento, versionFormato = 2 }: {
  concepto: Concepto; respuesta: string; preguntaId: string; indice: number; ruta: string; reintento: boolean
  versionFormato?: 1 | 2 | 3
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState<CoachAnswer | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const consultar = async () => {
    if (loading) return
    const abort = new AbortController(); controller.current = abort
    setLoading(true); setError('')
    try {
      const r = await explicarRespuesta({ conceptId: concepto.concept_id, answer: respuesta.slice(0, 500), questionId: preguntaId,
        version: versionPregunta(concepto), formatVersion: versionFormato, variantId: concepto.variante_id, index: indice,
        route: ruta as PresentacionIA['route'], retry: reintento }, abort.signal)
      if (!abort.signal.aborted) {
        if (r.estado === 'ok') setAnswer(r.data)
        else setError(r.motivo)
      }
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo abrir la ayuda.') }
    finally { if (!abort.signal.aborted) setLoading(false) }
  }
  return <section className="ayuda-ia" aria-label="Ayuda de IA">
    {!answer && <button className="btn pequeno" disabled={loading} onClick={() => void consultar()}>{loading ? 'Preparando una explicación breve…' : 'Explícame esta respuesta con IA'}</button>}
    {error && <p className="mini" role="status">{error}</p>}
    {answer && <div className="pila" style={{ gap: 8 }}>
      <h3>Una explicación más</h3>
      <p><b>Diferencia clave:</b> {answer.diferencia}</p><p>{answer.explicacion}</p><p><b>Para recordar:</b> {answer.recordar}</p>
      <details><summary>Fragmento utilizado</summary><blockquote>{answer.evidencia}</blockquote>
        <p className="mini">{concepto.revision_editorial ? referenciaDocente(concepto).title
          : `${concepto.source.doc_title} · ${referenciaPagina(concepto.source)}`}</p>
        {concepto.revision_editorial?.fuentes.map(f => <p className="mini" key={f.url}>
          <a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a></p>)}</details>
      <p className="mini">Ayuda generada por IA; puede equivocarse. Tu calificación y tu dominio no cambian por leerla.</p>
    </div>}
    {!answer && <p className="mini">Opcional · usa el concepto y tu respuesta · sale del presupuesto gratuito del día, que se renueva a las 00:00 UTC.</p>}
  </section>
}
