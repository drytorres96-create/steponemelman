// @vitest-environment jsdom
/** Reproducible visual review of REAL screens, with synthetic data and no network/session.
 * MELMAN_DESIGN_EXPORT=../qa/melman-review npm test -- src/__tests__/design-export.test.tsx
 * This is a Vitest-only harness. It is never imported by the application or production build.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConceptoZ, IndiceZ } from '../schema/concept'
import { ESTADO_INICIAL } from '../store/model'
import { emptyNbmeState } from '../nbme/model'
import type { ProgresoConcepto } from '../srs/tipos'
import type { SesionSemanal } from '../semana/tipos'
import type { PlanSemana } from '../plan/tipos'

const mock = vi.hoisted(() => ({ app: vi.fn(), auth: vi.fn(), nbme: vi.fn(), concepts: vi.fn(), plan: vi.fn(), sessions: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: mock.auth, authErrorMessage: () => 'Error de demostración' }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: mock.nbme }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: {}, from: () => { throw new Error('El harness no permite consultar Supabase') } } }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.concepts, cargarConceptos: vi.fn(), cargarModulo: vi.fn() }))
vi.mock('../semana/api', () => ({ cargarSesionesSemana: mock.sessions, cargarHistorialSesiones: mock.sessions, guardarAvance: vi.fn() }))
vi.mock('../plan/api', () => ({ cargarPlanSemana: mock.plan, cargarAdherencia: async () => [
  { eventoId: 'DEMO-S1', titulo: 'S1 · Demostración', hechas: 12, tareas: 15 },
  { eventoId: 'DEMO-S2', titulo: 'S2 · Demostración', hechas: 7, tareas: 15 },
], marcarCheckpoint: vi.fn(), PlanEscrituraError: class extends Error {} }))
vi.mock('../lib/cuota-ia', () => ({ useCuotaIA: () => ({ presupuesto: 100, restantes: 82, gastadas: 18, llamadas: 0, activa: true }), porcentajeRestante: () => 82, notificarUsoIA: vi.fn(), refrescarCuota: vi.fn() }))

import App from '../App'
import { AuthGate } from '../auth/AuthGate'

const conceptos = Array.from({ length: 24 }, (_, i) => ConceptoZ.parse({
  concept_id: `DEMO-${i + 1}`, source: { doc: 'DEMO', doc_title: 'Fuente sintética', page: 1, item_id: String(i + 1), fragment: 'Sin material clínico' },
  objetivo: `Objetivo de práctica ${i + 1}`, afirmacion: 'Contenido sintético para revisión visual', respuesta_canonica: 'Demostración', explicacion: 'Ejemplo de interfaz sin contenido clínico.',
  clasificacion: { disciplina_primaria: ['Fisiología', 'Farmacología', 'Patología'][i % 3], sistema_primario: ['Cardiovascular', 'Respiratorio'][i % 2], tema: 'Tema de demostración', tipo_conocimiento: 'Asociación', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'opcion_multiple' },
  evaluacion: { pregunta: 'Pregunta de demostración', opciones: [{ texto: 'Ejemplo A', correcta: true }, { texto: 'Ejemplo B', correcta: false }] },
  pistas: ['Demostración 1', 'Demostración 2', 'Demostración 3'], calidad: { confianza: 1, estado: 'aprobado' },
}))
const indice = IndiceZ.parse({ schema_version: '1.0.0', corpus_version: 'demo', n_conceptos: 24, documentos: ['DEMO'], glosario: [], cuarentena: 0,
  modulos: Array.from({ length: 4 }, (_, i) => ({ module_id: `DEMO-M${i}`, nombre: `Módulo de práctica ${i + 1}`, proposito: 'Objetivos de demostración para revisar la interfaz.', prerrequisitos: [], disciplinas: ['Fisiología', 'Farmacología'], sistemas: ['Cardiovascular', 'Respiratorio'], temas: ['Tema de demostración'], n_conceptos: 6, minutos_estimados: 20, cobertura_documental: ['DEMO'], orden: i,
    sesiones: [{ session_id: `DEMO-MS${i}`, titulo: 'Sesión de práctica', objetivo: 'Objetivo de demostración', conceptos: conceptos.slice(i * 6, i * 6 + 6).map(c => c.concept_id) }] })) })
const sesiones: SesionSemanal[] = Array.from({ length: 5 }, (_, i) => ({ id: `DEMO-S${i + 1}`, semana: 'S2', semanaInicio: '2026-09-14', dia: i + 1, orden: 1,
  titulo: 'Sesión de práctica', subtitulo: 'Continúa con los objetivos preparados para este día.', guion: conceptos.slice(0, 12).map(c => ({ kind: 'concepto' as const, id: c.concept_id })), presupuestoMin: 30,
  estado: i < 2 ? 'completada' : 'pendiente', cursor: i === 2 ? 3 : 0, nbmeSessionId: null, completadaEn: i < 2 ? '2026-09-15T10:00:00Z' : null }))
const plan: PlanSemana = { eventoId: 'DEMO-S2', titulo: 'S2 · 14–19 sep · Sesiones de práctica y repaso', inicio: '2026-09-14', fin: '2026-09-19', nota: 'Plan sintético para revisar la composición; no representa un plan de estudio real.',
  checkpoints: Array.from({ length: 6 }, (_, i) => i === 5 ? [{ id: 100, idx: 100, dia: 6, kind: 'descanso' as const, label: 'Descanso', done: false, doneAt: null }] : [
    { id: i * 3 + 1, idx: i * 3 + 1, dia: i + 1, kind: 'qbank' as const, label: 'Bloque de práctica · 10 preguntas', done: i < 3, doneAt: null },
    { id: i * 3 + 2, idx: i * 3 + 2, dia: i + 1, kind: 'tarjetas' as const, label: `StepOneMelman · Sesión de la semana ${i + 1}/5 · Sesión de práctica`, done: i < 2, doneAt: null },
    { id: i * 3 + 3, idx: i * 3 + 3, dia: i + 1, kind: 'podcast' as const, label: 'Audio de repaso', done: i < 2, doneAt: null },
  ]).flat() }
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
const network = vi.fn(() => { throw new Error('Las revisiones visuales no pueden llamar a la red') })
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 8, 16, 10, 30))
  vi.stubGlobal('fetch', network)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const now = Date.now()
  const progreso = Object.fromEntries(conceptos.slice(0, 14).map((c, i) => [c.concept_id, {
    concept_id: c.concept_id, estado: 'en_aprendizaje', dificultad: 5, estabilidad: 1, ultimo: now - 86400000,
    proxima: i < 5 ? now - 3600000 : now + 86400000, aciertos: 1, fallos: 0, dominado_en: null,
    intentos: [{ ts: now - 86400000, resultado: 'correcta', calificacion: 3, interaccion: 'opcion_multiple', recuperacion_activa: true, pistas_usadas: 0, ms: 5000, tipo_error: 'ninguno', confianza_declarada: 2, session_id: i < 3 ? 'DEMO-S3' : 'DEMO-S1' }],
  }])) as Record<string, ProgresoConcepto>
  mock.app.mockReturnValue({ listo: true, indice, estado: { ...ESTADO_INICIAL, progreso }, sincronizacion: { estado: 'sincronizado' }, sincronizarAhora: vi.fn() })
  mock.auth.mockReturnValue({ user: null, session: null, loading: false, signOut: vi.fn() })
  mock.nbme.mockReturnValue({ state: emptyNbmeState(), catalog: { schemaVersion: 1, bankVersion: 'demo', total: 0, questions: [] }, loading: false, busy: false, syncStatus: { state: 'synced' }, pauseSession: vi.fn() })
  mock.concepts.mockResolvedValue(conceptos); mock.sessions.mockResolvedValue(sesiones); mock.plan.mockResolvedValue(plan)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('exports real screen DOM with synthetic providers and no network, auth bypass or medical corpus', async () => {
  const out = process.env.MELMAN_DESIGN_EXPORT
  const styles = ['nbme/nbme.css', 'auth/auth.css', 'styles.css', 'editorial.css', 'organic.css']
  if (out) {
    mkdirSync(resolve(out, 'styles'), { recursive: true })
    for (const file of styles) writeFileSync(resolve(out, 'styles', file.replaceAll('/', '-')), readFileSync(resolve('src', file)))
  }
  for (const [file, route] of [['semana', 'semana'], ['biblioteca', 'modulos'], ['progreso', 'progreso'], ['recuperacion', 'recuperacion'], ['acceso', 'auth']] as const) {
    window.history.replaceState(null, '', `/#${route}`)
    await act(async () => { root.render(route === 'auth' ? <AuthGate>{() => <div>Unexpected private session</div>}</AuthGate> : <App key={route} />) })
    await act(async () => { await Promise.resolve() })
    expect(host.querySelector('h1')).not.toBeNull()
    expect(host.textContent).not.toContain('Cargando')
    expect(host.textContent).not.toContain('Unexpected private session')
    if (route === 'semana') expect(host.querySelectorAll('.plan-panel')).toHaveLength(1)
    if (out) {
      // React's submit handler is absent after serialization. Keep QA forms inert too,
      // so a password typed into this static preview cannot become a native GET query.
      const snapshot = host.cloneNode(true) as HTMLDivElement
      for (const form of snapshot.querySelectorAll('form')) {
        form.setAttribute('onsubmit', 'return false')
        form.setAttribute('inert', '')
      }
      const markup = snapshot.innerHTML
      const css = styles.map(s => `<link rel="stylesheet" href="./styles/${s.replaceAll('/', '-')}">`).join('\n')
      writeFileSync(resolve(out, `${file}.html`), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Melman · ${file} · DEMO</title>${css}<script src="/depth-motion.js?v=1" defer></script><style>.qa-demo{position:fixed;bottom:10px;left:12px;z-index:100;background:#1c1427;color:#dfc8f0;border:1px solid #b895d670;padding:6px 9px;border-radius:6px;font:9px system-ui;letter-spacing:.04em;pointer-events:none}@media(max-width:760px){.qa-demo{bottom:0;font-size:8px;padding:1px 5px;line-height:10px}}</style></head><body><aside class="qa-demo">DEMO · Datos sintéticos · 16 sep 2026 · Vista estática</aside><div id="root">${markup}</div></body></html>`)
    }
  }
  expect(network).not.toHaveBeenCalled()
  if (out) writeFileSync(resolve(out, 'README.txt'), 'QA reproducible: MELMAN_DESIGN_EXPORT=../qa/melman-review npm test -- src/__tests__/design-export.test.tsx\nHTML estático de componentes REALES: App, Semana, Modulos, Progreso, Recuperacion, AuthGate. Solo movimiento decorativo; sin acceso a sesión/corpus/red.\nDatos sintéticos y reloj 16-sep-2026. CSS copiado en orden real verificado en el build (nbme, auth, styles, editorial, organic).\nRecursos públicos: /images/cinematic/, incluido luminous/ocean-desktop.webp. El host de revisión puede remapear ese prefijo sin cambiar el DOM de componentes.\n')
})
