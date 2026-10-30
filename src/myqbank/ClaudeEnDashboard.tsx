import { useEffect, useRef, useState } from 'react'
import { IconoCerebro } from '../components/tutor/IconoCerebro'
import { ChatSesion } from '../screens/ChatSesion'
import { SugerenciaRecuperar } from '../screens/SugerenciaRecuperar'
import type { DatosAsistente } from './AsistenteDashboard'
import { Button, Card } from './components'
import { useSuaveExperience } from './SuaveExperience'
import './claude-dashboard.css'

/**
 * Lo que Claude aporta al dashboard de MyQBank, bajo «Your next step»:
 *  - «Reinforce today»: lo más frágil de lo ya visto, una vez al día y con techo (la tarjeta decide si toca).
 *  - «Ask Claude for a session»: abre un cuadro de diálogo donde se pide una sesión con palabras propias.
 *
 * El texto de la tarjeta va en inglés, como el resto del espacio; la conversación con Claude es en español,
 * que es como se pide. El diálogo vive siempre montado para que cerrarlo no borre la conversación.
 */

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ClaudeEnDashboard(d: DatosAsistente) {
  const { play } = useSuaveExperience()
  const [abierto, setAbierto] = useState(false)
  const [conversando, setConversando] = useState(false)
  const entrada = useRef<HTMLDivElement>(null)
  const dialogo = useRef<HTMLDivElement>(null)
  const alAbrir = useRef<Element | null>(null)

  // Safari no enfoca un botón al pulsarlo: si el foco está en <body>, al cerrar se vuelve al botón de la tarjeta.
  const abrir = () => { alAbrir.current = document.activeElement === document.body ? null : document.activeElement; setConversando(true); setAbierto(true) }
  const cerrar = () => {
    play('close')
    setAbierto(false)
    // El foco vuelve a quien abrió el diálogo; si ya no está, al botón de la tarjeta.
    const destino = alAbrir.current instanceof HTMLElement && alAbrir.current.isConnected ? alAbrir.current : entrada.current?.querySelector('button')
    destino?.focus()
  }

  // Mientras está abierto, la página de detrás no se desplaza. Siempre se devuelve lo que había.
  useEffect(() => {
    if (!abierto) return
    const raiz = document.documentElement
    const antes = raiz.style.overflow
    raiz.style.overflow = 'hidden'
    return () => { raiz.style.overflow = antes }
  }, [abierto])

  // Escape y Tab se escuchan en el documento y no en el diálogo: al enviar un mensaje el botón se desactiva, el foco cae
  // a <body> y un oyente del diálogo dejaría de enterarse justo cuando la persona quiere salir o seguir con el teclado.
  const cerrarAhora = useRef(cerrar)
  cerrarAhora.current = cerrar
  useEffect(() => {
    if (!abierto) return
    const teclas = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrarAhora.current(); return }
      if (ev.key !== 'Tab') return
      const dentro = [...(dialogo.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? [])].filter(el => el.offsetParent !== null || el === document.activeElement)
      if (!dentro.length) { ev.preventDefault(); return }
      const primero = dentro[0], ultimo = dentro[dentro.length - 1]
      const enElDialogo = !!dialogo.current?.contains(document.activeElement)
      if (ev.shiftKey && (!enElDialogo || document.activeElement === primero)) { ev.preventDefault(); ultimo.focus() }
      else if (!ev.shiftKey && (!enElDialogo || document.activeElement === ultimo)) { ev.preventDefault(); primero.focus() }
    }
    document.addEventListener('keydown', teclas)
    return () => document.removeEventListener('keydown', teclas)
  }, [abierto])

  return <section className="mq-claude" aria-label="Claude">
    <SugerenciaRecuperar variante="myqbank" usuario={d.usuario} ahora={d.ahora} candidatas={d.candidatas} listo={d.listo}
      modulos={d.modulos} listas={d.listas} onRecuperar={d.onNuevo} />
    <Card className="mq-claude-entrada" aria-labelledby="mq-claude-titulo">
      <span className="mq-claude-marca" aria-hidden="true"><IconoCerebro tamano={22} /></span>
      <div className="mq-claude-texto">
        <h2 id="mq-claude-titulo">Ask Claude for a session</h2>
        <p className="mq-small mq-muted">A topic, what you missed, what’s due… in your own words.</p>
      </div>
      <div ref={entrada}><Button onClick={abrir} aria-haspopup="dialog">{conversando ? 'Continue chat' : 'Open chat'}</Button></div>
    </Card>
    <div className="mq-claude-fondo" hidden={!abierto} onMouseDown={ev => { if (ev.target === ev.currentTarget) cerrar() }}>
      <div ref={dialogo} className="mq-claude-dialogo" role="dialog" aria-modal="true" aria-label="Pídele a Claude una sesión" lang="es">
        <ChatSesion abierto={abierto} onCerrar={cerrar} onNuevo={m => { setAbierto(false); d.onNuevo(m) }} ocupado={d.ocupado}
          progreso={d.progreso} criterios={d.criterios} nbme={d.nbme} listas={d.listas} publicados={d.publicados}
          modulos={d.modulos} enCajasHoy={d.enCajasHoy} bancoDisponible={d.bancoDisponible} />
      </div>
    </div>
  </section>
}
