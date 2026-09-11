import { useEffect, useRef, useState } from 'react'
import type { Concepto } from '../schema/concept'
import { supabase } from '../lib/supabase'
import { versionPregunta } from '../screens/sesion'
import type { CoachAnswer } from '../server/worker'
import { referenciaPagina } from '../lib/fuente'

export function AyudaIA({ concepto, respuesta, preguntaId, indice, ruta, reintento, versionFormato = 2 }: {
  concepto: Concepto; respuesta: string; preguntaId: string; indice: number; ruta: string; reintento: boolean
  versionFormato?: 1 | 2
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Inicia sesión para usar la ayuda.')
      const response = await fetch('/api/explicar', { method: 'POST', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ conceptId: concepto.concept_id, answer: respuesta.slice(0, 500), questionId: preguntaId,
          version: versionPregunta(concepto), formatVersion: versionFormato, variantId: concepto.variante_id, index: indice, route: ruta, retry: reintento }) })
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('La ayuda de IA todavía no está disponible en este entorno.')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo abrir la ayuda.')
      if (!abort.signal.aborted) setAnswer(data)
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
        <p className="mini">{concepto.source.doc_title} · {referenciaPagina(concepto.source)}</p></details>
      <p className="mini">Ayuda generada por IA; puede equivocarse. Tu calificación y tu dominio no cambian por leerla.</p>
    </div>}
    {!answer && <p className="mini">Opcional · usa el concepto y tu respuesta · hasta 20 ayudas nuevas al día, sujetas a la cuota gratuita.</p>}
  </section>
}
