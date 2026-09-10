import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/estado'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import { useDescarga } from '../components/descarga'
import { APP_VERSION } from '../release'

function NumeroCriterio({ id, titulo, valor, min, max, guardar }: {
  id: string; titulo: string; valor: number; min: number; max: number; guardar: (valor: number) => void
}) {
  const [texto, setTexto] = useState(String(valor))
  useEffect(() => { setTexto(String(valor)) }, [valor])
  return <div><label htmlFor={id}>{titulo}</label><input id={id} type="number" min={min} max={max}
    value={texto} onChange={e => setTexto(e.target.value)} onBlur={() => {
      const n = Number(texto)
      if (!texto.trim() || !Number.isInteger(n) || n < min || n > max) { setTexto(String(valor)); return }
      guardar(n)
    }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} /></div>
}

export function Ajustes() {
  const { estado, actualizarCriterios, exportar, importar, reiniciar, indice } = useApp()
  const [msg, setMsg] = useState('')
  const archivo = useRef<HTMLInputElement>(null)
  const { entregar, dialogo } = useDescarga()
  const c = estado.criterios

  const guardar = (patch: Partial<typeof c>) => actualizarCriterios({ ...c, ...patch })
  const descargar = () =>
    entregar(`progreso-step1-${new Date().toISOString().slice(0, 10)}.json`, exportar(), 'application/json')

  return (
    <div className="pila" style={{ maxWidth: 760 }}>
      {dialogo}
      <div><h1>Ajustes</h1><p className="sutil">Los criterios de dominio son configurables: al cambiarlos se recalcula el estado de todos tus conceptos.</p></div>

      <div className="tarjeta pila">
        <h2>Criterios de dominio</h2>
        <p className="mini">Los valores válidos se guardan al salir de cada campo.</p>
        <div className="rejilla r2">
          <NumeroCriterio id="criterio-recuperaciones" titulo="Respuestas independientes correctas mínimas" valor={c.recuperaciones} min={1} max={10} guardar={n => guardar({ recuperaciones: n })} />
          <NumeroCriterio id="criterio-sesiones" titulo="Sesiones distintas mínimas" valor={c.sesiones} min={1} max={6} guardar={n => guardar({ sesiones: n })} />
          <NumeroCriterio id="criterio-horas" titulo="Separación temporal mínima (horas)" valor={c.separacionHoras} min={0} max={168} guardar={n => guardar({ separacionHoras: n })} />
          <NumeroCriterio id="criterio-confusiones" titulo="Ventana sin confusiones (días)" valor={c.ventanaConfusionDias} min={0} max={90} guardar={n => guardar({ ventanaConfusionDias: n })} />
        </div>
        <p className="sutil">El dominio requiere respuestas correctas sin pistas, sin consultar la fuente ni ver la explicación antes de responder. Puedes demostrarlo recordando, discriminando opciones o aplicando el conocimiento. Los intentos anteriores se conservan en tu historial.</p>
        <button className="btn pequeno fantasma" style={{ alignSelf: 'flex-start' }} onClick={() => actualizarCriterios(CRITERIOS_POR_DEFECTO)}>
          Restaurar valores recomendados
        </button>
      </div>

      <div className="tarjeta pila">
        <h2>Tu progreso</h2>
        <p className="sutil">Tu progreso se sincroniza con tu cuenta. Inicia sesión con el mismo correo en otro dispositivo para continuar. También puedes importar el progreso de la versión anterior o guardar una copia.</p>
        <div className="fila">
          <button className="btn" onClick={descargar}>Exportar progreso</button>
          <button className="btn fantasma" onClick={() => archivo.current?.click()}>Importar progreso</button>
          <input ref={archivo} type="file" accept="application/json" style={{ display: 'none' }}
            onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return
              const r = importar(await f.text()); setMsg(r.mensaje)
            }} />
        </div>
        {msg && <div className="aviso"><span>ℹ</span><div>{msg}</div></div>}
        <hr className="sep" />
        <button className="btn fantasma" style={{ alignSelf: 'flex-start', borderColor: '#f2606a44', color: 'var(--rojo)' }}
          onClick={async () => {
            if (!confirm('Se borrará el progreso de tu cuenta en todos tus dispositivos. ¿Continuar?')) return
            try { await reiniciar(); setMsg('Progreso reiniciado en tu cuenta.') }
            catch (e) { setMsg(e instanceof Error ? e.message : 'No se pudo reiniciar. Tu progreso se conserva.') }
          }}>
          Reiniciar todo el progreso
        </button>
      </div>

      <div className="tarjeta">
        <h2 style={{ marginBottom: 8 }}>Glosario</h2>
        <p className="sutil">Siglas expandidas la primera vez que aparecen, extraídas del propio corpus.</p>
        <div className="scroll-x" style={{ maxHeight: 320 }}>
          <table className="tabla">
            <thead><tr><th>Sigla</th><th>Término</th><th>Disciplina</th></tr></thead>
            <tbody>{(indice?.glosario ?? []).map(g => (
              <tr key={g.sigla}><td><b>{g.sigla}</b></td><td className="sutil">{g.termino}</td><td className="mini">{g.disciplina}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <p className="mini">Step 1 · Melman · Versión {APP_VERSION}</p>
    </div>
  )
}
