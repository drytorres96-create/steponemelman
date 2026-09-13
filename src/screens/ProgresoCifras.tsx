import { useEffect, useState } from 'react'
import { useNbme } from '../nbme/NbmeProvider'
import { summarizeNbmeState } from '../nbme/model'
import { cargarHistorialSesiones } from '../semana/api'
import type { SesionSemanal } from '../semana/tipos'

/** El examen es el lunes 21 de diciembre de 2026: todo el ritmo se mide contra esa fecha. */
export const FECHA_EXAMEN = new Date(2026, 11, 21)
const SEMANA_MS = 7 * 24 * 3_600_000

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

const decimal = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 })

/**
 * Banda de cifras: dónde está el corpus, cómo van las preguntas y si el ritmo de
 * las últimas cuatro semanas alcanza para llegar al examen. Números y una línea
 * que los explique, sin florituras.
 */
export function BandaDeCifras({ dominados, tocados, total }: { dominados: number; tocados: number; total: number }) {
  const nbme = useNbme()
  const [sesiones, setSesiones] = useState<SesionSemanal[] | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarHistorialSesiones().then(s => { if (vivo) setSesiones(s) }).catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [])

  const preguntas = summarizeNbmeState(nbme.state)
  const ritmo = sesiones ? calcularRitmo(sesiones) : null
  const alDia = ritmo ? ritmo.porSemana >= ritmo.necesarioPorSemana : false

  return <section className="banda-cifras" aria-label="Resumen del avance">
    <div className="banda-dato">
      <div className="cifra">{dominados}<span className="banda-de"> / {total}</span></div>
      <div className="rotulo">conceptos con dominio vigente</div>
      <p className="mini">{tocados} trabajados alguna vez de {total} publicados.</p>
    </div>
    <div className="banda-dato">
      <div className="cifra">{preguntas.firstCorrect}<span className="banda-de"> / {preguntas.firstEvaluated}</span></div>
      <div className="rotulo">preguntas NBME acertadas de primera</div>
      <p className="mini">{preguntas.firstEvaluated
        ? `${Math.round(preguntas.firstCorrect / preguntas.firstEvaluated * 100)} % del primer intento, sin contar reintentos ni ayudas.`
        : 'Todavía no hay primeras respuestas evaluadas.'}</p>
    </div>
    <div className="banda-dato">
      <div className="cifra">{ritmo ? ritmo.completadas : '—'}<span className="banda-de"> / {ritmo ? ritmo.planificadas : '—'}</span></div>
      <div className="rotulo">sesiones de la semana completadas</div>
      <p className="mini">{fallo ? 'No se pudo leer el plan de sesiones ahora mismo.'
        : !ritmo ? 'Leyendo el plan de sesiones…'
        : `${ritmo.planificadas - ritmo.completadas} pendientes en el plan.`}</p>
    </div>
    <div className="banda-dato">
      <div className="cifra">{ritmo ? decimal(ritmo.porSemana) : '—'}<span className="banda-de"> / {ritmo ? decimal(ritmo.necesarioPorSemana) : '—'}</span></div>
      <div className="rotulo">sesiones por semana: tuyo frente al necesario</div>
      <p className="mini">{!ritmo ? 'Leyendo el plan de sesiones…'
        : `Ritmo de las últimas cuatro semanas frente al que pide lo que queda hasta el 21-dic-2026 (${ritmo.semanasRestantes} semanas). ${alDia ? 'Vas al día.' : 'Hoy vas por debajo.'}`}</p>
    </div>
  </section>
}
