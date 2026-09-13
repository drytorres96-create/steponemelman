import { useCallback, useEffect, useMemo, useState } from 'react'
import { Vacio } from '../components/comunes'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { cargarSesionesSemana } from '../semana/api'
import { coberturaSesion, type CoberturaSesion } from '../semana/cobertura'
import { separarGuion } from '../semana/guion'
import type { SesionSemanal } from '../semana/tipos'

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

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

function Tarjeta({ sesion, cobertura, onAbrir }:
  { sesion: SesionSemanal; cobertura: CoberturaSesion; onAbrir: (s: SesionSemanal) => void }) {
  const fecha = fechaLocal(sesion.semanaInicio, sesion.dia - 1)
  const hecha = sesion.estado === 'completada' || cobertura.cumple
  const empezada = cobertura.hechos > 0 || sesion.cursor > 0
  return <article className={`tarjeta semana-tarjeta${hecha ? ' completada' : ''}`}>
    <p className="semana-dia">{DIAS[sesion.dia - 1]} {diaYMes(fecha)}</p>
    <h3>{sesion.titulo}</h3>
    {sesion.subtitulo && <p className="sutil">{sesion.subtitulo}</p>}
    <p className="mini">{composicion(sesion)}</p>
    <p className="mini">{cobertura.hechos} de {cobertura.pasos} pasos respondidos</p>
    <progress className="semana-progreso" aria-label={`Pasos respondidos de ${sesion.titulo}`}
      value={cobertura.hechos} max={cobertura.pasos || 1} />
    {hecha ? <div className="fila">
      <p className="etq verde" role="status">Completada</p>
      {/* El umbral deja pasos sin responder: siguen a un clic, no se pierden al marcarse hecha. */}
      {cobertura.hechos < cobertura.pasos && <button className="btn pequeno fantasma" onClick={() => onAbrir(sesion)}>
        Retomar los {cobertura.pasos - cobertura.hechos} que faltan
      </button>}
    </div>
      : <button className="btn principal" onClick={() => onAbrir(sesion)}>
        {empezada ? `Continuar (paso ${Math.min(sesion.cursor + 1, sesion.guion.length)} de ${sesion.guion.length})` : 'Empezar'}
      </button>}
  </article>
}

export function Semana({ onAbrir, onRecuperacion, onBiblioteca }: {
  onAbrir: (s: SesionSemanal) => void
  onRecuperacion: () => void
  onBiblioteca: (tipo: 'conceptos' | 'preguntas') => void
}) {
  const { estado } = useApp()
  const nbme = useNbme()
  const [sesiones, setSesiones] = useState<SesionSemanal[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)

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

  const abrir = useCallback((s: SesionSemanal) => onAbrir(s), [onAbrir])

  if (error) return <Vacio titulo="No se pudieron cargar tus sesiones" texto="Tu progreso está a salvo. Comprueba la conexión y vuelve a intentarlo."
    accion={<button className="btn" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button>} />
  if (!sesiones) return <div className="vacio" role="status">Cargando tus sesiones…</div>

  const semanas = [...new Map(sesiones.map(s => [s.semana, s])).values()]
  const hecha = (s: SesionSemanal) => s.estado === 'completada' || coberturaDe(s).cumple
  const pendientes = sesiones.filter(s => !hecha(s))
  const enCurso = semanas.find(s => pendientes.some(p => p.semana === s.semana)) ?? semanas[0]

  const masCosas = <details className="tarjeta semana-extra">
    <summary>Quiero hacer algo más</summary>
    <p className="sutil" style={{ marginTop: 12 }}>Puedes abrir la biblioteca y estudiar por tu cuenta lo que necesites.</p>
    <div className="fila">
      <button className="btn fantasma" onClick={() => onBiblioteca('conceptos')}>Elegir conceptos</button>
      <button className="btn fantasma" onClick={() => onBiblioteca('preguntas')}>Elegir preguntas</button>
    </div>
  </details>

  if (!sesiones.length) return <div className="pila">
    <header className="semana-encabezado"><p className="editorial-eyebrow">Mi semana</p><h1>Sin sesiones preparadas</h1>
      <p className="sutil">Cuando haya sesiones planificadas aparecerán aquí, en orden por día.</p></header>
    <Vacio titulo="Nada que estudiar ahora mismo" texto="Mientras tanto puedes ponerte al día con lo que fallaste o con lo que vence."
      accion={<button className="btn" onClick={onRecuperacion}>Ir a Recuperación</button>} />
    {masCosas}
  </div>

  return <div className="pila">
    <header className="semana-encabezado">
      <p className="editorial-eyebrow">Mi semana</p>
      <h1>{enCurso.semana} · {rotuloSemana(enCurso.semanaInicio)}</h1>
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
