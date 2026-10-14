import { createContext, useContext, useMemo, useState, type KeyboardEvent, type SetStateAction, type ReactNode, type ButtonHTMLAttributes, type MouseEvent } from 'react'
import type { InteractionDraft } from '../myqbank/blocks'
import type { Concepto } from '../schema/concept'
import type { TipoError } from '../srs/tipos'
import { evaluarNumero, evaluarTexto, normalizar, type Veredicto } from '../lib/normalize'
import { esRespuestaBreve } from '../lib/formatos'

export interface Resultado {
  veredicto: Veredicto
  tipoError: TipoError
  recuperacionActiva: boolean
  detalle?: string
  respuestaDada: string
}
interface Props {
  c: Concepto; bloqueado: boolean; resultado: Resultado | null; onResponder: (r: Resultado) => void
  /** Estable durante el intento, distinta al iniciar otra presentación. */
  semilla?: string
  ocultarFeedback?: boolean
  draft?: InteractionDraft
  onDraft?: (draft: InteractionDraft) => void
  english?: boolean
  renderText?: (text: string, region: string) => ReactNode
}
const DraftContext = createContext<Pick<Props, 'draft' | 'onDraft' | 'english' | 'renderText'>>({})
function useCopy() { const { english } = useContext(DraftContext); return (es: string, en: string) => english ? en : es }
function InteractionText({ text, region }: { text: string; region: string }) { const { renderText } = useContext(DraftContext); return <>{renderText ? renderText(text, region) : text}</> }
/** A submitted choice remains text-selectable in My Q Bank. Its activation stays locked. */
function AnswerChoice(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { english } = useContext(DraftContext)
  if (!english) return <button {...props}/>
  const { disabled, onClick, children, type: _type, ...rest } = props
  return <div {...rest as React.HTMLAttributes<HTMLDivElement>} role={props.role ?? 'button'} tabIndex={0} aria-disabled={disabled || undefined}
    onClick={event => { if (!disabled) onClick?.(event as unknown as MouseEvent<HTMLButtonElement>) }}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); if (!disabled) event.currentTarget.click() } }}>{children}</div>
}
function useDraft<T,>(field: keyof InteractionDraft, initial: T): [T, (value: SetStateAction<T>) => void] {
  const context = useContext(DraftContext)
  const [local, setLocal] = useState(initial)
  const value = context.onDraft ? (context.draft?.[field] ?? initial) as T : local
  return [value, next => {
    const resolved = typeof next === 'function' ? (next as (p: T) => T)(value) : next
    if (context.onDraft) context.onDraft({ ...context.draft, [field]: resolved })
    else setLocal(resolved)
  }]
}

/**
 * Intro envía la respuesta y se consume ahí. Si no se cancela, el navegador entrega la
 * misma pulsación (su `keypress`) al botón que recibe el foco al corregir, «Siguiente
 * pregunta», y la corrección se salta sin llegar a verse.
 */
const intro = (enviar: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return
  e.preventDefault()
  enviar()
}

const LETRAS = 'ABCDEFGH'
const mezclar = <T,>(a: T[], semilla: string): T[] => {
  let h = 0; for (const ch of semilla) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [b[i], b[j]] = [b[j], b[i]] }
  return b
}

/* ---------------- opción múltiple / caso clínico / verdadero-falso ---------------- */
function Opciones({ c, bloqueado, resultado, onResponder, semilla, ocultarFeedback = false }: Props) {
  const tx = useCopy()
  const opciones = useMemo(() => mezclar(c.evaluacion.opciones ?? [], semilla ?? c.concept_id), [c, semilla])
  const [elegida, setElegida] = useDraft<number | null>('choice', null)
  const seleccionada = elegida ?? (resultado ? opciones.findIndex(o => o.texto === resultado.respuestaDada) : null)
  // Elegir no es responder: el intento se registra sólo al confirmar, igual que en el resto de formatos.
  const enviar = () => {
    if (bloqueado || elegida === null || !opciones[elegida]) return
    const o = opciones[elegida]
    const dist = c.distractores_cercanos.some(d => normalizar(d.texto) === normalizar(o.texto))
    onResponder({
      veredicto: o.correcta ? 'correcta' : 'incorrecta',
      tipoError: o.correcta ? 'ninguno' : (dist ? 'confusion_conceptos' : 'interpretacion_incorrecta'),
      recuperacionActiva: false,
      detalle: o.correcta ? undefined : o.por_que || undefined,
      respuestaDada: o.texto,
    })
  }
  return (
    <div>
      <div role="radiogroup" aria-label={tx('Opciones de respuesta', 'Answer choices')}>
        {opciones.map((o, i) => {
          let cls = 'opcion'
          if (seleccionada === i) cls += bloqueado && !ocultarFeedback ? (o.correcta ? ' acierto' : ' fallo') : ' elegida'
          else if (bloqueado && !ocultarFeedback && o.correcta) cls += ' correcta-oculta'
          return (
            <AnswerChoice key={i} className={cls} onClick={() => { if (!bloqueado) setElegida(i) }} disabled={bloqueado}
                    role="radio" aria-checked={seleccionada === i}>
              <span className="letra">{LETRAS[i]}</span>
              <span style={{ flex: 1 }}>
                <InteractionText text={o.texto} region={`choice:${i}`}/>
                {bloqueado && !ocultarFeedback && o.correcta && <div className="mini respuesta-estado" style={{ marginTop: 4 }}><span aria-hidden="true">✓</span> {tx('Respuesta correcta', 'Correct answer')}</div>}
              {bloqueado && !ocultarFeedback && !o.correcta && seleccionada === i && <div className="mini respuesta-estado" style={{ marginTop: 4 }}><span aria-hidden="true">×</span> {tx('Tu respuesta incorrecta', 'Your answer')}</div>}
              </span>
            </AnswerChoice>
          )
        })}
      </div>
      <button className="btn principal" style={{ marginTop: 12 }} onClick={enviar} disabled={bloqueado || elegida === null}>
        {tx('Comprobar respuesta', 'Submit answer')}
      </button>
    </div>
  )
}

/* ---------------- recuperación libre / tarjeta / completar ---------------- */
function Texto({ c, bloqueado, onResponder }: Props) {
  const tx = useCopy()
  const [v, setV] = useDraft('text', '')
  const enviar = () => {
    if (bloqueado || !v.trim()) return
    const ve = evaluarTexto(v, c.respuesta_canonica, [...c.sinonimos, ...c.evaluacion.respuestas_aceptadas],
                            c.distractores_cercanos.map(d => d.texto))
    const tipo: TipoError =
      ve === 'correcta' ? 'ninguno' :
      ve === 'ortografia' ? 'error_ortografico' :
      ve === 'parcial' ? 'recuerdo_incompleto' :
      ve === 'revision' ? 'error_por_revisar' : 'confusion_conceptos'
    onResponder({ veredicto: ve, tipoError: tipo, recuperacionActiva: true, respuestaDada: v })
  }
  return (
    <div>
    <p className="mini">{tx('Una palabra o frase corta. No necesitas explicar el mecanismo por escrito.', 'A word or short phrase is enough.')}</p>
    <div className="fila" style={{ gap: 8 }}>
      <input type="text" value={v} disabled={bloqueado} autoComplete="off" autoCapitalize="off" spellCheck={false}
        placeholder={tx('Una palabra o frase corta…', 'A word or short phrase…')} aria-label={tx('Tu respuesta', 'Your answer')} maxLength={100}
        onChange={e => setV(e.target.value)} onKeyDown={intro(enviar)} />
      <button className="btn principal" onClick={enviar} disabled={bloqueado || !v.trim()}>{tx('Comprobar', 'Submit answer')}</button>
    </div>
    </div>
  )
}

/* ---------------- numérico ---------------- */
function Numerico({ c, bloqueado, onResponder }: Props) {
  const tx = useCopy()
  const [v, setV] = useDraft('text', '')
  const enviar = () => {
    if (bloqueado || !v.trim()) return
    const ve = evaluarNumero(v, c.respuesta_canonica, c.evaluacion.tolerancia, c.evaluacion.unidad)
    const unidadMal = !!c.evaluacion.unidad && /[a-zA-Z%/]/.test(v) &&
      !normalizar(v).includes(normalizar(c.evaluacion.unidad).split(' ')[0])
    onResponder({
      veredicto: ve,
      tipoError: ve === 'correcta' ? 'ninguno' : ve === 'revision' ? 'error_por_revisar' : unidadMal ? 'error_unidad' : 'error_numerico',
      recuperacionActiva: true, respuestaDada: v,
    })
  }
  return (
    <div>
      <div className="fila" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <input type="text" inputMode="decimal" value={v} disabled={bloqueado} placeholder={tx('Valor…', 'Value…')} aria-label={tx('Respuesta numérica', 'Numeric answer')}
          onChange={e => setV(e.target.value)} onKeyDown={intro(enviar)} />
        {c.evaluacion.unidad && <span className="etq" style={{ flex: 'none' }}>{c.evaluacion.unidad}</span>}
        <button className="btn principal" onClick={enviar} disabled={bloqueado || !v.trim()}>{tx('Comprobar', 'Submit answer')}</button>
      </div>
      {c.evaluacion.tolerancia != null && <div className="mini" style={{ marginTop: 6 }}>{tx('Tolerancia aceptada', 'Accepted tolerance')}: ±{c.evaluacion.tolerancia}</div>}
    </div>
  )
}

/* ---------------- predicción direccional ---------------- */
const SIGNOS = [{ k: 'sube', s: '↑' }, { k: 'baja', s: '↓' }, { k: 'sin_cambio', s: '↔' }] as const
function Direccional({ c, bloqueado, onResponder, ocultarFeedback = false }: Props) {
  const tx = useCopy()
  const flechas = c.evaluacion.flechas ?? []
  const [sel, setSel] = useDraft<Record<number, string>>('mapping', {})
  const completo = flechas.length > 0 && Object.keys(sel).length === flechas.length
  const enviar = () => {
    if (bloqueado || !completo) return
    const aciertos = flechas.filter((f, i) => sel[i] === f.direccion).length
    const ve: Veredicto = aciertos === flechas.length ? 'correcta' : aciertos >= Math.ceil(flechas.length / 2) ? 'parcial' : 'incorrecta'
    onResponder({
      veredicto: ve, tipoError: ve === 'correcta' ? 'ninguno' : 'error_mecanistico', recuperacionActiva: false,
      detalle: ve === 'correcta' ? undefined : `${aciertos} de ${flechas.length} flechas correctas.`,
      respuestaDada: flechas.map((f, i) => `${f.variable}: ${SIGNOS.find(s => s.k === sel[i])?.s ?? '—'}`).join(', '),
    })
  }
  return (
    <div>
      <div className="flechas">
        {flechas.map((f, i) => (
          <div key={i} className="flecha-fila">
            <span><InteractionText text={f.variable} region={`direction:${i}`}/></span>
            <div className="flecha-ops" role="radiogroup" aria-label={f.variable}>
              {SIGNOS.map(s => {
                let cls = ''
                if (bloqueado && !ocultarFeedback) { if (s.k === f.direccion) cls = 'ok'; else if (sel[i] === s.k) cls = 'mal' }
                else if (sel[i] === s.k) cls = 'sel'
                return <AnswerChoice key={s.k} className={cls} disabled={bloqueado} role="radio" aria-checked={sel[i] === s.k}
                  aria-label={`${f.variable} ${s.k === 'sube' ? tx('aumenta', 'increases') : s.k === 'baja' ? tx('disminuye', 'decreases') : tx('sin cambio', 'unchanged')}`}
                  onClick={() => setSel(p => ({ ...p, [i]: s.k }))}>{s.s}</AnswerChoice>
              })}
            </div>
          </div>
        ))}
      </div>
      <button className="btn principal" style={{ marginTop: 12 }} onClick={enviar} disabled={bloqueado || !completo}>{tx('Comprobar flechas', 'Submit answer')}</button>
    </div>
  )
}

/* ---------------- ordenar secuencia ---------------- */
function Secuencia({ c, bloqueado, onResponder, semilla, ocultarFeedback = false }: Props) {
  const tx = useCopy()
  const pasos = c.evaluacion.pasos ?? []
  const barajados = useMemo(() => mezclar(pasos.map((p, i) => ({ p, i })), semilla ?? c.concept_id), [c, semilla])
  const [orden, setOrden] = useDraft<number[]>('sequence', [])
  const enviar = () => {
    if (bloqueado || orden.length !== pasos.length) return
    const ok = orden.every((v, i) => v === i)
    const desplazados = orden.filter((v, i) => v !== i).length
    onResponder({
      veredicto: ok ? 'correcta' : desplazados <= 2 ? 'parcial' : 'incorrecta',
      tipoError: ok ? 'ninguno' : 'error_secuencia', recuperacionActiva: false,
      detalle: ok ? undefined : `${desplazados} de ${pasos.length} pasos fuera de lugar.`,
      respuestaDada: orden.map(i => pasos[i]).join(' → '),
    })
  }
  return (
    <div>
      <div className="zona" style={{ marginBottom: 10 }}>
        {orden.length === 0 && <span className="mini">{tx('Toca los pasos en el orden correcto.', 'Select the steps in order.')}</span>}
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {orden.map((idx, pos) => (
            <li key={pos} style={{ marginBottom: 4, color: bloqueado && !ocultarFeedback ? (idx === pos ? 'var(--verde)' : 'var(--rojo)') : undefined }}>
              <InteractionText text={pasos[idx] ?? ''} region={`sequence:${idx}`}/>
            </li>
          ))}
        </ol>
      </div>
      <div className="fichas">
        {barajados.map(({ p, i }) => (
          <AnswerChoice key={i} className={`ficha${orden.includes(i) ? ' sel' : ''}`} disabled={bloqueado || orden.includes(i)}
            onClick={() => setOrden(o => [...o, i])}><InteractionText text={p} region={`sequence:${i}`}/></AnswerChoice>
        ))}
      </div>
      <div className="fila" style={{ marginTop: 12 }}>
        <button className="btn principal" onClick={enviar} disabled={bloqueado || orden.length !== pasos.length}>{tx('Comprobar orden', 'Submit answer')}</button>
        <button className="btn fantasma pequeno" onClick={() => setOrden([])} disabled={bloqueado || !orden.length}>{tx('Reiniciar', 'Reset')}</button>
      </div>
      {bloqueado && !ocultarFeedback && <div className="mini" style={{ marginTop: 10 }}>{tx('Orden correcto', 'Correct order')}: {pasos.join(' → ')}</div>}
    </div>
  )
}

/* ---------------- relacionar columnas ---------------- */
function Relacionar({ c, bloqueado, onResponder, semilla, ocultarFeedback = false }: Props) {
  const tx = useCopy()
  const pares = c.evaluacion.pares ?? []
  const derechas = useMemo(() => mezclar(pares.map((p, i) => ({ t: p.derecha, i })), (semilla ?? c.concept_id) + 'd'), [c, semilla])
  const [activo, setActivo] = useState<number | null>(null)
  const [enlaces, setEnlaces] = useDraft<Record<number, number>>('mapping', {})
  const enlaceCorrecto = (i: number) => pares[enlaces[i]]?.derecha === pares[i]?.derecha
  const enviar = () => {
    if (bloqueado || Object.keys(enlaces).length !== pares.length) return
    // Dos fichas derechas con el mismo texto son equivalentes aunque sus índices difieran.
    const aciertos = pares.filter((_, i) => enlaceCorrecto(i)).length
    const ok = aciertos === pares.length
    onResponder({
      veredicto: ok ? 'correcta' : aciertos >= Math.ceil(pares.length / 2) ? 'parcial' : 'incorrecta',
      tipoError: ok ? 'ninguno' : 'confusion_conceptos', recuperacionActiva: false,
      detalle: ok ? undefined : `${aciertos} de ${pares.length} parejas correctas.`,
      respuestaDada: pares.map((p, i) => `${p.izquierda} → ${pares[enlaces[i]]?.derecha ?? '—'}`).join('; '),
    })
  }
  return (
    <div>
      <div className="rejilla r2" style={{ gap: 10 }}>
        <div className="pila" style={{ gap: 6 }}>
          <div className="rotulo">{tx('Columna A', 'Column A')}</div>
          {pares.map((p, i) => {
            let cls = 'ficha'
            if (activo === i) cls += ' sel'
            if (bloqueado && !ocultarFeedback) cls += enlaceCorrecto(i) ? ' ok' : ' mal'
            return <AnswerChoice key={i} className={cls} disabled={bloqueado} style={{ textAlign: 'left' }}
              onClick={() => setActivo(i)}><InteractionText text={p.izquierda} region={`match:left:${i}`}/>
              {enlaces[i] != null && <div className="mini">→ <InteractionText text={pares[enlaces[i]]?.derecha ?? '—'} region={`match:right:${enlaces[i]}`}/></div>}</AnswerChoice>
          })}
        </div>
        <div className="pila" style={{ gap: 6 }}>
          <div className="rotulo">{tx('Columna B', 'Column B')}</div>
          {derechas.map(({ t, i }) => (
            <AnswerChoice key={i} className="ficha" style={{ textAlign: 'left' }}
              disabled={bloqueado || activo === null || Object.values(enlaces).includes(i)}
              onClick={() => { if (activo !== null) { setEnlaces(e => ({ ...e, [activo]: i })); setActivo(null) } }}><InteractionText text={t} region={`match:right:${i}`}/></AnswerChoice>
          ))}
        </div>
      </div>
      <div className="fila" style={{ marginTop: 12 }}>
        <button className="btn principal" onClick={enviar} disabled={bloqueado || Object.keys(enlaces).length !== pares.length}>{tx('Comprobar parejas', 'Submit answer')}</button>
        <button className="btn fantasma pequeno" onClick={() => { setEnlaces({}); setActivo(null) }} disabled={bloqueado}>{tx('Reiniciar', 'Reset')}</button>
      </div>
      {bloqueado && !ocultarFeedback && <div className="mini" style={{ marginTop: 10 }}>{pares.map(p => `${p.izquierda} → ${p.derecha}`).join(' · ')}</div>}
    </div>
  )
}

/* ---------------- clasificar ---------------- */
function Clasificar({ c, bloqueado, onResponder, semilla, ocultarFeedback = false }: Props) {
  const tx = useCopy()
  const grupos = c.evaluacion.grupos ?? []
  const elementos = useMemo(
    () => mezclar(grupos.flatMap((g, gi) => g.elementos.map((e, ei) => ({ id: `${gi}:${ei}`, e, gi }))), semilla ?? c.concept_id), [c, semilla])
  const [asig, setAsig] = useDraft<Record<string, number>>('mapping', {})
  const [activo, setActivo] = useState<string | null>(null)
  const total = elementos.length
  const enviar = () => {
    if (bloqueado || Object.keys(asig).length !== total) return
    const aciertos = elementos.filter(({ id, gi }) => asig[id] === gi).length
    const ok = aciertos === total
    onResponder({
      veredicto: ok ? 'correcta' : aciertos >= Math.ceil(total * 0.6) ? 'parcial' : 'incorrecta',
      tipoError: ok ? 'ninguno' : 'confusion_conceptos', recuperacionActiva: false,
      detalle: ok ? undefined : `${aciertos} de ${total} elementos bien clasificados.`,
      respuestaDada: Object.entries(asig).map(([id, g]) => `${elementos.find(x => x.id === id)?.e ?? id}: ${grupos[g]?.nombre}`).join('; '),
    })
  }
  return (
    <div>
      <div className="fichas" style={{ marginBottom: 12 }}>
        {elementos.filter(({ id }) => asig[id] == null).map(({ id, e }) => (
          <AnswerChoice key={id} className={`ficha${activo === id ? ' sel' : ''}`} disabled={bloqueado} onClick={() => setActivo(id)}><InteractionText text={e} region={`classify:${id}`}/></AnswerChoice>
        ))}
      </div>
      <div className="rejilla r2">
        {grupos.map((g, gi) => (
          <div key={gi}>
            <div className="rotulo" style={{ marginBottom: 6 }}><InteractionText text={g.nombre} region={`group:${gi}`}/></div>
            <AnswerChoice className="zona" style={{ width: '100%', textAlign: 'left', cursor: activo ? 'pointer' : 'default', background: 'var(--bg-2)' }}
              disabled={bloqueado || !activo}
              onClick={() => { if (activo) { setAsig(a => ({ ...a, [activo]: gi })); setActivo(null) } }}>
              <div className="fichas">
                {Object.entries(asig).filter(([, v]) => v === gi).map(([id]) => {
                  const elemento = elementos.find(x => x.id === id)
                  const correcto = elemento?.gi === gi
                  return <span key={id} className={`ficha${bloqueado && !ocultarFeedback ? (correcto ? ' ok' : ' mal') : ''}`}><InteractionText text={elemento?.e ?? ''} region={`classify:${id}`}/></span>
                })}
                {!Object.values(asig).includes(gi) && <span className="mini">{tx('Selecciona un elemento y toca este grupo.', 'Select an item, then choose this group.')}</span>}
              </div>
            </AnswerChoice>
          </div>
        ))}
      </div>
      <div className="fila" style={{ marginTop: 12 }}>
        <button className="btn principal" onClick={enviar} disabled={bloqueado || Object.keys(asig).length !== total}>{tx('Comprobar clasificación', 'Submit answer')}</button>
        <button className="btn fantasma pequeno" onClick={() => { setAsig({}); setActivo(null) }} disabled={bloqueado}>{tx('Reiniciar', 'Reset')}</button>
      </div>
    </div>
  )
}

const CON_FORMATO_PROPIO = ['opcion_multiple', 'caso_clinico', 'verdadero_falso', 'numerico',
  'prediccion_direccional', 'secuencia', 'relacionar', 'clasificar']

/** Cierto cuando la pregunta se responde escribiendo una palabra o frase corta. */
export function usaTextoLibre(c: Concepto): boolean {
  return !CON_FORMATO_PROPIO.includes(c.interaccion.recomendada) && esRespuestaBreve(c.respuesta_canonica)
}

export function Interaccion(props: Props) {
  return <DraftContext.Provider value={{ draft: props.draft, onDraft: props.onDraft, english: props.english, renderText: props.renderText }}><InteractionBody {...props}/></DraftContext.Provider>
}
function InteractionBody(props: Props) {
  switch (props.c.interaccion.recomendada) {
    case 'opcion_multiple': case 'caso_clinico': case 'verdadero_falso': return <Opciones {...props} />
    case 'numerico': return <Numerico {...props} />
    case 'prediccion_direccional': return <Direccional {...props} />
    case 'secuencia': return <Secuencia {...props} />
    case 'relacionar': return <Relacionar {...props} />
    case 'clasificar': return <Clasificar {...props} />
    default: return usaTextoLibre(props.c) ? <Texto {...props} /> : <RevisionSinEvaluacion {...props} />
  }
}

/** Protección para material antiguo sin una pregunta breve u opciones verificables. */
function RevisionSinEvaluacion({ c, bloqueado, onResponder }: Props) {
  const tx = useCopy()
  return <div className="pila">
    <p>Esta pregunta necesita una evaluación más precisa. Puedes consultar la explicación y continuar; no se contará como acierto ni fallo.</p>
    <button className="btn" disabled={bloqueado} onClick={() => onResponder({
      veredicto: 'revision', tipoError: 'error_por_revisar', recuperacionActiva: false,
      respuestaDada: 'Consulta de una pregunta pendiente de evaluación', detalle: c.explicacion,
    })}>{tx('Consultar explicación', 'Read explanation')}</button>
  </div>
}

/** Escritura correctiva: fijación ortográfica, sólo tras un error de ortografía en un término elegible. */
export function EscrituraCorrectiva({ termino, onHecho }: { termino: string; onHecho: () => void }) {
  const [v, setV] = useState('')
  const ok = normalizar(v) === normalizar(termino)
  return (
    <div className="tarjeta" style={{ marginTop: 14, borderColor: '#f0a63c33', background: '#f0a63c0a' }}>
      <div className="rotulo" style={{ marginBottom: 8 }}>Fijación ortográfica</div>
      <p className="sutil" style={{ marginBottom: 4 }}>Sabías el concepto: falló la escritura. Transcríbelo mientras lo ves.</p>
      <div style={{ fontSize: '1.3rem', fontWeight: 660, letterSpacing: '.01em', margin: '8px 0 12px', color: 'var(--ambar)' }}>{termino}</div>
      <div className="fila" style={{ flexWrap: 'nowrap' }}>
        <input type="text" value={v} autoComplete="off" spellCheck={false} aria-label="Transcribe el término"
          placeholder="Escríbelo aquí…" onChange={e => setV(e.target.value)}
          onKeyDown={intro(() => { if (ok) onHecho() })} />
        <button className="btn principal" disabled={!ok} onClick={onHecho}>{ok ? 'Correcto, continuar' : 'Transcribe'}</button>
      </div>
      <div className="mini" style={{ marginTop: 8 }}>El término volverá a aparecer más adelante sin mostrarse, y su intervalo aumentará cuando puedas escribirlo sin ayuda.</div>
    </div>
  )
}
