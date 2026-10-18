import { supabase } from '../lib/supabase'
import type { NbmeCatalog, NbmeQuestion, NbmeQuestionRef } from './types'
import { parseNbmeCatalog, parseNbmeQuestion } from './validation'
export { parseNbmeCatalog, parseNbmeQuestion } from './validation'

export function questionRefKey(ref: NbmeQuestionRef): string { return JSON.stringify([ref.id, ref.revision]) }

export class NbmeAccessError extends Error {
  constructor(public status: 401 | 403, message: string) { super(message); this.name = 'NbmeAccessError' }
}
function responseError(status: number): Error {
  if (status === 401) return new NbmeAccessError(401, 'Tu sesión ha caducado. Vuelve a iniciar sesión para cargar preguntas.')
  if (status === 403) return new NbmeAccessError(403, 'Esta cuenta todavía no tiene acceso al banco de preguntas.')
  if (status === 409) return new Error('No está disponible la versión de una pregunta de esta sesión. No se sustituyó ni se borró tu progreso.')
  if (status === 422) return new Error('Una pregunta necesita revisión editorial y no puede iniciarse todavía.')
  if (status === 429) return new Error('Hay varias solicitudes en curso. Espera unos segundos y vuelve a intentar.')
  return new Error('No se pudo cargar el banco. Revisa tu conexión y vuelve a intentar.')
}

/** Tokens are sent only to authenticated same-origin API endpoints; never persisted with content. */
export function createNbmeApi(userId: string) {
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session || data.session.user.id !== userId) throw responseError(401)
    const controller = new AbortController()
    const cancel = () => controller.abort()
    if (init.signal?.aborted) controller.abort()
    init.signal?.addEventListener('abort', cancel, { once: true })
    const timeout = setTimeout(cancel, 20_000)
    try {
      const response = await fetch(path, { ...init, signal: controller.signal, cache: 'no-store', credentials: 'omit',
        redirect: 'error', headers: { ...init.headers, Authorization: `Bearer ${data.session.access_token}` } })
      if (!response.ok) throw responseError(response.status)
      return response
    } finally {
      clearTimeout(timeout)
      init.signal?.removeEventListener('abort', cancel)
    }
  }
  return {
    async catalog(signal?: AbortSignal): Promise<NbmeCatalog> {
      const response = await request('/api/nbme/catalog', { signal })
      const catalog = parseNbmeCatalog(await response.json())
      if (!catalog) throw new Error('El catálogo de preguntas recibido no tiene un formato válido.')
      return catalog
    },
    async questions(refs: NbmeQuestionRef[], signal?: AbortSignal): Promise<NbmeQuestion[]> {
      if (!refs.length || refs.length > 20 || new Set(refs.map(questionRefKey)).size !== refs.length) {
        throw new Error('Selecciona entre una y veinte preguntas distintas.')
      }
      const response = await request('/api/nbme/questions', { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refs }) })
      const body: unknown = await response.json()
      if (!body || typeof body !== 'object' || !('questions' in body) || !Array.isArray(body.questions)) {
        throw new Error('No se recibió el bloque completo de preguntas.')
      }
      const questions = body.questions.map(parseNbmeQuestion)
      const keys = new Set(questions.filter((q): q is NbmeQuestion => q !== null).map(questionRefKey))
      if (questions.some(q => q === null) || questions.length !== refs.length || keys.size !== refs.length
        || refs.some(ref => !keys.has(questionRefKey(ref)))) {
        throw new Error('No se recibió la versión exacta de todas las preguntas. Vuelve a cargar el bloque.')
      }
      const byKey = new Map((questions as NbmeQuestion[]).map(q => [questionRefKey(q), q]))
      return refs.map(ref => byKey.get(questionRefKey(ref))!)
    },
    async figure(assetId: string, signal?: AbortSignal): Promise<Blob> {
      if (!/^[a-zA-Z0-9_.-]+$/.test(assetId)) throw new Error('La referencia de esta imagen no es válida.')
      const response = await request(`/api/nbme/assets/${encodeURIComponent(assetId)}`, { signal })
      const blob = await response.blob()
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || blob.size > 10 * 1024 * 1024) {
        throw new Error('La imagen recibida no tiene un formato válido.')
      }
      return blob
    },
  }
}
