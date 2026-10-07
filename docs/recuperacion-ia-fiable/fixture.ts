import type { Page, Route } from '@playwright/test'
import { catalogoNbmeReal, NBME_REAL_SESSION, preguntaNbmeReal } from '../../e2e/arnes/nbme-real-fixture'

export const AHORA = new Date('2026-10-05T11:30:00Z')
export const CUOTA_80 = { presupuesto: 8500, restantes: 6800, gastadas: 1700, llamadas: 1,
  activa: true, presupuestoUsuario: 7650, restantesUsuario: 6120 }
export const ERROR_TEMPORAL = { error: 'Cloudflare tardó demasiado en preparar los ejercicios. Puedes volver a intentarlo o continuar tu pregunta.', codigo: 'tiempo' }
export const RECUPERACION = { objetivo: 'Distinguish the first, second and last synthetic tokens.',
  source: { title: 'Synthetic demonstration source', page: 1 }, cached: false,
  ejercicios: [
    { id: 'rec-1', tipo: 'completar', pregunta: 'The first synthetic token is ____.', respuesta: 'alpha', explicacion: 'Alpha comes first.', evidencia: 'The first synthetic token is alpha.' },
    { id: 'rec-2', tipo: 'verdadero_falso', pregunta: 'The first synthetic token is alpha.', respuesta: 'Verdadero', explicacion: 'This matches the synthetic source.', evidencia: 'The first synthetic token is alpha.' },
    { id: 'rec-3', tipo: 'seleccion', pregunta: 'Which is the second synthetic token?', respuesta: 'beta', alternativas: ['alpha', 'beta', 'gamma'], explicacion: 'Beta comes second.', evidencia: 'The second synthetic token is beta.' },
    { id: 'rec-4', tipo: 'discriminar', pregunta: 'Which is the last synthetic token?', respuesta: 'gamma', alternativas: ['beta', 'gamma'], explicacion: 'Gamma comes last.', evidencia: 'The last synthetic token is gamma.' },
  ],
}

export async function instalarRed(page: Page, generar: (route: Route, numero: number) => Promise<void>) {
  const generaciones: { method: string; body: unknown; authorization?: string }[] = []
  const otrasIA: string[] = []
  const errores: string[] = []
  page.on('pageerror', error => errores.push(String(error)))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: AHORA })
  await page.route('**/*', async route => {
    const u = new URL(route.request().url())
    if (!['localhost', '127.0.0.1'].includes(u.hostname)) return route.abort()
    if (!u.pathname.startsWith('/api/')) return route.continue()
    if (u.pathname === '/api/nbme/catalog') return route.fulfill({ json: catalogoNbmeReal() })
    if (u.pathname === '/api/nbme/questions') {
      const refs = route.request().postDataJSON().refs as { id: string; revision?: string }[]
      return route.fulfill({ json: { questions: refs.map(ref => preguntaNbmeReal(ref.id, ref.revision)) } })
    }
    if (u.pathname === '/api/ia/estado') return route.fulfill({ json: CUOTA_80 })
    if (u.pathname === '/api/ia/recuperacion-nbme') {
      generaciones.push({ method: route.request().method(), body: route.request().postDataJSON(),
        authorization: route.request().headers()['authorization'] })
      return generar(route, generaciones.length)
    }
    if (u.pathname === '/api/ia/error' || u.pathname === '/api/calificar') otrasIA.push(u.pathname)
    return route.fulfill({ status: 503, json: { error: 'Synthetic backend unavailable.' } })
  })
  return { generaciones, otrasIA, errores }
}

export async function abrirOriginal(page: Page) {
  await page.goto('/?escena=atraso&proveedor=nbme-real#progreso')
  await page.getByRole('heading', { name: 'Progreso', exact: true }).waitFor()
  await page.getByText('Ponerme al día con la meta', { exact: true }).click()
  await page.getByRole('button', { name: 'Retomar mi sesión pendiente', exact: true }).click()
  await page.getByRole('heading', { name: 'Pregunta 1 de 2', exact: true }).waitFor()
}

/** Resolve this only when the test decides to deliver the HTTP response. */
export function retenerRespuesta() {
  let soltar!: () => void
  const puerta = new Promise<void>(resolve => { soltar = resolve })
  let iniciada!: () => void
  const inicio = new Promise<void>(resolve => { iniciada = resolve })
  let terminada!: () => void
  const fin = new Promise<void>(resolve => { terminada = resolve })
  return { inicio, fin, soltar, manejar: async (route: Route) => {
    iniciada()
    await puerta
    try { await route.fulfill({ json: RECUPERACION }) }
    catch { /* A real fetch cancellation can make the retained route unavailable. */ }
    finally { terminada() }
  } }
}

export const leerBanco = (page: Page) => page.evaluate(() => window.__leerNbmeReal())
export const leerEstudio = (page: Page) => page.evaluate(() => window.__leerProgresoSintetico())
export const leerRecuperacionLocal = (page: Page) => page.evaluate(() => Object.keys(localStorage)
  .filter(key => key.startsWith('step1-recuperacion-nbme:')).map(key => JSON.parse(localStorage.getItem(key)!)))
export { NBME_REAL_SESSION }
