import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { useNbme } from '../nbme/NbmeProvider'
import {
  DIAS_META, DIAS_PARA_PROYECTAR, distanciasMeta, fechaDelDia, primerasRespuestasNbme, resumenMeta, type SerieMeta,
} from '../lib/meta'
import { instanteEstudio, ZONA_ESTUDIO } from '../lib/calendario-estudio'
import type { Concepto } from '../schema/concept'
import { resumenProgresoAprendizaje } from '../lib/progreso-aprendizaje'
import type { AccionesRecuperacion } from './RecuperarMeta'

const RecuperarMeta = lazy(() => import('./RecuperarMeta').then(m => ({ default: m.RecuperarMeta })))

const diaYMes = (f: Date) => f.toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: ZONA_ESTUDIO }).replace('.', '')
const desdeISO = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(instanteEstudio({ anio: a, mes: m, dia: d }, 12))
}

const RUMBO: Record<SerieMeta['rumbo'], (distancia: number) => string> = {
  delante: d => `Vas ${d} por delante.`,
  linea: () => 'Vas dentro del margen de planificación.',
  debajo: d => `Vas ${d} por debajo.`,
}

/** Una meta: lo hecho, la marca de la línea encima y, cuando hay ritmo, adónde lleva. */
function Serie({ titulo, serie, fin }: { titulo: string; serie: SerieMeta; fin: string }) {
  const porcentaje = serie.meta ? serie.hechos / serie.meta * 100 : 0
  const pct = Math.min(100, Math.max(0, porcentaje))
  const marca = serie.meta ? Math.min(100, serie.linea / serie.meta * 100) : 0
  const distancia = distanciasMeta(serie)
  return <div className="meta-serie">
    <div className="meta-serie-cabecera">
      <strong>{titulo}</strong>
      <span>{serie.hechos} / {serie.meta} · {Math.round(porcentaje)} %</span>
    </div>
    <div className="meta-pista">
      <div className="barra-prog" role="progressbar" aria-label={titulo}
        aria-valuemin={0} aria-valuemax={serie.meta} aria-valuenow={Math.min(serie.meta, Math.max(0, serie.hechos))}
        aria-valuetext={`${serie.hechos} de ${serie.meta}; la línea va por ${serie.linea}${serie.hechos > serie.meta ? '; meta superada' : ''}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="meta-marca" style={{ left: `${marca}%` }} aria-hidden="true" />
    </div>
    <p className={`mini meta-rumbo ${serie.rumbo}`}>La línea va por {serie.linea}. {RUMBO[serie.rumbo](serie.distancia)}</p>
    <p className="mini meta-distancia">{distancia.igualarLinea > 0
      ? <>Para alcanzar la línea: {distancia.igualarLinea}. Para superarla: {distancia.superarLinea}.</>
      : distancia.superarLinea > 0 ? <>Estás exactamente en la línea. Para superarla: {distancia.superarLinea}.</>
        : <>Ya superaste la línea.</>} {distancia.completarMeta > 0
          ? <>Para completar la meta: {distancia.completarMeta}.</> : <>Meta completada{serie.hechos > serie.meta ? ` · ${serie.hechos - serie.meta} por encima` : ''}.</>}</p>
    {serie.proyeccion !== null && <p className="mini meta-proyeccion">
      Si sigues como la última semana: ~{serie.proyeccion} el {fin}{serie.proyeccion > serie.meta ? ', por encima de la meta' : serie.proyeccion === serie.meta ? ', justo en la meta' : ''}.
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
export function ProgresoMeta({ conceptos, conceptIds, ...acciones }: AccionesRecuperacion & { conceptos?: Concepto[]; conceptIds?: string[]; cargarDetalleConceptos?: () => Promise<Concepto[]> }) {
  const { estado } = useApp()
  const nbme = useNbme()
  const [recuperacionAbierta, setRecuperacionAbierta] = useState(false)
  const [, tic] = useState(0)
  useEffect(() => { const t = setInterval(() => tic(n => n + 1), 60_000); return () => clearInterval(t) }, [])
  const ahora = Date.now()
  const preguntas = useMemo(() => primerasRespuestasNbme(nbme.state, nbme.catalog), [nbme.state, nbme.catalog])
  const ids = useMemo(() => conceptIds ?? (conceptos ?? []).map(c => c.concept_id), [conceptIds, conceptos])
  const aprendizaje = useMemo(() => resumenProgresoAprendizaje(ids, estado.progreso, estado.criterios, ahora),
    [ids, estado.progreso, estado.criterios, ahora])
  // Sin catálogo todavía no se sabe cuántas hay: la meta no se recorta a cero mientras carga.
  const catalogo = !!nbme.catalog
  const r = resumenMeta({
    ahora, dominadosEn: aprendizaje.dominadosEn, primerasAcreditaciones: aprendizaje.primerasAcreditaciones, conceptosPublicados: aprendizaje.total,
    primerasRespuestas: preguntas.marcas, preguntasPublicadas: catalogo ? preguntas.publicadas : Number.POSITIVE_INFINITY,
  })

  const inicio = diaYMes(fechaDelDia(1))
  const fin = diaYMes(fechaDelDia(DIAS_META))
  const consolidar = `${r.semanasConsolidacion} ${r.semanasConsolidacion === 1 ? 'semana' : 'semanas'}`
  const cuando = r.dia < 1 ? `Empieza el ${inicio} y termina el ${fin}.`
    : r.dia > DIAS_META ? `Terminó el ${fin}.`
    : `Día ${r.dia} de ${DIAS_META}, del ${inicio} al ${fin}. Después quedan unas ${consolidar} para consolidar antes del examen.`
  const proyeccionPendiente = r.dia <= DIAS_PARA_PROYECTAR

  return <section className="tarjeta pila" aria-labelledby="meta-titulo">
    <div>
      <span className="rotulo">Visión a futuro</span>
      <h2 id="meta-titulo">Meta de {DIAS_META} días: {r.conceptos.meta} conceptos y {r.preguntas.meta} preguntas</h2>
      <p className="sutil">{cuando}</p>
    </div>

    <Serie titulo="Conceptos con dominio demostrado en esta meta" serie={r.conceptos} fin={fin} />
    <p className="mini">Dominio demostrado total: {aprendizaje.dominioDemostrado} conceptos. Mantenimiento: {aprendizaje.mantenimientoAlDia} al día · {aprendizaje.mantenimientoPendiente} pendientes de repaso{aprendizaje.mantenimientoPorComprobar > 0 && <> · {aprendizaje.mantenimientoPorComprobar} por comprobar</>}.</p>
    {catalogo ? <Serie titulo="Preguntas NBME respondidas" serie={r.preguntas} fin={fin} />
      : <p className="mini" role="status">{nbme.error ? 'Las preguntas NBME no están disponibles ahora mismo.' : 'Cargando las preguntas NBME…'}</p>}
    {proyeccionPendiente && <p className="mini">La proyección sale el {diaYMes(fechaDelDia(DIAS_PARA_PROYECTAR + 1))}.</p>}

    <details className="hoy-desplegable" onToggle={e => setRecuperacionAbierta(e.currentTarget.open)}>
      <summary>Ponerme al día con la meta</summary>
      {recuperacionAbierta && <div className="hoy-desplegable-cuerpo"><Suspense fallback={<p role="status">Comprobando tu siguiente paso…</p>}>
        <RecuperarMeta {...acciones} />
      </Suspense></div>}
    </details>

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

  </section>
}
