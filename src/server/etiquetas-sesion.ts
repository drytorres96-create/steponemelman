import type { ItemRevision } from '../lib/contexto-sesion'
import { acceptedExplanation, editorialPath, sourceIdentity } from '../myqbank/editorial'
import { parseNbmeQuestion } from '../nbme/validation'
import { originalRecoveryAllowed, type NbmeSourceSafety } from '../nbme/source-safety'
import { tieneClasificacionContradictoria } from './fuente-recuperacion-confiable'

type Leer = (path: string) => Promise<Response>
const ID = /^NBME(?:27|28|29)-P\d{4}$/
const REVISION = /^[a-zA-Z0-9_.-]{1,80}$/
const limpiar = (text: string) => text.replace(/\s+/g, ' ').trim().normalize('NFC')

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

/** A topic can be missing from the index even when the reviewed explanation is available.
 * Source holds remain in force: only the exact, independently reviewed companion may replace
 * a held original for classification. This neither edits nor clears the original question.
 */
export async function etiquetasDeSesion(items: ItemRevision[], policy: NbmeSourceSafety | null, get: Leer) {
  const labels = new Map<string, { id: string; etiqueta: string }>()
  for (const item of items) if (item.tipo === 'concepto' && !item.id.startsWith('NBME')) labels.set(item.id, { id: item.id, etiqueta: limpiar(item.etiqueta) })
  const requested = items.filter(i => i.tipo === 'pregunta' && ID.test(i.id))
  let conFuenteRevisada = 0
  if (requested.length && policy) {
    const index = await leerActivos(get, ['catalog-index.json'])
    const catalog = (index.get('catalog-index.json') ?? (await leerActivos(get, ['catalog.json'])).get('catalog.json')) as { questions?: { id: string; revision: string; status: string }[] } | undefined
    if (!Array.isArray(catalog?.questions)) throw Error('No se pudo comprobar el catálogo de preguntas.')
    const refs = requested.flatMap(item => {
      const matches = catalog.questions!.filter(q => q.id === item.id)
      const q = matches.length === 1 ? matches[0] : null
      return q?.status === 'ready' && REVISION.test(q.revision) && (!item.revision || item.revision === q.revision)
        ? [{ id: q.id, revision: q.revision }] : []
    })
    const paths = refs.map(q => `questions/${q.id}/${q.revision}.json`)
    const originals = await leerActivos(get, paths)
    const resolved = await Promise.all(refs.map(async (ref, n) => {
      const q = parseNbmeQuestion(originals.get(paths[n]))
      if (!q || q.id !== ref.id || q.revision !== ref.revision) return null
      const identity = await sourceIdentity(q)
      return { q, identity, path: editorialPath(identity) }
    }))
    const companions = await leerActivos(get, resolved.flatMap(r => r ? [r.path] : []))
    for (const item of resolved) {
      if (!item) continue
      const { q, identity, path } = item
      const raw = companions.get(path)
      const reviewed = raw === undefined ? null : await acceptedExplanation(raw, identity)
      let text = ''
      if (reviewed) {
        // Preserve context from several reviewed sections, rather than truncating to a generic title.
        text = reviewed.sections.filter(s => s.status === 'available' && !s.drill)
          .map(s => limpiar([s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])].join(' ')).slice(0, 500)).join(' ').slice(0, 1600)
        if (text) conFuenteRevisada++
      } else if (raw === undefined && originalRecoveryAllowed(policy, q.id)
        && !tieneClasificacionContradictoria(q.explanation ?? '', q.objective)) {
        text = limpiar([q.topic, q.objective, q.explanation].filter(Boolean).join(' ')).slice(0, 1200)
      }
      if (text) labels.set(q.id, { id: q.id, etiqueta: text })
    }
  }
  const revisables = items.flatMap(i => labels.has(i.id) ? [labels.get(i.id)!] : [])
  return { revisables, sinRevisar: items.length - revisables.length, conFuenteRevisada }
}
