import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { cargarPlanSemana, marcarCheckpoint, PlanEscrituraError } from '../plan/api'
import { tituloDeCheckpoint } from '../plan/enlace'
import { Enfoque } from '../plan/Enfoque'
import { DIAS_SEMANA, esTarea, MINUTOS_POR_KIND, type PlanCheckpoint, type PlanSemana } from '../plan/tipos'
import { fechaISO } from '../lib/tiempo'

const DIAS = [...DIAS_SEMANA, 'domingo']

/** `2026-09-14` como fecha local: parsearla como ISO la desplazaría un día según la zona. */
function fechaLocal(iso: string, mas = 0): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d + mas)
}
const diaYMes = (f: Date) => f.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')

/** `S2 · 14–19 sep · Reproductivo…` se parte en titular y contexto. */
function partirTitulo(titulo: string): { titular: string; resto: string } {
  const partes = titulo.split(' · ')
  return partes.length > 2
    ? { titular: partes.slice(0, 2).join(' · '), resto: partes.slice(2).join(' · ') }
    : { titular: titulo, resto: '' }
}

interface FilaProps {
  cp: PlanCheckpoint
  hecho: boolean
  error: string | null
  onMarcar: (cp: PlanCheckpoint, done: boolean) => void
  onEnfocar: (cp: PlanCheckpoint) => void
}

/**
 * Una tarea del plan. Una sesión preparada es una fila más, sin botón: su material
 * ya entra por Hoy, en lo nuevo de cada día. El audio se marca, no se cronometra.
 */
function Fila({ cp, hecho, error, onMarcar, onEnfocar }: FilaProps) {
  const sesion = tituloDeCheckpoint(cp) !== null
  const minutos = sesion ? null : MINUTOS_POR_KIND[cp.kind]
  return <li className={`plan-fila${hecho ? ' hecha' : ''}`}>
    <label className="plan-fila-marca">
      <input type="checkbox" checked={hecho} onChange={e => onMarcar(cp, e.currentTarget.checked)} />
      <span>{cp.kind === 'podcast' ? '🎧 ' : ''}{cp.label}</span>
    </label>
    <div className="fila plan-fila-acciones">
      {cp.kind === 'podcast' && !hecho && <button className="btn pequeno fantasma" onClick={() => onMarcar(cp, true)}>Oído</button>}
      {minutos !== null && !hecho && <>
        <span className="mini">~{minutos} min</span>
        <button className="btn pequeno" onClick={() => onEnfocar(cp)}>Empezar</button>
      </>}
    </div>
    {error && <p className="plan-fila-error" role="alert">{error}</p>}
  </li>
}

/**
 * El plan de la semana, tal como vivía en Mi semana: un día abierto, el descanso sin
 * casilla y las marcas optimistas que se deshacen si la base no las acepta. Va dentro
 * de «Cómo va todo»: es para ver y marcar el plan, no una segunda puerta al estudio.
 */
export function CalendarioSemana() {
  const { session } = useAuth()
  const token = session?.access_token ?? ''
  const [plan, setPlan] = useState<PlanSemana | null>(null)
  const [planListo, setPlanListo] = useState(false)
  // Marcas optimistas: lo que se ve antes de que la base conteste. Una que no cuaja se revierte.
  const [marcas, setMarcas] = useState<Record<number, boolean>>({})
  const [fallos, setFallos] = useState<Record<number, string>>({})
  const [diaAbierto, setDiaAbierto] = useState<number | null>(null)
  const [enfoque, setEnfoque] = useState<PlanCheckpoint | null>(null)

  // El plan nunca bloquea: si no llega, se dice en una línea.
  useEffect(() => {
    let vivo = true
    setPlanListo(false)
    cargarPlanSemana(token).then(p => { if (vivo) { setPlan(p); setPlanListo(true) } })
    return () => { vivo = false }
  }, [token])

  const hechoDe = useCallback((cp: PlanCheckpoint) => marcas[cp.id] ?? cp.done, [marcas])

  const marcar = useCallback(async (cp: PlanCheckpoint, done: boolean) => {
    if (!esTarea(cp)) return
    setMarcas(m => ({ ...m, [cp.id]: done }))
    setFallos(f => { const { [cp.id]: _fuera, ...resto } = f; return resto })
    try {
      const guardado = await marcarCheckpoint(cp.id, done, token)
      // Manda lo releído de la base, no lo que se envió.
      setMarcas(m => ({ ...m, [cp.id]: guardado.done }))
    } catch (causa) {
      setMarcas(m => ({ ...m, [cp.id]: cp.done }))
      setFallos(f => ({ ...f, [cp.id]: causa instanceof PlanEscrituraError ? causa.message
        : 'No se pudo guardar la marca en tu plan. Se deja como estaba.' }))
    }
  }, [token])

  const porDia = useMemo(() => {
    const mapa = new Map<number, PlanCheckpoint[]>()
    for (const cp of plan?.checkpoints ?? []) mapa.set(cp.dia, [...(mapa.get(cp.dia) ?? []), cp])
    return mapa
  }, [plan])

  // El día de hoy dentro de la semana del plan; `null` si hoy cae fuera (domingo incluido).
  const diaDeHoy = useMemo(() => {
    if (!plan) return null
    const hoy = fechaISO(new Date())
    if (hoy < plan.inicio || hoy > plan.fin) return null
    const dias = Math.round((fechaLocal(hoy).getTime() - fechaLocal(plan.inicio).getTime()) / 86400000) + 1
    return dias >= 1 && dias <= 6 ? dias : null
  }, [plan])

  const pendientesDe = useCallback((dia: number) =>
    (porDia.get(dia) ?? []).filter(cp => esTarea(cp) && !hechoDe(cp)).length, [porDia, hechoDe])

  // Un solo día abierto: la pantalla llena es lo que hace que no se empiece.
  useEffect(() => {
    if (!plan) return
    setDiaAbierto(actual => {
      if (actual !== null) return actual
      if (diaDeHoy !== null && porDia.has(diaDeHoy)) return diaDeHoy
      const dias = [...porDia.keys()].sort((a, b) => a - b)
      return dias.find(d => pendientesDe(d) > 0) ?? dias[0] ?? null
    })
    // `pendientesDe` cambia con cada marca; el día abierto se elige una vez por semana cargada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, diaDeHoy, porDia])

  if (!planListo) return <p className="mini" role="status">Cargando el plan de la semana…</p>
  if (!plan) return <p className="mini plan-ausente" role="status">El plan de la semana no está disponible ahora mismo.</p>

  if (enfoque) return <Enfoque minutos={MINUTOS_POR_KIND[enfoque.kind] ?? 20} etiqueta={enfoque.label}
    onTerminar={hecho => { if (hecho) void marcar(enfoque, true); setEnfoque(null) }} />

  const { titular, resto } = partirTitulo(plan.titulo)
  const tareas = plan.checkpoints.filter(esTarea)
  const hechas = tareas.filter(hechoDe).length
  const dias = [...porDia.keys()].sort((a, b) => a - b)

  return <section className="pila plan-semana" aria-labelledby="plan-semana-titulo">
    <div>
      <h3 id="plan-semana-titulo" className="semana-fechas">{titular}</h3>
      {resto && <p className="sutil">{resto}</p>}
      <p className="mini">{hechas} de {tareas.length} compromisos de esta semana</p>
    </div>
    <div className="plan-workspace" style={{ '--plan-dias': dias.length } as React.CSSProperties}>
      {dias.map(dia => {
        const lista = porDia.get(dia)!
        const abierto = dia === diaAbierto
        const descanso = lista.every(cp => cp.kind === 'descanso')
        const fecha = fechaLocal(plan.inicio, dia - 1)
        const pendientes = pendientesDe(dia)
        const resumen = descanso ? 'Descanso'
          : pendientes ? `${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}` : 'todo hecho'
        return <section key={dia} className={`plan-dia${abierto ? ' abierto' : ''}${descanso ? ' descanso' : ''}`}>
          <button className="plan-dia-titulo" aria-expanded={abierto} aria-controls={`plan-panel-${dia}`} id={`plan-dia-${dia}`}
            onClick={() => setDiaAbierto(d => d === dia ? null : dia)}>
            <span className="plan-dia-numero" aria-hidden="true">{String(fecha.getDate()).padStart(2, '0')}</span>
            <span className="plan-dia-copy"><b><span className="plan-dia-largo">{dia === diaDeHoy ? 'HOY · ' : ''}{DIAS[dia - 1]}</span><span className="plan-dia-corto" aria-hidden="true">{DIAS[dia - 1].slice(0, 3)}</span> <span className="sr-only">{diaYMes(fecha)}</span></b>
            <span className="mini">{resumen}</span></span>
            <span className="plan-dia-indicador" aria-hidden="true">{abierto ? '−' : '+'}</span>
          </button>
          {abierto && <div className="plan-panel" id={`plan-panel-${dia}`} aria-labelledby={`plan-dia-${dia}`}>
            {descanso
              // Un descanso no es una tarea: ni casilla, ni cronómetro, ni cuenta en el total.
              ? <p className="sutil plan-descanso">{lista.map(cp => cp.label).join(' · ')}. Hoy no se estudia; eso también es el plan.</p>
              : <ul className="plan-lista">
                {lista.map(cp => <Fila key={cp.id} cp={cp} hecho={hechoDe(cp)} error={fallos[cp.id] ?? null}
                  onMarcar={(punto, done) => { void marcar(punto, done) }} onEnfocar={setEnfoque} />)}
              </ul>}
          </div>}
        </section>
      })}
    </div>
    {plan.nota && <details className="semana-extra">
      <summary>Por qué esta semana es así</summary>
      <p className="sutil" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{plan.nota}</p>
    </details>}
  </section>
}
