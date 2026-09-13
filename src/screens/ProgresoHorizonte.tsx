import { useMemo } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import { progresoPorForma } from '../nbme/formas'
import { construirPlanHorizonte, SEMANAS_HORIZONTE } from '../lib/plan-horizonte'
import { lunesDe } from '../lib/tiempo'
import type { Concepto } from '../schema/concept'
import { dominioVigente } from '../srs/mastery'

const DIA_MES = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')
}

/**
 * Visión a futuro: el material que queda, repartido en diez semanas.
 *
 * No es una promesa ni una predicción: es una división del trabajo pendiente. Se
 * recalcula entero en cada visita desde lo que de verdad queda, así que avanzar
 * más de lo previsto baja los objetivos siguientes y perder una semana los sube.
 */
export function ProgresoHorizonte({ conceptos }: { conceptos: Concepto[] }) {
  const { estado } = useApp()
  const nbme = useNbme()
  const lunes = lunesDe().getTime()

  const publicados = new Set(conceptos.map(c => c.concept_id))
  const progresos = Object.values(estado.progreso).filter(p => publicados.has(p.concept_id))
  const dominados = progresos.filter(p => dominioVigente(p, estado.criterios)).length
  const dominadosSemana = progresos.filter(p => dominioVigente(p, estado.criterios) && (p.dominado_en ?? 0) >= lunes).length

  const total = useMemo(() => progresoPorForma(nbme.state, nbme.catalog, 0), [nbme.state, nbme.catalog])
  const semana = useMemo(() => progresoPorForma(nbme.state, nbme.catalog, lunes), [nbme.state, nbme.catalog, lunes])
  const suma = (filas: typeof total, campo: 'total' | 'vistas' | 'nuevas') => filas.reduce((s, f) => s + f[campo], 0)
  const totalPreguntas = suma(total, 'total')
  const respondidas = suma(total, 'vistas')
  const preguntasSemana = suma(semana, 'nuevas')

  const plan = construirPlanHorizonte({
    totalConceptos: conceptos.length, dominados,
    totalPreguntas, respondidas, semanas: SEMANAS_HORIZONTE,
  })
  const objetivoCumplido = dominadosSemana >= plan.objetivoConceptos && preguntasSemana >= plan.objetivoPreguntas
  const terminado = plan.restanConceptos === 0 && plan.restanPreguntas === 0

  return <section className="tarjeta pila" aria-labelledby="horizonte-titulo">
    <div>
      <span className="rotulo">Visión a futuro</span>
      <h2 id="horizonte-titulo">Cubrir el material en {SEMANAS_HORIZONTE} semanas</h2>
      <p className="sutil">Quedan {plan.restanConceptos} conceptos por dominar y {plan.restanPreguntas} preguntas por responder.
        El reparto carga por delante: las últimas semanas antes del examen valen más para consolidar que para material nuevo.</p>
    </div>

    {terminado ? <p className="etq verde">Todo el material publicado está cubierto.</p>
      : <p className={`etq ${objetivoCumplido ? 'verde' : 'ambar'}`} role="status">
        Esta semana: {plan.objetivoConceptos} conceptos y {plan.objetivoPreguntas} preguntas · llevas {dominadosSemana} y {preguntasSemana}
      </p>}

    <div className="scroll-x">
      <table className="tabla horizonte-tabla">
        <caption>Objetivo de cada semana y total acumulado al terminarla.</caption>
        <thead><tr>
          <th scope="col">Semana</th><th scope="col">Desde</th>
          <th scope="col">Conceptos</th><th scope="col">Preguntas</th>
          <th scope="col">Conceptos acumulados</th><th scope="col">Preguntas acumuladas</th>
        </tr></thead>
        <tbody>{plan.semanas.map(fila => <tr key={fila.indice} className={fila.indice === 1 ? 'horizonte-actual' : undefined}>
          <th scope="row">{fila.indice === 1 ? 'Esta semana' : `Semana ${fila.indice}`}</th>
          <td className="sutil">{DIA_MES(fila.inicio)}</td>
          <td>{fila.conceptos}</td><td>{fila.preguntas}</td>
          <td className="sutil">{fila.acumuladoConceptos} / {plan.totalConceptos}</td>
          <td className="sutil">{fila.acumuladoPreguntas} / {plan.totalPreguntas}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <p className="mini">Se recalcula solo con cada concepto dominado y cada pregunta respondida. «Dominado» usa tus criterios
      de dominio, no el haber visto el concepto una vez. Este reparto describe el material publicado; no estima tu resultado en Step 1.</p>
  </section>
}
