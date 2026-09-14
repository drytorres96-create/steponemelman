import { useEffect, useRef, useState } from 'react'
import type { Concepto } from '../schema/concept'
import { preguntarSobreConcepto, type TurnoChat } from '../lib/chat-ia'
import { sugerenciasDePregunta } from '../lib/sugerencias-chat'

/** Un turno pintado: los de la IA llevan de dónde sale lo que dicen. */
type Mensaje = TurnoChat & { apoyo?: 'material' | 'conocimiento'; patron?: string; fallo?: boolean }

/**
 * Chat sobre el ítem que acabas de responder.
 *
 * La explicación del concepto contesta la pregunta que el material decidió contestar. La
 * duda real suele ser otra y más pequeña —«¿por qué la captación de yodo baja aquí?»—, y
 * hasta ahora había que salir de la aplicación a buscarla. Esto la resuelve donde aparece,
 * con el material del concepto delante.
 *
 * Las sugerencias salen del propio ítem, no de la IA: sus filas, sus opciones incorrectas
 * y sus confusiones declaradas. Así la primera pregunta está a un toque.
 *
 * Como la viñeta de examen, esto no se califica ni toca tu dominio. Cada respuesta dice si
 * se apoya en el material o en fisiología general, porque no es lo mismo.
 */
export function ChatConcepto({ concepto }: { concepto: Concepto }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const control = useRef<AbortController | null>(null)
  const finRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => () => control.current?.abort(), [])
  // El autoscroll es un adorno: donde no exista, el hilo tiene que seguir funcionando igual.
  useEffect(() => {
    if (mensajes.length) finRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [mensajes, pensando])

  const sugerencias = sugerenciasDePregunta(concepto)

  const enviar = async (pregunta: string) => {
    const limpia = pregunta.trim()
    if (!limpia || pensando) return
    const abort = new AbortController(); control.current = abort
    // El historial que viaja es el de antes de esta pregunta: la pregunta va aparte.
    const previos = mensajes.filter(m => !m.fallo).map(({ rol, texto }) => ({ rol, texto }))
    setMensajes(m => [...m, { rol: 'yo', texto: limpia }])
    setTexto(''); setPensando(true)
    const resultado = await preguntarSobreConcepto(concepto.concept_id, limpia, previos, abort.signal)
    if (abort.signal.aborted) return
    setPensando(false)
    setMensajes(m => [...m, resultado.estado === 'ok'
      ? { rol: 'ia', texto: resultado.respuesta.respuesta, apoyo: resultado.respuesta.apoyo, patron: resultado.respuesta.patron }
      : { rol: 'ia', texto: resultado.motivo, fallo: true }])
  }

  return <section className="chat" aria-label="Preguntar sobre este concepto">
    <header className="chat-cabecera">
      <span className="chat-avatar" aria-hidden="true">💬</span>
      <div>
        <h3>Pregúntame sobre esta pregunta</h3>
        <p className="mini">Dudas concretas del ítem: por qué una fila va hacia abajo, por qué no era otra opción.</p>
      </div>
    </header>

    {mensajes.length > 0 && <div className="chat-hilo">
      {mensajes.map((m, n) => <div key={n} className={`chat-turno ${m.rol === 'yo' ? 'chat-mio' : 'chat-suyo'}`}>
        <span className="chat-icono" aria-hidden="true">{m.rol === 'yo' ? '🧑‍⚕️' : m.fallo ? '⚠️' : '🧠'}</span>
        <div className="chat-burbuja">
          <p>{m.texto}</p>
          {m.patron && <p className="chat-patron">🔑 {m.patron}</p>}
          {m.rol === 'ia' && !m.fallo && <p className="chat-apoyo">
            {m.apoyo === 'material' ? '📗 Apoyado en el material de este concepto' : '💡 Fisiología general, fuera del material: contrástalo'}
          </p>}
        </div>
      </div>)}
      {pensando && <div className="chat-turno chat-suyo">
        <span className="chat-icono" aria-hidden="true">🧠</span>
        <div className="chat-burbuja"><span className="chat-puntos" role="status" aria-label="Pensando">
          <i /><i /><i />
        </span></div>
      </div>}
      <div ref={finRef} />
    </div>}

    {!pensando && sugerencias.length > 0 && <div className="chat-sugerencias">
      {sugerencias.map(s => <button key={s} type="button" className="chat-chip" onClick={() => void enviar(s)}>{s}</button>)}
    </div>}

    <form className="chat-entrada" onSubmit={e => { e.preventDefault(); void enviar(texto) }}>
      <input type="text" value={texto} maxLength={400} disabled={pensando}
        placeholder="Escribe tu duda sobre este ítem…" aria-label="Tu pregunta"
        onChange={e => setTexto(e.target.value)} />
      <button className="btn principal pequeno" type="submit" disabled={pensando || !texto.trim()}>
        {pensando ? 'Pensando…' : 'Preguntar'}
      </button>
    </form>
    <p className="mini">Respuestas generadas por IA sobre el material de este concepto; pueden equivocarse. No se califican ni cambian tu dominio.</p>
  </section>
}
