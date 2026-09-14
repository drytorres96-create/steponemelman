import { useEffect, useState } from 'react'
import { conQueSeConfundio, ORIGEN_PARECIDO, type CoachConfusion } from '../lib/confusion-ia'

/**
 * Con qué confundiste lo que escribiste.
 *
 * Saber que fallaste ya lo dice el veredicto; lo que no dice es hacia dónde te fuiste. Esto
 * compara tu respuesta con los textos que el propio concepto trae —la respuesta buena, sus
 * sinónimos, los distractores declarados, las confusiones conocidas— y nombra el más
 * cercano. Si nada se parece lo bastante, no dice nada: es preferible el silencio a
 * sugerir una confusión que no existe.
 *
 * Se pide solo, porque cuesta del orden de una neurona y su valor está en verlo sin
 * buscarlo. Si no hay red o no hay cuota, desaparece sin ruido.
 */
export function ConfusionIA({ conceptId, respuesta }: { conceptId: string; respuesta: string }) {
  const [dato, setDato] = useState<CoachConfusion | null>(null)
  useEffect(() => {
    const control = new AbortController()
    setDato(null)
    void conQueSeConfundio(conceptId, respuesta, control.signal).then(r => { if (!control.signal.aborted) setDato(r) })
    return () => control.abort()
  }, [conceptId, respuesta])

  if (!dato?.mejor) return null
  const { texto, origen, similitud } = dato.mejor
  return <p className="mini" role="status">
    <b>Te fuiste hacia:</b> «{texto}» — {ORIGEN_PARECIDO[origen]}.
    <span className="sutil"> Parecido {Math.round(similitud * 100)} %.</span>
  </p>
}
