import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/estado'
import type { Concepto } from '../schema/concept'
import type { OpcionesSesionPersonalizada } from '../lib/busqueda'
import { analizarSemana, cuotaIA, MINIMO_CONCEPTOS, type Patron } from '../lib/analisis-ia'
import { fallosDeSemana } from '../lib/semana-fallos'
import { NOMBRE_ERROR } from '../srs/tipos'
import { lunesDe } from '../lib/tiempo'

/**
 * Lectura de la semana: la IA gratuita agrupa lo que se falló y dice por dónde empezar.
 *
 * Es lo único de la pantalla que no se calcula en local, así que está detrás de un botón y
 * nunca se pide sola: las cifras de progreso deben estar completas antes de que la IA diga
 * nada, y si la ayuda no está disponible aquí no falta nada que no estuviera ya.
 *
 * No cambia el dominio, ni las calificaciones, ni el orden de la repetición espaciada. Solo
 * ordena lo ya ocurrido y ofrece un atajo para repasar el grupo que propone.
 */
export function LecturaSemana({ conceptos, onEstudiar }: {
  conceptos: Concepto[]
  onEstudiar: (ids: string[], opciones?: OpcionesSesionPersonalizada) => void
}) {
  const { estado } = useApp()
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [lectura, setLectura] = useState<{ patrones: Patron[]; enfoque: string } | null>(null)
  const [restantes, setRestantes] = useState<number | null>(null)
  const aborto = useRef<AbortController | null>(null)
  useEffect(() => () => aborto.current?.abort(), [])

  const publicados = new Set(conceptos.map(c => c.concept_id))
  const titulo = (id: string) => conceptos.find(c => c.concept_id === id)?.afirmacion ?? id
  const fallos = fallosDeSemana(Object.values(estado.progreso), lunesDe().getTime(), publicados)

  const leer = async () => {
    if (cargando) return
    const control = new AbortController(); aborto.current = control
    setCargando(true); setAviso('')
    const resultado = await analizarSemana(fallos, control.signal)
    if (control.signal.aborted) return
    setCargando(false)
    if (resultado.estado === 'ok') setLectura({ patrones: resultado.patrones, enfoque: resultado.enfoque })
    else setAviso(resultado.motivo)
    const cuota = await cuotaIA(control.signal)
    if (!control.signal.aborted && cuota) setRestantes(Math.round(cuota.restantes / cuota.presupuesto * 100))
  }

  if (!fallos.length) return null

  return <section className="tarjeta pila" aria-label="Lectura de la semana">
    <h2>Lo que se te está mezclando</h2>
    <p className="mini">
      {fallos.length} concepto{fallos.length === 1 ? '' : 's'} con fallos esta semana
      {fallos.length >= MINIMO_CONCEPTOS ? '. La IA los agrupa por mecanismo para que el repaso empiece por donde más rinde.'
        : `. Hacen falta ${MINIMO_CONCEPTOS} para pedir una lectura.`}
    </p>

    {!lectura && fallos.length >= MINIMO_CONCEPTOS &&
      <button className="btn pequeno" disabled={cargando} onClick={() => void leer()}>
        {cargando ? 'Leyendo tu semana…' : 'Leer mi semana con IA'}
      </button>}
    {aviso && <p className="mini" role="status">{aviso}</p>}

    {lectura && <div className="pila" style={{ gap: 12 }}>
      <p><b>Por dónde empezar:</b> {lectura.enfoque}</p>
      {lectura.patrones.map(p => <div key={p.titulo} className="pila" style={{ gap: 6 }}>
        <h3>{p.titulo}</h3>
        <p>{p.porque}</p>
        <p className="mini"><b>Qué hacer:</b> {p.accion}</p>
        <ul className="mini">{p.conceptos.map(id => <li key={id}>{titulo(id)}</li>)}</ul>
        <div><button className="btn pequeno fantasma" onClick={() => onEstudiar(p.conceptos)}>
          Repasar estos {p.conceptos.length}
        </button></div>
      </div>)}
      <p className="mini">
        Lectura generada por IA sobre tus fallos de esta semana; puede equivocarse. No cambia tu dominio ni
        reordena tus repasos{restantes !== null ? ` · queda el ${restantes} % de la cuota gratuita de hoy` : ''}.
      </p>
    </div>}

    {!lectura && <details><summary className="mini">Ver los fallos que se enviarían</summary>
      <div className="scroll-x"><table className="tabla">
        <thead><tr><th>Concepto</th><th>Fallos</th><th>Aciertos</th><th>Error más repetido</th></tr></thead>
        <tbody>{fallos.map(f => <tr key={f.id}>
          <td>{titulo(f.id)}</td><td>{f.fallos}</td><td>{f.aciertos}</td><td className="sutil">{NOMBRE_ERROR[f.error]}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="mini">Solo salen del navegador estos identificadores y estas cifras. Tus respuestas escritas no se envían.</p>
    </details>}
  </section>
}
