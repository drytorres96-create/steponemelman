import { useEffect, useState } from 'react'
import { Modal } from '../components/comunes'
import { useNbme } from './NbmeProvider'
import { normalizarTexto } from './texto'
import type { NbmeFailedReview } from './types'

function FiguraFallada({ assetId, alt }: { assetId: string; alt: string }) {
  const { loadFigure } = useNbme()
  const [url, setUrl] = useState<string | null>(null)
  const [failure, setFailure] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    void loadFigure(assetId, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl)
    }).catch(() => { if (!controller.signal.aborted) setFailure(true) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [assetId, loadFigure])
  return url ? <img className="nbme-failed-figure" src={url} alt={alt} /> : <p role="status">{failure ? 'No se pudo cargar la figura.' : 'Cargando figura…'}</p>
}

export function FalladasNbme({ sessionId, titulo, onCerrar }: { sessionId: string; titulo: string; onCerrar: () => void }) {
  const { reviewSessionFailures } = useNbme()
  const [items, setItems] = useState<NbmeFailedReview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setItems(null); setError(null); setIndex(0)
    void reviewSessionFailures(sessionId, controller.signal).then(result => {
      if (!controller.signal.aborted) setItems(result)
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se pudieron cargar las preguntas falladas.') })
    return () => controller.abort()
  }, [sessionId, retry, reviewSessionFailures])
  const item = items?.[index]
  return <Modal titulo="Preguntas falladas" onCerrar={onCerrar} ancho={850}>
    <div className="pila nbme-failed-review"><p className="sutil">{titulo}</p>
      <p className="mini">Revisión de los errores en la primera vuelta. No cambia tus respuestas ni abre otra sesión.</p>
      {error && <div role="alert"><p>{error}</p><button className="btn" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>}
      {!items && !error && <p role="status">Cargando las versiones originales…</p>}
      {items && !items.length && <p>No hay preguntas falladas en la primera vuelta.</p>}
      {item && <>
        <h3>Pregunta fallada {index + 1} de {items!.length}</h3>
        <p className="nbme-source-text" lang="en">{normalizarTexto(item.question.stem)}</p>
        {item.question.figures.map(figure => <FiguraFallada key={figure.assetId} {...figure} />)}
        <ul className="nbme-failed-options" lang="en">{item.question.options.map(option => <li key={option.id} className={option.id === item.question.answer ? 'correct' : option.id === item.attempt.optionId ? 'wrong' : ''}>
          <b>{option.id}.</b> {normalizarTexto(option.text)}
          {option.id === item.attempt.optionId && <span className="nbme-option-state" lang="es">Tu respuesta original</span>}
          {option.id === item.question.answer && <span className="nbme-option-state" lang="es">Respuesta correcta</span>}
        </li>)}</ul>
        {item.question.explanation && <div><h3>Explicación</h3><p className="nbme-source-text" lang="en">{normalizarTexto(item.question.explanation)}</p></div>}
        {item.question.objective && <div><h3>Objetivo del aprendizaje</h3><p className="nbme-source-text" lang="en">{normalizarTexto(item.question.objective)}</p></div>}
        <div className="nbme-actions"><button className="btn" disabled={index === 0} onClick={() => setIndex(value => value - 1)}>Anterior</button>
          {index < items!.length - 1 ? <button className="btn" onClick={() => setIndex(value => value + 1)}>Siguiente fallada</button> : <button className="btn" onClick={onCerrar}>Volver a mis sesiones</button>}
        </div>
      </>}
    </div>
  </Modal>
}
