import type { RefNbme } from '../lib/contexto-sesion'
import { acceptedExplanation, editorialPath, sourceIdentity } from '../myqbank/editorial'
import { parseNbmeQuestion } from '../nbme/validation'
import { originalRecoveryAllowed, type NbmeSourceSafety } from '../nbme/source-safety'
import { tieneClasificacionContradictoria } from './fuente-recuperacion-confiable'

type Leer = (path: string) => Promise<Response>
const REVISION = /^[a-zA-Z0-9_.-]{1,80}$/
const limpiar = (text: string) => text.replace(/\s+/g, ' ').trim().normalize('NFC')

/** Cuánto material de cada pregunta lee Claude: lo bastante para clasificarla por lo que evalúa. */
export const MAX_EVIDENCIA_REVISADA = 2400
export const MAX_EVIDENCIA_ORIGINAL = 2000

/** De dónde sale lo que Claude leyó: la explicación revisada o el original autorizado por la política. */
export type OrigenEvidencia = 'revisada' | 'original'
export interface EvidenciaNbme { id: string; revision: string; texto: string; origen: OrigenEvidencia }

/** Only authenticated reads through the bank's existing RLS. No client-provided NBME content. */
async function leerActivos(get: Leer, paths: string[]): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>()
  for (let n = 0; n < paths.length; n += 20) {
    const batch = paths.slice(n, n + 20)
    const query = new URLSearchParams({ select: 'path,payload', path: `in.(${batch.join(',')})` })
    const response = await get(`/rest/v1/nbme_assets?${query}`)
    if (!response.ok) throw Error('No se pudo comprobar el material de las preguntas. Vuelve a intentarlo.')
    const rows: unknown = await response.json()
    if (!Array.isArray(rows)) throw Error('Respuesta del banco no válida.')
    for (const row of rows) {
      if (!row || typeof row.path !== 'string' || !batch.includes(row.path) || result.has(row.path)) throw Error('Respuesta del banco no válida.')
      result.set(row.path, row.payload)
    }
  }
  return result
}

/**
 * El material que Claude puede leer de cada pregunta NBME pedida, resuelto por el servidor.
 *
 * A topic can be missing from the index even when the reviewed explanation is available.
 * Source holds remain in force: only the exact, independently reviewed companion may replace
 * a held original for classification. This neither edits nor clears the original question.
 * Lo que no tiene una fuente utilizable queda en `sinFuente` y nunca sale hacia la IA.
 */
export async function evidenciaNbme(refs: RefNbme[], policy: NbmeSourceSafety | null, get: Leer): Promise<{ evidencias: EvidenciaNbme[]; sinFuente: string[] }> {
  if (!refs.length) return { evidencias: [], sinFuente: [] }
  if (!policy) return { evidencias: [], sinFuente: refs.map(r => r.id) }
  const index = await leerActivos(get, ['catalog-index.json'])
  const catalog = (index.get('catalog-index.json') ?? (await leerActivos(get, ['catalog.json'])).get('catalog.json')) as { questions?: { id: string; revision: string; status: string }[] } | undefined
  if (!Array.isArray(catalog?.questions)) throw Error('No se pudo comprobar el catálogo de preguntas.')
  const vigentes = refs.flatMap(ref => {
    const matches = catalog.questions!.filter(q => q.id === ref.id)
    const q = matches.length === 1 ? matches[0] : null
    return q?.status === 'ready' && REVISION.test(q.revision) && ref.revision === q.revision ? [{ id: q.id, revision: q.revision }] : []
  })
  const paths = vigentes.map(q => `questions/${q.id}/${q.revision}.json`)
  const originals = await leerActivos(get, paths)
  const resolved = await Promise.all(vigentes.map(async (ref, n) => {
    const q = parseNbmeQuestion(originals.get(paths[n]))
    if (!q || q.id !== ref.id || q.revision !== ref.revision) return null
    const identity = await sourceIdentity(q)
    return { q, identity, path: editorialPath(identity) }
  }))
  const companions = await leerActivos(get, resolved.flatMap(r => r ? [r.path] : []))
  const evidencias: EvidenciaNbme[] = []
  for (const item of resolved) {
    if (!item) continue
    const { q, identity, path } = item
    const raw = companions.get(path)
    const reviewed = raw === undefined ? null : await acceptedExplanation(raw, identity)
    if (reviewed) {
      // Preserve context from several reviewed sections, rather than truncating to a generic title.
      const texto = reviewed.sections.filter(s => s.status === 'available' && !s.drill)
        .map(s => limpiar([s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])].join(' ')).slice(0, 700)).join(' ').slice(0, MAX_EVIDENCIA_REVISADA)
      if (texto) evidencias.push({ id: q.id, revision: q.revision, texto, origen: 'revisada' })
    } else if (raw === undefined && originalRecoveryAllowed(policy, q.id)
      && !tieneClasificacionContradictoria(q.explanation ?? '', q.objective)) {
      const texto = limpiar([q.topic, q.objective, q.explanation].filter(Boolean).join(' ')).slice(0, MAX_EVIDENCIA_ORIGINAL)
      if (texto) evidencias.push({ id: q.id, revision: q.revision, texto, origen: 'original' })
    }
  }
  const con = new Set(evidencias.map(e => e.id))
  return { evidencias, sinFuente: refs.filter(r => !con.has(r.id)).map(r => r.id) }
}
