import { useMemo } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import {
  DIAS_META, DIAS_PARA_PROYECTAR, fechaDelDia, primerasRespuestasNbme, resumenMeta, type SerieMeta,
} from '../lib/meta'
import type { Concepto } from '../schema/concept'
import { evaluarDominio } from '../srs/mastery'

const diaYMes = (f: Date) => f.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')
const desdeISO = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

const RUMBO: Record<SerieMeta['rumbo'], (distancia: number) => string> = {
  delante: d => `Vas ${d} por delante.`,
  linea: () => 'Vas en la línea.',
  debajo: d => `Vas ${d} por debajo.`,
}

/** Una meta: lo hecho, la marca de la línea encima y, cuando hay ritmo, adónde lleva. */
function Serie({ titulo, serie, fin }: { titulo: string; serie: SerieMeta; fin: string }) {
  const pct = serie.meta ? Math.min(100, serie.hechos / serie.meta * 100) : 0
  const marca = serie.meta ? Math.min(100, serie.linea / serie.meta * 100) : 0
  return <div className="meta-serie">
    <div className="meta-serie-cabecera">
      <strong>{titulo}</strong>
      <span>{serie.hechos} / {serie.meta} · {Math.round(pct)} %</span>
    </div>
    <div className="meta-pista">
      <div className="barra-prog" role="progressbar" aria-label={titulo}
        aria-valuemin={0} aria-valuemax={serie.meta} aria-valuenow={serie.hechos}
        aria-valuetext={`${serie.hechos} de ${serie.meta}; la línea va por ${serie.linea}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="meta-marca" style={{ left: `${marca}%` }} aria-hidden="true" />
    </div>
    <p className={`mini meta-rumbo ${serie.rumbo}`}>La línea va por {serie.linea}. {RUMBO[serie.rumbo](serie.distancia)}</p>
    {serie.proyeccion !== null && <p className="mini meta-proyeccion">
      Si sigues como la última semana: ~{serie.proyeccion} el {fin}{serie.proyeccion >= serie.meta ? ', por encima de la meta' : ''}.
    </p>}
  </div>
}

/**
 * Visión a futuro: la meta de 60 días, lo que va hecho y adónde lleva el ritmo.
 *
 * La línea es el camino a la meta al paso de los techos de Hoy, y más despacio que
 * ellos: ya cuenta con días malos, así que nunca pide más de lo que Hoy da en un día.
 * Ir por debajo no trae alarma ni color; sólo la distancia.
 */
export function ProgresoMeta({ conceptos }: { conceptos: Concepto[] }) {
  const { estado } = useApp()
  const nbme = useNbme()
  const ahora = Date.now()
  const preguntas = useMemo(() => primerasRespuestasNbme(nbme.state, nbme.catalog), [nbme.state, nbme.catalog])
  // Dominado es cumplir los criterios, como una caja cerrada en Hoy: un repaso pendiente no
  // lo descuenta, porque Hoy no lo ofrece y la cifra bajaría sin nada que hacer para evitarlo.
  const dominadosEn = conceptos.flatMap(c => {
    const p = estado.progreso[c.concept_id]
    return p && evaluarDominio(p, estado.criterios, ahora).cumple ? [p.dominado_en ?? 0] : []
  })
  // Sin catálogo todavía no se sabe cuántas hay: la meta no se recorta a cero mientras carga.
  const catalogo = !!nbme.catalog
  const r = resumenMeta({
    ahora, dominadosEn, conceptosPublicados: conceptos.length,
    primerasRespuestas: preguntas.marcas, preguntasPublicadas: catalogo ? preguntas.publicadas : Number.POSITIVE_INFINITY,
  })

  const inicio = diaYMes(fechaDelDia(1))
  const fin = diaYMes(fechaDelDia(DIAS_META))
  const consolidar = `${r.semanasConsolidacion} ${r.semanasConsolidacion === 1 ? 'semana' : 'semanas'}`
  const cuando = r.dia < 1 ? `Empieza el ${inicio} y termina el ${fin}.`
    : r.dia > DIAS_META ? `Terminó el ${fin}.`
    : `Día ${r.dia} de ${DIAS_META}, del ${inicio} al ${fin}. Después quedan ${consolidar} para consolidar antes del examen.`
  const proyeccionPendiente = r.dia <= DIAS_PARA_PROYECTAR

  return <section className="tarjeta pila" aria-labelledby="meta-titulo">
    <div>
      <span className="rotulo">Visión a futuro</span>
      <h2 id="meta-titulo">Meta de {DIAS_META} días: {r.conceptos.meta} conceptos y {r.preguntas.meta} preguntas</h2>
      <p className="sutil">{cuando}</p>
    </div>

    <Serie titulo="Conceptos dominados" serie={r.conceptos} fin={fin} />
    {catalogo ? <Serie titulo="Preguntas NBME respondidas" serie={r.preguntas} fin={fin} />
      : <p className="mini" role="status">{nbme.error ? 'Las preguntas NBME no están disponibles ahora mismo.' : 'Cargando las preguntas NBME…'}</p>}
    {proyeccionPendiente && <p className="mini">La proyección sale el {diaYMes(fechaDelDia(DIAS_PARA_PROYECTAR + 1))}: antes no hay ritmo que proyectar.</p>}

    <div className="scroll-x">
      <table className="tabla meta-tabla">
        <caption>Dónde va la línea al terminar cada semana.</caption>
        <thead><tr>
          <th scope="col">Hasta</th><th scope="col">Conceptos</th><th scope="col">Preguntas</th>
        </tr></thead>
        <tbody>{r.filas.map(fila => <tr key={fila.semana} className={fila.actual ? 'meta-actual' : undefined}>
          <th scope="row">{diaYMes(desdeISO(fila.hasta))}{fila.actual && <> <span className="meta-hoy">esta semana</span></>}</th>
          <td>{fila.conceptos}</td><td>{fila.preguntas}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <p className="mini">La línea sigue los techos de Hoy —nada el viernes, el doble el fin de semana— y, en conceptos,
      va una semana por detrás: lo que tarda uno en quedar dominado. Ya cuenta con días malos: avanza más despacio de lo
      que dan los techos, así que nunca hace falta hacer más de lo que Hoy te da. Cuenta desde el {inicio}; «dominado» usa
      tus criterios de dominio, y una pregunta cuenta la primera vez que la respondes.</p>
  </section>
}
