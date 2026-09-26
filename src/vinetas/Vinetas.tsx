import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { usePielEstudio } from '../components/PielEstudio'
import { PausaSugerida, PAUSA_CADA } from '../components/PausaSugerida'
import { cargarVinetas, type CargaVinetas } from './api'
import { DISCIPLINAS_VINETAS, guardarProgresoVinetas, leerProgresoVinetas, seleccionar,
  type FiltroVinetas, type ProgresoVinetas, type Vineta } from './modelo'
import '../nbme/nbme.css'
import './vinetas.css'

/** El progreso del piloto es de esta cuenta y de este navegador. */
function useCuenta(): string {
  const { user } = useAuth()
  return user?.id ?? 'sin-cuenta'
}

const ETIQUETA_IA = 'Generada por IA · sin revisión clínica'

/** La entrada del piloto dentro de «Elegir contenido». */
export function VinetasInicio({ onEmpezar }: { onEmpezar: (vinetas: Vineta[]) => void }) {
  const cuenta = useCuenta()
  const [carga, setCarga] = useState<CargaVinetas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progreso] = useState<ProgresoVinetas>(() => leerProgresoVinetas(cuenta))
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    setError(null)
    cargarVinetas().then(c => { if (vivo) setCarga(c) }).catch(e => { if (vivo) setError(e instanceof Error ? e.message : String(e)) })
    return () => { vivo = false }
  }, [intento])

  const abrir = (filtro: FiltroVinetas) => { if (carga) onEmpezar(seleccionar(carga.vinetas, progreso, filtro)) }
  const cuantas = (filtro: FiltroVinetas) => carga ? seleccionar(carga.vinetas, progreso, filtro).length : 0

  return <section className="tarjeta pila vinetas-inicio" aria-labelledby="vinetas-titulo">
    <div><span className="etq ambar">Piloto · generadas por IA</span>
      <h2 id="vinetas-titulo" style={{ marginTop: 10 }}>Viñetas de mecanismo</h2></div>
    <p>Casos cortos en inglés, al estilo NBME, hechos por IA a partir de tus conceptos de bioquímica y
      microbiología. La explicación va en español: las claves del caso, el mecanismo paso a paso, por qué no
      las otras y el patrón para reconocerlo la próxima vez.</p>
    <div className="aviso"><span>⚠</span><div>Sin revisión clínica. Si algo no cuadra con tu material, manda tu
      material: márcala como dudosa. No cuentan para Hoy ni para el dominio.</div></div>
    {error && <div className="pila" role="alert"><p>{error}</p>
      <div><button className="btn" onClick={() => setIntento(n => n + 1)}>Volver a intentar</button></div></div>}
    {!carga && !error && <p className="sutil" role="status">Cargando las viñetas…</p>}
    {carga && <>
      {carga.desdeCopia && <p className="mini">Sin conexión: usas la copia guardada en este dispositivo.</p>}
      {!carga.vinetas.length && <p className="sutil">Todavía no hay viñetas publicadas.</p>}
      <div className="vinetas-disciplinas">
        {DISCIPLINAS_VINETAS.map(disciplina => {
          const total = carga.vinetas.filter(v => v.discipline === disciplina).length
          const pendientes = cuantas(disciplina)
          if (!total) return null
          return <div key={disciplina} className="vinetas-disciplina">
            <p><b>{disciplina}</b> <span className="sutil">· {total - pendientes} de {total} hechas</span></p>
            <button className="btn principal" disabled={!pendientes} onClick={() => abrir(disciplina)}>
              {pendientes ? `Empezar ${disciplina.toLowerCase()} (${pendientes})` : 'Hechas todas'}</button>
          </div>
        })}
      </div>
      <div className="fila">
        {cuantas('todas') > 0 && <button className="btn" onClick={() => abrir('todas')}>Todas las pendientes ({cuantas('todas')})</button>}
        {cuantas('falladas') > 0 && <button className="btn fantasma" onClick={() => abrir('falladas')}>Repasar las falladas ({cuantas('falladas')})</button>}
        {cuantas('dudosas') > 0 && <button className="btn fantasma" onClick={() => abrir('dudosas')}>Ver las dudosas ({cuantas('dudosas')})</button>}
      </div>
    </>}
  </section>
}

/**
 * Una viñeta tras otra. Con el teclado: la letra elige, Intro comprueba y el foco pasa a
 * «Siguiente viñeta», así que otro Intro sigue. La respuesta se guarda al comprobarla.
 */
export function VinetasSesion({ vinetas, onSalir }: { vinetas: Vineta[]; onSalir: () => void }) {
  usePielEstudio()
  const cuenta = useCuenta()
  const [progreso, setProgreso] = useState<ProgresoVinetas>(() => leerProgresoVinetas(cuenta))
  const [cursor, setCursor] = useState(0)
  const [eleccion, setEleccion] = useState<string | null>(null)
  const [corregida, setCorregida] = useState(false)
  const [aciertos, setAciertos] = useState(0)
  const [pausa, setPausa] = useState(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const siguiente = useRef<HTMLButtonElement>(null)
  const vineta = vinetas[cursor] as Vineta | undefined

  const actualizar = useCallback((cambio: (p: ProgresoVinetas) => ProgresoVinetas) => {
    setProgreso(previo => {
      const nuevo = cambio(previo)
      guardarProgresoVinetas(cuenta, nuevo)
      return nuevo
    })
  }, [cuenta])

  const comprobar = useCallback(() => {
    if (!vineta || !eleccion || corregida) return
    const correcta = eleccion === vineta.answer
    actualizar(p => ({ ...p, respuestas: { ...p.respuestas, [vineta.id]: { opcion: eleccion, correcta, ts: Date.now() } } }))
    if (correcta) setAciertos(n => n + 1)
    setCorregida(true)
  }, [vineta, eleccion, corregida, actualizar])

  const avanzar = () => {
    const proximo = cursor + 1
    // Veinte seguidas y quedan más: un respiro, igual que en las cajas.
    if (proximo % PAUSA_CADA === 0 && proximo < vinetas.length) setPausa(true)
    setCursor(proximo)
    setEleccion(null)
    setCorregida(false)
  }

  useEffect(() => {
    if (pausa || !vineta) return
    if (corregida) { siguiente.current?.focus({ preventScroll: true }); return }
    // Al abrir la vista, la aplicación enfoca su zona principal justo después: se espera un instante.
    const espera = setTimeout(() => titulo.current?.focus(), 0)
    return () => clearTimeout(espera)
  }, [cursor, corregida, pausa, vineta])

  useEffect(() => {
    if (!vineta || pausa) return
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat || corregida) return
      if (e.target instanceof Element && e.target.closest('textarea, input:not([type="radio"]), select, [contenteditable="true"]')) return
      if (e.key === 'Enter') {
        if (!eleccion || (e.target instanceof Element && e.target.closest('button, a, summary'))) return
        // Se consume: si no, la misma pulsación activaría «Siguiente viñeta», que recibe el foco.
        e.preventDefault()
        comprobar()
        return
      }
      const opcion = vineta.options.find(o => o.id === e.key.toUpperCase())
      if (opcion) { e.preventDefault(); setEleccion(opcion.id) }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [vineta, eleccion, corregida, pausa, comprobar])

  if (pausa) return <PausaSugerida hechos={cursor} onSeguir={() => setPausa(false)} onParar={onSalir} etiquetaParar="Parar por ahora" />

  if (!vineta) return <section className="tarjeta pila" aria-labelledby="vinetas-fin">
    <div><span className="etq verde">Viñetas hechas</span><h2 id="vinetas-fin" style={{ marginTop: 10 }}>
      {vinetas.length ? `Respondiste ${vinetas.length}: ${aciertos} correctas.` : 'No hay viñetas en este grupo.'}</h2></div>
    <p className="sutil">Las falladas y las dudosas quedan en «Elegir contenido → Viñetas» para repasarlas cuando quieras.</p>
    <div><button className="btn principal" onClick={onSalir}>Volver a las viñetas</button></div>
  </section>

  const respuestaCorrecta = vineta.options.find(o => o.id === vineta.answer)!
  const acierto = eleccion === vineta.answer
  const dudosa = progreso.dudosas[vineta.id] !== undefined
  const enviar = (e: FormEvent) => { e.preventDefault(); comprobar() }

  return <div className="nbme-player pila vinetas-sesion">
    <header className="nbme-player-header paso vinetas-cabecera">
      <p className="sutil">{cursor + 1} de {vinetas.length} · {vineta.discipline}</p>
      <button className="btn fantasma" onClick={onSalir}>Salir</button>
    </header>
    <progress className="sesion-mixta-progreso" aria-label="Viñetas respondidas" value={cursor + (corregida ? 1 : 0)} max={vinetas.length} />
    <section className="tarjeta nbme-question" aria-labelledby="vineta-titulo">
      <h1 id="vineta-titulo" className="nbme-question-heading" tabIndex={-1} ref={titulo}>Viñeta de mecanismo</h1>
      <p className="mini"><span className="etq ambar">{ETIQUETA_IA}</span> <span>{vineta.topic}</span></p>
      <div className="nbme-stem" lang="en"><p className="nbme-stem-parrafo">{vineta.stem}</p>
        <p className="nbme-stem-parrafo">{vineta.question}</p></div>
      <form onSubmit={enviar}>
        <fieldset className="nbme-options" disabled={corregida}>
          <legend>Selecciona una respuesta</legend>
          {vineta.options.map(opcion => {
            const elegida = eleccion === opcion.id
            const buena = corregida && opcion.id === vineta.answer
            const mala = corregida && elegida && !acierto
            return <label key={opcion.id} className={`nbme-option${elegida ? ' selected' : ''}${buena ? ' correct' : ''}${mala ? ' incorrect' : ''}`}>
              <input type="radio" name={`vineta-${vineta.id}`} value={opcion.id} checked={elegida} onChange={() => setEleccion(opcion.id)} />
              <span className="nbme-option-letter">{opcion.id}.</span><span className="nbme-option-text" lang="en">{opcion.text}
                {buena && <span className="nbme-option-state" lang="es">Respuesta correcta</span>}
                {mala && <span className="nbme-option-state" lang="es">Tu respuesta</span>}</span>
            </label>
          })}
        </fieldset>
        {!corregida && <><p className="mini" style={{ marginTop: 10 }}>También puedes elegir con la letra y comprobar con Intro.</p>
          <div className="nbme-actions" style={{ marginTop: 16 }}><button className="btn principal" type="submit" disabled={!eleccion}>Comprobar respuesta</button></div></>}
      </form>
    </section>

    {corregida && <section className={`tarjeta nbme-feedback pila ${acierto ? 'correct' : 'incorrect'}`} aria-labelledby="vineta-retro">
      <div><h2 id="vineta-retro">{acierto ? 'Correcto' : `No: la respuesta es ${vineta.answer}`}</h2>
        <p className="nbme-respuesta" role="status"><b>{vineta.answer}.</b> <span lang="en">{respuestaCorrecta.text}</span></p></div>
      {!acierto && eleccion && <p className="vinetas-tu-opcion"><b>Tu opción, {eleccion}:</b> {vineta.explanation.distractors[eleccion]}</p>}
      <div><h3>Claves del caso</h3><ul className="vinetas-lista">{vineta.explanation.clues.map(c => <li key={c}>{c}</li>)}</ul></div>
      <div><h3>Mecanismo</h3><ol className="vinetas-cadena">{vineta.explanation.mechanism.map(m => <li key={m}>{m}</li>)}</ol></div>
      <p className="vinetas-patron"><b>Patrón:</b> {vineta.explanation.pattern}</p>
      <details className="nbme-details"><summary>Por qué no las otras</summary>
        <div className="pila nbme-distractores">{vineta.options.filter(o => o.id !== vineta.answer).map(o => <div key={o.id} className="nbme-distractor">
          <b>{o.id}. <span lang="en">{o.text}</span></b><p>{vineta.explanation.distractors[o.id]}</p></div>)}</div>
      </details>
      <p className="mini">Concepto de origen: {vineta.concept}</p>
      <div className="nbme-actions">
        <button ref={siguiente} className="btn principal" onClick={avanzar}>{cursor + 1 < vinetas.length ? 'Siguiente viñeta' : 'Terminar'}</button>
        <button className="btn fantasma" aria-pressed={dudosa} onClick={() => actualizar(p => {
          const dudosas = { ...p.dudosas }
          if (dudosas[vineta.id] !== undefined) delete dudosas[vineta.id]
          else dudosas[vineta.id] = Date.now()
          return { ...p, dudosas }
        })}>{dudosa ? 'Marcada como dudosa' : 'Marcar como dudosa'}</button>
      </div>
    </section>}
  </div>
}
