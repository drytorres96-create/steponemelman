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
  recuperaciones: 3, sesiones: 2, separacionHoras: 20,
  exigirSinPistas: true, exigirRecuperacionActiva: true, ventanaConfusionDias: 14,
}

export interface EvidenciaDominio {
  cumple: boolean
  detalle: { criterio: string; cumplido: boolean; valor: string }[]
}

/** Lo no registrado en historiales antiguos no prueba que no se utilizó ayuda. */
export function evidenciaIndependiente(i: Intento): boolean {
  return (i.resultado === 'correcta' || i.resultado === 'ortografia')
    && i.pistas_usadas === 0 && i.fuente_consultada === false && i.explicacion_previa === false
}

function ultimoResuelto(p: ProgresoConcepto): Intento | undefined {
  return [...p.intentos].reverse().find(i => i.resultado !== 'revision')
}

export function evaluarDominio(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): EvidenciaDominio {
  // El historial se conserva. La evidencia vigente se reconstruye tras el último
  // fallo comprobado, evitando certificar de nuevo por aciertos antiguos.
  const ultimoFallo = p.intentos.reduce((ultimo, i, n) =>
    i.resultado !== 'revision' && !intentoCorrecto(i) ? n : ultimo, -1)
  const correctas = p.intentos.slice(ultimoFallo + 1).filter(evidenciaIndependiente)
  const sesiones = new Set(correctas.map(i => i.session_id || `legacy-dia-${Math.floor(i.ts / DIA)}`))
  const separadas = c.separacionHoras === 0 || c.sesiones < 2
    ? true
    : correctas.length >= 2 &&
      (correctas[correctas.length - 1].ts - correctas[0].ts) >= c.separacionHoras * 3_600_000
  const sinPistas = correctas.some(i => i.pistas_usadas === 0)
  const independiente = correctas.length > 0
  const confusionReciente = p.intentos.some(i =>
    i.tipo_error === 'confusion_conceptos' && (ahora - i.ts) < c.ventanaConfusionDias * DIA)

  const detalle = [
    { criterio: `${c.recuperaciones} respuestas correctas independientes`, cumplido: correctas.length >= c.recuperaciones, valor: `${correctas.length}` },
    { criterio: `${c.sesiones} sesiones distintas`, cumplido: sesiones.size >= c.sesiones, valor: `${sesiones.size}` },
    { criterio: `separadas ≥ ${c.separacionHoras} h`, cumplido: separadas, valor: separadas ? 'sí' : 'no' },
    ...(c.exigirSinPistas ? [{ criterio: 'al menos una sin pistas', cumplido: sinPistas, valor: sinPistas ? 'sí' : 'no' }] : []),
    ...(c.exigirRecuperacionActiva ? [{ criterio: 'evidencia independiente de recuerdo, discriminación o aplicación', cumplido: independiente, valor: independiente ? 'sí' : 'no' }] : []),
    { criterio: `sin confusiones en ${c.ventanaConfusionDias} días`, cumplido: !confusionReciente, valor: confusionReciente ? 'hay confusión reciente' : 'ninguna' },
  ]
  return { cumple: detalle.every(d => d.cumplido), detalle }
}

export function calcularEstado(p: ProgresoConcepto, c: CriteriosDominio, ahora = Date.now()): EstadoDominio {
  if (!p.intentos.length) return 'nuevo'
  const ev = evaluarDominio(p, c, ahora)
  const ultimo = ultimoResuelto(p)
  if (p.dominado_en && ultimo && !intentoCorrecto(ultimo)) return 'reaprendizaje'
  if (ev.cumple) return estaVencido(p, ahora) ? 'requiere_repaso' : 'dominado'
  if (estaVencido(p, ahora)) return 'requiere_repaso'
  const correctas = Number(ev.detalle[0].valor)
  if (correctas >= c.recuperaciones - 1) return 'proximo_dominio'
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
  const correctas = p.intentos.filter(evidenciaIndependiente).length
  if (correctas >= 2) return 'consolidacion'
  if (correctas >= 1) return 'recuperacion'
  return 'comprension'
}
export const NOMBRE_ETAPA: Record<Etapa, string> = {
  exposicion: 'Exposición', comprension: 'Comprensión', recuperacion: 'Recuperación',
  consolidacion: 'Consolidación', dominio: 'Dominio',
}
