import type { Interaccion } from '../schema/concept'
import type { Intento } from './tipos'

/**
 * Cuánta evidencia aporta un acierto contra la hipótesis de que fue suerte.
 *
 * Acertar no prueba lo mismo en todos los formatos. Elegir bien entre dos opciones
 * ocurre la mitad de las veces sin saber nada; escribir de memoria el nombre de una
 * enzima, casi nunca. En vez de un recargo fijo de «+1 acierto si todo fue
 * reconocimiento», cada acierto trae su propia probabilidad de haber salido por
 * azar y el conjunto se multiplica: la evidencia se acumula como probabilidad, no
 * como conteo.
 *
 * Los valores de los formatos abiertos no son cero. Se puede acertar por parecido,
 * por una pista del enunciado o por descarte parcial, así que 0,05 para el recuerdo
 * libre reconoce ese suelo en lugar de fingir certeza absoluta.
 */

/** Probabilidad de acertar sin saberlo, por formato de interacción. */
export const AZAR_POR_FORMATO: Record<Interaccion, number> = {
  recuperacion_libre: 0.05,
  completar: 0.05,
  numerico: 0.05,
  escritura_correctiva: 0.05,
  tarjeta: 0.10,
  caso_clinico: 0.10,
  simulador: 0.10,
  clasificar: 0.15,
  relacionar: 0.15,
  secuencia: 0.15,
  visual: 0.20,
  opcion_multiple: 0.25,
  prediccion_direccional: 1 / 3,
  verdadero_falso: 0.50,
}
/** Un formato que no reconocemos se trata como opción múltiple: ni premia ni castiga de más. */
export const AZAR_POR_DEFECTO = 0.25

/** Un acierto no acreditado como evidencia no mueve la aguja: su azar es 1. */
export const AZAR_NULO = 1

/** Umbral: la racha de aciertos tiene que ser demasiado improbable para ser suerte. */
export const UMBRAL_AZAR = 0.01

export function azarDeIntento(i: Intento): number {
  // La aplicación de un caso nuevo se juzga por el caso, no por el formato con que se presentó.
  if (i.tipo_evidencia === 'aplicacion') return 0.10
  // Un recuerdo libre registrado como tal manda sobre el rótulo de la interacción.
  if (i.recuperacion_activa && i.tipo_evidencia === 'recuerdo') return 0.05
  return AZAR_POR_FORMATO[i.interaccion as Interaccion] ?? AZAR_POR_DEFECTO
}

/**
 * Probabilidad de que toda la evidencia vigente sea casualidad. Sin aciertos es 1:
 * no haber respondido nunca no es evidencia de saber.
 */
export function azarAcumulado(aciertos: Intento[]): number {
  return aciertos.reduce((p, i) => p * azarDeIntento(i), 1)
}

/** `0,39 %` — la cifra se enseña, así que se formatea donde se calcula. */
export function porcentajeAzar(p: number): string {
  if (p >= 0.01) return `${(p * 100).toFixed(1)} %`
  if (p >= 0.0001) return `${(p * 100).toFixed(2)} %`
  return '< 0,01 %'
}
