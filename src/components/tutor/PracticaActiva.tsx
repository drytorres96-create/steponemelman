import { useEffect, useMemo, useRef, useState } from 'react'
import { barajar, corregir, MARCA_HUECO, respuestaEsperada, type Ejercicio, type Respuesta, type TipoEjercicio } from '../../lib/practica-activa'
import { IconoCerebro } from './IconoCerebro'
import { BotonCoral, BotonSalvia, Chevron, Cruz, Flecha, Marca } from './controles'

/**
 * La tarjeta de recuperación activa que vive dentro de la conversación. Claude escribe los
 * ejercicios; aquí se hacen y se corrigen sin red, con la clave que viaja con cada uno.
 *
 * Consolida, no mide: nada de esto es un intento ni toca dominio, cajas o repetición espaciada.
 */

const CAPSULA: Record<TipoEjercicio, string> = {
  verdadero_falso: 'Verdadero o falso', opcion_unica: 'Una respuesta', seleccion_multiple: 'Selección múltiple',
  completar: 'Palabra clave', ordenar: 'Ordenar pasos', emparejar: 'Emparejar',
}
const TITULO: Record<TipoEjercicio, string> = {
  verdadero_falso: '¿Verdadero o falso?', opcion_unica: 'Elige la respuesta correcta', seleccion_multiple: 'Selecciona todas las correctas',
  completar: 'Completa el concepto clave', ordenar: 'Ordena los pasos', emparejar: 'Empareja cada elemento',
}
const LETRAS = 'ABCDEFG'

/** Lo que se ve entre pulsar «Comprobar» y el resultado: breve, pero perceptible. */
export const PAUSA_REVISION_MS = 420

type Valor = boolean | string | string[] | Record<string, string> | null
export type ResultadoRonda = { estado: 'ok' | 'mal' | 'sin'; ayuda: boolean; aviso?: string }

const reducirMovimiento = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

function valorInicial(e: Ejercicio): Valor {
  switch (e.tipo) {
    case 'verdadero_falso': return null
    case 'opcion_unica': return null
    case 'seleccion_multiple': return []
    case 'completar': return ''
    case 'ordenar': return []
    case 'emparejar': return {}
  }
}

function listo(e: Ejercicio, v: Valor): boolean {
  switch (e.tipo) {
    case 'verdadero_falso': return typeof v === 'boolean'
    case 'opcion_unica': return typeof v === 'string' && v.length > 0
    case 'seleccion_multiple': return Array.isArray(v) && v.length > 0
    case 'completar': return typeof v === 'string' && v.trim().length > 0
    case 'ordenar': return Array.isArray(v) && v.length === e.pasos.length
    case 'emparejar': return !!v && typeof v === 'object' && !Array.isArray(v) && e.pares.every(p => !!(v as Record<string, string>)[p.izquierda])
  }
}

function respuestaDe(e: Ejercicio, v: Valor): Respuesta {
  switch (e.tipo) {
    case 'verdadero_falso': return { tipo: e.tipo, valor: v === true }
    case 'opcion_unica': return { tipo: e.tipo, valor: String(v ?? '') }
    case 'seleccion_multiple': return { tipo: e.tipo, valor: Array.isArray(v) ? v : [] }
    case 'completar': return { tipo: e.tipo, valor: String(v ?? '') }
    case 'ordenar': return { tipo: e.tipo, valor: Array.isArray(v) ? v : [] }
    case 'emparejar': return { tipo: e.tipo, valor: v && typeof v === 'object' && !Array.isArray(v) ? v : {} }
  }
}

/** La pista de Claude si la escribió; si no, una derivada del propio ejercicio que orienta sin resolver. */
export function pistaDe(e: Ejercicio): string {
  if (e.pista) return e.pista
  switch (e.tipo) {
    case 'verdadero_falso': return 'Sigue la cadena causa → efecto: ¿qué paso cambiaría si la afirmación fuera cierta?'
    case 'opcion_unica': return `«${e.opciones.find(o => o !== e.correcta) ?? ''}» no es la respuesta.`
    case 'seleccion_multiple': return `Hay ${e.correctas.length} respuestas correctas.`
    case 'completar': {
      const palabras = e.respuesta.trim().split(/\s+/)
      return palabras.length > 1 ? `Son ${palabras.length} palabras y empieza por «${e.respuesta[0]}».`
        : `Empieza por «${e.respuesta[0]}» y tiene ${e.respuesta.length} letras.`
    }
    case 'ordenar': return `El primer paso es: «${e.pasos[0]}».`
    case 'emparejar': return `«${e.pares[0].izquierda}» va con «${e.pares[0].derecha}».`
  }
}

type Vista = { opciones: string[]; derechas: string[]; pasos: string[] }
function prepararVista(e: Ejercicio, semilla: string): Vista {
  const vacia: Vista = { opciones: [], derechas: [], pasos: [] }
  switch (e.tipo) {
    case 'opcion_unica':
    case 'seleccion_multiple': return { ...vacia, opciones: barajar(e.opciones, semilla) }
    case 'emparejar': return { ...vacia, derechas: barajar(e.pares.map(p => p.derecha), semilla) }
    case 'ordenar': {
      let pasos = barajar(e.pasos, semilla)
      // Un orden «barajado» que ya es el correcto no practica nada.
      if (pasos.every((p, i) => p === e.pasos[i])) pasos = [...pasos.slice(1), pasos[0]]
      return { ...vacia, pasos }
    }
    default: return vacia
  }
}

export function resumenDe(ejercicios: Ejercicio[], resultados: Record<number, ResultadoRonda>) {
  const hechos = Object.keys(resultados).map(Number)
  const aciertos = hechos.filter(i => resultados[i].estado === 'ok').length
  const sinAyuda = hechos.filter(i => resultados[i].estado === 'ok' && !resultados[i].ayuda).length
  const falladas = ejercicios.map((_, i) => i).filter(i => resultados[i] && resultados[i].estado !== 'ok')
  return { aciertos, sinAyuda, total: ejercicios.length, falladas }
}

type Props = {
  ejercicios: Ejercicio[]
  semilla: string
  ronda: number
  /** Solo la última ronda ofrece seguir practicando. */
  ultima: boolean
  ocupado: boolean
  onOtraRonda: () => void
}

export function PracticaActiva({ ejercicios, semilla, ronda, ultima, ocupado, onOtraRonda }: Props) {
  const [orden, setOrden] = useState(() => ejercicios.map((_, i) => i))
  const [pos, setPos] = useState(0)
  const [resultados, setResultados] = useState<Record<number, ResultadoRonda>>({})
  const [valor, setValor] = useState<Valor>(() => valorInicial(ejercicios[0]))
  const [fase, setFase] = useState<'responder' | 'revisando' | 'resuelto'>('responder')
  const [pistaVista, setPistaVista] = useState(false)
  const [formatos, setFormatos] = useState(false)
  const [fin, setFin] = useState(false)
  const [vuelta, setVuelta] = useState(0)
  const temporizador = useRef<ReturnType<typeof setTimeout>>()
  const siguienteRef = useRef<HTMLButtonElement>(null)

  useEffect(() => () => clearTimeout(temporizador.current), [])

  const idx = orden[pos]
  const e = ejercicios[idx]
  const vista = useMemo(() => prepararVista(e, `${semilla}:${ronda}:${vuelta}:${idx}`), [e, semilla, ronda, vuelta, idx])
  const resultado = resultados[idx]

  useEffect(() => { if (fase === 'resuelto') siguienteRef.current?.focus({ preventScroll: true }) }, [fase])

  const irA = (nuevaPos: number, nuevoOrden = orden) => {
    setOrden(nuevoOrden); setPos(nuevaPos)
    setValor(valorInicial(ejercicios[nuevoOrden[nuevaPos]]))
    setFase('responder'); setPistaVista(false); setFormatos(false)
  }
  const resolver = (r: ResultadoRonda) => { setResultados(prev => ({ ...prev, [idx]: r })); setFase('resuelto') }
  const comprobar = () => {
    if (fase !== 'responder' || !listo(e, valor)) return
    setFase('revisando')
    temporizador.current = setTimeout(() => {
      const c = corregir(e, respuestaDe(e, valor))
      resolver({ estado: c.correcta ? 'ok' : 'mal', ayuda: pistaVista, ...(c.aviso ? { aviso: c.aviso } : {}) })
    }, reducirMovimiento() ? 140 : PAUSA_REVISION_MS)
  }
  const sinRecordar = () => { if (fase === 'responder') resolver({ estado: 'sin', ayuda: pistaVista }) }
  const siguiente = () => { if (pos + 1 < orden.length) irA(pos + 1); else setFin(true) }

  // Cambiar de formato intercambia el ejercicio actual con el siguiente pendiente de ese tipo.
  const otrosFormatos = useMemo(() => {
    const tipos: TipoEjercicio[] = []
    for (const i of orden.slice(pos + 1)) if (ejercicios[i].tipo !== e.tipo && !tipos.includes(ejercicios[i].tipo)) tipos.push(ejercicios[i].tipo)
    return tipos
  }, [orden, pos, ejercicios, e.tipo])
  const cambiarFormato = (tipo: TipoEjercicio) => {
    const k = orden.findIndex((i, n) => n > pos && ejercicios[i].tipo === tipo)
    if (k < 0) return
    const nuevo = [...orden];
    [nuevo[pos], nuevo[k]] = [nuevo[k], nuevo[pos]]
    irA(pos, nuevo)
  }

  const repasarFalladas = () => {
    const { falladas } = resumenDe(ejercicios, resultados)
    if (!falladas.length) return
    setResultados(prev => { const copia = { ...prev }; for (const i of falladas) delete copia[i]; return copia })
    setVuelta(v => v + 1); setFin(false)
    irA(0, falladas)
  }

  if (fin) return <Resumen ejercicios={ejercicios} resultados={resultados} ronda={ronda} ultima={ultima} ocupado={ocupado}
    onRepasar={repasarFalladas} onOtra={onOtraRonda} />

  const ultimo = pos + 1 >= orden.length
  const bloqueado = fase !== 'responder'
  return <div className="tutor-practica" data-fase={fase} role="group" aria-label={`Recuperación activa, ejercicio ${pos + 1} de ${orden.length}`}>
    <div className="tutor-practica-cab">
      <span className="tutor-practica-icono"><IconoCerebro tamano={17} /></span>
      <strong>Recuperación activa</strong>
      <span className="tutor-pildora tutor-pildora--cuenta">{pos + 1} de {orden.length}</span>
    </div>
    <div className="tutor-progreso" role="progressbar" aria-label="Progreso de la ronda" aria-valuemin={0} aria-valuemax={orden.length}
      aria-valuenow={orden.filter(i => resultados[i]).length}>
      {orden.map((i, n) => <i key={n} className={resultados[i] ? `hecho hecho--${resultados[i].estado}` : n === pos ? 'actual' : ''} />)}
    </div>
    <div className="tutor-formato">
      <span className="tutor-capsula-formato">{CAPSULA[e.tipo]}</span>
      <button type="button" className="tutor-enlace" aria-expanded={formatos} disabled={bloqueado || otrosFormatos.length === 0}
        onClick={() => setFormatos(v => !v)}>Cambiar formato <Chevron /></button>
    </div>
    {formatos && !bloqueado && <div className="tutor-formatos" role="group" aria-label="Otros formatos de ejercicio">
      {otrosFormatos.map(t => <button type="button" key={t} className="tutor-capsula-boton" onClick={() => cambiarFormato(t)}>{CAPSULA[t]}</button>)}
    </div>}

    <div className="tutor-ejercicio" key={`${vuelta}:${idx}`}>
      <h4 className="tutor-ejercicio-titulo">{TITULO[e.tipo]}</h4>
      <Entrada e={e} vista={vista} valor={valor} onValor={setValor} bloqueado={bloqueado} resuelto={fase === 'resuelto'}
        onEnviar={comprobar} />
      {pistaVista && <p className="tutor-pista" role="status"><span aria-hidden="true">💡</span> {pistaDe(e)}</p>}
    </div>

    {fase !== 'resuelto'
      ? <div className="tutor-acciones">
        <BotonSalvia className="tutor-btn--chico" disabled={bloqueado || pistaVista} onClick={() => setPistaVista(true)}>Una pista</BotonSalvia>
        <BotonSalvia className="tutor-btn--chico" disabled={bloqueado} onClick={sinRecordar}>No lo recuerdo</BotonSalvia>
        <BotonCoral className="tutor-comprobar" disabled={!listo(e, valor) || bloqueado} aria-busy={fase === 'revisando'} onClick={comprobar}>
          {fase === 'revisando' ? <>Revisando<span className="tutor-puntos" aria-hidden="true"><i /><i /><i /></span></> : <><Marca />Comprobar</>}
        </BotonCoral>
      </div>
      : resultado && <div className="tutor-resultado" role="status" data-estado={resultado.estado}>
        <p className="tutor-veredicto">{resultado.estado === 'ok' ? <><Marca /> Correcto</> : resultado.estado === 'mal' ? <><Cruz /> Todavía no</> : <>Aquí tienes la respuesta</>}</p>
        {resultado.aviso && <p className="tutor-aviso">{resultado.aviso}</p>}
        {resultado.estado !== 'ok' && <p className="tutor-esperada"><span>Respuesta</span> {respuestaEsperada(e)}</p>}
        <p className="tutor-explicacion">{e.explicacion}</p>
        <div className="tutor-acciones tutor-acciones--fin">
          {!ultimo && <button type="button" className="tutor-enlace" onClick={() => setFin(true)}>Terminar ronda</button>}
          <BotonCoral ref={siguienteRef} onClick={siguiente}>{ultimo ? 'Ver resumen' : 'Siguiente ejercicio'}<Flecha /></BotonCoral>
        </div>
      </div>}
  </div>
}

function Resumen({ ejercicios, resultados, ronda, ultima, ocupado, onRepasar, onOtra }: {
  ejercicios: Ejercicio[]; resultados: Record<number, ResultadoRonda>; ronda: number; ultima: boolean; ocupado: boolean
  onRepasar: () => void; onOtra: () => void
}) {
  const r = resumenDe(ejercicios, resultados)
  const hechos = Object.keys(resultados).length
  return <div className="tutor-practica tutor-practica--resumen" role="group" aria-label={`Resumen de la ronda ${ronda}`}>
    <div className="tutor-practica-cab">
      <span className="tutor-practica-icono"><IconoCerebro tamano={17} /></span>
      <strong>Ronda {ronda}</strong>
      <span className="tutor-pildora tutor-pildora--cuenta">{r.aciertos} de {hechos || r.total}</span>
    </div>
    <p className="tutor-resumen-texto">{hechos === 0 ? 'Cerraste la ronda sin responder.'
      : `${r.aciertos} correcta${r.aciertos === 1 ? '' : 's'}${r.aciertos ? ` · ${r.sinAyuda} sin pista` : ''}.`}</p>
    <ul className="tutor-resumen-capsulas">{ejercicios.map((e, i) => resultados[i] && <li key={i} data-estado={resultados[i].estado}>
      {resultados[i].estado === 'ok' ? <Marca tamano={13} /> : <Cruz tamano={13} />}{CAPSULA[e.tipo]}</li>)}</ul>
    {r.falladas.length > 0 && <details className="tutor-repaso">
      <summary>Ver lo que falló</summary>
      <ul>{r.falladas.map(i => <li key={i}><p>{ejercicios[i].enunciado}</p><p className="tutor-esperada"><span>Respuesta</span> {respuestaEsperada(ejercicios[i])}</p></li>)}</ul>
    </details>}
    {ultima && <div className="tutor-acciones tutor-acciones--fin">
      {r.falladas.length > 0 && <BotonSalvia onClick={onRepasar}>Repasar las falladas</BotonSalvia>}
      <BotonCoral disabled={ocupado} onClick={onOtra}>Otra ronda con ideas nuevas<Flecha /></BotonCoral>
    </div>}
  </div>
}

type PropsEntrada = { e: Ejercicio; vista: Vista; valor: Valor; onValor: (v: Valor) => void; bloqueado: boolean; resuelto: boolean; onEnviar: () => void }

function Entrada({ e, vista, valor, onValor, bloqueado, resuelto, onEnviar }: PropsEntrada) {
  switch (e.tipo) {
    case 'verdadero_falso': return <>
      <p className="tutor-enunciado">{e.enunciado}</p>
      <div className="tutor-vf" role="radiogroup" aria-label="Tu respuesta">
        {[true, false].map(v => <button type="button" role="radio" key={String(v)} aria-checked={valor === v} disabled={bloqueado}
          className="tutor-opcion tutor-opcion--corta" data-marcada={valor === v}
          data-estado={resuelto ? (e.verdadero === v ? 'correcta' : valor === v ? 'incorrecta' : 'neutra') : 'neutra'}
          onClick={() => onValor(v)}>{v ? 'Verdadero' : 'Falso'}</button>)}
      </div></>
    case 'opcion_unica': return <>
      <p className="tutor-enunciado">{e.enunciado}</p>
      <div className="tutor-opciones" role="radiogroup" aria-label="Opciones">
        {vista.opciones.map((o, i) => <button type="button" role="radio" key={o} aria-checked={valor === o} disabled={bloqueado}
          className="tutor-opcion" data-marcada={valor === o}
          data-estado={resuelto ? (o === e.correcta ? 'correcta' : valor === o ? 'incorrecta' : 'neutra') : 'neutra'} onClick={() => onValor(o)}>
          <b aria-hidden="true">{LETRAS[i]}</b><span>{o}</span></button>)}
      </div></>
    case 'seleccion_multiple': {
      const marcadas = Array.isArray(valor) ? valor : []
      return <>
        <p className="tutor-enunciado">{e.enunciado}</p>
        <div className="tutor-opciones" role="group" aria-label="Opciones: marca todas las correctas">
          {vista.opciones.map(o => {
            const on = marcadas.includes(o), buena = e.correctas.includes(o)
            return <button type="button" role="checkbox" key={o} aria-checked={on} disabled={bloqueado} className="tutor-opcion tutor-opcion--caja"
              data-marcada={on} data-estado={resuelto ? (buena ? 'correcta' : on ? 'incorrecta' : 'neutra') : 'neutra'}
              onClick={() => onValor(on ? marcadas.filter(x => x !== o) : [...marcadas, o])}>
              <b aria-hidden="true">{on ? <Marca tamano={12} /> : ''}</b><span>{o}</span></button>
          })}
        </div></>
    }
    case 'completar': {
      const [antes, despues = ''] = e.enunciado.split(MARCA_HUECO)
      return <>
        <p className="tutor-enunciado tutor-frase">{antes}<span className="tutor-hueco" data-resuelto={resuelto}>{resuelto ? e.respuesta : ' '}</span>{despues}</p>
        <input className="tutor-campo" type="text" value={typeof valor === 'string' ? valor : ''} maxLength={80} disabled={bloqueado}
          placeholder="Escribe tu respuesta…" aria-label="Palabra que completa la frase" autoComplete="off" autoCapitalize="off" spellCheck={false}
          onChange={ev => onValor(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); onEnviar() } }} />
      </>
    }
    case 'ordenar': {
      const elegidos = Array.isArray(valor) ? valor : []
      const pendientes = vista.pasos.filter(p => !elegidos.includes(p))
      return <>
        <p className="tutor-enunciado">{e.enunciado}</p>
        <ol className="tutor-orden" aria-label="Tu orden">
          {elegidos.map((p, i) => <li key={p}><button type="button" disabled={bloqueado} className="tutor-opcion"
            data-estado={resuelto ? (p === e.pasos[i] ? 'correcta' : 'incorrecta') : 'neutra'} data-marcada
            aria-label={`Paso ${i + 1}: ${p}. ${bloqueado ? '' : 'Pulsa para quitarlo.'}`}
            onClick={() => onValor(elegidos.filter(x => x !== p))}><b aria-hidden="true">{i + 1}</b><span>{p}</span></button></li>)}
        </ol>
        {pendientes.length > 0 && <div className="tutor-pendientes" role="group" aria-label="Pasos por colocar, pulsa en el orden correcto">
          {pendientes.map(p => <button type="button" key={p} disabled={bloqueado} className="tutor-capsula-boton"
            onClick={() => onValor([...elegidos, p])}>{p}</button>)}
        </div>}
        {resuelto && <p className="tutor-esperada"><span>Orden correcto</span> {e.pasos.map((p, i) => `${i + 1}. ${p}`).join('  →  ')}</p>}
      </>
    }
    case 'emparejar': {
      const elegido = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
      return <>
        <p className="tutor-enunciado">{e.enunciado}</p>
        <ul className="tutor-pares">
          {e.pares.map(p => <li key={p.izquierda} data-estado={resuelto ? (elegido[p.izquierda] === p.derecha ? 'correcta' : 'incorrecta') : 'neutra'}>
            <span>{p.izquierda}</span>
            <select aria-label={`Empareja: ${p.izquierda}`} value={elegido[p.izquierda] ?? ''} disabled={bloqueado}
              onChange={ev => onValor({ ...elegido, [p.izquierda]: ev.target.value })}>
              <option value="">Elige…</option>
              {vista.derechas.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {resuelto && elegido[p.izquierda] !== p.derecha && <small className="tutor-esperada"><span>Era</span> {p.derecha}</small>}
          </li>)}
        </ul></>
    }
  }
}
