import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { Anillo, Vacio } from '../components/comunes'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { estaVencido } from '../srs/fsrs'
import { dominioVigente } from '../srs/mastery'
import { construirPlanDiario, erroresRecientesPendientes } from '../lib/plan-estudio'
import { Cobertura } from './Cobertura'

export function Inicio({ onIr, onContinuar, onEmpezar, onDebiles }: {
  onIr: (v: string) => void
  onContinuar: () => void
  onEmpezar: (limite: number) => void
  onDebiles: (limite: number) => void
}) {
  const { indice, estado } = useApp()
  const [limite, setLimite] = useState<5 | 10 | 20>(10)
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  useEffect(() => {
    if (!indice) return
    let activo = true
    setError(false)
    cargarTodo(indice.modulos).then(cs => { if (activo) setConceptos(cs) })
      .catch(() => { if (activo) setError(true) })
    return () => { activo = false }
  }, [indice, reintento])

  const progresos = useMemo(() => {
    const publicados = new Set(indice?.modulos.flatMap(m => m.sesiones.flatMap(s => s.conceptos)))
    return Object.values(estado.progreso).filter(p => publicados.has(p.concept_id))
  }, [estado.progreso, indice])
  const total = indice?.n_conceptos ?? 0
  const vistos = progresos.filter(p => p.intentos.length > 0)
  const dominados = progresos.filter(p => dominioVigente(p, estado.criterios))
  const vencidos = progresos.filter(p => estaVencido(p))
  const recuperados = progresos.filter(p => p.aciertos > 0)
  const debiles = conceptos ? erroresRecientesPendientes(conceptos, estado.progreso).slice(0, 5) : []
  const recientes = [...dominados].sort((a, b) => (b.dominado_en ?? 0) - (a.dominado_en ?? 0)).slice(0, 5)
  const nombres = new Map(conceptos?.map(c => [c.concept_id, c.objetivo || c.clasificacion.tema]))
  const plan = conceptos ? construirPlanDiario(conceptos, estado.progreso, limite) : null
  const tiempos = progresos.flatMap(p => p.intentos).sort((a, b) => a.ts - b.ts)
    .filter(i => i.ms >= 1000 && i.ms <= 600000).slice(-100).map(i => i.ms).sort((a, b) => a - b)
  const mediana = tiempos.length >= 5 ? tiempos[Math.floor(tiempos.length / 2)] : null
  const minutos = mediana && plan ? Math.max(1, Math.round(mediana * plan.conceptos.length / 60000)) : null

  return (
    <div className="pila" style={{ gap: 22 }}>
      <div><h1>Tu estudio de hoy</h1><p className="sutil">Elige una carga manejable. Puedes pausar y continuar cuando lo necesites.</p></div>
      <section className="tarjeta plan-hoy" aria-labelledby="plan-titulo">
        <div className="pila" style={{ gap: 12 }}>
          <div className="rotulo">Un siguiente paso claro</div>
          <h2 id="plan-titulo">{estado.reanudable ? 'Retoma tu sesión' : 'Una sesión a tu medida'}</h2>
          {estado.reanudable && <>
            <p className="sutil">{estado.reanudable.titulo || 'Tu sesión guardada'} · vuelve al punto donde la dejaste.</p>
            <button className="btn principal" style={{ alignSelf: 'flex-start' }} onClick={onContinuar}>Continuar sesión guardada</button>
            <hr className="sep" />
          </>}
          <fieldset className="selector-carga">
            <legend>{estado.reanudable ? 'O empieza una sesión nueva' : '¿Cuántos conceptos quieres trabajar?'}</legend>
            <div className="fila" style={{ gap: 8 }}>
              {([5, 10, 20] as const).map(n => <label key={n} className={`carga-opcion${limite === n ? ' activa' : ''}`}>
                <input type="radio" name="carga-estudio" value={n} checked={limite === n} onChange={() => setLimite(n)} />
                <span>{n} conceptos</span>
              </label>)}
            </div>
          </fieldset>
          {error ? <div className="aviso" role="alert">No se pudo preparar el plan. <button className="btn pequeno" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button></div>
            : !plan ? <p className="sutil" role="status">Preparando tu plan…</p>
            : <>
              <p className="sutil" style={{ margin: 0 }}>{plan.explicacion}</p>
              <div className="fila" style={{ gap: 8 }}>
                <span className="etq">{plan.vencidos} de repaso</span>
                <span className="etq">{plan.errores} para reforzar</span>
                <span className="etq">{plan.nuevos} nuevos</span>
              </div>
              <p className="mini">{minutos ? `Tiempo orientativo: ${minutos} min, según tus respuestas anteriores. Puedes necesitar más para leer explicaciones.` : 'Sin límite de tiempo. La duración dependerá de las preguntas y de las explicaciones que consultes.'}</p>
              <button className={`btn ${estado.reanudable ? '' : 'principal'}`} style={{ alignSelf: 'flex-start' }}
                disabled={!plan.conceptos.length} onClick={() => onEmpezar(limite)}>
                {plan.conceptos.length ? `Empezar ${plan.conceptos.length} conceptos` : 'Todo al día por ahora'}
              </button>
            </>}
        </div>
        <div className="resumen-hoy">
          <Anillo valor={dominados.length} total={total || 1} etiqueta="dominio vigente" oro tam={124} />
          <p className="mini">Dentro del material publicado. Esta cifra no estima tu resultado en Step 1.</p>
          <button className="btn pequeno fantasma" onClick={() => onIr('progreso')}>Ver mi progreso</button>
        </div>
      </section>

      <div className="rejilla r3" aria-label="Resumen del estudio">
        <div className="tarjeta"><div className="cifra">{vistos.length}</div><div className="rotulo">conceptos trabajados</div><p className="mini">de {total} disponibles</p></div>
        <div className="tarjeta"><div className="cifra" style={{ color: 'var(--verde)' }}>{recuperados.length}</div><div className="rotulo">recordados alguna vez</div><p className="mini">Seguimos comprobándolos con el tiempo.</p></div>
        <button className="tarjeta pulsable" onClick={() => onIr('repaso')}><div className="cifra">{vencidos.length}</div><div className="rotulo">para repasar</div><p className="mini">Una sesión corta basta para empezar.</p></button>
      </div>

      <details className="tarjeta detalles-estudio">
        <summary>Qué he consolidado y qué puedo reforzar</summary>
        <div className="rejilla r2" style={{ marginTop: 18 }}>
          <div><h2>Dominio vigente</h2>
            {!recientes.length ? <Vacio titulo="Se construye con tiempo" texto="Varias respuestas independientes y separadas en el tiempo aportarán evidencia de dominio." />
              : recientes.map(p => <div className="fila concepto-resumen" key={p.concept_id}><span>{nombres.get(p.concept_id) || 'Concepto estudiado'}</span><span className="etq oro">Vigente</span></div>)}
          </div>
          <div><h2>Para reforzar</h2>
            {!debiles.length ? <Vacio titulo="Sin errores recientes pendientes" texto="Las dificultades son información para elegir la próxima práctica." />
              : <>{debiles.map(c => <div className="concepto-resumen" key={c.concept_id}>{c.objetivo || c.clasificacion.tema}</div>)}
                <button className="btn pequeno" style={{ marginTop: 12 }} onClick={() => onDebiles(limite)}>Practicar objetivos por reforzar</button></>}
          </div>
        </div>
      </details>
      {conceptos && indice && <details className="tarjeta detalles-estudio"><summary>Qué cubre el material disponible</summary><div style={{ marginTop: 18 }}><Cobertura conceptos={conceptos} indice={indice} /></div></details>}
      <button className="btn fantasma" style={{ alignSelf: 'flex-start' }} onClick={() => onIr('modulos')}>Elegir un módulo o una ruta</button>
    </div>
  )
}
