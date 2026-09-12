import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { construirPlanDiario } from '../lib/plan-estudio'
import { Cobertura } from './Cobertura'
import { contextoReanudacion } from '../lib/tiempo'

import { SelectorCarga, useCargaEstudio } from '../components/SelectorCarga'

export function Inicio({ onIr, onContinuar, onEmpezar }: {
  onIr: (v: string) => void
  onContinuar: () => void
  onEmpezar: (limite: number, minutos?: 10 | 20 | 30) => void
}) {
  const { indice, estado } = useApp()
  const carga = useCargaEstudio(estado.sesiones)
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

  const plan = useMemo(() => conceptos ? construirPlanDiario(conceptos, estado.progreso, carga.cantidad) : null,
    [conceptos, estado.progreso, carga.cantidad])
  const nuevaSesion = <div className="pila">
    <SelectorCarga carga={carga} />
    {error ? <div className="aviso" role="alert">No se pudo preparar el plan. <button className="btn pequeno" onClick={() => setReintento(v => v + 1)}>Volver a intentar</button></div>
      : !plan ? <p role="status">Preparando tu plan…</p>
      : <><p>{plan.explicacion}</p><p className="mini">{plan.vencidos} de repaso · {plan.errores} para reforzar · {plan.nuevos} nuevos</p>
        <button className="btn principal" style={{ alignSelf: 'flex-start' }} disabled={!plan.conceptos.length}
          onClick={() => onEmpezar(carga.cantidad, carga.presupuestoMinutos)}>
          {plan.conceptos.length ? carga.modo === 'tiempo' ? `Estudiar ${carga.minutos} minutos` : `Empezar ${plan.conceptos.length} conceptos` : 'Todo al día por ahora'}
        </button></>}
  </div>
  return <div className="pila">
    <div><h1>Tu estudio de hoy</h1><p className="sutil">Un siguiente paso. Puedes pausar y retomar cuando lo necesites.</p></div>
    <section className="tarjeta pila" aria-labelledby="plan-titulo">
      <h2 id="plan-titulo">{estado.reanudable ? 'Retoma tu sesión' : 'Tu siguiente sesión'}</h2>
      {estado.reanudable ? <><p>{estado.reanudable.titulo || 'Tu sesión guardada'}</p><p>{contextoReanudacion(estado)}</p>
        <button className="btn principal" style={{ alignSelf: 'flex-start' }} onClick={onContinuar}>Continuar sesión guardada</button>
        <details><summary>Empezar una sesión nueva</summary><div style={{ marginTop: 16 }}>{nuevaSesion}</div></details></> : nuevaSesion}
    </section>
    <div className="fila"><button className="btn" onClick={() => onIr('modulos')}>Elegir contenido</button>
      <button className="btn fantasma" onClick={() => onIr('repaso')}>Ver repasos pendientes</button>
      <button className="btn fantasma" onClick={() => onIr('progreso')}>Ver mi progreso</button></div>
    {conceptos && indice && <details className="tarjeta detalles-estudio"><summary>Qué cubre el material disponible</summary><div style={{ marginTop: 18 }}><Cobertura conceptos={conceptos} indice={indice} /></div></details>}
  </div>
}
