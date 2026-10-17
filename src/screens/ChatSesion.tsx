import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Avatar, Turno } from '../components/tutor/TutorClaude'
import { IconoCerebro } from '../components/tutor/IconoCerebro'
import { BotonCoral, BotonSalvia, Cruz, Enviar, manejadoresBrillo } from '../components/tutor/controles'
import '../components/tutor/tutor-claude.css'
import { describirConsulta } from '../lib/constructor-sesion'
import { MAX_PEDIDO, type ConsultaSesion, type TurnoSesion } from '../lib/contexto-sesion'
import type { MaterialNuevo } from '../lib/nuevo-hoy'
import { pedirEntender } from '../lib/sesion-claude'
import { armarDesdeConsulta, type DatosSesion } from './chat-sesion-flujo'

/**
 * «Pídele a Claude una sesión»: la persona describe con sus palabras lo que quiere estudiar.
 * Claude lo traduce al vocabulario de la plataforma (y, si falta algo que cambia la sesión,
 * pregunta con botones, como mucho dos veces); la plataforma filtra con el historial real y,
 * sólo si se pidió un tema libre, Claude revisa la lista corta. Al final queda un botón para
 * empezar. Nada de esto se guarda: la conversación vive en esta pantalla.
 *
 * Es opcional y no cuenta como deuda ni consume la sugerencia del día; lo que se estudie desde
 * aquí registra intentos como cualquier otra sesión.
 */

const EJEMPLOS = [
  'Hematología y lo relacionado con oncología',
  'Preguntas de endocrino que tengo por repasar',
  'Una sesión de las que he fallado',
  'Las que me han dado más trabajo',
]

const SALUDO = 'Dime con tus palabras qué sesión quieres: un tema, lo que has fallado, lo que tienes por repasar… Solo te pregunto lo que cambie de verdad la sesión.'

type AccionError = { tipo: 'entender' } | { tipo: 'armar'; consulta: ConsultaSesion; pedido: string }
type Msg =
  | { id: number; rol: 'yo'; texto: string }
  | { id: number; rol: 'ia'; texto: string }
  | { id: number; rol: 'pregunta'; texto: string; opciones: string[] }
  | { id: number; rol: 'sesion'; material: MaterialNuevo; resumen: string; nota: string[]; usada: boolean }
  | { id: number; rol: 'error'; motivo: string; accion: AccionError }

type SinId<T> = T extends unknown ? Omit<T, 'id'> : never
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const ELIGE_TU = 'Elige tú'

export interface PropsChatSesion extends DatosSesion {
  onNuevo: (material: MaterialNuevo) => void
  /** Otra sesión se está abriendo: no se lanza una segunda. */
  ocupado?: boolean
}

const reducirMovimiento = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export function ChatSesion({ onNuevo, ocupado: abriendo = false, ...datos }: PropsChatSesion) {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Msg[]>([])
  const [esperando, setEsperando] = useState(false)
  const [texto, setTexto] = useState('')
  const contador = useRef(0)
  const vivo = useRef(true)
  const control = useRef<AbortController | null>(null)
  const ocupadoRef = useRef(false)
  /** Lo que Claude ya sabe de esta petición: se reinicia cuando termina (sesión, vacío) o al empezar de nuevo. */
  const hilo = useRef<{ turnos: TurnoSesion[]; preguntas: number }>({ turnos: [], preguntas: 0 })
  const ultimos = useRef(datos)
  ultimos.current = datos
  const campo = useRef<HTMLInputElement>(null)
  const zona = useRef<HTMLDivElement>(null)

  useEffect(() => { vivo.current = true; return () => { vivo.current = false; control.current?.abort() } }, [])
  useEffect(() => { if (abierto) campo.current?.focus() }, [abierto])
  useEffect(() => {
    const el = zona.current
    if (!el || mensajes.length === 0) return
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: reducirMovimiento() ? 'auto' : 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [mensajes, esperando])

  const siguienteId = () => ++contador.current
  const poner = (m: SinId<Msg>) => setMensajes(prev => [...prev, { ...m, id: siguienteId() } as Msg])
  const quitar = (id: number) => setMensajes(prev => prev.filter(m => m.id !== id))
  const empezar = () => { ocupadoRef.current = true; setEsperando(true); control.current = new AbortController(); return control.current.signal }
  const terminar = () => { ocupadoRef.current = false; setEsperando(false) }
  const reiniciarHilo = () => { hilo.current = { turnos: [], preguntas: 0 } }

  /** Una petición cancelada o de una pantalla que ya no existe no toca nada. */
  const vigente = (signal: AbortSignal) => vivo.current && !signal.aborted

  const armar = async (consulta: ConsultaSesion, pedido: string) => {
    const signal = empezar()
    const r = await armarDesdeConsulta(consulta, pedido, ultimos.current, signal)
    if (!vigente(signal)) return
    terminar()
    if (r.estado === 'lista') {
      reiniciarHilo()
      const nota: string[] = []
      if (r.revision) nota.push(`Claude revisó ${plural(r.revision.revisadas, 'candidata', 'candidatas')} y dejó ${r.revision.encajan}.`)
      if (r.sinRevisar > 0) nota.push(`${plural(r.sinRevisar, 'pregunta NBME no se puede revisar', 'preguntas NBME no se pueden revisar')} con IA y ${r.sinRevisar === 1 ? 'quedó fuera' : 'quedaron fuera'}.`)
      const resumen = `${plural(r.conceptos, 'concepto', 'conceptos')} y ${plural(r.preguntas, 'pregunta', 'preguntas')} · ≈ ${r.minutos} min`
      poner({ rol: 'sesion', material: r.material, resumen, nota, usada: false })
    } else if (r.estado === 'vacio') {
      reiniciarHilo()
      poner({ rol: 'ia', texto: r.motivo })
    } else poner({ rol: 'error', motivo: r.motivo, accion: { tipo: 'armar', consulta, pedido } })
  }

  const conversar = async () => {
    const signal = empezar()
    const r = await pedirEntender(hilo.current.turnos, hilo.current.preguntas, signal)
    if (!vigente(signal)) return
    terminar()
    if (r.estado === 'sin_ia') { poner({ rol: 'error', motivo: r.motivo, accion: { tipo: 'entender' } }); return }
    if (r.tipo === 'pregunta') {
      hilo.current.turnos.push({ rol: 'ia', texto: r.texto })
      hilo.current.preguntas += 1
      poner({ rol: 'pregunta', texto: r.texto, opciones: r.opciones })
      return
    }
    const pedido = hilo.current.turnos.filter(t => t.rol === 'yo').map(t => t.texto).join(' · ').slice(0, MAX_PEDIDO)
    poner({ rol: 'ia', texto: `Entendí: ${describirConsulta(r.consulta)}. Busco en tu material…` })
    await armar(r.consulta, pedido)
  }

  const decir = (t: string) => {
    const limpio = t.replace(/\s+/g, ' ').trim().slice(0, MAX_PEDIDO)
    if (!limpio || ocupadoRef.current) return
    hilo.current.turnos.push({ rol: 'yo', texto: limpio })
    poner({ rol: 'yo', texto: limpio })
    void conversar()
  }

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    if (!texto.trim() || esperando) return
    decir(texto)
    setTexto('')
  }

  const reintentar = (m: Extract<Msg, { rol: 'error' }>) => {
    if (ocupadoRef.current) return
    quitar(m.id)
    if (m.accion.tipo === 'entender') void conversar()
    else void armar(m.accion.consulta, m.accion.pedido)
  }

  const comenzar = (m: Extract<Msg, { rol: 'sesion' }>) => {
    if (abriendo || m.usada) return
    setMensajes(prev => prev.map(x => x.id === m.id && x.rol === 'sesion' ? { ...x, usada: true } : x))
    onNuevo(m.material)
  }

  const desdeCero = () => {
    control.current?.abort()
    ocupadoRef.current = false
    setEsperando(false)
    reiniciarHilo()
    setMensajes([])
    setTexto('')
    campo.current?.focus()
  }

  if (!abierto) {
    return <section className="tarjeta chat-sesion-cerrada" aria-labelledby="chat-sesion-titulo">
      <p className="rotulo">Con tus palabras · opcional</p>
      <h2 id="chat-sesion-titulo">Pídele a Claude una sesión</h2>
      <p className="mini">Un tema, lo que has fallado, lo que tienes por repasar… Claude lo entiende, revisa tu material y te deja la sesión lista para empezar.</p>
      <div className="fila">
        <button type="button" className="btn principal" onClick={() => setAbierto(true)}>{mensajes.length ? 'Seguir con el chat' : 'Pedir una sesión'}</button>
      </div>
    </section>
  }

  const ultimo = mensajes[mensajes.length - 1]
  const mostrarOpciones = ultimo?.rol === 'pregunta' && !esperando
  const sinMensajes = mensajes.length === 0

  return <section className="tutor chat-sesion" aria-label="Claude, para armar tu sesión de estudio">
    <header className="tutor-cab">
      <span className="tutor-avatar" aria-hidden="true"><IconoCerebro tamano={22} /></span>
      <div className="tutor-titulo"><strong>Claude</strong><span>Arma tu sesión con tus palabras</span></div>
      <button type="button" className="tutor-icono-boton" aria-label="Cerrar el chat" onClick={() => setAbierto(false)}><Cruz /></button>
    </header>

    <div className="tutor-hilo" ref={zona} role="group" aria-label="Conversación con Claude" aria-live="polite" tabIndex={0}>
      <Turno rol="ia" texto={SALUDO} />
      {mensajes.map(m => m.rol === 'yo' || m.rol === 'ia' ? <Turno key={m.id} rol={m.rol} texto={m.texto} />
        : m.rol === 'pregunta' ? <Turno key={m.id} rol="ia" texto={m.texto} />
          : m.rol === 'error' ? <div key={m.id} className="tutor-turno tutor-turno--ia"><Avatar />
            <div className="tutor-burbuja tutor-burbuja--aviso" role="alert"><p>{m.motivo}</p>
              <BotonSalvia className="tutor-btn--chico" disabled={esperando} onClick={() => reintentar(m)}>Reintentar</BotonSalvia></div></div>
            : <div key={m.id} className="tutor-turno tutor-turno--ia"><Avatar />
              <div className="tutor-burbuja chat-sesion-resultado">
                <p className="chat-sesion-titulo-sesion"><strong>{m.material.titulo}</strong></p>
                <p>{m.resumen}</p>
                {m.nota.map(n => <p key={n} className="chat-sesion-nota">{n}</p>)}
                <BotonCoral className="tutor-btn--chico" disabled={abriendo || m.usada} onClick={() => comenzar(m)}>
                  {m.usada ? 'Sesión abierta' : 'Empezar la sesión'}</BotonCoral>
              </div></div>)}
      {esperando && <div className="tutor-turno tutor-turno--ia" role="status">
        <Avatar /><div className="tutor-burbuja tutor-burbuja--pensando"><span className="tutor-sr">Claude está pensando…</span>
          <span className="tutor-puntos" aria-hidden="true"><i /><i /><i /></span></div></div>}
      {mostrarOpciones && ultimo.rol === 'pregunta' && <div className="tutor-explora">
        <div className="tutor-chips" role="group" aria-label="Opciones de respuesta">
          {ultimo.opciones.map(o => <button type="button" key={o} className="tutor-chip" title={o} onClick={() => decir(o)}><span>{o}</span></button>)}
          <button type="button" className="tutor-chip" onClick={() => decir(ELIGE_TU)}><span>{ELIGE_TU}</span></button>
        </div>
      </div>}
      {sinMensajes && !esperando && <div className="tutor-explora">
        <p className="tutor-etiqueta">Por ejemplo</p>
        <div className="tutor-chips">
          {EJEMPLOS.map(e => <button type="button" key={e} className="tutor-chip" title={e} onClick={() => { setTexto(e); campo.current?.focus() }}><span>{e}</span></button>)}
        </div>
      </div>}
    </div>

    <form className="tutor-entrada" onSubmit={enviar}>
      <input ref={campo} className="tutor-entrada-campo" type="text" value={texto} maxLength={MAX_PEDIDO} onChange={ev => setTexto(ev.target.value)}
        placeholder="Qué quieres estudiar…" aria-label="Lo que quieres estudiar" autoComplete="off" disabled={esperando} enterKeyHint="send" />
      <button type="submit" className="tutor-enviar" aria-label="Enviar" disabled={!texto.trim() || esperando} {...manejadoresBrillo}><Enviar /></button>
    </form>
    {texto.length > MAX_PEDIDO - 60 && <p className="tutor-contador" aria-live="polite">{texto.length}/{MAX_PEDIDO}</p>}
    {!sinMensajes && <footer className="tutor-pie">
      <button type="button" className="tutor-enlace" onClick={desdeCero}>Empezar de nuevo</button>
    </footer>}
  </section>
}
