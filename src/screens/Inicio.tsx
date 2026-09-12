import { useEffect, useState } from 'react'
import { useApp } from '../store/estado'
import { cargarTodo } from '../data/corpus'
import type { Concepto } from '../schema/concept'
import { construirPlanDiario } from '../lib/plan-estudio'
import { Cobertura } from './Cobertura'
import { contextoReanudacion } from '../lib/tiempo'

import { SelectorCarga, useCargaEstudio } from '../components/SelectorCarga'
import { MedicalImage, NavigationIcon, StudyHero } from '../components/Editorial'

export function Inicio({ onIr, onContinuar, onEmpezar, embedded = false }: {
  embedded?: boolean
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

  const plan = conceptos ? construirPlanDiario(conceptos, estado.progreso, carga.cantidad) : null
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
  return <div className="pila editorial-home">
    {!embedded && <StudyHero />}
    <div className="home-session-grid">
    <section className="tarjeta pila home-session" aria-labelledby="plan-titulo">
      <p className="editorial-eyebrow">Tu práctica diaria</p>
      <h2 id="plan-titulo">{estado.reanudable ? 'Retoma tu sesión' : 'Tu siguiente sesión'}</h2>
      {estado.reanudable ? <><p>{estado.reanudable.titulo || 'Tu sesión guardada'}</p><p>{contextoReanudacion(estado)}</p>
        <button className="btn principal" style={{ alignSelf: 'flex-start' }} onClick={onContinuar}>Continuar sesión guardada</button>
        <details><summary>Empezar una sesión nueva</summary><div style={{ marginTop: 16 }}>{nuevaSesion}</div></details></> : nuevaSesion}
    </section>
    <aside className="home-review"><NavigationIcon name="repaso" /><p className="editorial-eyebrow">Dale tiempo a la memoria</p><h2>Volver también<br />es avanzar.</h2><p>Retoma los fundamentos y refuerza lo que necesita otra mirada.</p><button className="btn" onClick={() => onIr('repaso')}>Ver repasos pendientes <NavigationIcon name="arrow" /></button></aside>
    </div>
    <div className="home-paths">
      <button className="home-path home-path-photo" onClick={() => onIr('modulos')}><MedicalImage scene="organic" sizes="(max-width: 760px) 100vw, 40vw" /><span className="home-path-copy"><span className="editorial-eyebrow">Biblioteca de estudio</span><strong>Elegir contenido</strong><span>Explora por sistema y disciplina.</span></span><NavigationIcon name="arrow" /></button>
      <button className="home-path home-path-progress" onClick={() => onIr('progreso')}><NavigationIcon name="progreso" /><span className="home-path-copy"><span className="editorial-eyebrow">Tu recorrido</span><strong>Ver mi progreso</strong><span>Observa lo que vas construyendo.</span></span><NavigationIcon name="arrow" /></button>
    </div>
    {conceptos && indice && <details className="tarjeta detalles-estudio"><summary>Qué cubre el material disponible</summary><div style={{ marginTop: 18 }}><Cobertura conceptos={conceptos} indice={indice} /></div></details>}
  </div>
}
