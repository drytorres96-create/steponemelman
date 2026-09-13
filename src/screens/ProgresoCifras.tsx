import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { progresoPorForma } from '../nbme/formas'
import { cargarHistorialSesiones } from '../semana/api'
import type { SesionSemanal } from '../semana/tipos'
import type { Concepto } from '../schema/concept'
import { dominioVigente } from '../srs/mastery'
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

const decimal = (n: number) => n.toLocaleString('es', { maximumFractionDigits: 1 })

function Dato({ cifra, de, rotulo, nota }: { cifra: number | string; de?: number | string; rotulo: string; nota: string }) {
  return <div className="banda-dato">
    <div className="cifra">{cifra}{de !== undefined && <span className="banda-de"> / {de}</span>}</div>
    <div className="rotulo">{rotulo}</div>
    <p className="mini">{nota}</p>
  </div>
}

/**
 * Banda de cifras con dos ventanas. **General** mide todo el historial contra el
 * corpus completo; **Esta semana** mide sólo lo hecho desde el lunes, que es la
 * unidad con la que se planifica el estudio. Números y una línea que los explique.
 */
export function BandaDeCifras({ conceptos, ventana }: { conceptos: Concepto[]; ventana: Ventana }) {
  const { estado } = useApp()
  const nbme = useNbme()
  const [sesiones, setSesiones] = useState<SesionSemanal[] | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let vivo = true
    cargarHistorialSesiones().then(s => { if (vivo) setSesiones(s) }).catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [])

  const desde = ventana === 'semana' ? lunesDe().getTime() : 0
  const formas = useMemo(() => progresoPorForma(nbme.state, nbme.catalog, desde), [nbme.state, nbme.catalog, desde])
  const preguntas = formas.reduce((suma, f) => ({
    total: suma.total + f.total, vistas: suma.vistas + f.vistas,
    nuevas: suma.nuevas + f.nuevas, primeraVez: suma.primeraVez + f.primeraVez,
    reincidentes: suma.reincidentes + f.reincidentes,
  }), { total: 0, vistas: 0, nuevas: 0, primeraVez: 0, reincidentes: 0 })

  const total = conceptos.length
  const publicados = new Set(conceptos.map(c => c.concept_id))
  const progresos = Object.values(estado.progreso).filter(p => publicados.has(p.concept_id))
  const dominados = progresos.filter(p => dominioVigente(p, estado.criterios)).length
  const tocados = progresos.filter(p => p.intentos.length).length
  const trabajadosSemana = progresos.filter(p => p.intentos.some(t => t.ts >= desde)).length
  const dominadosSemana = progresos.filter(p => dominioVigente(p, estado.criterios) && (p.dominado_en ?? 0) >= desde).length

  const delaSemana = (sesiones ?? []).filter(s => fechaDeSesion(s).getTime() >= desde)
  const ritmo = sesiones ? calcularRitmo(sesiones) : null
  const alDia = ritmo ? ritmo.porSemana >= ritmo.necesarioPorSemana : false
  const notaSesiones = fallo ? 'No se pudo leer el plan de sesiones ahora mismo.'
    : !sesiones ? 'Leyendo el plan de sesiones…' : null

  if (ventana === 'semana') return <section className="banda-cifras" aria-label="Resumen de esta semana">
    <Dato cifra={dominadosSemana} rotulo="conceptos que cruzaron a dominio esta semana"
      nota={`${dominados} con dominio vigente en total, de ${total} publicados.`} />
    <Dato cifra={trabajadosSemana} rotulo="conceptos respondidos esta semana"
      nota={`${tocados} trabajados alguna vez de ${total} publicados.`} />
    <Dato cifra={preguntas.vistas} rotulo="preguntas NBME respondidas esta semana"
      nota={preguntas.vistas
        ? `${preguntas.nuevas} nuevas · ${preguntas.primeraVez} acertadas a la primera · ${preguntas.reincidentes} reincidentes.`
        : 'Aún no has respondido preguntas esta semana.'} />
    <Dato cifra={delaSemana.filter(hecha).length} de={delaSemana.length} rotulo="sesiones de esta semana completadas"
      nota={notaSesiones ?? (delaSemana.length
        ? `${delaSemana.length - delaSemana.filter(hecha).length} pendientes en el plan de esta semana.`
        : 'No hay sesiones planificadas para esta semana.')} />
  </section>

  return <section className="banda-cifras" aria-label="Resumen general del avance">
    <Dato cifra={dominados} de={total} rotulo="conceptos con dominio vigente"
      nota={`${tocados} trabajados alguna vez de ${total} publicados.`} />
    <Dato cifra={preguntas.primeraVez} de={preguntas.vistas} rotulo="preguntas NBME acertadas a la primera"
      nota={preguntas.vistas
        ? `${preguntas.vistas} respondidas de ${preguntas.total} publicadas · ${preguntas.reincidentes} reincidentes.`
        : 'Todavía no hay preguntas respondidas.'} />
    <Dato cifra={ritmo ? ritmo.completadas : '—'} de={ritmo ? ritmo.planificadas : '—'} rotulo="sesiones de la semana completadas"
      nota={notaSesiones ?? `${ritmo!.planificadas - ritmo!.completadas} pendientes en el plan.`} />
    <Dato cifra={ritmo ? decimal(ritmo.porSemana) : '—'} de={ritmo ? decimal(ritmo.necesarioPorSemana) : '—'}
      rotulo="sesiones por semana: tuyo frente al necesario"
      nota={notaSesiones ?? `Ritmo de las últimas cuatro semanas frente al que pide lo que queda hasta el 21-dic-2026 (${ritmo!.semanasRestantes} semanas). ${alDia ? 'Vas al día.' : 'Hoy vas por debajo.'}`} />
  </section>
}
