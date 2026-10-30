import type { Sistema } from '../schema/concept'
import { normalizarBusqueda } from '../lib/busqueda'

/** Display names are separate from the persisted Spanish taxonomy keys. */
const SYSTEM_LABELS: Record<Sistema, string> = {
  Cardiovascular: 'Cardiovascular', Endocrino: 'Endocrine', Gastrointestinal: 'Gastrointestinal',
  'Hematológico y oncológico': 'Hematology & oncology', Musculoesquelético: 'Musculoskeletal',
  Neurológico: 'Neurologic', Renal: 'Renal', Reproductivo: 'Reproductive',
  Respiratorio: 'Respiratory', Multisistémico: 'Multisystem',
}
const knownSystems = new Map(Object.entries(SYSTEM_LABELS).flatMap(([key, label]) =>
  [key, label].map(value => [normalizarBusqueda(value), key] as const)))

/** Only spelling/case and explicit translations are aliases; never infer medical classification. */
export function systemKey(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ').normalize('NFC')
  return knownSystems.get(normalizarBusqueda(trimmed)) ?? trimmed
}
export function systemLabel(value: string): string {
  const key = systemKey(value)
  return SYSTEM_LABELS[key as Sistema] ?? key
}
export function itemSystems(values: readonly string[]): string[] {
  const systems = [...new Set(values.map(systemKey).filter(Boolean))]
  return systems.length ? systems : ['Unclassified']
}
