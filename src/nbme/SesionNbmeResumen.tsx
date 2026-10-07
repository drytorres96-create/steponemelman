import { useState } from 'react'
import type { NbmeSession, NbmeState } from './types'
import { resumenSesionNbme } from './sesiones-resumen'

export function SesionNbmeResumen({ state, session, busy, onContinuar, onFalladas, onBorrar }:
  { state: NbmeState; session: NbmeSession; busy: boolean; onContinuar: () => void; onFalladas: () => void; onBorrar: () => boolean }) {
  const [confirm, setConfirm] = useState(false)
  const [failure, setFailure] = useState(false)
  const { view, correct, wrong, unanswered, percentage, status } = resumenSesionNbme(state, session)
  const label = `Primera vuelta: ${correct} correctas (${Math.round(percentage(correct))}%), ${wrong} equivocadas (${Math.round(percentage(wrong))}%), ${unanswered} sin respuesta válida (${Math.round(percentage(unanswered))}%).`
  return <article className="nbme-session-card" aria-label={session.title}>
    <div className="nbme-session-title"><h3>{session.title}</h3><span className={`nbme-session-state${view.phase === 'complete' ? ' complete' : ''}`}>{status}</span></div>
    <p className="mini">{view.firstAnswered}/{view.initialCount} respondidas en primera vuelta · {view.pendingErrors} correcciones pendientes</p>
    <div className="nbme-session-distribution" role="img" aria-label={label}>
      <span className="correct" style={{ width: `${percentage(correct)}%` }} />
      <span className="wrong" style={{ width: `${percentage(wrong)}%` }} />
      <span className="unanswered" style={{ width: `${percentage(unanswered)}%` }} />
    </div>
    <p className="nbme-session-legend mini"><span className="correct">{Math.round(percentage(correct))}% correctas</span><span className="wrong">{Math.round(percentage(wrong))}% equivocadas</span><span className="unanswered">{Math.round(percentage(unanswered))}% sin responder</span></p>
    {!!view.firstConflicts && <p className="mini">{view.firstConflicts} respuestas en conflicto se muestran en gris.</p>}
    <div className="nbme-actions">
      <button className="btn" disabled={busy || view.phase === 'complete'} onClick={onContinuar}>Continuar</button>
      <button className="btn" disabled={busy || !wrong} onClick={onFalladas}>Ver solo falladas{wrong ? ` (${wrong})` : ''}</button>
      <button className="btn fantasma" disabled={busy} onClick={() => { setConfirm(true); setFailure(false) }}>Borrar sesión</button>
    </div>
    {confirm && <div className="nbme-session-delete" role="group" aria-label="Confirmar borrado de sesión">
      <p className="mini">Se quita esta sesión de la lista. Tus respuestas, aciertos, errores y el progreso de conceptos se conservan.</p>
      <div className="nbme-actions"><button className="btn" disabled={busy} onClick={() => {
        if (onBorrar()) setConfirm(false); else setFailure(true)
      }}>Sí, borrar sesión</button><button className="btn fantasma" onClick={() => setConfirm(false)}>Cancelar</button></div>
      {failure && <p role="alert">No se pudo quitar la sesión. Espera a que cargue tu cuenta y vuelve a intentarlo.</p>}
    </div>}
  </article>
}
