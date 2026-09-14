import { aciertosVigentes, evaluarDominio, type CriteriosDominio } from './mastery'
import type { Intento, ProgresoConcepto } from './tipos'

/**
 * Qué le falta de verdad a un concepto para cruzar el umbral de dominio.
 *
 * Contar aciertos no basta para decir «con uno más lo cierras». El criterio pide
 * además que los aciertos vigentes estén **separados en el tiempo**, y ese reloj
 * no se adelanta respondiendo otra vez: tres aciertos en una tarde siguen siendo
 * una tarde. Distinguir «le falta un acierto» de «le falta esperar» evita mandar
 * a repasar algo que hoy no puede acreditarse por mucho que se acierte.
 *
 * La cercanía no reimplementa las reglas: simula un acierto independiente ahora
 * mismo y le pregunta a `evaluarDominio` qué pasaría.
 */
export interface Cercania {
  /** Ya cumple el umbral con la evidencia que tiene. */
  cumple: boolean
  /** Un acierto independiente registrado ahora lo cruzaría. */
  bastaUnAcierto: boolean
  /** Tiene todo salvo la separación: practicar hoy no lo acerca al umbral. */
  esperandoSeparacion: boolean
  /** Instante a partir del cual la separación deja de bloquear; null si no bloquea. */
  disponibleDesde: number | null
  /** Criterios todavía pendientes, tal como los explica `evaluarDominio`. */
  faltan: string[]
}

/** Acierto limpio de referencia: sin ayudas, recuerdo activo y en una sesión nueva. */
function aciertoSimulado(ahora: number): Intento {
  return {
    attempt_id: 'cercania-simulada', session_id: 'cercania-simulada', ts: ahora,
    calificacion: 3, resultado: 'correcta', interaccion: 'recuperacion_libre',
    recuperacion_activa: true, tipo_evidencia: 'recuerdo',
    pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
    ms: 0, tipo_error: 'ninguno', confianza_declarada: null,
  }
}

export function cercaniaDominio(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): Cercania {
  const actual = evaluarDominio(p, c, ahora)
  const faltan = actual.detalle.filter(d => !d.cumplido).map(d => d.criterio)
  if (actual.cumple) {
    return { cumple: true, bastaUnAcierto: false, esperandoSeparacion: false, disponibleDesde: null, faltan: [] }
  }

  const conUno = evaluarDominio({ ...p, intentos: [...p.intentos, aciertoSimulado(ahora)] }, c, ahora)
  const pendientes = conUno.detalle.filter(d => !d.cumplido)
  const soloSeparacion = pendientes.length === 1 && pendientes[0].clave === 'separacion'

  // El reloj de la separación corre desde el primer acierto que sigue vigente: un
  // acierto nuevo se añade al final y no mueve ese punto de partida.
  const primero = aciertosVigentes(p)[0]
  const disponibleDesde = soloSeparacion && primero
    ? primero.ts + c.separacionHoras * 3_600_000
    : null

  return {
    cumple: false,
    bastaUnAcierto: conUno.cumple,
    esperandoSeparacion: soloSeparacion,
    disponibleDesde,
    faltan,
  }
}
