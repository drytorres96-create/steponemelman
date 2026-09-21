/**
 * Piel de las pantallas de concentración.
 *
 * Mientras están abiertos el reproductor de sesión y el panel de foco, la ventana
 * cambia a una paleta propia: papel y tinta de día, noche cálida de noche. El
 * atributo vive en `<html>` solo mientras esas pantallas están montadas, así que el
 * resto de la aplicación conserva su aspecto sin tocar ninguna de sus hojas.
 *
 * La preferencia se guarda en este navegador. No viaja a Supabase: es una decisión
 * del sitio donde se estudia, no del progreso.
 */
export type PielEstudio = 'claro' | 'oscuro'

const CLAVE = 'step1-piel-estudio'

export const ATRIBUTO_PIEL = 'data-piel-estudio'

/** La elección explícita; `null` mientras no se haya tocado el conmutador. */
export function pielGuardada(): PielEstudio | null {
  try {
    const valor = localStorage.getItem(CLAVE)
    return valor === 'claro' || valor === 'oscuro' ? valor : null
  } catch { return null }
}

export function guardarPiel(piel: PielEstudio): void {
  try { localStorage.setItem(CLAVE, piel) } catch { /* la sesión sigue con la piel en memoria */ }
}

/** Sin elección guardada manda el dispositivo: claro de día, oscuro de noche. */
export function pielDelDispositivo(): PielEstudio {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro' } catch { return 'oscuro' }
}

export const pielInicial = (): PielEstudio => pielGuardada() ?? pielDelDispositivo()

export const contraria = (piel: PielEstudio): PielEstudio => piel === 'claro' ? 'oscuro' : 'claro'

/** `null` devuelve la ventana a la piel general de la aplicación. */
export function aplicarPiel(piel: PielEstudio | null): void {
  const raiz = document.documentElement
  if (piel) raiz.setAttribute(ATRIBUTO_PIEL, piel)
  else raiz.removeAttribute(ATRIBUTO_PIEL)
}
