import { useEffect, useRef, useState } from 'react'
import { Cronometro } from '../components/Cronometro'
import { tiempoLegible } from '../lib/tiempo'

/**
 * Panel de foco para una tarea del plan que no es una sesión preparada: el banco
 * de AMBOSS, un bloque de falladas, la lectura de First Aid. Monta el mismo
 * cronómetro del reproductor y, al llegar a cero, pregunta.
 *
 * El cronómetro mide, no decide: nada se marca solo desde aquí. Cerrar el panel
 * sin marcar deja el checkpoint exactamente como estaba.
 */
export function Enfoque({ minutos, etiqueta, onTerminar }:
  { minutos: number; etiqueta: string; onTerminar: (hecho: boolean) => void }) {
  const [presupuesto, setPresupuesto] = useState(minutos)
  const [ms, setMs] = useState(0)
  const [pausado, setPausado] = useState(false)
  const desde = useRef(Date.now())
  const acumulado = useRef(0)

  useEffect(() => {
    if (pausado) return
    desde.current = Date.now()
    const t = setInterval(() => setMs(acumulado.current + (Date.now() - desde.current)), 1000)
    return () => {
      clearInterval(t)
      acumulado.current += Date.now() - desde.current
      setMs(acumulado.current)
    }
  }, [pausado])

  const cumplido = ms >= presupuesto * 60000

  return <section className="tarjeta pila plan-enfoque" aria-labelledby="plan-enfoque-titulo">
    <div>
      <p className="editorial-eyebrow">En marcha</p>
      <h2 id="plan-enfoque-titulo" style={{ marginTop: 6 }}>{etiqueta}</h2>
      <p className="sutil">{presupuesto} minutos previstos · {tiempoLegible(ms)} en marcha{pausado ? ' · en pausa' : ''}</p>
    </div>
    <Cronometro msVisibles={ms} presupuesto={presupuesto} sinLimite={false} />
    {cumplido
      ? <>
        <p role="status">Se cumplieron los {presupuesto} minutos. Tú decides si está hecho.</p>
        <div className="fila">
          <button className="btn principal" onClick={() => onTerminar(true)}>Marcar como hecho</button>
          <button className="btn fantasma" onClick={() => setPresupuesto(p => p + 5)}>Seguir un poco más (+5 min)</button>
        </div>
      </>
      : <div className="fila">
        <button className="btn principal" onClick={() => onTerminar(true)}>Ya está hecho</button>
        <button className="btn fantasma" onClick={() => setPausado(p => !p)}>{pausado ? 'Continuar' : 'Pausar'}</button>
        <button className="btn fantasma" onClick={() => onTerminar(false)}>Dejarlo para luego</button>
      </div>}
    {cumplido && <button className="btn fantasma" onClick={() => onTerminar(false)}>Dejarlo sin marcar</button>}
  </section>
}
