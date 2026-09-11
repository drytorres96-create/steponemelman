import { useId, useState } from 'react'
import type { RegistroSesion } from '../store/model'
import { cargaPorTiempo } from '../lib/tiempo'

export function useCargaEstudio(sesiones: RegistroSesion[]) {
  const [modo, setModo] = useState<'tiempo' | 'conceptos'>('tiempo')
  const [minutos, setMinutos] = useState<10 | 20 | 30>(20)
  const [limite, setLimite] = useState<5 | 10 | 20>(10)
  return { modo, setModo, minutos, setMinutos, limite, setLimite,
    cantidad: modo === 'tiempo' ? cargaPorTiempo(minutos, sesiones) : limite,
    presupuestoMinutos: modo === 'tiempo' ? minutos : undefined }
}

export function SelectorCarga({ carga }: { carga: ReturnType<typeof useCargaEstudio> }) {
  const id = useId()
  return <details className="detalles-estudio">
    <summary>Cambiar duración · {carga.modo === 'tiempo' ? `${carga.minutos} minutos` : `hasta ${carga.limite} conceptos`}</summary>
    <fieldset className="selector-carga" style={{ marginTop: 12 }}><legend>Carga de la sesión</legend>
      <div className="fila" style={{ marginBottom: 12 }}>
        <button className="btn pequeno" aria-pressed={carga.modo === 'tiempo'} onClick={() => carga.setModo('tiempo')}>Por tiempo</button>
        <button className="btn pequeno" aria-pressed={carga.modo === 'conceptos'} onClick={() => carga.setModo('conceptos')}>Por conceptos</button>
      </div>
      <div className="fila">
        {carga.modo === 'tiempo' ? ([10, 20, 30] as const).map(n => <label className={`carga-opcion${carga.minutos === n ? ' activa' : ''}`} key={n}>
          <input type="radio" name={`${id}-tiempo`} checked={carga.minutos === n} onChange={() => carga.setMinutos(n)} />{n} minutos
        </label>) : ([5, 10, 20] as const).map(n => <label className={`carga-opcion${carga.limite === n ? ' activa' : ''}`} key={n}>
          <input type="radio" name={`${id}-conceptos`} checked={carga.limite === n} onChange={() => carga.setLimite(n)} />{n} conceptos
        </label>)}
      </div>
    </fieldset>
    <p className="mini">{carga.modo === 'tiempo' ? 'Incluye preguntas y explicaciones. Al llegar al tiempo podrás pausar o continuar; el número de conceptos es orientativo.' : 'Sin límite de tiempo. Los errores vuelven a aparecer hasta acertarlos.'}</p>
  </details>
}
