import { intentoCorrecto, type Intento, type ProgresoConcepto, type EstadoDominio } from './tipos'
import { DIA, estaVencido } from './fsrs'

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
  // 96 h y no 20: tres aciertos separados por 20 horas caben en una tarde larga y la mañana
  // siguiente, que es machacar la misma huella, no espaciarla.
  recuperaciones: 3, sesiones: 2, separacionHoras: 96,
  exigirSinPistas: true, exigirRecuperacionActiva: true, ventanaConfusionDias: 7,
}

export interface EvidenciaDominio {
  cumple: boolean
  /** Aciertos exigidos para este concepto: sube cuando toda la evidencia es reconocimiento. */
  requeridas: number
  detalle: { criterio: string; cumplido: boolean; valor: string }[]
}

/** Recuerdo libre o aplicación de un caso, frente al reconocimiento entre opciones. */
export function evidenciaActiva(i: Intento): boolean {
  return i.recuperacion_activa || i.tipo_evidencia === 'aplicacion'
}
/** Aciertos extra exigidos cuando no hay ni un recuerdo libre ni una aplicación. */
export const RECARGO_RECONOCIMIENTO = 2

/** Lo no registrado en historiales antiguos no prueba que no se utilizó ayuda. */
export function evidenciaIndependiente(i: Intento): boolean {
  return (i.resultado === 'correcta' || i.resultado === 'ortografia')
    && i.pistas_usadas === 0 && i.fuente_consultada === false && i.explicacion_previa === false
}

function ultimoResuelto(p: ProgresoConcepto): Intento | undefined {
  return [...p.intentos].reverse().find(i => i.resultado !== 'revision')
}

function aciertosVigentes(p: ProgresoConcepto): Intento[] {
  // El historial se conserva. La evidencia vigente se reconstruye tras el último
  // fallo comprobado, evitando certificar de nuevo por aciertos antiguos.
  const ultimoFallo = p.intentos.reduce((ultimo, i, n) =>
    i.resultado !== 'revision' && !intentoCorrecto(i) ? n : ultimo, -1)
  return p.intentos.slice(ultimoFallo + 1).filter(evidenciaIndependiente)
}

export function evaluarDominio(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): EvidenciaDominio {
  const correctas = aciertosVigentes(p)
  const activas = correctas.filter(evidenciaActiva)
  // Acertar tres veces entre tres opciones ocurre por azar una vez de cada 27. Cuando toda la
  // evidencia vigente es reconocimiento, el umbral sube a cinco (1 de cada 243); un solo recuerdo
  // libre o una aplicación lo devuelven al umbral normal.
  const soloReconocimiento = c.exigirRecuperacionActiva && correctas.length > 0 && activas.length === 0
  const requeridas = soloReconocimiento ? c.recuperaciones + RECARGO_RECONOCIMIENTO : c.recuperaciones
  const sesiones = new Set(correctas.map(i => i.session_id || `legacy-dia-${Math.floor(i.ts / DIA)}`))
  const separadas = c.separacionHoras === 0 || c.sesiones < 2
    ? true
    : correctas.length >= 2 &&
      (correctas[correctas.length - 1].ts - correctas[0].ts) >= c.separacionHoras * 3_600_000
  const sinPistas = correctas.some(i => i.pistas_usadas === 0)
  const confusionReciente = p.intentos.some(i =>
    i.tipo_error === 'confusion_conceptos' && (ahora - i.ts) < c.ventanaConfusionDias * DIA)

  const detalle = [
    { criterio: `${requeridas} respuestas correctas independientes`, cumplido: correctas.length >= requeridas, valor: `${correctas.length}` },
    { criterio: `${c.sesiones} sesiones distintas`, cumplido: sesiones.size >= c.sesiones, valor: `${sesiones.size}` },
    { criterio: `separadas ≥ ${c.separacionHoras} h`, cumplido: separadas, valor: separadas ? 'sí' : 'no' },
    ...(c.exigirSinPistas ? [{ criterio: 'al menos una sin pistas', cumplido: sinPistas, valor: sinPistas ? 'sí' : 'no' }] : []),
    ...(c.exigirRecuperacionActiva ? [{
      criterio: 'recuerdo libre o aplicación, no sólo reconocimiento',
      cumplido: activas.length > 0 || correctas.length >= requeridas,
      valor: activas.length > 0 ? `${activas.length}` : `ninguno · umbral ${requeridas}`,
    }] : []),
    { criterio: `sin confusiones en ${c.ventanaConfusionDias} días`, cumplido: !confusionReciente, valor: confusionReciente ? 'hay confusión reciente' : 'ninguna' },
  ]
  return { cumple: detalle.every(d => d.cumplido), requeridas, detalle }
}

/** Explica la evidencia que falta sin equiparar acertar un reintento con dominar. */
export function resumenDominio(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): { texto: string; pendientes: string[] } {
  const ev = evaluarDominio(p, c, ahora)
  const pendientes = ev.detalle.filter(d => !d.cumplido).map(d => d.criterio)
  if (ev.cumple) return {
    texto: estaVencido(p, ahora) ? 'Criterios de dominio alcanzados · repaso pendiente' : 'Dominio acreditado',
    pendientes: estaVencido(p, ahora) ? ['Completar el repaso pendiente para mantener el dominio vigente'] : [],
  }
  return {
    texto: `Dominio: ${ev.detalle[0].valor}/${ev.requeridas} aciertos independientes · ${ev.detalle[1].valor}/${c.sesiones} sesiones`,
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
