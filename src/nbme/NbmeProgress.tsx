import { useMemo } from 'react'
import { useNbme } from './NbmeProvider'
import { deriveNbmeSession, questionProgress, summarizeNbmeState } from './model'
import './nbme.css'

export function NbmeProgress({ onContinuar }: { onContinuar?: () => void }) {
  const { catalog, state, loading, busy, resumeSession } = useNbme()
  const summary = useMemo(() => summarizeNbmeState(state), [state])
  const pending = useMemo(() => Object.values(state.sessions)
    .filter(session => deriveNbmeSession(state, session.id)?.phase !== 'complete')
    .sort((a, b) => b.controlChangedAt - a.controlChangedAt)[0], [state])
  const byForm = useMemo(() => (['27', '28', '29'] as const).map(form => {
    const questions = (catalog?.questions ?? []).filter(q => q.form === form)
    const progress = questions.map(q => questionProgress(state, q.id))
    return { form, seen: progress.filter(p => p.seen).length, correct: progress.filter(p => p.firstCorrect === true).length,
      evaluated: progress.filter(p => p.firstCorrect !== null).length, pending: progress.filter(p => p.pendingError).length }
  }), [catalog, state])

  if (loading) return <section className="tarjeta nbme-progress"><h2>Preguntas de aplicación</h2><p role="status" className="sutil">Cargando progreso…</p></section>

  return <section className="tarjeta nbme-progress pila" aria-labelledby="nbme-progress-title">
    <div><h2 id="nbme-progress-title">Preguntas de aplicación</h2>
      <p className="sutil">Tu práctica con las formas 27, 28 y 29.</p></div>
    {summary.seen ? <>
      <dl className="nbme-counts"><div><dt>Preguntas respondidas</dt><dd>{summary.seen}</dd></div>
        <div><dt>Aciertos en primera respuesta</dt><dd>{summary.firstCorrect}/{summary.firstEvaluated}</dd></div>
        <div><dt>Errores pendientes</dt><dd>{summary.pendingErrors}</dd></div></dl>
      <p className="mini">Se cuenta la primera respuesta registrada aquí para cada pregunta. Los reintentos no modifican ese resultado.</p>
      {summary.firstConflicts > 0 && <p className="sutil">{summary.firstConflicts} preguntas tienen primeras respuestas en conflicto entre dispositivos y quedan fuera del cálculo de aciertos.</p>}
      <details className="nbme-details"><summary>Ver por forma</summary><div className="nbme-table-wrap"><table className="nbme-quality-table">
        <thead><tr><th scope="col">Forma</th><th scope="col">Respondidas</th><th scope="col">Primeros aciertos</th><th scope="col">Errores pendientes</th></tr></thead>
        <tbody>{byForm.map(item => <tr key={item.form}><th scope="row">NBME {item.form}</th><td>{item.seen}</td><td>{item.correct}/{item.evaluated}</td><td>{item.pending}</td></tr>)}</tbody>
      </table></div></details>
    </> : <p className="sutil">Tus respuestas y correcciones aparecerán aquí cuando comiences a practicar.</p>}
    {pending && onContinuar && <div className="nbme-actions"><button className="btn" disabled={busy} onClick={async () => { if (await resumeSession(pending.id)) onContinuar() }}>Continuar sesión de preguntas</button></div>}
    <p className="mini">Estos resultados describen tu práctica; no son una puntuación NBME ni una predicción de aprobación.</p>
  </section>
}
