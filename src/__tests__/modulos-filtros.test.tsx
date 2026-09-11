// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ, IndiceZ } from '../schema/concept'
import { ESTADO_INICIAL } from '../store/model'
import type { ProgresoConcepto } from '../srs/tipos'

const mock = vi.hoisted(() => ({ app: vi.fn(), cargarTodo: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargarTodo }))
import { Modulos } from '../screens/Modulos'

const base = ConceptoZ.parse({
  concept_id: 'QA-farmaco', source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: '1', fragment: 'Prueba sintética' },
  objetivo: 'Objetivo alfa', afirmacion: 'Contenido sintético', respuesta_canonica: 'Alfa', explicacion: 'Explicación sintética',
  clasificacion: { disciplina_primaria: 'Farmacología', sistema_primario: 'Endocrino', tema: 'Tema alfa', tipo_conocimiento: 'Asociación', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'opcion_multiple' },
  evaluacion: { pregunta: '¿Qué término corresponde?', opciones: [{ texto: 'Alfa', correcta: true }, { texto: 'Beta', correcta: false }] },
  pistas: ['Pista 1', 'Pista 2', 'Pista 3'], calidad: { confianza: 1, estado: 'aprobado' },
})
const cs = [base,
  ConceptoZ.parse({ ...base, concept_id: 'QA-secundario', objetivo: 'Objetivo con etiquetas secundarias', clasificacion: {
    ...base.clasificacion, disciplina_primaria: 'Patología', disciplinas_secundarias: ['Farmacología'],
    sistema_primario: 'Multisistémico', sistemas_secundarios: ['Endocrino'],
  } }),
  ConceptoZ.parse({ ...base, concept_id: 'QA-solo-sistema', objetivo: 'Solo endocrino', clasificacion: { ...base.clasificacion, disciplina_primaria: 'Fisiología' } }),
  ConceptoZ.parse({ ...base, concept_id: 'QA-solo-disciplina', objetivo: 'Solo farmacología', clasificacion: { ...base.clasificacion, sistema_primario: 'Cardiovascular' } }),
]
const indice = IndiceZ.parse({ schema_version: '1.0.0', corpus_version: '1.0.3', n_conceptos: 4, documentos: ['QA'], glosario: [], cuarentena: 0,
  modulos: [{ module_id: 'QA-MOD', nombre: 'Módulo de prueba', proposito: 'Probar intersecciones', prerrequisitos: [], disciplinas: ['Farmacología', 'Fisiología', 'Patología'],
    sistemas: ['Endocrino', 'Cardiovascular', 'Multisistémico'], temas: ['Tema alfa'], n_conceptos: 4, minutos_estimados: 10, cobertura_documental: ['QA'], orden: 1,
    sesiones: [{ session_id: 'QA-S1', titulo: 'Sesión de prueba', objetivo: 'Prueba', conceptos: cs.map(c => c.concept_id) }] }] })
const onAbrir = vi.fn(), onEstudiar = vi.fn()
let root: Root, host: HTMLDivElement
let progreso: Record<string, ProgresoConcepto>
const ahora = Date.now()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  // Todos ya se estudiaron y aún no están vencidos: la práctica manual debe funcionar igualmente.
  progreso = Object.fromEntries(cs.map(c => [c.concept_id, {
    concept_id: c.concept_id, estado: 'en_aprendizaje', dificultad: 5, estabilidad: 1, ultimo: ahora,
    proxima: ahora + 86_400_000, aciertos: 1, fallos: 0, dominado_en: null,
    intentos: [{ ts: ahora, resultado: 'correcta', calificacion: 3, interaccion: 'opcion_multiple', recuperacion_activa: true,
      pistas_usadas: 0, ms: 5000, tipo_error: 'ninguno', confianza_declarada: 2 }],
  }])) as Record<string, ProgresoConcepto>
  mock.app.mockImplementation(() => ({ indice, estado: { ...ESTADO_INICIAL, progreso } }))
  mock.cargarTodo.mockResolvedValue(cs)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })
async function render() { await act(async () => root.render(<Modulos onAbrir={onAbrir} onEstudiar={onEstudiar} />)) }
function button(label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)
  if (!found) throw new Error(`No está el botón ${label}`)
  return found
}
async function click(label: string) { await act(async () => button(label).click()) }
async function filter(label: string, value: string) {
  const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
  expect(select).toBeTruthy()
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
}
async function combine() { await filter('Filtrar por disciplina', 'Farmacología'); await filter('Filtrar por sistema', 'Endocrino') }

describe('sesiones personalizadas con filtros reales de conceptos', () => {
  it('lanza la intersección exacta incluso con todos los resultados vistos y al día', async () => {
    await render(); await combine()
    expect(host.textContent).toContain('2 conceptos coincidentes')
    await click('Practicar filtros (2)')
    expect(onEstudiar).toHaveBeenLastCalledWith(['QA-farmaco', 'QA-secundario'], expect.objectContaining({ subtitulo: 'Farmacología · Endocrino' }))
    expect(onAbrir).not.toHaveBeenCalled()
  })

  it('aplica los mismos filtros al módulo y a sus sesiones sin incluir hermanos no coincidentes', async () => {
    await render(); await combine()
    await click('Hasta 10 conceptos')
    expect(onEstudiar.mock.calls.at(-1)?.[0]).toEqual(['QA-farmaco', 'QA-secundario'])
    await click('Ver 1 sesiones')
    const sesion = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Sesión de prueba'))!
    await act(async () => sesion.click())
    expect(onEstudiar.mock.calls.at(-1)?.[0]).toEqual(['QA-farmaco', 'QA-secundario'])
    expect(onAbrir).not.toHaveBeenCalled()
  })

  it('filtra rutas especializadas, conserva modo examen y explica rutas sin candidatos', async () => {
    await render(); await combine()
    const examen = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.startsWith('Práctica sin ayuda'))!
    await act(async () => examen.click())
    const [ids, meta] = onEstudiar.mock.calls.at(-1)!
    expect([...ids].sort()).toEqual(['QA-farmaco', 'QA-secundario'])
    expect(meta.ruta).toBe('examen')
    onEstudiar.mockClear()
    const repaso = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.startsWith('Repaso espaciado'))!
    await act(async () => repaso.click())
    expect(onEstudiar).not.toHaveBeenCalled()
    expect(host.textContent).toContain('No hay conceptos elegibles')
    expect(host.textContent).toContain('Puedes usar «Practicar filtros»')
  })

  it('comparte los filtros con Buscar conceptos y puede iniciar sin seleccionar casillas', async () => {
    await render(); await combine(); await click('Buscar conceptos')
    expect(host.querySelector<HTMLSelectElement>('#busqueda-disciplina')?.value).toBe('Farmacología')
    expect(host.querySelector<HTMLSelectElement>('#busqueda-sistema')?.value).toBe('Endocrino')
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    const panel = host.querySelector('#panel-conceptos')!
    const iniciar = [...panel.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.startsWith('Practicar filtros'))!
    await act(async () => iniciar.click())
    expect(onEstudiar.mock.calls.at(-1)?.[0]).toEqual(['QA-farmaco', 'QA-secundario'])
    await filter('Filtrar conceptos por sistema', 'Cardiovascular'); await click('Módulos y rutas')
    expect(host.querySelector<HTMLSelectElement>('#modulos-sistema')?.value).toBe('Cardiovascular')
    await click('Practicar filtros (1)')
    expect(onEstudiar.mock.calls.at(-1)?.[0]).toEqual(['QA-solo-disciplina'])
  })

  it('los errores de carga permiten reintentar sin ofrecer una sesión fuera de los filtros', async () => {
    mock.cargarTodo.mockRejectedValue(new Error('sin conexión'))
    await render()
    expect(button('Practicar filtros (0)').disabled).toBe(true)
    expect(host.textContent).toContain('No se pudieron cargar los conceptos para filtrar')
    mock.cargarTodo.mockResolvedValue(cs)
    await click('Reintentar filtros'); await combine(); await click('Practicar filtros (2)')
    expect(onEstudiar.mock.calls.at(-1)?.[0]).toEqual(['QA-farmaco', 'QA-secundario'])
  })
})
