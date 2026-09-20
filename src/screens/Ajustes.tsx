import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/estado'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import { useDescarga } from '../components/descarga'
import { APP_VERSION } from '../release'
import { ScreenHeading } from '../components/Editorial'

const CAMPOS = [
  { clave: 'recuperaciones', titulo: 'Respuestas independientes correctas mínimas', min: 1, max: 10 },
  { clave: 'sesiones', titulo: 'Sesiones distintas mínimas', min: 1, max: 6 },
  { clave: 'separacionHoras', titulo: 'Separación temporal mínima (horas)', min: 0, max: 168 },
  { clave: 'ventanaConfusionDias', titulo: 'Ventana sin confusiones (días)', min: 0, max: 90 },
] as const
const textos = (c: typeof CRITERIOS_POR_DEFECTO) => Object.fromEntries(CAMPOS.map(f => [f.clave, String(c[f.clave])])) as Record<typeof CAMPOS[number]['clave'], string>

export function Ajustes() {
  const { estado, actualizarCriterios, exportar, importar, reiniciar, indice } = useApp()
  const [msg, setMsg] = useState('')
  const archivo = useRef<HTMLInputElement>(null)
  const { entregar, dialogo } = useDescarga()
  const c = estado.criterios

  const guardados = JSON.stringify(textos(c))
  const [base, setBase] = useState(guardados)
  const [borrador, setBorrador] = useState(() => textos(c))
  const [mensajeCriterios, setMensajeCriterios] = useState('')
  const sucio = JSON.stringify(borrador) !== base
  const conflicto = guardados !== base
  useEffect(() => { if (!sucio) { setBase(guardados); setBorrador(JSON.parse(guardados)) } }, [guardados, sucio])
  const cancelar = () => { setBorrador(textos(c)); setBase(guardados); setMensajeCriterios('') }
  const aplicar = () => {
    if (conflicto) { setMensajeCriterios('Los criterios cambiaron en otra ventana. Recarga los valores antes de aplicar.'); return }
    const invalido = CAMPOS.find(f => !borrador[f.clave].trim() || !Number.isInteger(Number(borrador[f.clave])) || Number(borrador[f.clave]) < f.min || Number(borrador[f.clave]) > f.max)
    if (invalido) { setMensajeCriterios(`Revisa «${invalido.titulo}»: usa un entero entre ${invalido.min} y ${invalido.max}.`); return }
    const nuevos = { ...c }
    for (const f of CAMPOS) nuevos[f.clave] = Number(borrador[f.clave])
    actualizarCriterios(nuevos); setBorrador(textos(nuevos)); setBase(JSON.stringify(textos(nuevos))); setMensajeCriterios('Criterios aplicados. Tu historial se conserva.')
  }
  const descargar = () =>
    entregar(`progreso-step1-${new Date().toISOString().slice(0, 10)}.json`, exportar(), 'application/json')

  return (
    <div className="pila" style={{ maxWidth: 760 }}>
      {dialogo}
      <ScreenHeading eyebrow="Tu espacio personal" title="Ajustes" description="Respaldo, preferencias y material de consulta." />

      <details className="tarjeta"><summary>Criterios de dominio (avanzado)</summary>
        <form className="pila" style={{ marginTop: 16 }} noValidate onSubmit={e => { e.preventDefault(); aplicar() }}>
          <p className="mini">Edita los valores y aplícalos juntos. Hasta entonces se conservan tus criterios actuales.</p>
          <div className="rejilla r2">{CAMPOS.map(f => <div key={f.clave}><label htmlFor={`criterio-${f.clave}`}>{f.titulo}</label>
            <input id={`criterio-${f.clave}`} type="number" min={f.min} max={f.max} step={1} value={borrador[f.clave]}
              onChange={e => { setBorrador(b => ({ ...b, [f.clave]: e.target.value })); setMensajeCriterios('') }} /></div>)}</div>
          <p className="sutil">Cambiar los criterios recalcula el dominio vigente. Tus intentos y los hitos de dominio anteriores se conservan.</p>
          {conflicto && <p role="alert">Los criterios cambiaron en otra ventana. Pulsa «Recargar valores» para revisar la configuración actual.</p>}
          <div className="fila"><button className="btn principal" type="submit" disabled={!sucio || conflicto}>Aplicar criterios</button>
            <button className="btn" type="button" onClick={cancelar}>{conflicto ? 'Recargar valores' : 'Cancelar cambios'}</button>
            <button className="btn fantasma" type="button" onClick={() => { setBorrador(textos(CRITERIOS_POR_DEFECTO)); setMensajeCriterios('Recomendados preparados. Pulsa Aplicar criterios para guardarlos.') }}>Restaurar valores recomendados</button></div>
          {mensajeCriterios && <p role="status">{mensajeCriterios}</p>}
        </form>
      </details>

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

      <details className="tarjeta"><summary>Glosario del material</summary>
        <p className="sutil">Siglas expandidas la primera vez que aparecen, extraídas del propio corpus.</p>
        <div className="scroll-x" style={{ maxHeight: 320 }}>
          <table className="tabla">
            <thead><tr><th>Sigla</th><th>Término</th><th>Disciplina</th></tr></thead>
            <tbody>{(indice?.glosario ?? []).map(g => (
              <tr key={g.sigla}><td><b>{g.sigla}</b></td><td className="sutil">{g.termino}</td><td className="mini">{g.disciplina}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
      <p className="mini">Step 1 · Melman · Versión {APP_VERSION}</p>
    </div>
  )
}
