// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConceptoZ, IndiceZ } from '../schema/concept'
import { ESTADO_INICIAL, type EstadoApp } from '../store/model'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'

const mock = vi.hoisted(() => ({ app: vi.fn(), cargar: vi.fn(), actualizar: vi.fn(), exportar: vi.fn(), importar: vi.fn(), reiniciar: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.cargar }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: () => ({ state: { attempts: {} } }) }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: null }) }))
vi.mock('../components/descarga', () => ({ useDescarga: () => ({ entregar: vi.fn(), dialogo: null }) }))
vi.mock('../semana/api', () => ({ cargarHistorialSesiones: vi.fn() }))
vi.mock('../plan/api', () => ({ cargarPlanSemana: vi.fn() }))
import { Ajustes } from '../screens/Ajustes'
import { PreguntasFrecuentes } from '../screens/PreguntasFrecuentes'

const concepto = ConceptoZ.parse({
  concept_id: 'QA-FAQ', source: { doc: 'QA', doc_title: 'Synthetic source', page: 1, item_id: 'Q', fragment: 'Synthetic fact.' },
  objetivo: 'Synthetic objective', afirmacion: 'Synthetic fact.', respuesta_canonica: 'Synthetic', explicacion: 'Synthetic explanation.',
  clasificacion: { disciplina_primaria: 'Fisiología', disciplinas_secundarias: ['Farmacología'], sistema_primario: 'Cardiovascular',
    sistemas_secundarios: ['Endocrino'], tema: 'Synthetic topic', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre' }, evaluacion: { pregunta: 'Synthetic question?' },
  pistas: ['A', 'B', 'C'], calidad: { estado: 'aprobado', confianza: 1 },
})
const indice = IndiceZ.parse({ schema_version: '1.0.0', corpus_version: 'qa-faq', n_conceptos: 1, cuarentena: 991,
  modulos: [{ module_id: 'QA-M', nombre: 'Módulo sintético', proposito: 'Synthetic purpose', prerrequisitos: [], disciplinas: ['Fisiología'],
    sistemas: ['Cardiovascular'], temas: ['Synthetic topic'], n_conceptos: 1, minutos_estimados: 1, cobertura_documental: ['QA'], orden: 1,
    sesiones: [{ session_id: 'QA-S', titulo: 'Synthetic session', objetivo: 'Synthetic objective', conceptos: ['QA-FAQ', 'QA-FAQ'] }] }], documentos: ['QA'], glosario: [] })
let root: Root, host: HTMLDivElement, estado: EstadoApp
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  estado = { ...ESTADO_INICIAL, criterios: { ...ESTADO_INICIAL.criterios }, progreso: {} }
  mock.app.mockImplementation(() => ({ estado, indice, actualizarCriterios: mock.actualizar,
    exportar: mock.exportar, importar: mock.importar, reiniciar: mock.reiniciar }))
  mock.actualizar.mockImplementation(c => { estado = { ...estado, criterios: c } })
  mock.cargar.mockResolvedValue([concepto, concepto])
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
const texto = (el: Element = host) => (el.textContent ?? '').replace(/\s+/g, ' ')
const pregunta = (titulo: string) => [...host.querySelectorAll<HTMLDetailsElement>('details')].find(d => d.querySelector(':scope > summary')?.textContent === titulo)!
async function abrir(titulo: string) {
  const d = pregunta(titulo); expect(d).toBeTruthy()
  await act(async () => { d.open = true; d.dispatchEvent(new Event('toggle')) })
  return d
}
async function escribir(selector: string, valor: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('preguntas frecuentes de Ajustes', () => {
  it('agrupa la consulta en preguntas nativas, cerradas y con nombres accesibles', async () => {
    await act(async () => root.render(<PreguntasFrecuentes criterios={CRITERIOS_POR_DEFECTO} />))
    expect(host.querySelector('section[aria-labelledby="faq-titulo"] h2')?.textContent).toBe('Preguntas frecuentes')
    expect([...host.querySelectorAll('h3')].map(h => h.textContent)).toEqual([
      'Dominio y aprendizaje', 'Meta y círculos', 'Hoy y repasos', 'Sesiones, IA y cuenta',
    ])
    const preguntas = [...host.querySelectorAll<HTMLDetailsElement>('details')]
    expect(preguntas).toHaveLength(13)
    expect(preguntas.every(d => !d.open && !!d.querySelector(':scope > summary')?.textContent)).toBe(true)
    const objetivo = pregunta('¿Qué diferencia hay entre visto, práctica y dominio?')
    await act(async () => objetivo.querySelector<HTMLElement>('summary')!.click())
    expect(objetivo.open).toBe(true)
    expect(texto(objetivo)).toContain('Una recomendación en una lista no lo cuenta.')
    expect(texto(objetivo)).toContain('Cada concepto conserva un solo historial')
    expect(preguntas.filter(d => d.open)).toHaveLength(1)
    expect(mock.actualizar).not.toHaveBeenCalled()
    expect(mock.cargar).not.toHaveBeenCalled()
  })

  it('explica los criterios guardados personalizados, incluidas las condiciones opcionales', async () => {
    const personalizados = { ...CRITERIOS_POR_DEFECTO, recuperaciones: 5, sesiones: 4, separacionHoras: 72,
      ventanaConfusionDias: 12, exigirSinPistas: false, exigirRecuperacionActiva: false }
    await act(async () => root.render(<PreguntasFrecuentes criterios={personalizados} />))
    const criterio = await abrir('¿Qué necesito para demostrar dominio?')
    expect(texto(criterio)).toContain('5 respuestas independientes correctas en 4 sesiones distintas')
    expect(texto(criterio)).toContain('al menos 72 horas entre el primer y el último acierto vigente')
    expect(texto(criterio)).toContain('durante 12 días')
    expect(texto(criterio)).not.toContain('También está activada')
    expect(texto(criterio)).not.toContain('Además, al menos una debe ser')
    expect(texto(criterio)).toContain('sin consultar la fuente y sin ver antes la explicación')
    await act(async () => root.render(<PreguntasFrecuentes criterios={{ ...personalizados, recuperaciones: 1, sesiones: 1, ventanaConfusionDias: 0 }} />))
    expect(texto(criterio)).toContain('1 respuesta independiente correcta en 1 sesión.')
    expect(texto(criterio)).toContain('Con una sola sesión no se exige separación temporal.')
    expect(texto(criterio)).toContain('No hay una ventana de bloqueo por confusiones activada.')
    expect(texto(criterio)).not.toContain('al menos 72 horas')
  })

  it('conserva las reglas de meta y distingue los círculos de Hoy y Progreso', async () => {
    await act(async () => root.render(<PreguntasFrecuentes criterios={CRITERIOS_POR_DEFECTO} />))
    const meta = await abrir('¿Qué hace avanzar las líneas de la meta?')
    expect(texto(meta)).toContain('60 días, del 25 de septiembre al 23 de noviembre')
    expect(texto(meta)).toContain('510 conceptos y 255 preguntas NBME')
    expect(texto(meta)).toContain('03:00 de Nueva York')
    expect(texto(meta)).toContain('7 días como margen de planificación')
    expect(texto(meta)).toContain('primera respuesta, correcta o incorrecta')
    const circulos = await abrir('¿Qué muestran los círculos?')
    expect(texto(circulos)).toContain('En Hoy, el círculo interior muestra el trabajo diario y el exterior el dominio del tema')
    expect(texto(circulos)).toContain('En Progreso, el exterior muestra sesiones completadas')
    expect(texto(circulos)).toContain('Sin dato · n=0')
    expect(texto(circulos)).toContain('no se promedian ni estiman aprobación')
    const ia = await abrir('¿Cómo recupero una pregunta NBME fallada?')
    expect(texto(ia)).toContain('Los ejercicios de IA no acreditan dominio Melman.')
    expect(texto(ia)).toContain('la siguiente del mismo bloque')
  })

  it('Ajustes conserva el borrador: la FAQ cambia únicamente después de aplicar criterios', async () => {
    const anterior = structuredClone(estado)
    await act(async () => root.render(<Ajustes />))
    const criterio = await abrir('¿Qué necesito para demostrar dominio?')
    await escribir('#criterio-recuperaciones', '5')
    expect(texto(criterio)).toContain('3 respuestas independientes correctas')
    expect(estado).toEqual(anterior)
    expect(mock.actualizar).not.toHaveBeenCalled()
    expect(mock.cargar).not.toHaveBeenCalled()
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Aplicar criterios')!.click())
    expect(mock.actualizar).toHaveBeenCalledExactlyOnceWith({ ...anterior.criterios, recuperaciones: 5 })
    expect(texto(criterio)).toContain('5 respuestas independientes correctas')
    expect(estado.progreso).toEqual(anterior.progreso)
    expect(mock.exportar).not.toHaveBeenCalled()
    expect(mock.importar).not.toHaveBeenCalled()
    expect(mock.reiniciar).not.toHaveBeenCalled()
  })

  it('carga el índice sólo a petición, cuenta IDs únicos y no expone información de auditoría', async () => {
    const anterior = structuredClone(estado)
    await act(async () => root.render(<Ajustes />))
    await abrir('¿Qué muestra el índice del material?')
    expect(mock.cargar).not.toHaveBeenCalled()
    const d = await abrir('Índice del material')
    expect(mock.cargar).toHaveBeenCalledExactlyOnceWith(indice.modulos)
    expect(texto()).toContain('1 concepto publicado.')
    const filaModulo = [...host.querySelectorAll('tr')].find(tr => tr.querySelector('th')?.textContent === 'Módulo sintético')!
    expect(filaModulo.querySelector('td')?.textContent).toBe('1')
    const areas = host.querySelector('section[aria-label="Contenido disponible por área"]')!
    for (const nombre of ['Cardiovascular', 'Endocrino', 'Fisiología', 'Farmacología']) {
      expect([...areas.querySelectorAll('tr')].find(tr => tr.querySelector('th')?.textContent === nombre)?.querySelector('td')?.textContent).toBe('1')
    }
    expect(texto(areas)).not.toMatch(/apartados|revisión|Lotes|cuarentena|991|191|porcentaje/)
    await act(async () => { d.open = false; d.dispatchEvent(new Event('toggle')) })
    await abrir('Índice del material')
    expect(mock.cargar).toHaveBeenCalledOnce()
    expect(estado).toEqual(anterior)
    expect(mock.actualizar).not.toHaveBeenCalled()
  })

  it('un fallo de carga del índice admite reintento sin afectar criterios ni progreso', async () => {
    mock.cargar.mockRejectedValueOnce(new Error('Synthetic failure')).mockResolvedValueOnce([concepto])
    await act(async () => root.render(<Ajustes />))
    await abrir('Índice del material')
    expect(host.querySelector('[role="status"]')?.textContent).toBe('No se pudo cargar el índice del material.')
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Volver a cargar el índice')!.click())
    expect(mock.cargar).toHaveBeenCalledTimes(2)
    expect(texto()).toContain('1 concepto publicado.')
    expect(mock.actualizar).not.toHaveBeenCalled()
    expect(mock.reiniciar).not.toHaveBeenCalled()
  })
})
