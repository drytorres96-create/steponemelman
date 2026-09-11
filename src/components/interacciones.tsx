import { useMemo, useState } from 'react'
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
  const opciones = useMemo(() => mezclar(c.evaluacion.opciones ?? [], semilla ?? c.concept_id), [c, semilla])
  const [elegida, setElegida] = useState<number | null>(null)
  const responder = (i: number) => {
    if (bloqueado) return
    setElegida(i)
    const o = opciones[i]
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
    <div role="radiogroup" aria-label="Opciones de respuesta">
      {opciones.map((o, i) => {
        let cls = 'opcion'
        if (elegida === i) cls += bloqueado && !ocultarFeedback ? (o.correcta ? ' acierto' : ' fallo') : ' elegida'
        else if (bloqueado && !ocultarFeedback && o.correcta) cls += ' correcta-oculta'
        return (
          <button key={i} className={cls} onClick={() => responder(i)} disabled={bloqueado}
                  role="radio" aria-checked={elegida === i}>
            <span className="letra">{LETRAS[i]}</span>
            <span style={{ flex: 1 }}>
              {o.texto}
              {bloqueado && !ocultarFeedback && !o.correcta && o.por_que && <div className="mini" style={{ marginTop: 4 }}>{o.por_que}</div>}
              {bloqueado && !ocultarFeedback && o.correcta && <div className="mini" style={{ marginTop: 4, color: 'var(--verde)' }}>Respuesta correcta</div>}
            </span>
          </button>
        )
      })}
      {resultado && null}
    </div>
  )
}

/* ---------------- recuperación libre / tarjeta / completar ---------------- */
function Texto({ c, bloqueado, onResponder }: Props) {
  const [v, setV] = useState('')
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
    <p className="mini">Una palabra o frase corta. No necesitas explicar el mecanismo por escrito.</p>
    <div className="fila" style={{ gap: 8 }}>
      <input type="text" value={v} disabled={bloqueado} autoComplete="off" autoCapitalize="off" spellCheck={false}
        placeholder="Una palabra o frase corta…" aria-label="Tu respuesta" maxLength={100}
        onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }} />
      <button className="btn principal" onClick={enviar} disabled={bloqueado || !v.trim()}>Comprobar</button>
    </div>
    </div>
  )
}

/* ---------------- numérico ---------------- */
function Numerico({ c, bloqueado, onResponder }: Props) {
  const [v, setV] = useState('')
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
        <input type="text" inputMode="decimal" value={v} disabled={bloqueado} placeholder="Valor…" aria-label="Respuesta numérica"
          onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }} />
        {c.evaluacion.unidad && <span className="etq" style={{ flex: 'none' }}>{c.evaluacion.unidad}</span>}
        <button className="btn principal" onClick={enviar} disabled={bloqueado || !v.trim()}>Comprobar</button>
      </div>
      {c.evaluacion.tolerancia != null && <div className="mini" style={{ marginTop: 6 }}>Tolerancia aceptada: ±{c.evaluacion.tolerancia}</div>}
    </div>
  )
}

/* ---------------- predicción direccional ---------------- */
const SIGNOS = [{ k: 'sube', s: '↑' }, { k: 'baja', s: '↓' }, { k: 'sin_cambio', s: '↔' }] as const
function Direccional({ c, bloqueado, onResponder, ocultarFeedback = false }: Props) {
  const flechas = c.evaluacion.flechas ?? []
  const [sel, setSel] = useState<Record<number, string>>({})
  const completo = flechas.length > 0 && Object.keys(sel).length === flechas.length
  const enviar = () => {
    if (bloqueado || !completo) return
    const aciertos = flechas.filter((f, i) => sel[i] === f.direccion).length
    const ve: Veredicto = aciertos === flechas.length ? 'correcta' : aciertos >= Math.ceil(flechas.length / 2) ? 'parcial' : 'incorrecta'
    onResponder({
      veredicto: ve, tipoError: ve === 'correcta' ? 'ninguno' : 'error_mecanistico', recuperacionActiva: true,
      detalle: ve === 'correcta' ? undefined : `${aciertos} de ${flechas.length} flechas correctas.`,
      respuestaDada: flechas.map((f, i) => `${f.variable}: ${SIGNOS.find(s => s.k === sel[i])?.s ?? '—'}`).join(', '),
    })
  }
  return (
    <div>
      <div className="flechas">
        {flechas.map((f, i) => (
          <div key={i} className="flecha-fila">
            <span>{f.variable}</span>
            <div className="flecha-ops" role="radiogroup" aria-label={f.variable}>
              {SIGNOS.map(s => {
                let cls = ''
                if (bloqueado && !ocultarFeedback) { if (s.k === f.direccion) cls = 'ok'; else if (sel[i] === s.k) cls = 'mal' }
                else if (sel[i] === s.k) cls = 'sel'
                return <button key={s.k} className={cls} disabled={bloqueado} role="radio" aria-checked={sel[i] === s.k}
                  aria-label={`${f.variable} ${s.k === 'sube' ? 'aumenta' : s.k === 'baja' ? 'disminuye' : 'sin cambio'}`}
                  onClick={() => setSel(p => ({ ...p, [i]: s.k }))}>{s.s}</button>
              })}
            </div>
          </div>
        ))}
      </div>
      <button className="btn principal" style={{ marginTop: 12 }} onClick={enviar} disabled={bloqueado || !completo}>Comprobar flechas</button>
    </div>
  )
}

/* ---------------- ordenar secuencia ---------------- */
function Secuencia({ c, bloqueado, onResponder, semilla, ocultarFeedback = false }: Props) {
  const pasos = c.evaluacion.pasos ?? []
  const barajados = useMemo(() => mezclar(pasos.map((p, i) => ({ p, i })), semilla ?? c.concept_id), [c, semilla])
  const [orden, setOrden] = useState<number[]>([])
  const enviar = () => {
    if (bloqueado || orden.length !== pasos.length) return
    const ok = orden.every((v, i) => v === i)
    const desplazados = orden.filter((v, i) => v !== i).length
    onResponder({
      veredicto: ok ? 'correcta' : desplazados <= 2 ? 'parcial' : 'incorrecta',
      tipoError: ok ? 'ninguno' : 'error_secuencia', recuperacionActiva: true,
      detalle: ok ? undefined : `${desplazados} de ${pasos.length} pasos fuera de lugar.`,
      respuestaDada: orden.map(i => pasos[i]).join(' → '),
    })
  }
  return (
    <div>
      <div className="zona" style={{ marginBottom: 10 }}>
        {orden.length === 0 && <span className="mini">Toca los pasos en el orden correcto.</span>}
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {orden.map((idx, pos) => (
            <li key={pos} style={{ marginBottom: 4, color: bloqueado && !ocultarFeedback ? (idx === pos ? 'var(--verde)' : 'var(--rojo)') : undefined }}>
              {pasos[idx]}
            </li>
          ))}
        </ol>
      </div>
      <div className="fichas">
        {barajados.map(({ p, i }) => (
          <button key={i} className={`ficha${orden.includes(i) ? ' sel' : ''}`} disabled={bloqueado || orden.includes(i)}
            onClick={() => setOrden(o => [...o, i])}>{p}</button>
        ))}
      </div>
      <div className="fila" style={{ marginTop: 12 }}>
        <button className="btn principal" onClick={enviar} disabled={bloqueado || orden.length !== pasos.length}>Comprobar orden</button>
        <button className="btn fantasma pequeno" onClick={() => setOrden([])} disabled={bloqueado || !orden.length}>Reiniciar</button>
      </div>
      {bloqueado && !ocultarFeedback && <div className="mini" style={{ marginTop: 10 }}>Orden correcto: {pasos.join(' → ')}</div>}
    </div>
  )
}

/* ---------------- relacionar columnas ---------------- */
function Relacionar({ c, bloqueado, onResponder, semilla, ocultarFeedback = false }: Props) {
  const pares = c.evaluacion.pares ?? []
  const derechas = useMemo(() => mezclar(pares.map((p, i) => ({ t: p.derecha, i })), (semilla ?? c.concept_id) + 'd'), [c, semilla])
  const [activo, setActivo] = useState<number | null>(null)
  const [enlaces, setEnlaces] = useState<Record<number, number>>({})
  const enlaceCorrecto = (i: number) => pares[enlaces[i]]?.derecha === pares[i]?.derecha
  const enviar = () => {
    if (bloqueado || Object.keys(enlaces).length !== pares.length) return
    // Dos fichas derechas con el mismo texto son equivalentes aunque sus índices difieran.
    const aciertos = pares.filter((_, i) => enlaceCorrecto(i)).length
    const ok = aciertos === pares.length
    onResponder({
      veredicto: ok ? 'correcta' : aciertos >= Math.ceil(pares.length / 2) ? 'parcial' : 'incorrecta',
      tipoError: ok ? 'ninguno' : 'confusion_conceptos', recuperacionActiva: true,
      detalle: ok ? undefined : `${aciertos} de ${pares.length} parejas correctas.`,
      respuestaDada: pares.map((p, i) => `${p.izquierda} → ${pares[enlaces[i]]?.derecha ?? '—'}`).join('; '),
    })
  }
  return (
    <div>
      <div className="rejilla r2" style={{ gap: 10 }}>
        <div className="pila" style={{ gap: 6 }}>
          <div className="rotulo">Columna A</div>
          {pares.map((p, i) => {
            let cls = 'ficha'
            if (activo === i) cls += ' sel'
            if (bloqueado && !ocultarFeedback) cls += enlaceCorrecto(i) ? ' ok' : ' mal'
            return <button key={i} className={cls} disabled={bloqueado} style={{ textAlign: 'left' }}
              onClick={() => setActivo(i)}>{p.izquierda}
              {enlaces[i] != null && <div className="mini">→ {pares[enlaces[i]].derecha}</div>}</button>
          })}
        </div>
        <div className="pila" style={{ gap: 6 }}>
          <div className="rotulo">Columna B</div>
          {derechas.map(({ t, i }) => (
            <button key={i} className="ficha" style={{ textAlign: 'left' }}
              disabled={bloqueado || activo === null || Object.values(enlaces).includes(i)}
              onClick={() => { if (activo !== null) { setEnlaces(e => ({ ...e, [activo]: i })); setActivo(null) } }}>{t}</button>
          ))}
        </div>
      </div>
      <div className="fila" style={{ marginTop: 12 }}>
        <button className="btn principal" onClick={enviar} disabled={bloqueado || Object.keys(enlaces).length !== pares.length}>Comprobar parejas</button>
        <button className="btn fantasma pequeno" onClick={() => { setEnlaces({}); setActivo(null) }} disabled={bloqueado}>Reiniciar</button>
      </div>
      {bloqueado && !ocultarFeedback && <div className="mini" style={{ marginTop: 10 }}>{pares.map(p => `${p.izquierda} → ${p.derecha}`).join(' · ')}</div>}
    </div>
  )
}

/* ---------------- clasificar ---------------- */
function Clasificar({ c, bloqueado, onResponder, semilla, ocultarFeedback = false }: Props) {
  const grupos = c.evaluacion.grupos ?? []
  const elementos = useMemo(
    () => mezclar(grupos.flatMap((g, gi) => g.elementos.map((e, ei) => ({ id: `${gi}:${ei}`, e, gi }))), semilla ?? c.concept_id), [c, semilla])
  const [asig, setAsig] = useState<Record<string, number>>({})
  const [activo, setActivo] = useState<string | null>(null)
  const total = elementos.length
  const enviar = () => {
    if (bloqueado || Object.keys(asig).length !== total) return
    const aciertos = elementos.filter(({ id, gi }) => asig[id] === gi).length
    const ok = aciertos === total
    onResponder({
      veredicto: ok ? 'correcta' : aciertos >= Math.ceil(total * 0.6) ? 'parcial' : 'incorrecta',
      tipoError: ok ? 'ninguno' : 'confusion_conceptos', recuperacionActiva: true,
      detalle: ok ? undefined : `${aciertos} de ${total} elementos bien clasificados.`,
      respuestaDada: Object.entries(asig).map(([id, g]) => `${elementos.find(x => x.id === id)?.e ?? id}: ${grupos[g]?.nombre}`).join('; '),
    })
  }
  return (
    <div>
      <div className="fichas" style={{ marginBottom: 12 }}>
        {elementos.filter(({ id }) => asig[id] == null).map(({ id, e }) => (
          <button key={id} className={`ficha${activo === id ? ' sel' : ''}`} disabled={bloqueado} onClick={() => setActivo(id)}>{e}</button>
        ))}
      </div>
      <div className="rejilla r2">
        {grupos.map((g, gi) => (
          <div key={gi}>
            <div className="rotulo" style={{ marginBottom: 6 }}>{g.nombre}</div>
            <button className="zona" style={{ width: '100%', textAlign: 'left', cursor: activo ? 'pointer' : 'default', background: '#0b101c' }}
              disabled={bloqueado || !activo}
              onClick={() => { if (activo) { setAsig(a => ({ ...a, [activo]: gi })); setActivo(null) } }}>
              <div className="fichas">
                {Object.entries(asig).filter(([, v]) => v === gi).map(([id]) => {
                  const elemento = elementos.find(x => x.id === id)
                  const correcto = elemento?.gi === gi
                  return <span key={id} className={`ficha${bloqueado && !ocultarFeedback ? (correcto ? ' ok' : ' mal') : ''}`}>{elemento?.e}</span>
                })}
                {!Object.values(asig).includes(gi) && <span className="mini">Selecciona un elemento y toca este grupo.</span>}
              </div>
            </button>
          </div>
        ))}
      </div>
      <div className="fila" style={{ marginTop: 12 }}>
        <button className="btn principal" onClick={enviar} disabled={bloqueado || Object.keys(asig).length !== total}>Comprobar clasificación</button>
        <button className="btn fantasma pequeno" onClick={() => { setAsig({}); setActivo(null) }} disabled={bloqueado}>Reiniciar</button>
      </div>
    </div>
  )
}

export function Interaccion(props: Props) {
  switch (props.c.interaccion.recomendada) {
    case 'opcion_multiple': case 'caso_clinico': case 'verdadero_falso': return <Opciones {...props} />
    case 'numerico': return <Numerico {...props} />
    case 'prediccion_direccional': return <Direccional {...props} />
    case 'secuencia': return <Secuencia {...props} />
    case 'relacionar': return <Relacionar {...props} />
    case 'clasificar': return <Clasificar {...props} />
    default: return esRespuestaBreve(props.c.respuesta_canonica) ? <Texto {...props} /> : <RevisionSinEvaluacion {...props} />
  }
}

/** Protección para material antiguo sin una pregunta breve u opciones verificables. */
function RevisionSinEvaluacion({ c, bloqueado, onResponder }: Props) {
  return <div className="pila">
    <p>Esta pregunta necesita una evaluación más precisa. Puedes consultar la explicación y continuar; no se contará como acierto ni fallo.</p>
    <button className="btn" disabled={bloqueado} onClick={() => onResponder({
      veredicto: 'revision', tipoError: 'error_por_revisar', recuperacionActiva: false,
      respuestaDada: 'Consulta de una pregunta pendiente de evaluación', detalle: c.explicacion,
    })}>Consultar explicación</button>
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
          onKeyDown={e => { if (e.key === 'Enter' && ok) onHecho() }} />
        <button className="btn principal" disabled={!ok} onClick={onHecho}>{ok ? 'Correcto, continuar' : 'Transcribe'}</button>
      </div>
      <div className="mini" style={{ marginTop: 8 }}>El término volverá a aparecer más adelante sin mostrarse, y su intervalo aumentará cuando puedas escribirlo sin ayuda.</div>
    </div>
  )
}
