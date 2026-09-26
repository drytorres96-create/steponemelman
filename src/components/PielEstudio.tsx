import { useEffect, useSyncExternalStore } from 'react'
import { contraria, elegirPiel, montarPiel, pielVigente, suscribirPiel, type PielEstudio } from '../lib/piel-estudio'

/**
 * Aplica la piel de concentración mientras la pantalla esté montada y la retira al
 * salir la última que la usa. La montan el recorrido de las cajas y de lo nuevo, el
 * reproductor de conceptos y el panel de foco; ninguna otra vista.
 */
export function usePielEstudio() {
  const piel = useSyncExternalStore(suscribirPiel, pielVigente, pielVigente)
  useEffect(() => montarPiel(), [])
  return { piel, alternar: () => elegirPiel(contraria(pielVigente())) }
}

const Luna = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
</svg>

const Sol = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="4" />
  <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
</svg>

/** Conmutador de la piel: dice adónde va, no dónde está. */
export function BotonPiel({ piel, alternar }: { piel: PielEstudio; alternar: () => void }) {
  const aNoche = piel === 'claro'
  const texto = aNoche ? 'Modo noche' : 'Modo día'
  return <button type="button" className="btn pequeno fantasma piel-boton" onClick={alternar}
    aria-label={`Cambiar al ${texto.toLowerCase()}`} title={`Cambiar al ${texto.toLowerCase()}`}>
    {aNoche ? <Luna /> : <Sol />}<span className="piel-boton-texto">{texto}</span>
  </button>
}
