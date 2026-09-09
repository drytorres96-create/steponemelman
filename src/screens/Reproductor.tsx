import { useCallback, useEffect, useRef, useState } from 'react'
import type { Concepto } from '../schema/concept'
import { NOMBRE_INTERACCION } from '../schema/concept'
import { useApp } from '../store/estado'
import { Interaccion, EscrituraCorrectiva, type Resultado } from '../components/interacciones'
import { Modal, PanelFuente, EtiquetaEstado } from '../components/comunes'
import { NOMBRE_ERROR, type Intento, type TipoError } from '../srs/tipos'
import { evaluarDominio } from '../srs/mastery'
import { calificacionEfectiva, intervalo } from '../srs/fsrs'
import { crearUUID } from '../store/model'
import { reinsertarTrasFallo } from '../lib/cola'

export interface Cola { titulo: string; subtitulo: string; ruta: string; modulo: string; conceptos: Concepto[]; sessionId?: string }

/** Enseñanza previa: se elige por el tipo de conocimiento, no siempre la misma. */
function modoEnsenanza(c: Concepto): 'mecanismo' | 'comparacion' | 'explicacion' | 'directo' {
  const t = c.clasificacion.tipo_conocimiento
  if (t === 'Diagnóstico' || t === 'Hallazgo clínico' || t === 'Patrón visual') return 'directo'
  if (t === 'Mecanismo' || t === 'Secuencia' || t === 'Relación causa-efecto' || t === 'Algoritmo') return 'mecanismo'
  if (t === 'Comparación') return 'comparacion'
  return 'explicacion'
}

const formatoIntervalo = (dias: number) =>
  dias < 1 / 24 ? `${Math.round(dias * 1440)} min` : dias < 1 ? `${Math.round(dias * 24)} h`
  : dias < 30 ? `${Math.round(dias)} d` : `${(dias / 30).toFixed(1)} meses`

export function Reproductor({ cola, onSalir, indiceInicial = 0 }:
  { cola: Cola; onSalir: () => void; indiceInicial?: number }) {
  const { registrarIntento, progresoDe, estado, guardarReanudable, iniciarSesion, cerrarSesion } = useApp()
  const [orden, setOrden] = useState<Concepto[]>(cola.conceptos)
  const [i, setI] = useState(indiceInicial)
  const [fase, setFase] = useState<'ensenanza' | 'tarea' | 'retro' | 'ortografia'>('tarea')
  const [pistas, setPistas] = useState(0)
  const [res, setRes] = useState<Resultado | null>(null)
  const [verFuente, setVerFuente] = useState(false)
  const [confianza, setConfianza] = useState<1 | 2 | 3 | null>(null)
  const t0 = useRef(Date.now())
  const sesionId = useRef<string | null>(cola.sessionId ?? null)
  const anterior = estado.sesiones.find(s => s.id === cola.sessionId)
  const intentosAnteriores = cola.sessionId ? Object.values(estado.progreso).flatMap(p => p.intentos).filter(t => t.session_id === cola.sessionId) : []
  const acum = useRef({
    vistos: Math.max(anterior?.vistos ?? 0, intentosAnteriores.length),
    correctos: Math.max(anterior?.correctos ?? 0, intentosAnteriores.filter(t => t.resultado === 'correcta' || t.resultado === 'ortografia').length),
    ms: Math.max(anterior?.ms ?? 0, intentosAnteriores.reduce((n, t) => n + t.ms, 0)),
  })

  const c = orden[i]

  useEffect(() => { if (!sesionId.current) sesionId.current = iniciarSesion(cola.modulo, cola.ruta) }, [cola, iniciarSesion])
  useEffect(() => {
    if (!c) return
    const p = progresoDe(c.concept_id)
    setFase(p.intentos.length === 0 && modoEnsenanza(c) !== 'directo' ? 'ensenanza' : 'tarea')
    setPistas(0); setRes(null); setConfianza(null); t0.current = Date.now()
    guardarReanudable({
      modulo: cola.modulo, sesion: cola.ruta, indice: i, ts: Date.now(),
      conceptIds: orden.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      ...(sesionId.current ? { sessionId: sesionId.current } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, c?.concept_id, orden])

  const terminar = useCallback(() => {
    if (sesionId.current) cerrarSesion(sesionId.current, acum.current)
    guardarReanudable(null); onSalir()
  }, [cerrarSesion, guardarReanudable, onSalir])

  const pausar = useCallback(() => {
    if (sesionId.current) cerrarSesion(sesionId.current, acum.current)
    guardarReanudable({
      modulo: cola.modulo, sesion: cola.ruta, indice: i, ts: Date.now(),
      conceptIds: orden.map(x => x.concept_id), titulo: cola.titulo, subtitulo: cola.subtitulo,
      ...(sesionId.current ? { sessionId: sesionId.current } : {}),
    })
    onSalir()
  }, [cerrarSesion, guardarReanudable, onSalir, cola, i, orden])

  const responder = (r: Resultado) => {
    let tipo: TipoError = r.tipoError
    if (r.veredicto === 'correcta' && pistas >= 2) tipo = 'correcta_con_pistas'
    else if (r.veredicto === 'correcta' && confianza === 1) tipo = 'correcta_baja_confianza'
    else if (r.veredicto === 'incorrecta' && confianza === 3) tipo = 'incorrecta_exceso_confianza'
    setRes({ ...r, tipoError: tipo })
    setFase('retro')
    acum.current.vistos++
    if (r.veredicto === 'correcta' || r.veredicto === 'ortografia') acum.current.correctos++
  }

  const calificar = (g: 1 | 2 | 3 | 4) => {
    if (!c || !res) return
    const ms = Date.now() - t0.current
    acum.current.ms += ms
    const intento: Intento = {
      attempt_id: crearUUID(), session_id: sesionId.current, ts: Date.now(), calificacion: g, resultado: res.veredicto,
      interaccion: c.interaccion.recomendada,
      recuperacion_activa: res.recuperacionActiva, pistas_usadas: pistas, ms,
      tipo_error: res.tipoError, confianza_declarada: confianza,
    }
    registrarIntento(c.concept_id, intento)

    // reintroducir el fallo varios ítems después, no de forma mecánica inmediata
    let longitudSiguiente = orden.length
    if (res.veredicto === 'incorrecta') {
      const copia = reinsertarTrasFallo(orden, i, 3 + Math.floor(Math.random() * 3))
      longitudSiguiente = copia.length; setOrden(copia)
    }
    if (res.tipoError === 'error_ortografico' && c.escritura_correctiva.elegible && c.escritura_correctiva.termino) {
      setFase('ortografia'); return
    }
    avanzar(longitudSiguiente)
  }
  const avanzar = (longitud = orden.length) => { if (i + 1 >= longitud) terminar(); else setI(i + 1) }

  if (!c) return null
  const p = progresoDe(c.concept_id)
  const ev = evaluarDominio(p, estado.criterios)
  const modo = modoEnsenanza(c)

  return (
    <div className="reproductor pila">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <div className="fila" style={{ gap: 8 }}>
          <span className={`etq d-${c.clasificacion.disciplina_primaria.replace(/ /g, '\\ ')}`}>
            <i className="punto-d" /> {c.clasificacion.disciplina_primaria}
          </span>
          <span className="etq">{c.clasificacion.sistema_primario}</span>
          <span className="etq violeta">{NOMBRE_INTERACCION[c.interaccion.recomendada]}</span>
          <EtiquetaEstado estado={p.estado} />
        </div>
        <button className="btn pequeno fantasma" onClick={pausar}>Pausar sesión</button>
      </div>

      <div className="avance" aria-label={`Ítem ${i + 1} de ${orden.length}`}>
        {orden.map((_, k) => <i key={k} className={k < i ? 'hecho' : k === i ? 'actual' : ''} />)}
      </div>

      <div className="tarea">
        {fase === 'ensenanza' && (
          <div>
            <div className="rotulo" style={{ marginBottom: 10 }}>
              {modo === 'mecanismo' ? 'Mecanismo paso a paso' : modo === 'comparacion' ? 'Comparación' : 'Antes de recuperar'}
            </div>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.55 }}>{c.afirmacion}</p>
            <p className="sutil">{c.explicacion}</p>
            {c.patron && <div className="pista" style={{ borderColor: 'var(--oro)', background: 'var(--oro-tenue)' }}><b>Patrón:</b> {c.patron}</div>}
            {c.confusiones.length > 0 && (
              <p className="mini">Se confunde con: {c.confusiones.join(' · ')}</p>
            )}
            <button className="btn principal" style={{ marginTop: 12 }} onClick={() => { setFase('tarea'); t0.current = Date.now() }}>
              Ahora recupéralo
            </button>
          </div>
        )}

        {fase !== 'ensenanza' && (
          <>
            <div className="pregunta">{c.evaluacion.pregunta}</div>
            {fase === 'tarea' && confianza === null && (
              <div className="fila" style={{ gap: 6, marginBottom: 14 }}>
                <span className="mini">¿Qué tan seguro estás?</span>
                {([[1, 'Poco'], [2, 'Medio'], [3, 'Mucho']] as const).map(([v, t]) => (
                  <button key={v} className="btn pequeno fantasma" onClick={() => setConfianza(v as 1 | 2 | 3)}>{t}</button>
                ))}
              </div>
            )}
            {pistas > 0 && c.pistas.slice(0, pistas).map((t, k) => (
              <div key={k} className="pista"><b>Pista {k + 1}:</b> {t}</div>
            ))}
            <Interaccion key={c.concept_id} c={c} bloqueado={fase !== 'tarea'} resultado={res} onResponder={responder} />
            {fase === 'tarea' && (
              <div className="fila" style={{ marginTop: 14 }}>
                <button className="btn pequeno fantasma" disabled={pistas >= 3} onClick={() => setPistas(pistas + 1)}>
                  {pistas === 0 ? 'Necesito una pista' : pistas < 3 ? `Otra pista (${pistas}/3)` : 'Sin más pistas'}
                </button>
                <button className="btn pequeno fantasma" onClick={() => setVerFuente(true)}>Ver la fuente</button>
              </div>
            )}
          </>
        )}

        {fase === 'retro' && res && (
          <div className={`retro ${res.veredicto === 'correcta' ? 'ok' : res.veredicto === 'incorrecta' ? 'no' : 'parcial'}`}>
            <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <b>{res.veredicto === 'correcta' ? 'Correcto' : res.veredicto === 'parcial' ? 'Parcialmente correcto'
                 : res.veredicto === 'ortografia' ? 'Concepto correcto, ortografía incorrecta' : 'Incorrecto'}</b>
              <span className="etq">{NOMBRE_ERROR[res.tipoError]}</span>
            </div>
            {res.veredicto !== 'correcta' && (
              <p style={{ marginBottom: 6 }}>Respuesta correcta: <b>{c.respuesta_canonica}</b></p>
            )}
            {res.detalle && <p className="sutil" style={{ marginBottom: 6 }}>{res.detalle}</p>}
            <p style={{ marginBottom: 6 }}>{c.explicacion}</p>
            {c.patron && <p style={{ marginBottom: 6 }}><span className="decisiva">Patrón reutilizable</span> · {c.patron}</p>}
            {c.contexto && <p className="sutil" style={{ marginBottom: 6 }}>{c.contexto}</p>}
            {c.relacionados.length > 0 && <p className="mini">Conecta con: {c.relacionados.join(' · ')}</p>}
            <div className="fila" style={{ marginTop: 10 }}>
              <button className="btn pequeno fantasma" onClick={() => setVerFuente(true)}>Abrir la fuente</button>
              <span className="mini">{ev.cumple ? 'Cumple los criterios de dominio' : `${ev.detalle.filter(d => d.cumplido).length}/${ev.detalle.length} criterios de dominio`}</span>
            </div>
            <hr className="sep" />
            <div className="rotulo" style={{ marginBottom: 8 }}>¿Cuándo debe volver a aparecer?</div>
            <div className="escalera">
              {(res.veredicto === 'incorrecta'
                ? [[1, 'Otra vez']] as const
                : res.veredicto === 'parcial' || res.veredicto === 'ortografia'
                  ? [[1, 'Otra vez'], [2, 'Difícil']] as const
                  : [[2, 'Difícil'], [3, 'Bien'], [4, 'Fácil']] as const
              ).map(([g, txt]) => {
                const efectivo = calificacionEfectiva({ resultado: res.veredicto, calificacion: g })
                return (
                  <button key={g} onClick={() => calificar(g)}>
                    <b>{txt}</b>
                    <small>{formatoIntervalo(Math.max(efectivo === 1 ? 0.007 : 0.02, intervalo(efectivo === 1 ? 0.4 : p.estabilidad > 0 ? p.estabilidad * (efectivo === 2 ? 1.2 : efectivo === 3 ? 2.2 : 3.4) : (efectivo === 2 ? 1.2 : efectivo === 3 ? 3.2 : 15.7))))}</small>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {fase === 'ortografia' && c.escritura_correctiva.termino && (
          <EscrituraCorrectiva termino={c.escritura_correctiva.termino} onHecho={avanzar} />
        )}
      </div>

      {verFuente && <Modal titulo="Fuente del concepto" onCerrar={() => setVerFuente(false)}><PanelFuente c={c} /></Modal>}
    </div>
  )
}
