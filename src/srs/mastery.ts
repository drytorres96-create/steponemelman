import { intentoCorrecto, type Intento, type ProgresoConcepto, type EstadoDominio } from './tipos'
import { DIA, estaVencido, retencion } from './fsrs'
import { azarAcumulado, porcentajeAzar, UMBRAL_AZAR } from './azar'

/** Criterios de dominio — configurables desde Ajustes. */
export interface CriteriosDominio {
  recuperaciones: number        // recuperaciones correctas mínimas
  sesiones: number              // en al menos N sesiones distintas
  separacionHoras: number       // separadas temporalmente
  exigirSinPistas: boolean      // al menos una sin pistas
  exigirRecuperacionActiva: boolean // clave histórica: evidencia independiente, también discriminación/aplicación
  ventanaConfusionDias: number  // sin confusiones fundamentales recientes
}
export const CRITERIOS_POR_DEFECTO: CriteriosDominio = {
  // 48 h, decidido por Yoel el 14-sep-2026. Veinte horas caben en una tarde larga y la mañana
  // siguiente —machacar la misma huella, no espaciarla—, pero 96 h eran cuatro días por concepto
  // con el examen en diciembre: demasiado para ver progreso. Dos noches de sueño separan los
  // aciertos de verdad y caben en la semana.
  recuperaciones: 3, sesiones: 2, separacionHoras: 48,
  exigirSinPistas: true, exigirRecuperacionActiva: true, ventanaConfusionDias: 7,
}

/**
 * Criterios con los que se venía sincronizando antes de cada ajuste. `criterios` es un campo
 * persistido, así que cambiar CRITERIOS_POR_DEFECTO no llega a una cuenta que ya guardó los
 * anteriores: la lectura del estado los migra cuando coinciden exactamente con alguna generación
 * anterior. Coincidir exactamente es la prueba de que nunca se tocaron a mano.
 */
export const CRITERIOS_HEREDADOS: CriteriosDominio = {
  recuperaciones: 3, sesiones: 2, separacionHoras: 20,
  exigirSinPistas: true, exigirRecuperacionActiva: true, ventanaConfusionDias: 14,
}
/** La generación de 96 h, vigente entre el 10 y el 14 de septiembre de 2026. */
export const CRITERIOS_96H: CriteriosDominio = {
  recuperaciones: 3, sesiones: 2, separacionHoras: 96,
  exigirSinPistas: true, exigirRecuperacionActiva: true, ventanaConfusionDias: 7,
}
export const GENERACIONES_HEREDADAS: CriteriosDominio[] = [CRITERIOS_HEREDADOS, CRITERIOS_96H]

export function sonCriteriosHeredados(c: CriteriosDominio): boolean {
  const claves = Object.keys(CRITERIOS_POR_DEFECTO) as (keyof CriteriosDominio)[]
  return GENERACIONES_HEREDADAS.some(g => claves.every(k => c[k] === g[k]))
}

/** Identificador estable de cada criterio, para razonar sobre ellos sin leer el rótulo. */
export type ClaveCriterio = 'aciertos' | 'sesiones' | 'separacion' | 'pistas' | 'azar' | 'retencion' | 'confusion'

export interface EvidenciaDominio {
  cumple: boolean
  /** Aciertos exigidos para este concepto: sube cuando toda la evidencia es reconocimiento. */
  requeridas: number
  detalle: { clave: ClaveCriterio; criterio: string; cumplido: boolean; valor: string }[]
}

/** Recuerdo libre o aplicación de un caso, frente al reconocimiento entre opciones. */
export function evidenciaActiva(i: Intento): boolean {
  return i.recuperacion_activa || i.tipo_evidencia === 'aplicacion'
}
/**
 * Probabilidad de recordarlo hoy por debajo de la cual el concepto pide repaso. Es el mismo
 * 0,90 con el que el planificador calcula sus intervalos, así que la cifra que se enseña y la
 * regla que vence un concepto son la misma. Decidido por Yoel el 14-sep-2026.
 */
export const UMBRAL_RETENCION = 0.9

/**
 * Aciertos que se descuentan al fallar. Antes un fallo borraba toda la evidencia vigente:
 * cuatro aciertos y un mal día te devolvían a cero. Descontar dos retrocede un escalón real
 * —el planificador además recorta la estabilidad, así que la retención baja sola— sin tirar
 * semanas de trabajo. Decidido por Yoel el 14-sep-2026.
 */
export const DESCUENTO_POR_FALLO = 2

/** Lo no registrado en historiales antiguos no prueba que no se utilizó ayuda. */
export function evidenciaIndependiente(i: Intento): boolean {
  return (i.resultado === 'correcta' || i.resultado === 'ortografia')
    && i.pistas_usadas === 0 && i.fuente_consultada === false && i.explicacion_previa === false
}

function ultimoResuelto(p: ProgresoConcepto): Intento | undefined {
  return [...p.intentos].reverse().find(i => i.resultado !== 'revision')
}

/**
 * Aciertos que siguen contando. El historial se conserva, pero la evidencia vigente
 * se reconstruye tras el último fallo comprobado. Exportado porque la cercanía al
 * dominio necesita saber desde cuándo corre el reloj de la separación.
 */
export function aciertosVigentes(p: ProgresoConcepto): Intento[] {
  const vigentes: Intento[] = []
  for (const intento of p.intentos) {
    // Una respuesta por revisar no es evidencia de saber ni de olvidar: no suma ni resta.
    if (intento.resultado === 'revision') continue
    if (intentoCorrecto(intento)) {
      if (evidenciaIndependiente(intento)) vigentes.push(intento)
    } else {
      vigentes.splice(Math.max(0, vigentes.length - DESCUENTO_POR_FALLO))
    }
  }
  return vigentes
}

export function evaluarDominio(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): EvidenciaDominio {
  const correctas = aciertosVigentes(p)
  const requeridas = c.recuperaciones
  // Evidencia contra el azar: cada acierto aporta la probabilidad de haberlo acertado sin
  // saberlo, y el conjunto se multiplica. Dos recuerdos libres bastan (0,25 %); cuatro
  // aciertos de opción múltiple entre cuatro, también (0,39 %); tres, todavía no (1,6 %).
  const azar = azarAcumulado(correctas)
  // Probabilidad de recordarlo hoy según el planificador. Es la señal continua: sube con cada
  // acierto bien espaciado y baja sola con los días, así que el avance se ve sin puertas.
  const dias = p.ultimo ? Math.max(0, (ahora - p.ultimo) / DIA) : 0
  const prevista = p.estabilidad > 0 ? retencion(dias, p.estabilidad) : 0
  const sesiones = new Set(correctas.map(i => i.session_id || `legacy-dia-${Math.floor(i.ts / DIA)}`))
  const separadas = c.separacionHoras === 0 || c.sesiones < 2
    ? true
    : correctas.length >= 2 &&
      (correctas[correctas.length - 1].ts - correctas[0].ts) >= c.separacionHoras * 3_600_000
  const sinPistas = correctas.some(i => i.pistas_usadas === 0)
  const confusionReciente = p.intentos.some(i =>
    i.tipo_error === 'confusion_conceptos' && (ahora - i.ts) < c.ventanaConfusionDias * DIA)

  const detalle: EvidenciaDominio['detalle'] = [
    { clave: 'aciertos', criterio: `${requeridas} respuestas correctas independientes`, cumplido: correctas.length >= requeridas, valor: `${correctas.length}` },
    { clave: 'sesiones', criterio: `${c.sesiones} sesiones distintas`, cumplido: sesiones.size >= c.sesiones, valor: `${sesiones.size}` },
    { clave: 'separacion', criterio: `separadas ≥ ${c.separacionHoras} h`, cumplido: separadas, valor: separadas ? 'sí' : 'no' },
    ...(c.exigirSinPistas ? [{ clave: 'pistas' as const, criterio: 'al menos una sin pistas', cumplido: sinPistas, valor: sinPistas ? 'sí' : 'no' }] : []),
    ...(c.exigirRecuperacionActiva ? [{
      clave: 'azar' as const,
      criterio: `probabilidad de acertarlo por azar ≤ ${porcentajeAzar(UMBRAL_AZAR)}`,
      cumplido: correctas.length > 0 && azar <= UMBRAL_AZAR,
      valor: correctas.length ? porcentajeAzar(azar) : 'sin evidencia',
    }] : []),
    // Indicador, no puerta. El planificador ya fija `proxima` en el instante en que la
    // retención cae a este mismo 0,90, así que exigirlo aquí además duplicaría el
    // vencimiento y borraría la diferencia entre «nunca lo dominaste» y «toca repasarlo».
    // Vive en el detalle porque es la señal continua: sube y baja cada día, a la vista.
    {
      clave: 'retencion' as const,
      criterio: `probabilidad de recordarlo hoy ≥ ${Math.round(UMBRAL_RETENCION * 100)} %`,
      cumplido: prevista >= UMBRAL_RETENCION,
      valor: `${Math.round(prevista * 100)} %`,
    },
    { clave: 'confusion', criterio: `sin confusiones en ${c.ventanaConfusionDias} días`, cumplido: !confusionReciente, valor: confusionReciente ? 'hay confusión reciente' : 'ninguna' },
  ]
  return { cumple: detalle.every(d => d.clave === 'retencion' || d.cumplido), requeridas, detalle }
}

/**
 * Explica la evidencia que falta sin equiparar acertar un reintento con dominar.
 *
 * El texto lleva siempre las dos señales continuas —lo improbable que es que la racha sea
 * suerte y la probabilidad de recordarlo hoy— porque son las que se mueven cada día. Un
 * conteo de aciertos se queda quieto; estos dos números enseñan el avance mientras lo hay.
 */
export function resumenDominio(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): { texto: string; pendientes: string[] } {
  const ev = evaluarDominio(p, c, ahora)
  const pendientes = ev.detalle.filter(d => !d.cumplido).map(d => d.criterio)
  const de = (clave: ClaveCriterio) => ev.detalle.find(d => d.clave === clave)?.valor ?? '—'
  const senales = `recuerdo hoy ${de('retencion')}`
    + (ev.detalle.some(d => d.clave === 'azar') ? ` · azar ${de('azar')}` : '')

  if (ev.cumple) return {
    texto: estaVencido(p, ahora)
      ? `Criterios de dominio alcanzados · repaso pendiente · ${senales}`
      : `Dominio acreditado · ${senales}`,
    pendientes: estaVencido(p, ahora) ? ['Completar el repaso pendiente para mantener el dominio vigente'] : [],
  }
  return {
    texto: `Dominio: ${de('aciertos')}/${ev.requeridas} aciertos independientes · ${de('sesiones')}/${c.sesiones} sesiones · ${senales}`,
    pendientes,
  }
}

export function calcularEstado(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): EstadoDominio {
  if (!p.intentos.length) return 'nuevo'
  const ev = evaluarDominio(p, c, ahora)
  const ultimo = ultimoResuelto(p)
  if (p.dominado_en && ultimo && !intentoCorrecto(ultimo)) return 'reaprendizaje'
  if (ev.cumple) return estaVencido(p, ahora) ? 'requiere_repaso' : 'dominado'
  if (estaVencido(p, ahora)) return 'requiere_repaso'
  const correctas = Number(ev.detalle[0].valor)
  if (correctas > 0 && correctas >= ev.requeridas - 1) return 'proximo_dominio'
  if (correctas >= 1) return 'en_consolidacion'
  return 'en_aprendizaje'
}

/** Estado actual; `dominado_en` sólo conserva el hito histórico. */
export function dominioVigente(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): boolean {
  return calcularEstado(p, c, ahora) === 'dominado'
}

/** Etapas visibles del aprendizaje, para diferenciarlas en la interfaz. */
export type Etapa = 'exposicion' | 'comprension' | 'recuperacion' | 'consolidacion' | 'dominio'
export function etapa(p: ProgresoConcepto, c = CRITERIOS_POR_DEFECTO, ahora = Date.now()): Etapa {
  if (!p.intentos.length) return 'exposicion'
  if (dominioVigente(p, c, ahora)) return 'dominio'
  const correctas = aciertosVigentes(p).length
  if (correctas >= 2) return 'consolidacion'
  if (correctas >= 1) return 'recuperacion'
  return 'comprension'
}
export const NOMBRE_ETAPA: Record<Etapa, string> = {
  exposicion: 'Exposición', comprension: 'Comprensión', recuperacion: 'Recuperación',
  consolidacion: 'Consolidación', dominio: 'Dominio',
}
