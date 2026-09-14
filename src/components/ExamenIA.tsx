import { useEffect, useRef, useState } from 'react'
import type { Concepto } from '../schema/concept'
import { comoCaeEnElExamen, type CoachExamen } from '../lib/examen-ia'

/**
 * «Cómo caería esto en el examen»: la viñeta que preguntaría este concepto.
 *
 * Existe para el problema contrario al de la ayuda. La ayuda aparece cuando fallas; esto
 * aparece siempre, porque un concepto que parece cien por cien teórico se vuelve útil
 * cuando ves en qué ítem cae y qué hallazgo lo delata.
 *
 * Es el único sitio de la aplicación donde se muestra contenido que el modelo escribe en
 * vez de reordenar el del corpus, así que no se califica, no cuenta como intento y no
 * mueve tu dominio ni tus repasos. La pantalla lo dice sin letra pequeña.
 */
export function ExamenIA({ concepto }: { concepto: Concepto }) {
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [examen, setExamen] = useState<CoachExamen | null>(null)
  const control = useRef<AbortController | null>(null)
  useEffect(() => () => control.current?.abort(), [])

  const pedir = async () => {
    if (cargando) return
    const abort = new AbortController(); control.current = abort
    setCargando(true); setAviso('')
    const resultado = await comoCaeEnElExamen(concepto.concept_id, abort.signal)
    if (abort.signal.aborted) return
    setCargando(false)
    if (resultado.estado === 'ok') setExamen(resultado.examen)
    else setAviso(resultado.motivo)
  }

  return <section className="pila" aria-label="Cómo caería en el examen" style={{ gap: 10 }}>
    {!examen && <button className="btn pequeno" disabled={cargando} onClick={() => void pedir()}>
      {cargando ? 'Escribiendo la viñeta…' : 'Muéstrame cómo caería en el examen'}
    </button>}
    {aviso && <p className="mini" role="status">{aviso}</p>}
    {!examen && <p className="mini">Te enseña el ítem que preguntaría este concepto, el hallazgo que decide la respuesta y el patrón para reconocerlo.</p>}

    {examen && <>
      <h3>Así podría caer</h3>
      <blockquote>{examen.vineta}</blockquote>
      {examen.dato_clave && <p><b>El dato que manda:</b> {examen.dato_clave}</p>}
      <p className="patron"><b>Patrón para llevarte:</b> {examen.patron}</p>
      <div className="pila" style={{ gap: 4 }}>
        <p><b>Por dónde te querrían llevar:</b></p>
        <ul className="mini">{examen.trampas.map(t => <li key={t.opcion}><b>{t.opcion}:</b> {t.por_que}</li>)}</ul>
      </div>
      {examen.utilidad && <p className="mini"><b>Para qué sirve reconocerlo:</b> {examen.utilidad}</p>}
      <p className="mini">Viñeta escrita por IA a partir de este concepto. A diferencia de la explicación, no está
        verificada contra la fuente: úsala para reconocer el patrón, no como material de referencia. No cuenta como
        intento ni cambia tu dominio.</p>
    </>}
  </section>
}
