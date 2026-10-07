import { intentoCorrecto, type Intento, type ProgresoConcepto, type EstadoDominio } from './tipos'
import { DIA, estaVencido, proximaRevision, retencion } from './fsrs'

/** Criterios de dominio — configurables desde Ajustes. */
export interface CriteriosDominio {
  recuperaciones: number        // recuperaciones correctas mínimas
  sesiones: number              // en al menos N sesiones distintas
  separacionHoras: number       // separadas temporalmente
  exigirSinPistas: boolean      // al menos una sin pistas
  exigirRecuperacionActiva: boolean // al menos un recuerdo sin alternativas o una aplicación
  ventanaConfusionDias: number  // sin confusiones fundamentales recientes
}
export const CRITERIOS_POR_DEFECTO: CriteriosDominio = {
  // Regla operativa de separación decidida por Yoel el 14-sep-2026: 48 h.
  // Evita acreditar una racha de la misma tarde y cabe en el horizonte del examen.
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
export type ClaveCriterio = 'aciertos' | 'sesiones' | 'separacion' | 'pistas' | 'recuperacion' | 'retencion' | 'confusion'

export interface EvidenciaDominio {
  cumple: boolean
  /** Respuestas independientes exigidas por los criterios guardados. */
  requeridas: number
  detalle: { clave: ClaveCriterio; criterio: string; cumplido: boolean; valor: string }[]
}

const FORMATOS_SIN_ALTERNATIVAS = new Set([
  'recuperacion_libre', 'completar', 'numerico', 'tarjeta', 'escritura_correctiva', 'visual', 'simulador',
])

/**
 * Interpreta la evidencia sin reescribir el historial. Los controles con alternativas
 * visibles antes se marcaban como recuperación; su formato prevalece sobre ese flag.
 * Un formato desconocido o un caso antiguo sin aplicación registrada no la demuestra.
 */
export function tipoEvidenciaDeIntento(i: Intento): NonNullable<Intento['tipo_evidencia']> {
  if (i.interaccion === 'caso_clinico' && i.tipo_evidencia === 'aplicacion') return 'aplicacion'
  if (FORMATOS_SIN_ALTERNATIVAS.has(i.interaccion) && i.recuperacion_activa
      && i.tipo_evidencia !== 'discriminacion') return 'recuerdo'
  return 'discriminacion'
}

/** Recuerdo sin alternativas o aplicación registrada, frente a elegir entre opciones. */
export function evidenciaActiva(i: Intento): boolean {
  return tipoEvidenciaDeIntento(i) !== 'discriminacion'
}
/**
 * Retención estimada por debajo de la cual el concepto pide repaso. Es el mismo
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

function ultimoResuelto(p: ProgresoConcepto, ahora: number): Intento | undefined {
  return [...p.intentos].reverse().find(i => i.ts <= ahora && i.resultado !== 'revision')
}

/**
 * Aciertos que siguen contando. El historial se conserva, pero la evidencia vigente
 * se reconstruye tras el último fallo comprobado. Exportado porque la cercanía al
 * dominio necesita saber desde cuándo corre el reloj de la separación.
 */
export function aciertosVigentes(p: ProgresoConcepto, ahora = Infinity): Intento[] {
  const vigentes: Intento[] = []
  for (const intento of p.intentos) {
    // Consultar una fecha pasada no permite usar aciertos ni fallos posteriores.
    if (intento.ts > ahora) continue
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
  const correctas = aciertosVigentes(p, ahora)
  const requeridas = c.recuperaciones
  const recuperacion = correctas.some(evidenciaActiva)
  // Retención estimada hoy según el planificador. Es la señal continua: sube con cada
  // acierto bien espaciado y baja sola con los días, así que el avance se ve sin puertas.
  const dias = p.ultimo !== null ? Math.max(0, (ahora - p.ultimo) / DIA) : 0
  const prevista = p.estabilidad > 0 ? retencion(dias, p.estabilidad) : 0
  const sesiones = new Set(correctas.map(i => i.session_id || `legacy-dia-${Math.floor(i.ts / DIA)}`))
  const separadas = c.separacionHoras === 0 || c.sesiones < 2
    ? true
    : correctas.length >= 2 &&
      (correctas[correctas.length - 1].ts - correctas[0].ts) >= c.separacionHoras * 3_600_000
  const sinPistas = correctas.some(i => i.pistas_usadas === 0)
  const confusionReciente = p.intentos.some(i =>
    i.ts <= ahora && i.tipo_error === 'confusion_conceptos' && (ahora - i.ts) < c.ventanaConfusionDias * DIA)

  const detalle: EvidenciaDominio['detalle'] = [
    { clave: 'aciertos', criterio: `${requeridas} respuestas correctas independientes`, cumplido: correctas.length >= requeridas, valor: `${correctas.length}` },
    { clave: 'sesiones', criterio: `${c.sesiones} sesiones distintas`, cumplido: sesiones.size >= c.sesiones, valor: `${sesiones.size}` },
    { clave: 'separacion', criterio: `separadas ≥ ${c.separacionHoras} h`, cumplido: separadas, valor: separadas ? 'sí' : 'no' },
    ...(c.exigirSinPistas ? [{ clave: 'pistas' as const, criterio: 'al menos una sin pistas', cumplido: sinPistas, valor: sinPistas ? 'sí' : 'no' }] : []),
    ...(c.exigirRecuperacionActiva ? [{
      clave: 'recuperacion' as const,
      criterio: 'al menos un recuerdo sin alternativas o una aplicación independiente',
      cumplido: recuperacion,
      valor: recuperacion ? 'sí' : 'pendiente',
    }] : []),
    // Indicador, no puerta. El planificador ya fija `proxima` en el instante en que la
    // retención cae a este mismo 0,90, así que exigirlo aquí además duplicaría el
    // vencimiento y borraría la diferencia entre «nunca lo dominaste» y «toca repasarlo».
    // Vive en el detalle porque es la señal continua: sube y baja cada día, a la vista.
    {
      clave: 'retencion' as const,
      criterio: `retención estimada hoy ≥ ${Math.round(UMBRAL_RETENCION * 100)} %`,
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
 * La estimación de retención se separa de la evidencia registrada: acertar entre
 * alternativas muchas veces no demuestra por sí solo una recuperación sin ellas.
 */
export function resumenDominio(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): { texto: string; pendientes: string[] } {
  const ev = evaluarDominio(p, c, ahora)
  const pendientes = ev.detalle.filter(d => d.clave !== 'retencion' && !d.cumplido).map(d => d.criterio)
  const de = (clave: ClaveCriterio) => ev.detalle.find(d => d.clave === clave)?.valor ?? '—'
  const senales = `retención estimada hoy ${de('retencion')}`

  if (ev.cumple) {
    const ultimo = ultimoResuelto(p, ahora)
    if (ultimo && !intentoCorrecto(ultimo)) return {
      texto: `Criterios de dominio alcanzados · recuperación pendiente · ${senales}`,
      pendientes: ['Recuperar el concepto tras la última respuesta fallada'],
    }
    if (proximaRevision(p) === null) return {
      texto: `Criterios de dominio alcanzados · mantenimiento por comprobar · ${senales}`,
      pendientes: ['Completar un repaso para comprobar el mantenimiento y su próxima fecha'],
    }
    return {
      texto: estaVencido(p, ahora)
        ? `Criterios de dominio alcanzados · repaso pendiente · ${senales}`
        : `Dominio acreditado · ${senales}`,
      pendientes: estaVencido(p, ahora) ? ['Completar el repaso pendiente para mantener el dominio vigente'] : [],
    }
  }
  return {
    texto: `Dominio: ${de('aciertos')}/${ev.requeridas} aciertos independientes · ${de('sesiones')}/${c.sesiones} sesiones · ${senales}`,
    pendientes,
  }
}

export function calcularEstado(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): EstadoDominio {
  if (!p.intentos.some(i => i.ts <= ahora)) return 'nuevo'
  const ev = evaluarDominio(p, c, ahora)
  const ultimo = ultimoResuelto(p, ahora)
  if (p.dominado_en && p.dominado_en <= ahora && ultimo && !intentoCorrecto(ultimo)) return 'reaprendizaje'
  if (ev.cumple) return estaVencido(p, ahora) ? 'requiere_repaso' : 'dominado'
  if (estaVencido(p, ahora)) return 'requiere_repaso'
  const correctas = Number(ev.detalle[0].valor)
  if (correctas > 0 && correctas >= ev.requeridas - 1) return 'proximo_dominio'
  if (correctas >= 1) return 'en_consolidacion'
  return 'en_aprendizaje'
}

/** Estado actual; `dominado_en` sólo conserva el hito histórico. */
export function dominioVigente(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): boolean {
  return proximaRevision(p) !== null && calcularEstado(p, c, ahora) === 'dominado'
}

/** Etapas visibles del aprendizaje, para diferenciarlas en la interfaz. */
export type Etapa = 'exposicion' | 'comprension' | 'recuperacion' | 'consolidacion' | 'dominio'
export function etapa(p: ProgresoConcepto, c = CRITERIOS_POR_DEFECTO, ahora = Date.now()): Etapa {
  if (!p.intentos.some(i => i.ts <= ahora)) return 'exposicion'
  if (dominioVigente(p, c, ahora)) return 'dominio'
  const correctas = aciertosVigentes(p, ahora).length
  if (correctas >= 2) return 'consolidacion'
  if (correctas >= 1) return 'recuperacion'
  return 'comprension'
}
export const NOMBRE_ETAPA: Record<Etapa, string> = {
  exposicion: 'Exposición', comprension: 'Comprensión', recuperacion: 'Recuperación',
  consolidacion: 'Consolidación', dominio: 'Dominio',
}
