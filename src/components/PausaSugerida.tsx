import { useEffect, useRef } from 'react'

/** Cada cuántos ítems seguidos se sugiere parar un momento. */
export const PAUSA_CADA = 20

/**
 * Una pausa sugerida entre ítems. No cambia nada de lo que toca hoy ni cuenta como
 * dejarlo: es un respiro que se salta con Intro. Con TDAH, sesenta ítems seguidos sin
 * un corte cuestan más que los mismos sesenta con dos respiros de un minuto.
 */
export function PausaSugerida({ hechos, onSeguir, onParar, etiquetaParar }:
  { hechos: number; onSeguir: () => void; onParar: () => void; etiquetaParar: string }) {
  const seguir = useRef<HTMLButtonElement>(null)
  useEffect(() => { seguir.current?.focus({ preventScroll: true }) }, [])
  return <section className="tarjeta pila pausa-sugerida" aria-labelledby="pausa-titulo">
    <span className="rotulo">Pausa sugerida</span>
    <h2 id="pausa-titulo">Llevas {hechos} seguidos. Buen momento para parar un minuto.</h2>
    <p>Levántate, bebe agua y mira lejos un rato. Todo está guardado: al volver sigues justo aquí.</p>
    <div className="fila">
      <button ref={seguir} className="btn principal" onClick={onSeguir}>Seguir</button>
      <button className="btn fantasma" onClick={onParar}>{etiquetaParar}</button>
    </div>
  </section>
}
