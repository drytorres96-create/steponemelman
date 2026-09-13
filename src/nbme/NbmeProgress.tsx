import { useMemo } from 'react'
import { useNbme } from './NbmeProvider'
import { deriveNbmeSession, summarizeNbmeState } from './model'
import { progresoPorForma, type ResumenForma } from './formas'
import { lunesDe } from '../lib/tiempo'
import './nbme.css'

const pct = (n: number) => `${Math.round(n * 100)} %`

function FilaForma({ fila }: { fila: ResumenForma }) {
  const evaluadas = fila.correctas + fila.incorrectas
  return <article className="nbme-forma">
    <div className="nbme-forma-encabezado">
      <h3>NBME {fila.form}</h3>
      <span className="etq">{fila.vistas} de {fila.total} vistas · {pct(fila.porcentaje)}</span>
    </div>
    <progress className="nbme-forma-barra" aria-label={`Cobertura de la forma ${fila.form}`}
      value={fila.vistas} max={fila.total || 1} />
    <dl className="nbme-forma-cifras">
      <div><dt>Vistas</dt><dd>{fila.vistas}</dd></div>
      <div><dt>Correctas</dt><dd>{fila.correctas}</dd></div>
      <div><dt>Incorrectas</dt><dd>{fila.incorrectas}</dd></div>
      <div><dt>A la primera</dt><dd>{fila.primeraVez}</dd></div>
      <div><dt>Reincidentes</dt><dd>{fila.reincidentes}</dd></div>
    </dl>
    <p className="mini">{evaluadas
      ? `${pct(fila.correctas / evaluadas)} correctas sobre las vistas. «A la primera» cuenta el primer intento registrado de cada pregunta; «reincidentes», las falladas dos veces o más.`
      : 'Sin respuestas registradas en esta forma todavía.'}</p>
  </article>
}

export function NbmeProgress({ onContinuar, ventana = 'general' }:
  { onContinuar?: () => void; ventana?: 'semana' | 'general' }) {
  const { catalog, state, loading, busy, resumeSession } = useNbme()
  const desde = ventana === 'semana' ? lunesDe().getTime() : 0
  const summary = useMemo(() => summarizeNbmeState(state), [state])
  const pending = useMemo(() => Object.values(state.sessions)
    .filter(session => deriveNbmeSession(state, session.id)?.phase !== 'complete')
    .sort((a, b) => b.controlChangedAt - a.controlChangedAt)[0], [state])
  const formas = useMemo(() => progresoPorForma(state, catalog, desde), [state, catalog, desde])
  const totales = formas.reduce((s, f) => ({
    total: s.total + f.total, vistas: s.vistas + f.vistas, correctas: s.correctas + f.correctas,
    incorrectas: s.incorrectas + f.incorrectas, primeraVez: s.primeraVez + f.primeraVez,
    reincidentes: s.reincidentes + f.reincidentes,
  }), { total: 0, vistas: 0, correctas: 0, incorrectas: 0, primeraVez: 0, reincidentes: 0 })

  if (loading) return <section className="tarjeta nbme-progress"><h2>Preguntas de aplicación</h2><p role="status" className="sutil">Cargando progreso…</p></section>

  return <section className="tarjeta nbme-progress pila" aria-labelledby="nbme-progress-title">
    <div><h2 id="nbme-progress-title">Preguntas de aplicación</h2>
      <p className="sutil">{ventana === 'semana'
        ? 'Lo que has respondido de las formas 27, 28 y 29 desde el lunes.'
        : 'Tu práctica con las formas 27, 28 y 29.'}</p></div>

    {totales.vistas ? <>
      <dl className="nbme-counts">
        <div><dt>Vistas</dt><dd>{totales.vistas}/{totales.total}</dd></div>
        <div><dt>Correctas</dt><dd>{totales.correctas}</dd></div>
        <div><dt>Incorrectas</dt><dd>{totales.incorrectas}</dd></div>
        <div><dt>A la primera</dt><dd>{totales.primeraVez}</dd></div>
        <div><dt>Reincidentes</dt><dd>{totales.reincidentes}</dd></div>
      </dl>
      <p className="mini">«Correctas» e «incorrectas» describen cómo quedó el último intento de cada pregunta; por eso corregir un error lo mueve de una columna a la otra.</p>
      {ventana === 'general' && summary.firstConflicts > 0 && <p className="sutil">{summary.firstConflicts} preguntas tienen primeras respuestas en conflicto entre dispositivos y quedan fuera del cálculo de aciertos.</p>}
    </> : <p className="sutil">{ventana === 'semana'
      ? 'Todavía no has respondido preguntas esta semana.'
      : 'Tus respuestas y correcciones aparecerán aquí cuando comiences a practicar.'}</p>}

    <div className="nbme-formas">{formas.map(fila => <FilaForma key={fila.form} fila={fila} />)}</div>

    {pending && onContinuar && <div className="nbme-actions"><button className="btn" disabled={busy} onClick={async () => { if (await resumeSession(pending.id)) onContinuar() }}>Continuar sesión de preguntas</button></div>}
    <p className="mini">Estos resultados describen tu práctica; no son una puntuación NBME ni una predicción de aprobación.</p>
  </section>
}
