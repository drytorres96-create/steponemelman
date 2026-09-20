import { useEffect, useMemo, useState } from 'react'
import { useNbme } from './NbmeProvider'
import { deriveNbmeSession, questionProgress } from './model'
import type { NbmeQuestionMeta } from './types'
import { ScreenHeading } from '../components/Editorial'
import './nbme.css'

export function NbmeLibrary({ onStart }: { onStart: () => void }) {
  const { catalog, state, filters, setFilters, loading, busy, error, startSession, resumeSession,
    discardSession, attemptsInSession, reloadCatalog, catalogStale } = useNbme()
  // El catálogo se refresca al abrir esta vista, no en el arranque de la aplicación.
  useEffect(() => { if (catalogStale) void reloadCatalog() }, [catalogStale, reloadCatalog])
  const [confirmarDescarte, setConfirmarDescarte] = useState<string | null>(null)
  const questions = catalog?.questions ?? []
  const systems = useMemo(() => [...new Set(questions.flatMap(q => q.systems))].sort((a, b) => a.localeCompare(b, 'es')), [catalog])
  const disciplines = useMemo(() => [...new Set(questions.flatMap(q => q.disciplines))].sort((a, b) => a.localeCompare(b, 'es')), [catalog])
  const matched = useMemo(() => questions.filter(q =>
    (filters.form === 'all' || q.form === filters.form) &&
    (!filters.system || q.systems.includes(filters.system)) &&
    (!filters.discipline || q.disciplines.includes(filters.discipline)) &&
    (filters.status === 'all' || (filters.status === 'unseen'
      ? !questionProgress(state, q.id).seen : questionProgress(state, q.id).pendingError))), [catalog, filters, state])
  const ready = useMemo(() => matched.filter(q => q.status === 'ready').sort((a, b) => {
    const pa = questionProgress(state, a.id), pb = questionProgress(state, b.id)
    const priority = (p: typeof pa) => p.pendingError ? 0 : !p.seen ? 1 : 2
    return priority(pa) - priority(pb) || (pa.latestSubmittedAt ?? 0) - (pb.latestSubmittedAt ?? 0) || a.id.localeCompare(b.id)
  }), [matched, state])
  const pending = useMemo(() => Object.values(state.sessions)
    .map(session => ({ session, view: deriveNbmeSession(state, session.id) }))
    .filter(item => item.view && item.view.phase !== 'complete')
    .sort((a, b) => b.session.controlChangedAt - a.session.controlChangedAt), [state])
  const next = pending[0]
  const candidateCount = Math.min(filters.size, ready.length)
  const totalReady = questions.filter(q => q.status === 'ready').length
  const filterActive = filters.form !== 'all' || !!filters.system || !!filters.discipline || filters.status !== 'all'

  const begin = async () => {
    const refs = ready.slice(0, filters.size).map(q => ({ id: q.id, revision: q.revision }))
    if (!refs.length) return
    const title = [filters.system, filters.discipline, filters.form !== 'all' ? `NBME ${filters.form}` : 'Preguntas de aplicación'].filter(Boolean).join(' · ')
    if (await startSession(refs, { title, budgetMinutes: filters.budgetMinutes })) onStart()
  }
  const resume = async (id: string) => { if (await resumeSession(id)) onStart() }
  const countForForm = (form: NbmeQuestionMeta['form'], status?: NbmeQuestionMeta['status']) => questions.filter(q => q.form === form && (!status || q.status === status)).length

  return <div className="nbme-library pila">
    <ScreenHeading landscape="horizon" eyebrow="Del concepto al razonamiento" title="Preguntas de aplicación" description="Practica con las formas 27, 28 y 29 y repasa los fundamentos que necesites." />

    {next && <section className="tarjeta nbme-resume" aria-label="Sesión de preguntas guardada">
      <div><h2>Retoma donde lo dejaste</h2><p className="sutil">{next.session.title}</p>
        <p className="mini">{next.view!.firstAnswered} de {next.view!.initialCount} respondidas en la primera vuelta · {next.view!.pendingErrors} correcciones pendientes</p>
      </div>
      <div className="fila">
        <button className="btn principal" disabled={busy || loading} onClick={() => void resume(next.session.id)}>Continuar sesión</button>
        {confirmarDescarte === next.session.id
          ? <>
              <button className="btn pequeno" disabled={busy} onClick={() => { discardSession(next.session.id); setConfirmarDescarte(null) }}>
                Sí, descartar {attemptsInSession(next.session.id) || 'el'} {attemptsInSession(next.session.id) === 1 ? 'respuesta' : 'respuestas'}
              </button>
              <button className="btn pequeno fantasma" onClick={() => setConfirmarDescarte(null)}>Mejor no</button>
            </>
          : <button className="btn pequeno fantasma" disabled={busy} onClick={() => setConfirmarDescarte(next.session.id)}>Descartar bloque</button>}
      </div>
      {confirmarDescarte === next.session.id && <p className="mini">Se borra el bloque y sus respuestas. El resto de tu progreso no se toca.</p>}
    </section>}

    {error && <div className="nbme-error" role="alert"><p>{error}</p>
      {!catalog && <button className="btn" disabled={loading} onClick={() => void reloadCatalog()}>Reintentar carga</button>}
    </div>}

    <section className="tarjeta pila" aria-labelledby="nbme-session-heading" aria-busy={loading}>
      <div><h2 id="nbme-session-heading">{next ? 'Preparar otra sesión' : 'Tu sesión de preguntas'}</h2>
        <p className="sutil">Combina sistema y disciplina. Se aplican ambos filtros.</p></div>
      <div className="nbme-filter-grid">
        <div><label htmlFor="nbme-system">Sistema</label><select id="nbme-system" value={filters.system} disabled={!catalog || busy}
          onChange={e => setFilters({ system: e.target.value })}>
          <option value="">Todos los sistemas</option>{systems.map(value => <option key={value} value={value}>{value}</option>)}
        </select></div>
        <div><label htmlFor="nbme-discipline">Disciplina</label><select id="nbme-discipline" value={filters.discipline} disabled={!catalog || busy}
          onChange={e => setFilters({ discipline: e.target.value })}>
          <option value="">Todas las disciplinas</option>{disciplines.map(value => <option key={value} value={value}>{value}</option>)}
        </select></div>
      </div>
      <details className="nbme-details"><summary>Más opciones</summary>
        <div className="nbme-filter-grid">
          <div><label htmlFor="nbme-form">Forma</label><select id="nbme-form" value={filters.form} disabled={!catalog || busy}
            onChange={e => setFilters({ form: e.target.value as typeof filters.form })}>
            <option value="all">Todas las formas</option>{(['27', '28', '29'] as const).map(form => <option key={form} value={form}>NBME {form}</option>)}
          </select></div>
          <div><label htmlFor="nbme-status">Qué practicar</label><select id="nbme-status" value={filters.status} disabled={!catalog || busy}
            onChange={e => setFilters({ status: e.target.value as typeof filters.status })}>
            <option value="all">Todas: nuevas y ya respondidas</option><option value="unseen">Sin responder aquí</option><option value="errors">Errores pendientes</option>
          </select></div>
          <div><label htmlFor="nbme-budget">Aviso de pausa</label><select id="nbme-budget" value={filters.budgetMinutes ?? ''} disabled={busy}
            onChange={e => setFilters({ budgetMinutes: e.target.value ? Number(e.target.value) as 10 | 20 | 30 : null })}>
            <option value="">Sin aviso de tiempo</option><option value="10">A los 10 minutos</option><option value="20">A los 20 minutos</option><option value="30">A los 30 minutos</option>
          </select></div>
        </div>
      </details>
      <fieldset className="nbme-sizes" disabled={busy}>
        <legend>Preguntas para comenzar</legend>
        <div className="fila">{([5, 10, 20] as const).map(size => <label className="nbme-size" key={size}>
          <input type="radio" name="nbme-session-size" value={size} checked={filters.size === size} onChange={() => setFilters({ size })} />{size} preguntas
        </label>)}</div>
      </fieldset>
      <div className="nbme-actions">
        <button className={`btn${next ? '' : ' principal'}`} disabled={loading || busy || !candidateCount} onClick={() => void begin()}>
          {busy ? 'Preparando…' : `Comenzar ${candidateCount || filters.size} preguntas`}
        </button>
        {filterActive && <button className="btn fantasma" disabled={busy} onClick={() => setFilters({ form: 'all', system: '', discipline: '', status: 'all' })}>Limpiar filtros</button>}
      </div>
      <p className="nbme-status" role="status" aria-live="polite">{loading ? 'Cargando el banco…' : `${ready.length} preguntas disponibles con estos filtros.`}</p>
      {!loading && catalog && !ready.length && <p className="sutil">Prueba otros filtros o incluye preguntas ya respondidas. Las preguntas pendientes de revisión no entran en la sesión.</p>}
      <p className="mini">Los errores volverán durante la práctica. Puedes pausar en cualquier momento y continuar después.</p>
    </section>

    {pending.length > 1 && <details className="tarjeta nbme-details"><summary>Otras sesiones guardadas ({pending.length - 1})</summary>
      <div className="pila">{pending.slice(1).map(({ session, view }) => <div className="nbme-resume" key={session.id}>
        <div><b>{session.title}</b><p className="mini">{view!.firstAnswered}/{view!.initialCount} en primera vuelta · {view!.pendingErrors} correcciones pendientes</p></div>
        <button className="btn" disabled={busy} onClick={() => void resume(session.id)}>Retomar</button>
      </div>)}</div>
    </details>}

    {catalog && <details className="tarjeta nbme-details"><summary>Contenido del banco: {totalReady} disponibles · {questions.length - totalReady} pendientes de revisión</summary>
      <p className="sutil">Las preguntas con problemas de opciones, texto o figuras se conservan en el inventario y quedan fuera de la práctica hasta resolverlos.</p>
      <p className="mini">El contenido procede de los archivos importados. Disponibilidad indica que pasó los controles de extracción; no certifica una revisión médica independiente. La clasificación por sistema y disciplina es orientativa.</p>
      <div className="nbme-table-wrap"><table className="nbme-quality-table"><caption className="mini">Disponibilidad por forma</caption>
        <thead><tr><th scope="col">Forma</th><th scope="col">Disponibles</th><th scope="col">Pendientes</th><th scope="col">Total</th></tr></thead>
        <tbody>{(['27', '28', '29'] as const).map(form => <tr key={form}><th scope="row">NBME {form}</th><td>{countForForm(form, 'ready')}</td><td>{countForForm(form, 'blocked')}</td><td>{countForForm(form)}</td></tr>)}</tbody>
      </table></div>
    </details>}
  </div>
}
