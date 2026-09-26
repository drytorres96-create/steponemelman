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

/*
 * Una sola piel para toda la sesión. La montan a la vez el recorrido (cajas o lo
 * nuevo) y, dentro, cada reproductor de conceptos; al pasar de un concepto a una
 * pregunta NBME el reproductor se desmonta, y si se llevara la piel consigo la
 * pantalla cambiaría de color a mitad de sesión. Por eso se cuenta cuántas pantallas
 * la tienen montada y sólo se retira al salir la última, y todas leen la misma piel.
 */
let elegida: PielEstudio | null = null
let montajes = 0
const oyentes = new Set<() => void>()

/** La piel que se ve: la elegida en esta sesión o, si no se ha tocado, la inicial. */
export function pielVigente(): PielEstudio {
  return elegida ??= pielInicial()
}

export function suscribirPiel(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => { oyentes.delete(oyente) }
}

export function elegirPiel(piel: PielEstudio): void {
  elegida = piel
  guardarPiel(piel)
  if (montajes) aplicarPiel(piel)
  oyentes.forEach(oyente => oyente())
}

/** Viste la ventana mientras la pantalla esté montada; devuelve la función que la desmonta. */
export function montarPiel(): () => void {
  montajes++
  aplicarPiel(pielVigente())
  return () => {
    montajes = Math.max(0, montajes - 1)
    if (montajes) return
    aplicarPiel(null)
    // La próxima sesión vuelve a mirar la preferencia guardada o la del dispositivo.
    elegida = null
  }
}
