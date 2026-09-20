import { useCallback, useEffect, useMemo, useState } from 'react'
import { Vacio } from '../components/comunes'
import { DepthArtwork } from '../components/Editorial'
import { useAuth } from '../auth/AuthProvider'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { cargarSesionesSemana } from '../semana/api'
import { coberturaSesion, type CoberturaSesion } from '../semana/cobertura'
import { separarGuion } from '../semana/guion'
import type { SesionSemanal } from '../semana/tipos'
import { cargarPlanSemana, marcarCheckpoint, PlanEscrituraError } from '../plan/api'
import { enlazarCheckpoints, sesionesDeLaSemana } from '../plan/enlace'
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

/** `S2 · 14–19 sep`: de lunes a sábado, que es la semana de estudio. */
function rotuloSemana(semanaInicio: string): string {
  const inicio = fechaLocal(semanaInicio), fin = fechaLocal(semanaInicio, 5)
  const mes = fin.toLocaleDateString('es', { month: 'short' }).replace('.', '')
  return inicio.getMonth() === fin.getMonth()
    ? `${inicio.getDate()}–${fin.getDate()} ${mes}`
    : `${diaYMes(inicio)} – ${diaYMes(fin)}`
}

function composicion(sesion: SesionSemanal): string {
  const { conceptIds, preguntas } = separarGuion(sesion.guion)
  const partes = []
  if (conceptIds.length) partes.push(`${conceptIds.length} ${conceptIds.length === 1 ? 'concepto' : 'conceptos'}`)
  if (preguntas.length) partes.push(`${preguntas.length} ${preguntas.length === 1 ? 'pregunta' : 'preguntas'}`)
  partes.push(`~${sesion.presupuestoMin} min`)
  return partes.join(' · ')
}

/** Pasos, progreso y cobertura de una sesión preparada. La misma información en las dos vistas. */
function CuerpoSesion({ sesion, cobertura, onAbrir }:
  { sesion: SesionSemanal; cobertura: CoberturaSesion; onAbrir: () => void }) {
  const hecha = sesion.estado === 'completada' || cobertura.cumple
  const empezada = cobertura.hechos > 0 || sesion.cursor > 0
  return <div className="sesion-resumen">
    <div className="sesion-evidencia"><p className="sesion-composicion">{composicion(sesion)}</p>
    <p className="mini">{cobertura.hechos} de {cobertura.pasos} pasos respondidos</p>
    <progress className="semana-progreso" aria-label={`Pasos respondidos de ${sesion.titulo}`}
      value={cobertura.hechos} max={cobertura.pasos || 1} /></div>
    <div className="sesion-accion">{hecha ? <div className="fila">
      <p className="etq verde" role="status">Completada</p>
      {/* El umbral deja pasos sin responder: siguen a un clic, no se pierden al marcarse hecha. */}
      {cobertura.hechos < cobertura.pasos && <button className="btn pequeno fantasma" onClick={onAbrir}>
        Retomar los {cobertura.pasos - cobertura.hechos} que faltan
      </button>}
    </div>
      : <button className="btn principal" onClick={onAbrir}>
        {empezada ? `Continuar sesión (paso ${Math.min(sesion.cursor + 1, sesion.guion.length)} de ${sesion.guion.length})` : 'Empezar sesión'}
      </button>}</div>
  </div>
}

function Tarjeta({ sesion, cobertura, onAbrir }:
  { sesion: SesionSemanal; cobertura: CoberturaSesion; onAbrir: (s: SesionSemanal) => void }) {
  const fecha = fechaLocal(sesion.semanaInicio, sesion.dia - 1)
  const hecha = sesion.estado === 'completada' || cobertura.cumple
  return <article className={`tarjeta semana-tarjeta${hecha ? ' completada' : ''}`}>
    <p className="semana-dia">{DIAS[sesion.dia - 1]} {diaYMes(fecha)}</p>
    <h3>{sesion.titulo}</h3>
    {sesion.subtitulo && <p className="sutil">{sesion.subtitulo}</p>}
    <CuerpoSesion sesion={sesion} cobertura={cobertura} onAbrir={() => onAbrir(sesion)} />
  </article>
}

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
  sesion: SesionSemanal | null
  cobertura: CoberturaSesion | null
  error: string | null
  onMarcar: (cp: PlanCheckpoint, done: boolean) => void
  onEnfocar: (cp: PlanCheckpoint) => void
  onAbrirSesion: (cp: PlanCheckpoint, s: SesionSemanal) => void
}

function Fila({ cp, hecho, sesion, cobertura, error, onMarcar, onEnfocar, onAbrirSesion }: FilaProps) {
  const minutos = MINUTOS_POR_KIND[cp.kind]
  return <li className={`plan-fila${hecho ? ' hecha' : ''}${sesion ? ' plan-fila-preparada' : ''}`}>
    {sesion && <p className="editorial-eyebrow sesion-rotulo">Sesión preparada</p>}
    <label className="plan-fila-marca">
      <input type="checkbox" checked={hecho} aria-label={sesion ? cp.label : undefined} onChange={e => onMarcar(cp, e.currentTarget.checked)} />
      <span>{cp.kind === 'podcast' ? '🎧 ' : ''}{sesion ? sesion.titulo : cp.label}</span>
    </label>
    <div className="fila plan-fila-acciones">
      {/* El audio se escucha fuera de la app: se marca, no se cronometra. */}
      {cp.kind === 'podcast' && !hecho && <button className="btn pequeno fantasma" onClick={() => onMarcar(cp, true)}>Oído</button>}
      {!sesion && minutos !== null && !hecho && <>
        <span className="mini">~{minutos} min</span>
        <button className="btn pequeno" onClick={() => onEnfocar(cp)}>Empezar</button>
      </>}
    </div>
    {sesion && cobertura && <div className="plan-fila-sesion">
      {sesion.subtitulo && <p className="sutil">{sesion.subtitulo}</p>}
      <CuerpoSesion sesion={sesion} cobertura={cobertura} onAbrir={() => onAbrirSesion(cp, sesion)} />
    </div>}
    {error && <p className="plan-fila-error" role="alert">{error}</p>}
  </li>
}

export function Semana({ onAbrir, onRecuperacion, onBiblioteca }: {
  onAbrir: (s: SesionSemanal, alCompletar?: () => void) => void
  onRecuperacion: () => void
  onBiblioteca: (tipo: 'conceptos' | 'preguntas') => void
}) {
  const { estado } = useApp()
  const { session } = useAuth()
  const token = session?.access_token ?? ''
  const nbme = useNbme()
  const [sesiones, setSesiones] = useState<SesionSemanal[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  const [plan, setPlan] = useState<PlanSemana | null>(null)
  const [planListo, setPlanListo] = useState(false)
  // Marcas optimistas: lo que se ve antes de que la base conteste. Una que no cuaja se revierte.
  const [marcas, setMarcas] = useState<Record<number, boolean>>({})
  const [fallos, setFallos] = useState<Record<number, string>>({})
  const [diaAbierto, setDiaAbierto] = useState<number | null>(null)
  const [enfoque, setEnfoque] = useState<PlanCheckpoint | null>(null)

  // Evidencia registrada, agrupada por sesión: es lo que decide si una sesión está hecha.
  const conceptosPorSesion = useMemo(() => {
    const mapa = new Map<string, Set<string>>()
    for (const progreso of Object.values(estado.progreso)) {
      for (const intento of progreso.intentos) {
        if (!intento.session_id) continue
        const set = mapa.get(intento.session_id) ?? new Set<string>()
        set.add(progreso.concept_id)
        mapa.set(intento.session_id, set)
      }
    }
    return mapa
  }, [estado.progreso])
  const preguntasPorSesion = useMemo(() => {
    const mapa = new Map<string, Set<string>>()
    for (const intento of Object.values(nbme.state.attempts)) {
      const set = mapa.get(intento.sessionId) ?? new Set<string>()
      set.add(intento.questionId)
      mapa.set(intento.sessionId, set)
    }
    return mapa
  }, [nbme.state.attempts])
  const coberturaDe = useCallback((s: SesionSemanal) => coberturaSesion(s.guion,
    conceptosPorSesion.get(s.id) ?? [], preguntasPorSesion.get(s.nbmeSessionId ?? '') ?? []),
    [conceptosPorSesion, preguntasPorSesion])

  useEffect(() => {
    let vivo = true
    setError(false)
    cargarSesionesSemana().then(s => { if (vivo) setSesiones(s) }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [reintento])

  // El plan nunca bloquea: si no llega, la pantalla se queda con las sesiones preparadas.
  useEffect(() => {
    let vivo = true
    setPlanListo(false)
    cargarPlanSemana(token).then(p => { if (vivo) { setPlan(p); setPlanListo(true) } })
    return () => { vivo = false }
  }, [token, reintento])

  const abrir = useCallback((s: SesionSemanal) => onAbrir(s), [onAbrir])

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

  const sesionesPlan = useMemo(() => plan ? sesionesDeLaSemana(sesiones ?? [], plan.inicio, plan.fin) : [],
    [plan, sesiones])
  const enlaces = useMemo(() => plan ? enlazarCheckpoints(plan.checkpoints, sesionesPlan) : new Map<number, SesionSemanal>(),
    [plan, sesionesPlan])

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

  const masCosas = <details className="tarjeta semana-extra">
    <summary>Quiero hacer algo más</summary>
    <p className="sutil" style={{ marginTop: 12 }}>Puedes abrir la biblioteca y estudiar por tu cuenta lo que necesites.</p>
    <div className="fila">
      <button className="btn fantasma" onClick={() => onBiblioteca('conceptos')}>Elegir conceptos</button>
      <button className="btn fantasma" onClick={() => onBiblioteca('preguntas')}>Elegir preguntas</button>
    </div>
  </details>

  if (error) return <Vacio titulo="No se pudieron cargar tus sesiones" texto="Tu progreso está a salvo. Comprueba la conexión y vuelve a intentarlo."
    accion={<button className="btn" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button>} />
  if (!sesiones || !planListo) return <div className="vacio" role="status">Cargando tu semana…</div>

  if (enfoque) return <Enfoque minutos={MINUTOS_POR_KIND[enfoque.kind] ?? 20} etiqueta={enfoque.label}
    onTerminar={hecho => { if (hecho) void marcar(enfoque, true); setEnfoque(null) }} />

  if (plan) {
    const { titular, resto } = partirTitulo(plan.titulo)
    const tareas = plan.checkpoints.filter(esTarea)
    const hechas = tareas.filter(hechoDe).length
    const dias = [...porDia.keys()].sort((a, b) => a - b)

    return <div className="pila semana-workspace">
      <header className="semana-encabezado" data-depth-scene>
        <DepthArtwork scene="lens" subject="optical-violet" />
        <div className="semana-heading-copy"><p className="editorial-eyebrow">Tu plan de estudio</p>
        <h1>Mi semana</h1>
        <p className="semana-fechas">{titular}</p>
        {resto && <p className="sutil">{resto}</p>}
        </div>
        <div className="semana-balance"><p className="editorial-eyebrow">Avance semanal</p>
        <p className="semana-balance-cifra"><strong>{hechas}</strong><span> / {tareas.length}</span></p>
        <p className="mini">{hechas} de {tareas.length} hechos</p>
        <progress className="semana-progreso" aria-label="Avance del plan de esta semana"
          value={hechas} max={tareas.length || 1} /></div>
      </header>

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
          <div className="plan-panel-heading"><div><p className="editorial-eyebrow">{dia === diaDeHoy ? 'Tu estudio de hoy' : 'Tu estudio del día'}</p><h2>{DIAS[dia - 1]} <span>{diaYMes(fecha)}</span></h2></div><span className="etq">{resumen}</span></div>
          {descanso
            // Un descanso no es una tarea: ni casilla, ni cronómetro, ni cuenta en el total.
            ? <p className="sutil plan-descanso">{lista.map(cp => cp.label).join(' · ')}. Hoy no se estudia; eso también es el plan.</p>
            : <ul className="plan-lista">
              {lista.map(cp => {
                const sesion = enlaces.get(cp.id) ?? null
                return <Fila key={cp.id} cp={cp} hecho={hechoDe(cp)} sesion={sesion}
                  cobertura={sesion ? coberturaDe(sesion) : null} error={fallos[cp.id] ?? null}
                  onMarcar={(punto, done) => { void marcar(punto, done) }}
                  onEnfocar={setEnfoque}
                  onAbrirSesion={(punto, s) => onAbrir(s, () => { void marcar(punto, true) })} />
              })}
            </ul>}</div>}
        </section>
      })}
      {diaAbierto === null && <div className="plan-panel plan-panel-vacio"><p className="editorial-eyebrow">Tu plan de estudio</p><h2>Elige un día</h2><p className="sutil">Abre un día para ver sus tareas y sesiones.</p></div>}
      </div>
      <div className="semana-tools">
      {plan.nota && <details className="tarjeta semana-extra">
        <summary>Por qué esta semana es así</summary>
        <p className="sutil" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{plan.nota}</p>
      </details>}
      {masCosas}</div>
    </div>
  }

  // Sin plan: exactamente lo que hacía la pantalla antes de que existiera.
  const avisoPlan = <p className="mini plan-ausente" role="status">El plan no está disponible ahora mismo. Estas son las sesiones de la semana.</p>
  const semanas = [...new Map(sesiones.map(s => [s.semana, s])).values()]
  const hecha = (s: SesionSemanal) => s.estado === 'completada' || coberturaDe(s).cumple
  const pendientes = sesiones.filter(s => !hecha(s))
  const enCurso = semanas.find(s => pendientes.some(p => p.semana === s.semana)) ?? semanas[0]

  if (!sesiones.length) return <div className="pila">
    <header className="semana-encabezado"><p className="editorial-eyebrow">Mi semana</p><h1>Sin sesiones preparadas</h1>
      {avisoPlan}
      <p className="sutil">Cuando haya sesiones planificadas aparecerán aquí, en orden por día.</p></header>
    <Vacio titulo="Nada que estudiar ahora mismo" texto="Mientras tanto puedes ponerte al día con lo que fallaste o con lo que vence."
      accion={<button className="btn" onClick={onRecuperacion}>Ir a Recuperación</button>} />
    {masCosas}
  </div>

  return <div className="pila">
    <header className="semana-encabezado">
      <p className="editorial-eyebrow">Mi semana</p>
      <h1>{enCurso.semana} · {rotuloSemana(enCurso.semanaInicio)}</h1>
      {avisoPlan}
      <p className="sutil">{pendientes.length
        ? `${pendientes.length} ${pendientes.length === 1 ? 'sesión pendiente' : 'sesiones pendientes'}. Una sesión se marca completada sola cuando respondes el 85 % de sus pasos.`
        : 'Todas las sesiones planificadas están hechas.'}</p>
    </header>

    {!pendientes.length && <Vacio titulo="Nada pendiente por ahora" texto="Las sesiones hechas se quedan aquí hasta la auditoría de fin de semana."
      accion={<button className="btn" onClick={onRecuperacion}>Ir a Recuperación</button>} />}

    {semanas.map(bloque => <section key={bloque.semana} className="pila" aria-labelledby={`semana-${bloque.semana}`}>
      <h2 id={`semana-${bloque.semana}`} className="rotulo">{bloque.semana} · {rotuloSemana(bloque.semanaInicio)}</h2>
      <div className="semana-grid">
        {sesiones.filter(s => s.semana === bloque.semana).map(s =>
          <Tarjeta key={s.id} sesion={s} cobertura={coberturaDe(s)} onAbrir={abrir} />)}
      </div>
    </section>)}

    {masCosas}
  </div>
}
