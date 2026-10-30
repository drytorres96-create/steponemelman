import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/estado'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import { useDescarga } from '../components/descarga'
import { APP_VERSION } from '../release'
import { ScreenHeading } from '../components/Editorial'
import { useNbme } from '../nbme/NbmeProvider'
import { useAuth } from '../auth/AuthProvider'
import { cargarHistorialSesiones } from '../semana/api'
import { cargarPlanSemana } from '../plan/api'
import { nombreRespaldo } from '../lib/respaldo'
import { PreguntasFrecuentes } from './PreguntasFrecuentes'
import { Cobertura } from './Cobertura'
import { cargarTodo } from '../data/corpus'
import type { Concepto, Indice } from '../schema/concept'

const CAMPOS = [
  { clave: 'recuperaciones', titulo: 'Respuestas independientes correctas mínimas', en: 'Minimum independent correct answers', min: 1, max: 10 },
  { clave: 'sesiones', titulo: 'Sesiones distintas mínimas', en: 'Minimum separate sessions', min: 1, max: 6 },
  { clave: 'separacionHoras', titulo: 'Separación temporal mínima (horas)', en: 'Minimum spacing (hours)', min: 0, max: 168 },
  { clave: 'ventanaConfusionDias', titulo: 'Ventana sin confusiones (días)', en: 'Confusion-free window (days)', min: 0, max: 90 },
] as const
/** Lo que no viaja con el progreso sincronizado: si tarda o falla, el respaldo sale sin ello. */
export const LIMITE_EXTRAS_MS = 4_000
function conLimite<T>(promesa: Promise<T>): Promise<T | null> {
  return Promise.race([promesa.catch(() => null), new Promise<null>(listo => setTimeout(() => listo(null), LIMITE_EXTRAS_MS))])
}
const textos = (c: typeof CRITERIOS_POR_DEFECTO) => Object.fromEntries(CAMPOS.map(f => [f.clave, String(c[f.clave])])) as Record<typeof CAMPOS[number]['clave'], string>

function IndiceMaterial({ indice }: { indice: Indice | null }) {
  const [conceptos, setConceptos] = useState<Concepto[] | null>(null)
  const [fallo, setFallo] = useState(false)
  const [reintento, setReintento] = useState(0)
  useEffect(() => {
    if (!indice) return
    let vivo = true
    setConceptos(null); setFallo(false)
    cargarTodo(indice.modulos).then(c => { if (vivo) setConceptos(c) }).catch(() => { if (vivo) setFallo(true) })
    return () => { vivo = false }
  }, [indice, reintento])
  if (!indice) return <p role="status">Cargando el índice del material…</p>
  if (fallo) return <div className="pila"><p role="status">No se pudo cargar el índice del material.</p><button className="btn" onClick={() => setReintento(n => n + 1)}>Volver a cargar el índice</button></div>
  if (!conceptos) return <p role="status">Cargando el contenido disponible…</p>
  const publicados = new Set(conceptos.map(c => c.concept_id))
  return <div className="pila ajustes-indice">
    <div className="scroll-x" tabIndex={0} role="region" aria-label="Módulos publicados"><table className="tabla"><caption>Módulos publicados</caption>
      <thead><tr><th scope="col">Módulo</th><th scope="col">Conceptos</th></tr></thead>
      <tbody>{indice.modulos.map(m => <tr key={m.module_id}><th scope="row">{m.nombre}</th>
        <td>{new Set(m.sesiones.flatMap(s => s.conceptos).filter(id => publicados.has(id))).size.toLocaleString('es')}</td></tr>)}</tbody>
    </table></div>
    <Cobertura conceptos={conceptos} indice={indice} />
  </div>
}

export function Ajustes({ english = false, extraBackup, restoreExtra }: { english?: boolean; extraBackup?: Record<string, unknown>; restoreExtra?: (backup: Record<string, unknown>) => string } = {}) {
  const tx = (es: string, en: string) => english ? en : es
  const { estado, actualizarCriterios, exportar, importar, reiniciar, indice } = useApp()
  const nbme = useNbme()
  const { session } = useAuth()
  const [preparando, setPreparando] = useState(false)
  const [msg, setMsg] = useState('')
  const [importando, setImportando] = useState(false)
  const [indiceSolicitado, setIndiceSolicitado] = useState(false)
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
    if (conflicto) { setMensajeCriterios(tx('Los criterios cambiaron en otra ventana. Recarga los valores antes de aplicar.', 'Criteria changed in another window. Reload the values before applying.')); return }
    const invalido = CAMPOS.find(f => !borrador[f.clave].trim() || !Number.isInteger(Number(borrador[f.clave])) || Number(borrador[f.clave]) < f.min || Number(borrador[f.clave]) > f.max)
    if (invalido) { setMensajeCriterios(tx(`Revisa «${invalido.titulo}»: usa un entero entre ${invalido.min} y ${invalido.max}.`, `Check “${invalido.en}”: enter a whole number from ${invalido.min} to ${invalido.max}.`)); return }
    const nuevos = { ...c }
    for (const f of CAMPOS) nuevos[f.clave] = Number(borrador[f.clave])
    actualizarCriterios(nuevos); setBorrador(textos(nuevos)); setBase(JSON.stringify(textos(nuevos))); setMensajeCriterios(tx('Criterios aplicados. Tu historial se conserva.', 'Criteria applied. Your history is preserved.'))
  }
  // Un solo archivo con todo: conceptos arriba, en el formato que lee «Importar progreso», y
  // las preguntas NBME en `nbme`, que viven en tu cuenta y no se importan desde aquí.
  // Además van las sesiones de la semana y el plan de esta semana, que viven fuera del progreso.
  const descargar = async () => {
    setPreparando(true); setMsg('')
    try {
      const [semanas, plan] = await Promise.all([conLimite(cargarHistorialSesiones()),
        conLimite(cargarPlanSemana(session?.access_token ?? ''))])
      entregar(nombreRespaldo(), exportar({ ...extraBackup, nbme: nbme.state, semanas, plan }), 'application/json')
    } catch {
      setMsg(tx('No se pudo preparar la copia. Tu progreso se conserva; vuelve a intentarlo.', 'Could not prepare the backup. Your progress is preserved; please retry.'))
    } finally { setPreparando(false) }
  }

  return (
    <div className="pila" style={{ maxWidth: 760 }}>
      {dialogo}
      {!english && <ScreenHeading landscape="stone" eyebrow="Tu espacio personal" title="Ajustes" description="Preferencias, respaldo y preguntas frecuentes." />}

      <details className="tarjeta ajustes-seccion"><summary>{tx('Criterios de dominio (avanzado)','Mastery criteria (advanced)')}</summary>
        <form className="pila" style={{ marginTop: 16 }} noValidate onSubmit={e => { e.preventDefault(); aplicar() }}>
          <div className="rejilla r2">{CAMPOS.map(f => <div key={f.clave}><label htmlFor={`criterio-${f.clave}`}>{tx(f.titulo, f.en)}</label>
            <input id={`criterio-${f.clave}`} type="number" min={f.min} max={f.max} step={1} value={borrador[f.clave]}
              onChange={e => { setBorrador(b => ({ ...b, [f.clave]: e.target.value })); setMensajeCriterios('') }} /></div>)}</div>
          {conflicto && <p role="alert">{tx('Los criterios cambiaron en otra ventana. Pulsa «Recargar valores» para revisar la configuración actual.', 'Criteria changed in another window. Choose Reload values to review the current settings.')}</p>}
          <div className="fila"><button className="btn principal" type="submit" disabled={!sucio || conflicto}>{tx('Aplicar criterios','Apply criteria')}</button>
            <button className="btn" type="button" onClick={cancelar}>{conflicto ? tx('Recargar valores','Reload values') : tx('Cancelar cambios','Cancel changes')}</button>
            <button className="btn fantasma" type="button" onClick={() => { setBorrador(textos(CRITERIOS_POR_DEFECTO)); setMensajeCriterios(tx('Recomendados preparados. Pulsa Aplicar criterios para guardarlos.', 'Recommended values are ready. Choose Apply criteria to save them.')) }}>{tx('Restaurar valores recomendados','Restore recommended values')}</button></div>
          {mensajeCriterios && <p role="status">{mensajeCriterios}</p>}
        </form>
      </details>

      <div className="tarjeta pila">
        <h2>{tx('Respaldo del progreso','Progress backup')}</h2>
        <div className="fila">
          <button className="btn" disabled={preparando} onClick={() => void descargar()}>{preparando ? tx('Preparando la copia…','Preparing backup…') : tx('Exportar progreso','Export progress')}</button>
          <button className="btn fantasma" disabled={importando} onClick={() => archivo.current?.click()}>{importando ? tx('Importando…', 'Importing…') : tx('Importar progreso','Import progress')}</button>
          <input ref={archivo} type="file" accept="application/json" style={{ display: 'none' }}
            onChange={async e => {
              const input = e.currentTarget, f = input.files?.[0]; if (!f) return
              setImportando(true); setMsg('')
              try {
                const text = await f.text(), r = importar(text)
                try { setMsg(`${r.mensaje} ${r.ok && restoreExtra ? restoreExtra(JSON.parse(text)) : ''}`) }
                catch { setMsg(`${r.mensaje} ${tx('No se pudieron importar las anotaciones.', 'Annotations could not be restored.')}`) }
              } catch {
                setMsg(tx('No se pudo leer o importar el archivo. Vuelve a seleccionarlo para reintentar.', 'Could not read or import the file. Select it again to retry.'))
              } finally { input.value = ''; setImportando(false) }
            }} />
        </div>
        {msg && <div className="aviso" role="status"><span aria-hidden="true">ℹ</span><div>{msg}</div></div>}
        <hr className="sep" />
        <button className="btn fantasma" style={{ alignSelf: 'flex-start', borderColor: '#f2606a44', color: 'var(--rojo)' }}
          onClick={async () => {
            if (!confirm(tx('Se reiniciarán el progreso de conceptos, los bloques guardados (incluidos NBME y Mixed), las sesiones y los criterios en todos tus dispositivos. Las respuestas NBME se conservan por separado. ¿Continuar?', 'This resets concept progress, all saved blocks (including NBME and Mixed), study sessions and mastery criteria on all your devices. NBME answer history is stored separately and is preserved. Continue?'))) return
            try { await reiniciar(); setMsg(tx('Progreso reiniciado en tu cuenta.', 'Study progress and saved blocks reset in your account.')) }
            catch (e) { setMsg(e instanceof Error ? e.message : tx('No se pudo reiniciar. Tu progreso se conserva.', 'Could not reset. Your progress is preserved.')) }
          }}>
          {tx('Reiniciar progreso y bloques','Reset study progress and blocks')}
        </button>
      </div>

      <details className="tarjeta ajustes-seccion" onToggle={e => { if (e.currentTarget.open) setIndiceSolicitado(true) }}><summary>{tx('Índice del material','Material index')}</summary>
        {indiceSolicitado && <IndiceMaterial indice={indice} />}
      </details>

      <details className="tarjeta ajustes-seccion"><summary>{tx('Glosario del material','Glossary')}</summary>
        <div className="scroll-x" tabIndex={0} role="region" aria-label="Glosario del material" style={{ maxHeight: 320 }}>
          <table className="tabla">
            <thead><tr><th>Sigla</th><th>Término</th><th>Disciplina</th></tr></thead>
            <tbody>{(indice?.glosario ?? []).map(g => (
              <tr key={g.sigla}><td><b>{g.sigla}</b></td><td className="sutil">{g.termino}</td><td className="mini">{g.disciplina}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
      <div lang="es"><PreguntasFrecuentes criterios={c} /></div>
      <p className="mini">{english ? 'My Q Bank · Version' : 'Step 1 · Melman · Versión'} {APP_VERSION}</p>
    </div>
  )
}
