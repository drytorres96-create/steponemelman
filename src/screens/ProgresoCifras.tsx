import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { progresoPorForma } from '../nbme/formas'
import { cargarHistorialSesiones } from '../semana/api'
import type { SesionSemanal } from '../semana/tipos'
import type { Concepto } from '../schema/concept'
import { Anillo } from '../components/comunes'
import { useAuth } from '../auth/AuthProvider'
import { cargarTopics } from '../plan/api'
import { evidenciaDiferida, evidenciaPorTopic, porcentajeObservado, type Fraccion, type TopicEstado } from '../lib/retencion-observada'
import { lunesDe } from '../lib/tiempo'

/** El examen es el lunes 21 de diciembre de 2026: todo el ritmo se mide contra esa fecha. */
export const FECHA_EXAMEN = new Date(2026, 11, 21)
const SEMANA_MS = 7 * 24 * 3_600_000

export type Ventana = 'semana' | 'general'

const hecha = (s: SesionSemanal) => s.estado === 'completada' || s.estado === 'auditada'

/** Fecha local del día de una sesión, sin desplazamiento por zona horaria. */
export function fechaDeSesion(s: SesionSemanal): Date {
  const [a, m, d] = s.semanaInicio.split('-').map(Number)
  return new Date(a, m - 1, d + s.dia - 1)
}

export interface Ritmo {
  completadas: number
  planificadas: number
  recientes: number
  porSemana: number
  necesarioPorSemana: number
  semanasRestantes: number
}

export function calcularRitmo(sesiones: SesionSemanal[], ahora = Date.now()): Ritmo {
  const completadas = sesiones.filter(hecha).length
  const recientes = sesiones.filter(s => hecha(s) && ahora - fechaDeSesion(s).getTime() <= 4 * SEMANA_MS && fechaDeSesion(s).getTime() <= ahora).length
  const pendientes = sesiones.filter(s => !hecha(s)).length
  const semanasRestantes = Math.max(1, Math.ceil((FECHA_EXAMEN.getTime() - ahora) / SEMANA_MS))
  return {
    completadas, planificadas: sesiones.length, recientes,
    porSemana: recientes / 4,
    necesarioPorSemana: pendientes / semanasRestantes,
    semanasRestantes,
  }
}

const fraccion = (f: Fraccion) => f.n ? `${porcentajeObservado(f)} % · ${f.favorables}/${f.n}` : 'Sin dato · n=0'

export function BandaDeCifras({ conceptos, ventana }: { conceptos: Concepto[]; ventana: Ventana }) {
  const { estado } = useApp()
  const { session } = useAuth()
  const nbme = useNbme()
  const [sesiones, setSesiones] = useState<SesionSemanal[] | null>(null)
  const [topics, setTopics] = useState<TopicEstado[] | null>(null)
  const [fallo, setFallo] = useState(false)
  useEffect(() => {
    let vivo = true
    cargarHistorialSesiones().then(s => { if (vivo) setSesiones(s) }).catch(() => { if (vivo) setFallo(true) })
    cargarTopics(session?.access_token ?? '').then(t => { if (vivo) setTopics(t) }).catch(() => { if (vivo) setTopics(null) })
    return () => { vivo = false }
  }, [session?.access_token])
  const ahora = Date.now(), desde = ventana === 'semana' ? lunesDe().getTime() : 0
  const hasta = ventana === 'semana' ? lunesDe().getTime() + SEMANA_MS : ahora + 1
  const formas = useMemo(() => progresoPorForma(nbme.state, nbme.catalog, desde), [nbme.state, nbme.catalog, desde])
  const preguntas = formas.reduce((n, f) => ({ n: n.n + f.nuevas, favorables: n.favorables + f.primeraVez }), { n: 0, favorables: 0 })
  const publicados = new Set(conceptos.map(c => c.concept_id))
  const progresos = Object.values(estado.progreso).filter(p => publicados.has(p.concept_id))
  const evidencia = evidenciaDiferida(progresos, desde, ahora)
  const detalle = evidenciaPorTopic(conceptos, estado.progreso, topics ?? [], desde, ahora)
  const periodo = (sesiones ?? []).filter(s => fechaDeSesion(s).getTime() >= desde && fechaDeSesion(s).getTime() < hasta)
  const plan = { n: periodo.length, favorables: periodo.filter(hecha).length }
  const anillos = [
    { label: ventana === 'semana' ? 'Sesiones de esta semana' : 'Sesiones registradas', ...plan, tam: 236 },
    { label: 'Acierto inicial en preguntas locales', ...preguntas, tam: 194 },
    { label: 'Recuperación sin ayuda tras ≥30 días', ...evidencia.retencion, tam: 152 },
  ]
  return <section className="tarjeta pila" aria-label={ventana === 'semana' ? 'Resumen de esta semana' : 'Resumen general'}>
    <div className="fila progress-radial-summary">
      <div className="progress-rings" aria-label="Tres dimensiones independientes; no se promedian">
        {anillos.map(a => <div key={a.label} className="progress-ring-layer"><Anillo valor={a.favorables} total={a.n} tam={a.tam} etiqueta={a.label} /></div>)}
        <div className="progress-ring-center"><strong>{sesiones ? plan.favorables : '—'}</strong><span>sesiones hechas</span><small>{plan.n ? `de ${plan.n} registradas` : 'sin plan registrado'}</small></div>
      </div>
      <div className="pila progress-ring-legend"><h2>{ventana === 'semana' ? 'Tu semana, en tres anillos' : 'Tu práctica registrada'}</h2>
        {anillos.map((a, i) => <p key={a.label}><b>{i === 0 ? 'Exterior' : i === 1 ? 'Medio' : 'Interior'} · {a.label}</b><br />{fraccion(a)}</p>)}
        {fallo && <p role="status">No se pudieron leer las sesiones. Los otros registros se conservan.</p>}
        <p className="mini">Cada anillo conserva su denominador. Las preguntas locales son práctica; estas cifras no estiman aprobación.</p>
      </div>
    </div>
    <details><summary>Retención observada y repetición del error</summary>
      <p><b>Recuperación tras ≥30 días:</b> {fraccion(evidencia.retencion)}</p>
      <p><b>Errores repetidos tras ≥24 h:</b> {fraccion(evidencia.repeticion)}</p>
      <p className="mini">Correctas/intentadas tras 30 días; falladas/reexaminadas tras un fallo separado al menos 24 h. Parcial cuenta como fallo. Se excluyen ayudas, revisiones y condiciones o versiones no verificables. El intervalo parte del intento inmediatamente anterior.</p>
      <h3>Temas cerrados en el plan</h3>
      {topics === null ? <p className="mini">No se pudo consultar el estado de los temas; no se supone que estén cerrados.</p>
        : <div className="scroll-x"><table className="tabla"><thead><tr><th>Tema</th><th>Recuperación ≥30 d</th><th>Error repetido ≥24 h</th></tr></thead><tbody>{detalle.map(t => <tr key={t.nombre}><th scope="row">{t.nombre}</th><td>{fraccion(t.retencion)}</td><td>{fraccion(t.repeticion)}</td></tr>)}</tbody></table></div>}
      <p className="mini">La correspondencia usa la disciplina o el sistema principal del concepto. Cerrado describe el plan; no demuestra dominio.</p>
    </details>
  </section>
}
