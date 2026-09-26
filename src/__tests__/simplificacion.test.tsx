import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ, IndiceZ } from '../schema/concept'
import { ESTADO_INICIAL, type EstadoApp } from '../store/model'
import { csvAuditoria, celdaCSV, jsonNotas } from '../lib/exportar-auditoria'

const mock = vi.hoisted(() => ({ app: vi.fn(), cargar: vi.fn(), leer: vi.fn(), escribir: vi.fn(), descargar: vi.fn(),
  semanas: vi.fn(), plan: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../store/db', () => ({ leer: mock.leer, escribir: mock.escribir }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargar, cargarCuarentena: async () => ({ conceptos: [] }) }))
vi.mock('../components/descarga', () => ({ useDescarga: () => ({ entregar: mock.descargar, dialogo: null }) }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({ state: { schemaVersion: 1, marca: 'preguntas' } }) }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'token-sintetico' } }) }))
vi.mock('../semana/api', () => ({ cargarHistorialSesiones: mock.semanas }))
vi.mock('../plan/api', () => ({ cargarPlanSemana: mock.plan }))
import { Ajustes, LIMITE_EXTRAS_MS } from '../screens/Ajustes'
import { Auditoria } from '../screens/Auditoria'

const c = ConceptoZ.parse({ concept_id: 'QA-uno', source: { doc: 'QA', doc_title: 'Documento sintético', page: 1, item_id: 'I', fragment: 'Ejemplo sintético.' },
  objetivo: 'Reconocer alfa', afirmacion: 'Alfa es primero.', respuesta_canonica: 'alfa', explicacion: 'Explicación sintética.',
  clasificacion: { disciplina_primaria: 'Fisiología', disciplinas_secundarias: ['Farmacología'], sistema_primario: 'Cardiovascular', sistemas_secundarios: ['Endocrino'], tema: 'Secuencia', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre' }, evaluacion: { pregunta: '¿Cuál es primero?' }, pistas: ['uno', 'dos', 'tres'], calidad: { estado: 'aprobado', confianza: 1 } })
const cs = [c, ...['dos', 'tres', 'cuatro'].map(x => ConceptoZ.parse({ ...c, concept_id: `QA-${x}` }))]
const indice = IndiceZ.parse({ schema_version: '1.0.0', corpus_version: '1.0.5', n_conceptos: 0, modulos: [], documentos: ['QA'], glosario: [], cuarentena: 0 })
let host: HTMLDivElement, root: Root, estado: EstadoApp
const guardar = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  estado = { ...ESTADO_INICIAL, criterios: { ...ESTADO_INICIAL.criterios }, progreso: {} }
  guardar.mockImplementation(c => { estado = { ...estado, criterios: c } })
  mock.app.mockImplementation(() => ({ estado, actualizarCriterios: guardar,
    exportar: (extra?: Record<string, unknown>) => JSON.stringify({ ...estado, ...extra }), indice }))
  mock.cargar.mockResolvedValue(cs); mock.leer.mockResolvedValue({}); mock.escribir.mockResolvedValue(undefined)
  mock.semanas.mockResolvedValue([{ id: 'semana-sintetica' }]); mock.plan.mockResolvedValue({ eventoId: 'S-sintetica' })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })
const boton = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!
const click = async (label: string) => { expect(boton(label)).toBeTruthy(); await act(async () => boton(label).click()) }
async function escribir(selector: string, texto: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!
  expect(input).toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('simplificación con datos conservados', () => {
  it('Exportar progreso entrega un solo archivo con conceptos, preguntas NBME, sesiones de la semana y plan', async () => {
    await act(async () => root.render(<Ajustes />))
    await click('Exportar progreso')
    const [nombre, contenido, tipo] = mock.descargar.mock.calls[0]
    expect(nombre).toMatch(/^progreso-step1-\d{4}-\d{2}-\d{2}\.json$/)
    expect(tipo).toBe('application/json')
    expect(JSON.parse(contenido)).toMatchObject({ version: 1, nbme: { schemaVersion: 1, marca: 'preguntas' },
      semanas: [{ id: 'semana-sintetica' }], plan: { eventoId: 'S-sintetica' } })
    expect(mock.plan).toHaveBeenCalledWith('token-sintetico')
    expect(host.textContent).toContain('La copia incluye los conceptos, las preguntas NBME, las sesiones de la semana y el plan')
    expect(boton('Exportar progreso').disabled).toBe(false)
  })

  it('si las sesiones fallan o el plan no responde, el respaldo sale igual sin ellos', async () => {
    vi.useFakeTimers()
    mock.semanas.mockRejectedValue(new Error('sin red'))
    mock.plan.mockReturnValue(new Promise(() => undefined))
    await act(async () => root.render(<Ajustes />))
    await act(async () => { boton('Exportar progreso').click() })
    expect(boton('Preparando la copia…').disabled).toBe(true)
    expect(mock.descargar).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(LIMITE_EXTRAS_MS) })
    const archivo = JSON.parse(mock.descargar.mock.calls[0][1])
    expect(archivo).toMatchObject({ version: 1, nbme: { marca: 'preguntas' }, semanas: null, plan: null })
    expect(boton('Exportar progreso').disabled).toBe(false)
    vi.useRealTimers()
  })

  it('edita criterios como borrador, valida y guarda todos en una sola operación', async () => {
    await act(async () => root.render(<Ajustes />))
    expect(host.querySelector('details')?.open).toBe(false)
    await escribir('#criterio-recuperaciones', '0')
    await escribir('#criterio-sesiones', '4')
    expect(guardar).not.toHaveBeenCalled()
    await click('Aplicar criterios')
    expect(guardar).not.toHaveBeenCalled()
    expect(host.textContent).toContain('usa un entero entre 1 y 10')
    await escribir('#criterio-recuperaciones', '05')
    await click('Aplicar criterios')
    expect(guardar).toHaveBeenCalledExactlyOnceWith({ ...ESTADO_INICIAL.criterios, recuperaciones: 5, sesiones: 4 })
    expect(boton('Aplicar criterios').disabled).toBe(true)
    expect(host.querySelector<HTMLInputElement>('#criterio-recuperaciones')?.value).toBe('5')
  })

  it('un cambio remoto conserva el borrador y exige recargarlo antes de aplicar', async () => {
    await act(async () => root.render(<Ajustes />))
    await escribir('#criterio-recuperaciones', '5')
    estado = { ...estado, criterios: { ...estado.criterios, recuperaciones: 7 } }
    await act(async () => root.render(<Ajustes />))
    expect(host.querySelector<HTMLInputElement>('#criterio-recuperaciones')?.value).toBe('5')
    expect(boton('Aplicar criterios').disabled).toBe(true)
    await click('Recargar valores')
    expect(host.querySelector<HTMLInputElement>('#criterio-recuperaciones')?.value).toBe('7')
    expect(guardar).not.toHaveBeenCalled()
  })

  it('conserva una nota al cerrar con Escape y exporta también las que están fuera del filtro', async () => {
    mock.leer.mockResolvedValue({ 'QA-fuera': { nota: 'Nota anterior fuera del filtro' } })
    await act(async () => root.render(<Auditoria />))
    await click('Revisar')
    await escribir('textarea[aria-label="Nota de revisión"]', 'Nota nueva antes de Escape')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    await escribir('input[aria-label="Buscar conceptos"]', 'QA-uno')
    await click('Exportar notas')
    const contenido = JSON.parse(mock.descargar.mock.calls.at(-1)![1])
    expect(contenido.correcciones).toEqual({ 'QA-fuera': { nota: 'Nota anterior fuera del filtro' }, 'QA-uno': { nota: 'Nota nueva antes de Escape' } })
    expect(mock.escribir).toHaveBeenLastCalledWith('correcciones-auditoria', contenido.correcciones, { estricto: true })
  })

  it('no permite editar antes de leer las notas y avisa si falla la escritura', async () => {
    let terminar!: (value: unknown) => void
    mock.leer.mockImplementation(() => new Promise(resolve => { terminar = resolve }))
    await act(async () => root.render(<Auditoria />))
    await click('Revisar')
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Nota de revisión"]')?.disabled).toBe(true)
    await act(async () => terminar({}))
    mock.escribir.mockRejectedValue(new Error('cuota'))
    await escribir('textarea[aria-label="Nota de revisión"]', 'Se conserva para exportar')
    expect(host.textContent).toContain('No se pudo guardar la nota')
  })

  it('CSV mantiene las propuestas separadas y neutraliza fórmulas sin alterar el JSON', () => {
    const notas = { 'QA-uno': { tema: 'Tema propuesto', nota: '=HYPERLINK("ejemplo")\nsegunda línea' }, 'QA-fuera': { nota: 'Otra' } }
    const csv = csvAuditoria([c], notas)
    expect(csv).toContain('"tema_propuesto"'); expect(csv).toContain('"Tema propuesto"')
    expect(csv).toContain('"\'=HYPERLINK(""ejemplo"")\nsegunda línea"')
    for (const texto of [' +SUM(1)', '\ttexto', '-1', '@dato', '\n=1']) expect(celdaCSV(texto)).toBe(`"'${texto}"`)
    expect(JSON.parse(jsonNotas(notas)).correcciones).toEqual(notas)
    expect(c.clasificacion.tema).toBe('Secuencia')
  })
})
