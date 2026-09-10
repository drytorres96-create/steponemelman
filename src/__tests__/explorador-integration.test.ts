// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ, IndiceZ } from '../schema/concept'
import type { EstadoApp } from '../store/model'
import type { CloudSnapshot, SyncReply } from '../store/sync'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), load: vi.fn(), rpc: vi.fn(), indice: vi.fn(), conceptos: vi.fn() }))
vi.mock('../store/db', () => ({ leer: mocks.read, escribir: mocks.write }))
vi.mock('../data/corpus', () => ({ cargarIndice: mocks.indice, cargarMigraciones: async () => ({}), cargarTodo: mocks.conceptos }))
vi.mock('../lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.load }) }) }), rpc: mocks.rpc,
} }))

import { ProveedorEstado, useApp } from '../store/estado'
import { ExploradorConceptos } from '../screens/ExploradorConceptos'

const base = ConceptoZ.parse({
  concept_id: 'QA-001', source: { doc: 'QA', doc_title: 'Documento sintético', page: 1, item_id: 'QA-I1', fragment: 'FRAGMENTO SINTÉTICO OCULTO' },
  objetivo: 'Conectar presión alfa', afirmacion: 'AFIRMACIÓN SINTÉTICA OCULTA', respuesta_canonica: 'RESPUESTA SINTÉTICA OCULTA',
  explicacion: 'EXPLICACIÓN SINTÉTICA OCULTA', sinonimos: ['término alfa'],
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Cardiovascular', tema: 'Presión', tipo_conocimiento: 'Mecanismo', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre' }, evaluacion: { pregunta: 'PREGUNTA SINTÉTICA DE PRUEBA' },
  pistas: ['Pista 1', 'Pista 2', 'Pista 3'], calidad: { confianza: 1, estado: 'aprobado' },
})
const conceptos = Array.from({ length: 25 }, (_, n) => ConceptoZ.parse({ ...base,
  concept_id: `QA-${String(n + 1).padStart(3, '0')}`, objetivo: n === 0 ? base.objetivo : n === 1 ? 'Entender señal beta' : `Objetivo sintético ${n + 1}`,
  sinonimos: n === 0 ? base.sinonimos : [],
  clasificacion: { ...base.clasificacion, ...(n === 1 ? { disciplina_primaria: 'Patología', sistema_primario: 'Renal', tema: 'Señal' } : n === 0 ? {} : { tema: 'Control' }) },
}))
const indice = IndiceZ.parse({ schema_version: '1.0.0', corpus_version: '1.0.2', n_conceptos: conceptos.length, documentos: ['QA'], glosario: [], cuarentena: 0,
  modulos: [{ module_id: 'QA-MOD', nombre: 'Módulo sintético', proposito: 'Verificar búsqueda', prerrequisitos: [], disciplinas: ['Fisiología', 'Patología'],
    sistemas: ['Cardiovascular', 'Renal'], temas: ['Presión', 'Señal', 'Control'], n_conceptos: conceptos.length, minutos_estimados: 10, cobertura_documental: ['QA'], orden: 1,
    sesiones: [{ session_id: 'QA-S1', titulo: 'Sesión sintética', objetivo: 'Prueba', conceptos: conceptos.map(c => c.concept_id) }] }] })
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
let root: Root
let host: HTMLDivElement
let row: CloudSnapshot | null
const onEstudiar = vi.fn()

function Harness({ activo }: { activo: boolean }) {
  const api = useApp()
  return api.listo ? createElement(ExploradorConceptos, { activo, onEstudiar }) : null
}
async function render(activo = true) {
  await act(async () => root.render(createElement(StrictMode, null, createElement(ProveedorEstado, {
    userId: 'qa-explorador', children: createElement(Harness, { activo }),
  }))))
}
function button(label: string): HTMLButtonElement {
  const result = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  if (!result) throw new Error(`Falta ${label}: ${host.textContent}`)
  return result
}
async function click(label: string) { await act(async () => button(label).click()) }
async function buscar(value: string) {
  const label = [...host.querySelectorAll('label')].find(l => l.textContent === 'Buscar conceptos')!
  const input = label ? host.querySelector<HTMLInputElement>(`input[id="${label.htmlFor}"]`)! : null
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function filtrar(label: string, value: string) {
  const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
  expect(select).not.toBeNull()
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
}
const resultados = () => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  localStorage.clear()
  row = null
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  mocks.read.mockResolvedValue(null)
  mocks.write.mockResolvedValue(undefined)
  mocks.indice.mockResolvedValue(indice)
  mocks.conceptos.mockResolvedValue(conceptos)
  mocks.load.mockImplementation(async () => ({ data: clone(row), error: null }))
  mocks.rpc.mockImplementation(async (_name: string, params: { p_state: EstadoApp; p_generation: string | null }) => {
    row = { state: clone(params.p_state), generation: params.p_generation ?? 'qa-generation', revision: (row?.revision ?? 0) + 1,
      user_id: 'qa-explorador', updated_at: new Date().toISOString() }
    return { data: { ok: true, kind: 'saved', row: clone(row) } satisfies SyncReply, error: null }
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

describe('explorador integrado con el estado de estudio', () => {
  it('no carga los conceptos hasta abrir el explorador', async () => {
    await render(false)
    expect(mocks.conceptos).not.toHaveBeenCalled()
    await render(true)
    expect(mocks.conceptos).toHaveBeenCalledWith(indice.modulos)
    expect(host.textContent).toContain('Conectar presión alfa')
    expect(host.textContent).not.toMatch(/AFIRMACIÓN SINTÉTICA|RESPUESTA SINTÉTICA|EXPLICACIÓN SINTÉTICA|FRAGMENTO SINTÉTICO/)
  })

  it('encuentra texto sin acentos y combina la búsqueda con filtros de área', async () => {
    await render()
    await buscar('presion alfa')
    expect(resultados()).toHaveLength(1)
    expect(host.textContent).toContain('Conectar presión alfa')
    expect(host.textContent).not.toContain('Entender señal beta')
    await filtrar('Filtrar conceptos por disciplina', 'Patología')
    expect(resultados()).toHaveLength(0)
    await buscar('')
    expect(resultados()).toHaveLength(1)
    expect(host.textContent).toContain('Entender señal beta')
    await filtrar('Filtrar conceptos por sistema', 'Cardiovascular')
    expect(resultados()).toHaveLength(0)
  })

  it('conserva la selección entre páginas y no permite enviar más de 20 conceptos', async () => {
    await render()
    const primeraPagina = resultados()
    expect(primeraPagina).toHaveLength(20)
    for (const checkbox of primeraPagina) await act(async () => checkbox.click())
    await click('Siguiente')
    expect(resultados()).toHaveLength(5)
    expect(resultados().every(c => c.disabled)).toBe(true)
    await click('Practicar selección (20)')
    const ids = onEstudiar.mock.calls.at(-1)?.[0] as string[]
    expect(ids).toHaveLength(20)
    expect(new Set(ids).size).toBe(20)
    expect(ids.every(id => conceptos.some(c => c.concept_id === id))).toBe(true)
    await click('Anterior')
    expect(resultados().every(c => c.checked)).toBe(true)
  })

  it('ofrece reintentar después de un error de carga sin perder acceso a la pantalla', async () => {
    mocks.conceptos.mockRejectedValue(new Error('sin conexión'))
    await render()
    expect(host.textContent).toContain('No se pudieron cargar los conceptos')
    mocks.conceptos.mockResolvedValue(conceptos)
    await click('Volver a intentar')
    expect(host.textContent).toContain('Conectar presión alfa')
    expect(resultados()).toHaveLength(20)
  })
})
