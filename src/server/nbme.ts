import config from '../../project.config.json'
import { preguntaConLecturasDudosas } from '../nbme/texto'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Authorization',
} })
const unavailable = () => json({ error: 'No se pudo cargar el banco de preguntas. Vuelve a intentarlo.' }, 503)
const ID = /^NBME(?:27|28|29)-P\d{4}$/
const REVISION = /^[a-zA-Z0-9_.-]{1,80}$/
type Ref = { id: string; revision: string }

async function readBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const parts: Uint8Array[] = []; let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > 6000) { await reader.cancel(); return null }
    parts.push(part.value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  return new TextDecoder().decode(bytes)
}

/** Private study material. Database RLS independently checks bank membership. */
export async function handleNbme(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const catalog = url.pathname === '/api/nbme/catalog'
  const questions = url.pathname === '/api/nbme/questions'
  const imageId = /^\/api\/nbme\/assets\/([a-zA-Z0-9_.-]{1,120})$/.exec(url.pathname)?.[1]
  if (!catalog && !questions && !imageId) return json({ error: 'No encontrado.' }, 404)
  if (request.method !== (questions ? 'POST' : 'GET')) return json({ error: 'Método no permitido.' }, 405)
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ error: 'Origen no permitido.' }, 403)
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [^\s]{20,8192}$/.test(authorization)) return json({ error: 'Inicia sesión para acceder a las preguntas.' }, 401)

  let refs: Ref[] = []
  if (questions) {
    if (Number(request.headers.get('content-length') ?? 0) > 6000) return json({ error: 'Solicitud demasiado larga.' }, 413)
    try {
      const body = await readBody(request)
      if (body === null) return json({ error: 'Solicitud demasiado larga.' }, 413)
      const data = JSON.parse(body)
      if (!Array.isArray(data.refs) || !data.refs.length || data.refs.length > 20 || !data.refs.every((r: Ref) =>
        r && typeof r.id === 'string' && ID.test(r.id) && typeof r.revision === 'string' && REVISION.test(r.revision))) {
        return json({ error: 'Selecciona entre 1 y 20 preguntas válidas.' }, 400)
      }
      refs = data.refs
      if (new Set(refs.map(r => `${r.id}:${r.revision}`)).size !== refs.length) return json({ error: 'La selección contiene preguntas repetidas.' }, 400)
    } catch { return json({ error: 'Solicitud no válida.' }, 400) }
  }

  try {
    const headers = { apikey: config.supabasePublishableKey, Authorization: authorization }
    const get = (path: string) => fetch(`${config.supabaseUrl}${path}`, { headers, signal: AbortSignal.timeout(10000) })
    const auth = await get('/auth/v1/user')
    if (!auth.ok) return json({ error: 'Tu sesión necesita verificarse otra vez.' }, 401)
    const user = await auth.json() as { id?: string; is_anonymous?: boolean; email_confirmed_at?: string }
    if (!user.id || user.is_anonymous || !user.email_confirmed_at) return json({ error: 'Se necesita una cuenta verificada.' }, 403)
    const asset = async (path: string): Promise<Record<string, unknown> | null> => {
      const result = await get(`/rest/v1/nbme_assets?select=payload&path=eq.${encodeURIComponent(path)}`)
      if (!result.ok) throw new Error('bank_unavailable')
      const value = (await result.json() as { payload: Record<string, unknown> }[])[0]?.payload
      return value && typeof value === 'object' ? value : null
    }
    // Una cuenta sin permiso no debe provocar ninguna lectura del banco: la
    // membresía se comprueba antes de pedir el catálogo o cualquier pregunta.
    const member = await get(`/rest/v1/nbme_members?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`)
    if (!member.ok) return unavailable()
    if (!(await member.json() as unknown[]).length) return json({ error: 'Tu cuenta no tiene acceso a este banco.' }, 403)
    // Always consult current availability through RLS. A shared cache must not
    // retain withdrawn items or bypass revoked application membership.
    const catalogoVigente = async () => await asset('catalog-index.json') ?? await asset('catalog.json')
    if (catalog) {
      const value = await catalogoVigente()
      if (!value || value.schemaVersion !== 1 || !Array.isArray(value.questions)) return unavailable()
      return json(value)
    }
    if (imageId) {
      const value = await asset(`assets/${imageId}`)
      if (!value) return json({ error: 'Imagen no disponible.' }, 404)
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(String(value.mimeType))
        || typeof value.dataBase64 !== 'string' || value.dataBase64.length > 7000000) return unavailable()
      const binary = atob(value.dataBase64)
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
      return new Response(bytes, { headers: { 'Content-Type': String(value.mimeType),
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Authorization' } })
    }
    const latestCatalog = await catalogoVigente()
    if (!latestCatalog || !Array.isArray(latestCatalog.questions)) return unavailable()
    const latest = new Map(latestCatalog.questions.map((q: { id: string; status: string }) => [q.id, q.status]))
    // Una pregunta retirada no llega a descargarse.
    if (refs.some(ref => latest.get(ref.id) !== 'ready')) {
      return json({ error: 'Una pregunta necesita revisión. Se conserva el historial de tu sesión.' }, 422)
    }
    // A session pins its revision. Never silently replace a saved question with another version.
    const paths = refs.map(r => `questions/${r.id}/${r.revision}.json`)
    const query = new URLSearchParams({ select: 'path,payload', path: `in.(${paths.join(',')})` })
    const result = await get(`/rest/v1/nbme_assets?${query}`)
    if (!result.ok) return unavailable()
    const rows: unknown = await result.json()
    if (!Array.isArray(rows)) return unavailable()
    const byPath = new Map<string, Record<string, unknown>>()
    for (const row of rows) {
      if (!row || typeof row.path !== 'string' || !row.payload || typeof row.payload !== 'object'
        || Array.isArray(row.payload) || byPath.has(row.path)) return unavailable()
      byPath.set(row.path, row.payload)
    }
    const values = paths.map(path => byPath.get(path))
    if (values.some((q, i) => !q || q.id !== refs[i].id || q.revision !== refs[i].revision)) {
      return json({ error: 'No está disponible la versión guardada de una pregunta. Tu sesión se conserva para reintentar.' }, 409)
    }
    if (values.some(q => q!.status !== 'ready')) return json({ error: 'Una pregunta necesita revisión y no puede calificarse.' }, 422)
    if (values.some(q => typeof q!.stem !== 'string' || !Array.isArray(q!.options)
      || !(q!.options as unknown[]).every(o => o && typeof o === 'object' && 'text' in o && typeof o.text === 'string'))) return unavailable()
    if (values.some(q => preguntaConLecturasDudosas(q as { stem: string; options: { text: string }[] }))) {
      return json({ error: 'Una pregunta contiene datos ilegibles y necesita cotejarse con la fuente.' }, 422)
    }
    return json({ questions: values })
  } catch { return unavailable() }
}
