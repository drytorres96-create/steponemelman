import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { cargarAdherencia, type AdherenciaSemana } from '../plan/api'

/**
 * Adherencia al plan: qué parte de la semana planificada quedó hecha, esta semana
 * y las cuatro anteriores.
 *
 * Va en su propia banda, separada de las cifras de dominio, a propósito. Hacer y
 * dominar son cosas distintas: promediarlas en un solo número dejaría los dos
 * inservibles — una semana entera cumplida sin nada consolidado se leería igual
 * que media semana bien aprendida.
 */
export function BandaAdherencia() {
  const { session } = useAuth()
  const token = session?.access_token ?? ''
  const [semanas, setSemanas] = useState<AdherenciaSemana[] | null>(null)

  useEffect(() => {
    let vivo = true
    cargarAdherencia(token).then(s => { if (vivo) setSemanas(s) })
    return () => { vivo = false }
  }, [token])

  // Sin plan no hay banda: nada de un hueco con guiones donde no hay nada que medir.
  if (!semanas?.length) return null

  const rotulo = (titulo: string) => titulo.split(' · ')[0]

  return <section className="tarjeta pila plan-adherencia" aria-labelledby="plan-adherencia-titulo">
    <div>
      <h2 id="plan-adherencia-titulo" className="rotulo">Adherencia al plan</h2>
      <p className="mini">mide si se hizo, no si se domina</p>
    </div>
    <div className="banda-cifras">
      {semanas.map(s => {
        const pct = s.tareas ? Math.round((s.hechas / s.tareas) * 100) : 0
        return <div className="banda-dato" key={s.eventoId}>
          <div className="cifra">{pct}<span className="banda-de"> %</span></div>
          <div className="rotulo">{rotulo(s.titulo)}</div>
          <p className="mini">{s.hechas} de {s.tareas} puntos del plan, sin contar los descansos.</p>
        </div>
      })}
    </div>
  </section>
}
