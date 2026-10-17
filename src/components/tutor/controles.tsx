import { forwardRef, type ButtonHTMLAttributes, type PointerEvent } from 'react'

/**
 * El brillo perlado de los botones terracota nace del punto donde se toca: las coordenadas
 * relativas quedan en --px/--py y el CSS dibuja el degradado radial. Funciona igual con ratón
 * que con el dedo (pointerdown), sin depender de que exista el cursor.
 */
function brillo(e: PointerEvent<HTMLElement>) {
  const caja = e.currentTarget.getBoundingClientRect()
  if (!caja.width || !caja.height) return
  e.currentTarget.style.setProperty('--px', `${Math.round(((e.clientX - caja.left) / caja.width) * 100)}%`)
  e.currentTarget.style.setProperty('--py', `${Math.round(((e.clientY - caja.top) / caja.height) * 100)}%`)
}

export const manejadoresBrillo = { onPointerMove: brillo, onPointerDown: brillo, onPointerEnter: brillo }

type PropsBoton = ButtonHTMLAttributes<HTMLButtonElement>

/** Acción principal: terracota, la única superficie de este panel que lleva ese color. */
export const BotonCoral = forwardRef<HTMLButtonElement, PropsBoton>(function BotonCoral({ className = '', type = 'button', ...resto }, ref) {
  return <button ref={ref} type={type} className={`tutor-btn tutor-btn--coral ${className}`.trim()} {...manejadoresBrillo} {...resto} />
})

/** Acción secundaria: cápsula salvia, discreta. */
export function BotonSalvia({ className = '', type = 'button', ...resto }: PropsBoton) {
  return <button type={type} className={`tutor-btn tutor-btn--salvia ${className}`.trim()} {...resto} />
}

export const Marca = ({ tamano = 16 }: { tamano?: number }) => <svg className="tutor-ico" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>

export const Cruz = ({ tamano = 16 }: { tamano?: number }) => <svg className="tutor-ico" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17" /></svg>

export const Flecha = ({ tamano = 16 }: { tamano?: number }) => <svg className="tutor-ico tutor-ico--flecha" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>

export const Chevron = ({ tamano = 14 }: { tamano?: number }) => <svg className="tutor-ico" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>

export const Enviar = ({ tamano = 18 }: { tamano?: number }) => <svg className="tutor-ico tutor-ico--enviar" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>

export const Ampliar = ({ tamano = 16, reducir = false }: { tamano?: number; reducir?: boolean }) => <svg className="tutor-ico" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  {reducir ? <path d="M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5" /> : <path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" />}</svg>

export const Bombilla = ({ tamano = 15 }: { tamano?: number }) => <svg className="tutor-ico" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></svg>

export const Engranes = ({ tamano = 15 }: { tamano?: number }) => <svg className="tutor-ico" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h8m4 0h4M4 17h4m4 0h8M12 4v6M8 14v6" /></svg>

export const Llave = ({ tamano = 15 }: { tamano?: number }) => <svg className="tutor-ico" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 3 3" /></svg>

export const Diana = ({ tamano = 15 }: { tamano?: number }) => <svg className="tutor-ico" width={tamano} height={tamano} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>
