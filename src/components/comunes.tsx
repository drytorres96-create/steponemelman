import { useEffect, useId, useRef, type ReactNode } from 'react'
import type { Concepto } from '../schema/concept'
import type { EstadoDominio } from '../srs/tipos'
import { NOMBRE_ESTADO } from '../srs/tipos'
import { referenciaPagina } from '../lib/fuente'

export function Anillo({ valor, total, tam = 108, etiqueta, oro = false }:
  { valor: number; total: number; tam?: number; etiqueta: string; oro?: boolean }) {
  const pct = total ? Math.min(1, Math.max(0, valor / total)) : 0
  const gradiente = useId()
  const r = tam / 2 - 7, circ = 2 * Math.PI * r
  return (
    <div className="anillo" style={{ width: tam, height: tam }}
         role="img" aria-label={`${etiqueta}: ${valor} de ${total}`}>
      <svg width={tam} height={tam} aria-hidden="true">
        <circle cx={tam/2} cy={tam/2} r={r} fill="none" stroke="#ffffff10" strokeWidth="7" />
        <circle cx={tam/2} cy={tam/2} r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          stroke={`url(#${gradiente})`}
          strokeDasharray={`${circ * pct} ${circ}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }} />
        <defs>
          <linearGradient id={gradiente} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={oro ? '#c99a2e' : '#8b7cf6'} /><stop offset="100%" stopColor={oro ? '#e3b23c' : '#e05fa8'} /></linearGradient>
        </defs>
      </svg>
      <div className="centro"><b style={oro ? { color: 'var(--oro)' } : undefined}>{valor}</b><small>{etiqueta}</small></div>
    </div>
  )
}

export function Barra({ valor, total, oro = false, etiqueta = 'Progreso' }: { valor: number; total: number; oro?: boolean; etiqueta?: string }) {
  const pct = total ? Math.min(100, Math.max(0, Math.round((valor / total) * 100))) : 0
  return <div className={`barra-prog${oro ? ' oro' : ''}`} role="progressbar"
    aria-label={etiqueta} aria-valuetext={`${valor} de ${total}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
}

const CLASE_ESTADO: Record<EstadoDominio, string> = {
  nuevo: '', en_aprendizaje: 'cian', en_consolidacion: 'violeta', proximo_dominio: 'ambar',
  dominado: 'oro', requiere_repaso: 'rojo', reaprendizaje: 'rojo',
}
export function EtiquetaEstado({ estado }: { estado: EstadoDominio }) {
  return <span className={`etq ${CLASE_ESTADO[estado]}`}>{NOMBRE_ESTADO[estado]}</span>
}

export function Modal({ titulo, onCerrar, children, ancho }:
  { titulo: string; onCerrar: () => void; children: ReactNode; ancho?: number }) {
  const panel = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const controles = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') ?? [])
    ;(controles()[0] ?? panel.current)?.focus()
    const teclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cerrar.current(); return }
      if (e.key !== 'Tab') return
      const lista = controles(), primero = lista[0], ultimo = lista.at(-1)
      if (!primero || !ultimo) { e.preventDefault(); panel.current?.focus(); return }
      if (e.shiftKey && (document.activeElement === primero || !panel.current?.contains(document.activeElement))) {
        e.preventDefault(); ultimo.focus()
      } else if (!e.shiftKey && (document.activeElement === ultimo || !panel.current?.contains(document.activeElement))) {
        e.preventDefault(); primero.focus()
      }
    }
    document.addEventListener('keydown', teclado)
    return () => {
      document.removeEventListener('keydown', teclado)
      document.body.style.overflow = overflow
      if (anterior?.isConnected) anterior.focus()
    }
  }, [])
  return (
    <div className="modal-fondo" onClick={onCerrar} role="dialog" aria-modal="true" aria-label={titulo}>
      <div ref={panel} tabIndex={-1} className="modal" style={ancho ? { maxWidth: ancho } : undefined} onClick={e => e.stopPropagation()}>
        <div className="modal-cab">
          <h2 style={{ flex: 1 }}>{titulo}</h2>
          <button className="btn pequeno fantasma" onClick={onCerrar} aria-label="Cerrar">Cerrar</button>
        </div>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  )
}

/** Pantalla «Fuente»: documento, página, fragmento verbatim y relación exacta con el concepto. */
export function PanelFuente({ c }: { c: Concepto }) {
  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="fila" style={{ gap: 8 }}>
        <span className="etq violeta">{c.source.doc_title}</span>
        <span className="etq">{referenciaPagina(c.source)}</span>
        <span className="etq">{c.source.item_id}</span>
      </div>
      {c.source.pdf_page && c.source.pdf_page !== c.source.page && <p className="mini">
        La página PDF cuenta la portada. El ancla de la extracción es {c.source.page}.
      </p>}
      <div>
        <div className="rotulo" style={{ marginBottom: 6 }}>Fragmento fuente (verbatim)</div>
        <div className="fragmento">{c.source.fragment}</div>
      </div>
      {c.fuentes_adicionales?.length ? (
        <div>
          <div className="rotulo" style={{ marginBottom: 6 }}>Otras apariciones del mismo concepto</div>
          {c.fuentes_adicionales.map((f, i) => (
            <div key={i} className="sutil">· {f.doc}, página {f.page}</div>
          ))}
        </div>
      ) : null}
      <div>
        <div className="rotulo" style={{ marginBottom: 6 }}>Relación con el concepto</div>
        <p className="sutil" style={{ margin: 0 }}>
          <b style={{ color: 'var(--texto)' }}>Objetivo:</b> {c.objetivo}<br />
          <b style={{ color: 'var(--texto)' }}>Afirmación canónica:</b> {c.afirmacion}<br />
          <b style={{ color: 'var(--texto)' }}>Respuesta:</b> {c.respuesta_canonica}
        </p>
      </div>
      {c.calidad.alertas.length > 0 && (
        <div className="aviso"><span>⚠</span><div>
          <b>Alertas registradas en la auditoría</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{c.calidad.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div></div>
      )}
      <div className="mini">Confianza de la auditoría automatizada: {(c.calidad.confianza * 100).toFixed(0)} %. Esta revisión la realizó un sistema de inteligencia artificial; no sustituye la revisión de una persona.</div>
    </div>
  )
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: ReactNode }) {
  return <div className="vacio"><h3 style={{ marginBottom: 6 }}>{titulo}</h3><p className="sutil">{texto}</p>{accion}</div>
}
