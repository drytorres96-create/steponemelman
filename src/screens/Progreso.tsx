import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import { ScreenHeading } from '../components/Editorial'
import { BandaDeCifras } from './ProgresoCifras'
import { ProgresoMeta } from './ProgresoMeta'
import { BandaAdherencia } from './ProgresoAdherencia'
import { CalendarioSemana } from './CalendarioSemana'
import { resumenProgresoAprendizaje } from '../lib/progreso-aprendizaje'
import type { AccionesRecuperacion } from './RecuperarMeta'

/** Los indicadores sólo necesitan IDs y progreso. El contenido se carga al pedir su detalle. */
export function ResumenProgreso(acciones: AccionesRecuperacion) {
  const { indice, estado } = useApp()
  const [semanaAbierta, setSemanaAbierta] = useState(false)
  const [, tic] = useState(0)
  useEffect(() => { const timer = setInterval(() => tic(n => n + 1), 60_000); return () => clearInterval(timer) }, [])
  const conceptIds = useMemo(() => [...new Set(indice?.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos)) ?? [])], [indice])
  const ahora = Date.now()
  const resumen = useMemo(() => resumenProgresoAprendizaje(conceptIds, estado.progreso, estado.criterios, ahora, estado.conceptosVistos),
    [conceptIds, estado.progreso, estado.criterios, estado.conceptosVistos, ahora])
  const cargarDetalleConceptos = useCallback(() => cargarTodo(indice?.modulos ?? []), [indice])
  return <div className="pila premium-progress">
    <section className="premium-progress-grid" aria-label="Estado de tu aprendizaje">
      <article className="premium-progress-card"><h2>Conceptos vistos</h2><strong>{resumen.vistos} / {resumen.total}</strong>
        <progress max={resumen.total || 1} value={resumen.vistos} aria-label="Progreso de conceptos vistos" />
        <p className="mini">{resumen.actividad} con práctica registrada. Abrir un concepto cuenta como visto; responderlo registra práctica.</p></article>
      <article className="premium-progress-card"><h2>Dominio demostrado</h2><strong>{resumen.dominioDemostrado}</strong>
        <p className="mini">Cumplen tus criterios de evidencia. Un repaso vencido conserva esa evidencia.</p></article>
      <article className="premium-progress-card"><h2>Mantenimiento al día</h2><strong>{resumen.mantenimientoAlDia} / {resumen.dominioDemostrado}</strong>
        <p className="mini">{resumen.mantenimientoPendiente} pendientes de repaso.{resumen.mantenimientoPorComprobar > 0 && ` ${resumen.mantenimientoPorComprobar} por comprobar.`}
          {!resumen.dominioDemostrado && ' Se contará al demostrar dominio.'}</p></article>
    </section>
    <BandaDeCifras conceptIds={conceptIds} cargarDetalleConceptos={cargarDetalleConceptos} ventana="semana" />
    <ProgresoMeta conceptIds={conceptIds} {...acciones} />
    <details className="hoy-desplegable" onToggle={event => setSemanaAbierta(event.currentTarget.open)}><summary>Mi semana y mi plan</summary>
      {semanaAbierta && <div className="hoy-desplegable-cuerpo pila"><BandaAdherencia /><CalendarioSemana /></div>}
    </details>
  </div>
}

export function Progreso(acciones: AccionesRecuperacion) {
  return <div className="pila">
    <ScreenHeading eyebrow="Tu práctica" title="Progreso" description="Lo que hiciste, lo que demostraste y lo que mantienes al día." />
    <ResumenProgreso {...acciones} />
  </div>
}
