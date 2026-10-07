import { useEffect, useId, useRef, type ReactNode } from 'react'
import type { Concepto } from '../schema/concept'
import type { EstadoDominio } from '../srs/tipos'
import { NOMBRE_ESTADO } from '../srs/tipos'
import { referenciaPagina } from '../lib/fuente'
import { fundamentoEditorial } from '../lib/fuente-docente'

export function Anillo({ valor, total, tam = 108, etiqueta, oro = false }:
  { valor: number; total: number; tam?: number; etiqueta: string; oro?: boolean }) {
  const pct = total ? Math.min(1, Math.max(0, valor / total)) : 0
  const gradiente = useId()
  const r = tam / 2 - 7, circ = 2 * Math.PI * r
  return (
    <div className="anillo" style={{ width: tam, height: tam }}
         role="img" aria-label={`${etiqueta}: ${valor} de ${total}`}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <circle cx={tam/2} cy={tam/2} r={r} fill="none" stroke="var(--linea)" strokeWidth="7" />
        <circle cx={tam/2} cy={tam/2} r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          stroke={`url(#${gradiente})`}
          strokeDasharray={`${circ * pct} ${circ}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }} />
        <defs>
          <linearGradient id={gradiente} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={oro ? 'var(--oro)' : 'var(--violeta)'} /><stop offset="100%" stopColor={oro ? 'var(--oro)' : 'var(--magenta)'} /></linearGradient>
        </defs>
      </svg>
      <div className="centro"><b style={oro ? { color: 'var(--oro)' } : undefined}>{valor}</b><small>{etiqueta}</small></div>
    </div>
  )
}

export interface SegmentoAnillo { valor: number; total: number }
export interface MedidaAnillo { valor: number; total: number; etiqueta: string }

const fraccion = (valor: number, total: number) => total ? Math.min(1, Math.max(0, valor / total)) : 0

/**
 * Anillo dentro de anillo. El interior es el día y se cierra en oro cuando el día
 * está completo; el exterior es el tema de la semana, partido en tramos cuyo
 * tamaño corresponde a su población. Los conceptos compartidos entre sesiones
 * deben llegar asignados una sola vez.
 *
 * La pista es una línea fina en `--linea-interactiva` (más de 3:1 sobre el fondo)
 * y el avance un trazo grueso encima: así el borde del avance contrasta con el
 * fondo y no depende de distinguirse de la pista. Un solo `role="img"` lleva las
 * dos cifras; el SVG es decorativo.
 */
export function AnilloDoble({ interior, exterior, segmentos, cerrado = false, tam = 196 }: {
  interior: MedidaAnillo; exterior: MedidaAnillo; segmentos: SegmentoAnillo[]; cerrado?: boolean; tam?: number
}) {
  const gradiente = useId()
  const c = tam / 2
  const rExt = c - 7, rInt = c - 29
  const circExt = 2 * Math.PI * rExt, circInt = 2 * Math.PI * rInt
  const conContenido = segmentos.filter(t => Number.isFinite(t.total) && t.total > 0)
  const tramos = conContenido.length ? conContenido : [{ valor: exterior.valor, total: exterior.total }]
  const poblacion = tramos.reduce((n, t) => n + t.total, 0)
  // La misma proporción de hueco en cada arco conserva la fracción global:
  // el avance visible suma los conceptos, no promedia sesiones de distinto tamaño.
  const proporcionHueco = tramos.length > 1 ? Math.min(.18, 8 * tramos.length / circExt) : 0
  let recorrido = 0
  const arcos = tramos.map(t => {
    const paso = poblacion > 0 ? circExt * t.total / poblacion : circExt
    const hueco = paso * proporcionHueco
    const arco = { largo: paso - hueco, desplazamiento: -(recorrido + hueco / 2), avance: fraccion(t.valor, t.total) }
    recorrido += paso
    return arco
  })
  const avanceInt = cerrado ? 1 : fraccion(interior.valor, interior.total)
  const transicion = { transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }
  return (
    <div className={`anillo anillo-doble${cerrado ? ' cerrado' : ''}`} style={{ width: tam, height: tam }} role="img"
      aria-label={`${interior.etiqueta}: ${interior.valor} de ${interior.total}. ${exterior.etiqueta}: ${exterior.valor} de ${exterior.total}.`}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradiente} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={cerrado ? 'var(--oro)' : 'var(--violeta)'} />
            <stop offset="100%" stopColor={cerrado ? 'var(--oro)' : 'var(--magenta)'} />
          </linearGradient>
        </defs>
        {arcos.map(({ largo, desplazamiento, avance }, i) => {
          return <g key={i}>
            <circle cx={c} cy={c} r={rExt} fill="none" stroke="var(--linea-interactiva)" strokeWidth="2"
              strokeDasharray={`${largo} ${circExt - largo}`} strokeDashoffset={desplazamiento} />
            <circle cx={c} cy={c} r={rExt} fill="none" stroke="var(--violeta)" strokeWidth="9" strokeLinecap="butt"
              strokeDasharray={`${largo * avance} ${circExt}`} strokeDashoffset={desplazamiento} style={transicion} />
          </g>
        })}
        <circle cx={c} cy={c} r={rInt} fill="none" stroke="var(--linea-interactiva)" strokeWidth="2" />
        {/* Sin avance no se pinta nada: el extremo redondeado de un trazo vacío dejaría un punto. */}
        {avanceInt > 0 && <circle cx={c} cy={c} r={rInt} fill="none" strokeWidth="13" strokeLinecap="round" stroke={`url(#${gradiente})`}
          strokeDasharray={`${circInt * avanceInt} ${circInt}`} style={transicion} />}
      </svg>
      <div className="centro">
        {cerrado ? <b style={{ color: 'var(--oro)' }}>Listo</b> : <b>{interior.valor}<span>/{interior.total}</span></b>}
        <small>hoy</small>
      </div>
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

/** Procedencia y evidencia docente. Las notas internas de auditoría no forman parte de la UI. */
export function PanelFuente({ c }: { c: Concepto }) {
  const fundamento = fundamentoEditorial(c)
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
        <div className="rotulo" style={{ marginBottom: 6 }}>{c.revision_editorial ? 'Fundamento del concepto' : 'Fragmento fuente (verbatim)'}</div>
        <div className="fragmento">{c.revision_editorial ? fundamento ?? c.explicacion : c.source.fragment}</div>
      </div>
      {c.revision_editorial && c.revision_editorial.fuentes.length > 0 && <div><b>Referencias</b>
        {c.revision_editorial.fuentes.map(f => <p key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a></p>)}
      </div>}
      {c.variante_id && <div><b>Referencias de esta variante</b>{c.variantes?.find(v => v.variant_id === c.variante_id)?.fuentes.map(f => <p key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a></p>)}</div>}
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
    </div>
  )
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: ReactNode }) {
  return <div className="vacio"><h3 style={{ marginBottom: 6 }}>{titulo}</h3><p className="sutil">{texto}</p>{accion}</div>
}
