import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { MAX_MENSAJE, type OrigenChat, type TurnoChat } from '../../lib/contexto-chat'
import { pedirPractica, preguntarAlTutor, type FuenteChat } from '../../lib/chat-claude'
import type { Ejercicio } from '../../lib/practica-activa'
import { IconoCerebro } from './IconoCerebro'
import { PracticaActiva } from './PracticaActiva'
import { TextoClaude } from './TextoClaude'
import { Ampliar, BotonSalvia, Bombilla, Chevron, Diana, Engranes, Enviar, Flecha, Llave, manejadoresBrillo } from './controles'
import './tutor-claude.css'

/**
 * El tutor de la pregunta que acabas de responder: un chat con Claude que aparece sea cual sea
 * el resultado (acierto, parcial o fallo) y, dentro de la misma conversación, una tarjeta de
 * recuperación activa que escribe y dirige Claude.
 *
 * No consulta nada al montarse: el saludo es fijo y solo se llama a Claude cuando la persona
 * toca una sugerencia o escribe. El material médico lo lee siempre el servidor.
 */

export type EstadoRespuesta = 'correcta' | 'parcial' | 'incorrecta' | 'ortografia' | 'revision'

const PILDORA: Record<EstadoRespuesta, string> = {
  correcta: 'Correcta', parcial: 'Parcialmente correcta', incorrecta: 'Incorrecta',
  ortografia: 'Casi: ortografía', revision: 'Pendiente de revisar',
}
const SALUDO: Record<EstadoRespuesta, string> = {
  correcta: 'Ya respondiste esta pregunta. Puedo explicarte el mecanismo, señalar la idea central o practicar lo esencial contigo.',
  parcial: 'Acertaste una parte. Puedo ayudarte a ver qué faltaba, desde el mecanismo o desde el dato que manda.',
  incorrecta: 'Vamos a ver qué pedía esta pregunta y por qué. ¿Por dónde quieres empezar?',
  ortografia: 'El concepto lo tenías; falló la escritura. Puedo explicarte el mecanismo o hacerte practicar lo esencial.',
  revision: 'Esta respuesta quedó pendiente de revisar. Mientras tanto puedo explicarte el mecanismo o la idea central.',
}

type Accion = { tipo: 'mensaje'; texto: string } | { tipo: 'practica'; masRonda: boolean }
type Msg =
  | { id: number; rol: 'yo'; texto: string; api: boolean }
  | { id: number; rol: 'ia'; texto: string; api: boolean; fuente?: FuenteChat }
  | { id: number; rol: 'error'; motivo: string; accion: Accion }
  | { id: number; rol: 'practica'; ronda: number; estado: 'cargando' | 'lista'; ejercicios: Ejercicio[] }

type Chip = { id: string; etiqueta: string; mensaje?: string; icono: ReactNode }

export interface PropsTutor {
  origen: OrigenChat
  /** Cómo fue la respuesta: decide el saludo y la cápsula de estado. */
  estado: EstadoRespuesta
  /** «Pregunta 3»; sin él, la cápsula dice «Esta pregunta». */
  numero?: number
  /** Preguntas concretas del ítem (por qué no es la otra opción…), sacadas del material. */
  sugerencias?: string[]
  /** Falso cuando el ítem no es un caso clínico y no tiene sentido buscar un stem killer. */
  stemKiller?: boolean
  onVerPregunta?: () => void
  /** Solo donde no hay ya un botón de siguiente pregunta a la vista. */
  onSiguiente?: () => void
  /** Identifica la pregunta para barajar los ejercicios de forma estable. */
  semilla: string
}

/** Turnos que Claude ya contestó: parejas yo → ia de verdad (el saludo y los avisos no cuentan). */
function historialDe(mensajes: Msg[]): TurnoChat[] {
  const turnos: TurnoChat[] = []
  for (let n = 0; n < mensajes.length - 1; n++) {
    const a = mensajes[n], b = mensajes[n + 1]
    if (a.rol === 'yo' && a.api && b.rol === 'ia' && b.api) { turnos.push({ rol: 'yo', texto: a.texto }, { rol: 'ia', texto: b.texto }); n++ }
  }
  return turnos
}

const MENSAJES_FIJOS = new Set(['explícame el mecanismo paso a paso', '¿cuál es el key learning point de este ejercicio?', '¿hay un stem killer en esta pregunta?'])

export function TutorClaude({ origen, estado, numero, sugerencias = [], stemKiller = true, onVerPregunta, onSiguiente, semilla }: PropsTutor) {
  const [mensajes, setMensajes] = useState<Msg[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [amplio, setAmplio] = useState(false)
  const [texto, setTexto] = useState('')
  const [usadas, setUsadas] = useState<string[]>([])
  const contador = useRef(0)
  const vivo = useRef(true)
  const control = useRef<AbortController | null>(null)
  const hilo = useRef<HTMLDivElement>(null)
  const ultimos = useRef({ mensajes, origen })
  ultimos.current = { mensajes, origen }
  const ocupadoRef = useRef(false)

  useEffect(() => { vivo.current = true; return () => { vivo.current = false; control.current?.abort() } }, [])
  useEffect(() => {
    const el = hilo.current
    if (!el || mensajes.length === 0) return
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: reducirMovimiento() ? 'auto' : 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [mensajes, ocupado])

  const siguienteId = () => ++contador.current
  const poner = (m: Msg) => setMensajes(prev => [...prev, m])
  const quitar = (id: number) => setMensajes(prev => prev.filter(m => m.id !== id))
  const empezar = () => { ocupadoRef.current = true; setOcupado(true); control.current = new AbortController(); return control.current.signal }
  const terminar = () => { ocupadoRef.current = false; if (vivo.current) setOcupado(false) }

  const consultar = async (textoPregunta: string) => {
    const historial = historialDe(ultimos.current.mensajes)
    const signal = empezar()
    const r = await preguntarAlTutor(ultimos.current.origen, textoPregunta, historial, signal)
    terminar()
    if (!vivo.current) return
    if (r.estado === 'ok') poner({ id: siguienteId(), rol: 'ia', texto: r.texto, api: true, fuente: r.fuente })
    else poner({ id: siguienteId(), rol: 'error', motivo: r.motivo, accion: { tipo: 'mensaje', texto: textoPregunta } })
  }

  const preguntar = (t: string, quien?: string) => {
    const limpio = t.trim().slice(0, MAX_MENSAJE)
    if (!limpio || ocupadoRef.current) return
    if (quien) setUsadas(prev => [...prev, quien])
    poner({ id: siguienteId(), rol: 'yo', texto: limpio, api: true })
    void consultar(limpio)
  }

  const rondas = mensajes.filter((m): m is Extract<Msg, { rol: 'practica' }> => m.rol === 'practica')
  const generar = async (masRonda: boolean) => {
    const evitar = rondas.filter(r => r.estado === 'lista').flatMap(r => r.ejercicios.map(e => e.enunciado.slice(0, 100))).slice(-12)
    const id = siguienteId()
    poner({ id, rol: 'practica', ronda: rondas.length + 1, estado: 'cargando', ejercicios: [] })
    const signal = empezar()
    const r = await pedirPractica(ultimos.current.origen, evitar, signal)
    terminar()
    if (!vivo.current) return
    if (r.estado === 'ok') setMensajes(prev => prev.map(m => m.id === id && m.rol === 'practica' ? { ...m, estado: 'lista', ejercicios: r.ejercicios } : m))
    else {
      quitar(id)
      poner({ id: siguienteId(), rol: 'error', motivo: r.motivo, accion: { tipo: 'practica', masRonda } })
    }
  }

  const practicar = (masRonda: boolean) => {
    if (ocupadoRef.current) return
    if (!masRonda) setUsadas(prev => [...prev, 'practica'])
    poner({ id: siguienteId(), rol: 'yo', texto: masRonda ? 'Quiero otra ronda con ideas nuevas.' : 'Quiero practicar con recuperación activa.', api: false })
    poner({ id: siguienteId(), rol: 'ia', api: false, texto: masRonda
      ? 'Preparo otra ronda sin repetir lo anterior.' : 'Preparo una ronda corta con lo esencial de esta pregunta.' })
    void generar(masRonda)
  }

  const reintentar = (m: Extract<Msg, { rol: 'error' }>) => {
    if (ocupadoRef.current) return
    quitar(m.id)
    if (m.accion.tipo === 'mensaje') void consultar(m.accion.texto)
    else void generar(m.accion.masRonda)
  }

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    if (!texto.trim() || ocupado) return
    preguntar(texto)
    setTexto('')
  }

  // Las sugerencias del ítem no repiten las tres cápsulas fijas: una pregunta, una cápsula.
  const contextuales = sugerencias.filter(s => !MENSAJES_FIJOS.has(s.trim().toLowerCase())).slice(0, 2)
  const chips: Chip[] = [
    { id: 'mecanismo', etiqueta: 'Mecanismo paso a paso', mensaje: 'Explícame el mecanismo paso a paso', icono: <Engranes /> },
    { id: 'klp', etiqueta: 'Key learning point', mensaje: '¿Cuál es el key learning point de este ejercicio?', icono: <Llave /> },
    ...(stemKiller ? [{ id: 'stem', etiqueta: 'Stem killer', mensaje: '¿Hay un stem killer en esta pregunta?', icono: <Diana /> }] : []),
    ...contextuales.map((s, i) => ({ id: `ctx${i}`, etiqueta: s, mensaje: s, icono: <Bombilla /> })),
  ].filter(c => !usadas.includes(c.id))
  const hayPractica = rondas.length > 0 || usadas.includes('practica')
  const ultimaRonda = rondas[rondas.length - 1]

  return <section className={`tutor${amplio ? ' tutor--amplio' : ''}`} aria-label="Claude, tu tutor de esta pregunta" data-estado={estado}>
    <header className="tutor-cab">
      <span className="tutor-avatar" aria-hidden="true"><IconoCerebro tamano={22} /></span>
      <div className="tutor-titulo"><strong>Claude</strong><span>Tu tutor de esta pregunta</span></div>
      <button type="button" className="tutor-icono-boton" aria-expanded={amplio} aria-label={amplio ? 'Reducir el chat' : 'Ampliar el chat'}
        onClick={() => setAmplio(v => !v)}><Ampliar reducir={amplio} /></button>
    </header>

    <div className="tutor-contexto">
      <span className="tutor-pildora">{numero ? `Pregunta ${numero}` : 'Esta pregunta'}</span>
      <span className={`tutor-pildora tutor-pildora--${estado}`}>{PILDORA[estado]}</span>
      {onVerPregunta && <button type="button" className="tutor-enlace tutor-enlace--ver" onClick={onVerPregunta}>Ver pregunta <Chevron /></button>}
    </div>

    <div className="tutor-hilo" ref={hilo} role="group" aria-label="Conversación con Claude" tabIndex={0}>
      <Turno rol="ia" texto={SALUDO[estado]} />
      {mensajes.map(m => m.rol === 'yo' ? <Turno key={m.id} rol="yo" texto={m.texto} />
        : m.rol === 'ia' ? <Turno key={m.id} rol="ia" texto={m.texto} markdown={m.api} fuente={m.fuente} />
          : m.rol === 'error' ? <div key={m.id} className="tutor-turno tutor-turno--ia"><Avatar />
            <div className="tutor-burbuja tutor-burbuja--aviso" role="alert"><p>{m.motivo}</p>
              <BotonSalvia className="tutor-btn--chico" disabled={ocupado} onClick={() => reintentar(m)}>Reintentar</BotonSalvia></div></div>
            : <div key={m.id} className="tutor-tarjeta">
              {m.estado === 'cargando'
                ? <div className="tutor-practica tutor-practica--cargando" role="status" aria-busy="true">
                  <div className="tutor-practica-cab"><span className="tutor-practica-icono"><IconoCerebro tamano={17} /></span><strong>Recuperación activa</strong></div>
                  <p className="tutor-cargando">Claude está escribiendo los ejercicios<span className="tutor-puntos" aria-hidden="true"><i /><i /><i /></span></p>
                  <div className="tutor-esqueleto" aria-hidden="true"><i /><i /><i /></div>
                </div>
                : <PracticaActiva ejercicios={m.ejercicios} semilla={semilla} ronda={m.ronda} ultima={ultimaRonda?.id === m.id}
                  ocupado={ocupado} onOtraRonda={() => practicar(true)} />}
            </div>)}
      {ocupado && !rondas.some(r => r.estado === 'cargando') && <div className="tutor-turno tutor-turno--ia" role="status">
        <Avatar /><div className="tutor-burbuja tutor-burbuja--pensando"><span className="tutor-sr">Claude está pensando…</span>
          <span className="tutor-puntos" aria-hidden="true"><i /><i /><i /></span></div></div>}
      {!ocupado && (chips.length > 0 || !hayPractica) && <div className="tutor-explora">
        <p className="tutor-etiqueta">Explora este caso</p>
        <div className="tutor-chips">
          {chips.map(c => <button type="button" key={c.id} className="tutor-chip" title={c.etiqueta} onClick={() => preguntar(c.mensaje ?? c.etiqueta, c.id)}>
            {c.icono}<span>{c.etiqueta}</span></button>)}
          {!hayPractica && <button type="button" className="tutor-chip tutor-chip--practica" onClick={() => practicar(false)}>
            <IconoCerebro tamano={15} /><span>Recuperación activa</span></button>}
        </div>
      </div>}
    </div>

    <form className="tutor-entrada" onSubmit={enviar}>
      <input className="tutor-entrada-campo" type="text" value={texto} maxLength={MAX_MENSAJE} onChange={ev => setTexto(ev.target.value)}
        placeholder="Pregunta algo sobre este caso…" aria-label="Tu pregunta para Claude" autoComplete="off" disabled={ocupado} enterKeyHint="send" />
      <button type="submit" className="tutor-enviar" aria-label="Enviar pregunta" disabled={!texto.trim() || ocupado} {...manejadoresBrillo}><Enviar /></button>
    </form>
    {texto.length > MAX_MENSAJE - 60 && <p className="tutor-contador" aria-live="polite">{texto.length}/{MAX_MENSAJE}</p>}

    {onSiguiente && <footer className="tutor-pie">
      <button type="button" className="tutor-enlace tutor-enlace--siguiente" onClick={onSiguiente}>Siguiente pregunta<Flecha /></button>
    </footer>}
  </section>
}

const reducirMovimiento = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export function Avatar() { return <span className="tutor-mini-avatar" aria-hidden="true"><IconoCerebro tamano={15} /></span> }

export function Turno({ rol, texto, markdown = false, fuente }: { rol: 'yo' | 'ia'; texto: string; markdown?: boolean; fuente?: FuenteChat }) {
  return <div className={`tutor-turno tutor-turno--${rol}`}>
    {rol === 'ia' && <Avatar />}
    <div className="tutor-burbuja">
      {markdown ? <TextoClaude texto={texto} /> : <p>{texto}</p>}
      {fuente && <p className="tutor-fuente">Material: {fuente.title}{fuente.page > 0 ? ` · p. ${fuente.page}` : ''}</p>}
    </div>
  </div>
}
