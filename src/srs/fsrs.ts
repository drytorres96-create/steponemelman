/**
 * Planificador de repetición espaciada.
 *
 * Modelo transparente inspirado en FSRS (Free Spaced Repetition Scheduler): cada concepto tiene
 * una **estabilidad** S (días que la memoria aguanta antes de caer a la retención objetivo) y una
 * **dificultad** D (1-10). No usamos la biblioteca oficial para no depender de un paquete externo
 * en tiempo de estudio; los pesos son los del conjunto FSRS-4.5 por defecto, reducidos al
 * subconjunto que necesitamos, y todo el cálculo es auditable desde la propia interfaz.
 *
 * R(t) = (1 + F · t/S)^C   con F = 19/81 y C = -0.5   → retención tras t días
 */
import { intentoCorrecto, type Intento, type ProgresoConcepto, type EstadoDominio } from './tipos'

export const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
                  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898] as const
const F = 19 / 81, C = -0.5
export const DIA = 86_400_000

/**
 * Horizonte del examen. El planificador es un modelo de retención a largo plazo; el examen tiene
 * fecha. Un repaso programado para después del 21-dic-2026 no llega a ocurrir, así que se comprime
 * dentro del horizonte útil en lugar de dejar el concepto sin comprobar.
 */
export const FECHA_EXAMEN = '2026-12-21T08:00:00-05:00'
export const EXAMEN_MS = Date.parse(FECHA_EXAMEN)

/** Último instante en que un repaso todavía sirve: el día anterior al examen. */
export function techoHorizonte(propuesta: number, ahora: number, examen = EXAMEN_MS): number {
  if (!Number.isFinite(examen)) return propuesta
  const limite = examen - DIA
  // Pasado el horizonte, el planificador vuelve a su comportamiento largo sin quedarse
  // atascado programando todo en el pasado.
  if (limite <= ahora) return propuesta
  return Math.min(propuesta, limite)
}

export function retencion(dias: number, estabilidad: number): number {
  if (estabilidad <= 0) return 0
  return Math.pow(1 + F * (dias / estabilidad), C)
}

/** Intervalo (días) para alcanzar la retención objetivo. */
export function intervalo(estabilidad: number, objetivo = 0.9): number {
  return (estabilidad / F) * (Math.pow(objetivo, 1 / C) - 1)
}

const clampD = (d: number) => Math.min(10, Math.max(1, d))

export function dificultadInicial(g: number) { return clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1) }
export function estabilidadInicial(g: number) { return Math.max(0.1, W[Math.min(3, Math.max(0, g - 1))]) }

export function siguienteDificultad(d: number, g: number): number {
  const delta = d - W[6] * (g - 3)
  const media = W[7] * dificultadInicial(4) + (1 - W[7]) * delta
  return clampD(media)
}

export function siguienteEstabilidad(s: number, d: number, r: number, g: number): number {
  if (g === 1) {
    // olvido: la estabilidad cae, pero nunca por debajo de un mínimo útil
    const sPost = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r))
    return Math.max(0.1, Math.min(s, sPost))
  }
  const bonoFacil = g === 4 ? W[16] : 1
  const penalDificil = g === 2 ? W[15] : 1
  const inc = Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1)
  return Math.max(0.1, s * (1 + inc * bonoFacil * penalDificil))
}

export function nuevoProgreso(concept_id: string): ProgresoConcepto {
  return { concept_id, estado: 'nuevo', dificultad: 5, estabilidad: 0, ultimo: null, proxima: null,
           intentos: [], aciertos: 0, fallos: 0, dominado_en: null }
}

/** Ajuste del intervalo según el tipo de error, no sólo según acierto/fallo. */
export function factorPorError(intento: Intento): number {
  switch (intento.tipo_error) {
    case 'error_ortografico': return 0.85          // sabía el concepto: apenas se penaliza
    case 'correcta_con_pistas': return 0.6
    case 'correcta_baja_confianza': return 0.75
    case 'confusion_conceptos': return 0.5         // la confusión necesita volver antes
    case 'incorrecta_exceso_confianza': return 0.4
    default: return 1
  }
}

export function calificacionEfectiva(intento: Pick<Intento, 'resultado' | 'calificacion'>
  & Partial<Pick<Intento, 'pistas_usadas' | 'fuente_consultada' | 'explicacion_previa'>>): 1 | 2 | 3 | 4 {
  if (intento.resultado === 'revision') return 2 // Sin agenda; programar conserva la anterior.
  const g = intento.resultado === 'incorrecta' ? 1
    : intento.resultado === 'parcial' ? Math.min(2, intento.calificacion)
    : intento.resultado === 'ortografia' ? Math.min(3, Math.max(2, intento.calificacion))
    : intento.resultado === 'correcta' ? Math.max(2, intento.calificacion)
    : intento.calificacion
  const asistido = (intento.pistas_usadas ?? 0) > 0 || intento.fuente_consultada || intento.explicacion_previa
  return (asistido && intento.resultado === 'correcta' ? Math.min(2, g) : g) as 1 | 2 | 3 | 4
}

export function programar(p: ProgresoConcepto, intento: Intento, ahora = Date.now(),
                          examen = EXAMEN_MS): ProgresoConcepto {
  // Una respuesta no reconocida requiere revisión, no es evidencia de olvido.
  if (intento.resultado === 'revision') return { ...p, intentos: [...p.intentos, intento] }
  // La respuesta comprobada gobierna el planificador. La calificación sólo matiza
  // la dificultad dentro del rango compatible con ese resultado.
  const g = calificacionEfectiva(intento)
  const diasDesde = p.ultimo ? (ahora - p.ultimo) / DIA : 0
  const r = p.estabilidad > 0 ? retencion(diasDesde, p.estabilidad) : 0.9

  const dificultad = p.estabilidad === 0 ? dificultadInicial(g) : siguienteDificultad(p.dificultad, g)
  const estabilidad = p.estabilidad === 0 ? estabilidadInicial(g) : siguienteEstabilidad(p.estabilidad, dificultad, r, g)

  const dias = Math.max(g === 1 ? 10 / 1440 : 0.007, intervalo(estabilidad) * factorPorError(intento))
  const intentos = [...p.intentos, intento]
  const correcto = intentoCorrecto(intento)
  const aciertos = p.aciertos + (correcto ? 1 : 0)
  const fallos = p.fallos + (correcto ? 0 : 1)

  return { ...p, dificultad, estabilidad, ultimo: ahora,
           proxima: techoHorizonte(ahora + dias * DIA, ahora, examen),
           intentos, aciertos, fallos }
}

export function estaVencido(p: ProgresoConcepto, ahora = Date.now()): boolean {
  return p.proxima != null && p.proxima <= ahora
}

/** Prioridad de la cola de repaso: primero lo más olvidado y lo más confundido. */
export function prioridad(p: ProgresoConcepto, ahora = Date.now()): number {
  if (p.proxima == null) return 0
  const atraso = (ahora - p.proxima) / DIA
  const rr = p.estabilidad > 0 ? retencion(Math.max(0, (ahora - (p.ultimo ?? ahora)) / DIA), p.estabilidad) : 0
  const penalConfusion = p.intentos.slice(-3).some(i => i.tipo_error === 'confusion_conceptos') ? 1.4 : 1
  return (atraso + 1) * (1 - rr) * penalConfusion
}

export const ESTADOS_ACTIVOS: EstadoDominio[] = ['en_aprendizaje','en_consolidacion','proximo_dominio','reaprendizaje']
