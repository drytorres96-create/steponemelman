// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import { DIA, nuevoProgreso } from '../srs/fsrs'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import type { Concepto } from '../schema/concept'
import type { SesionSemanal } from '../semana/tipos'

const mock = vi.hoisted(() => ({ app: vi.fn(), banco: vi.fn(), historial: vi.fn(), topics: vi.fn(), detalle: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { access_token: 'token-sintetico' } }) }))
vi.mock('../nbme/NbmeProvider', () => ({ useNbme: mock.banco }))
vi.mock('../semana/api', () => ({ cargarHistorialSesiones: mock.historial }))
vi.mock('../plan/api', () => ({ cargarTopics: mock.topics }))
import { BandaDeCifras, fechaDeSesion } from '../screens/ProgresoCifras'

const HOY = Date.parse('2026-10-08T09:00:00-04:00')
const i = (dias: number, extra: Partial<Intento> = {}): Intento => ({
  ts: HOY + dias * DIA, calificacion: 3, resultado: 'correcta', interaccion: 'recuperacion_libre',
  recuperacion_activa: true, tipo_evidencia: 'recuerdo', pistas_usadas: 0, fuente_consultada: false,
  explicacion_previa: false, pregunta_version: 'sintetica-v1', ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const p = (id: string, extra: Partial<Intento> = {}): ProgresoConcepto => ({
  ...nuevoProgreso(id), intentos: [i(-32, { resultado: 'incorrecta', ...extra }), i(-2, extra)],
})
const ids = ['R', 'D', 'A', 'H', 'nuevo', 'R']
const conceptos = [...new Set([...ids, 'fuera'])].map(concept_id => ({
  concept_id, clasificacion: { disciplina_primaria: 'Bioquímica', sistema_primario: 'Endocrino' },
}) as Concepto)
const sesion = (dia: number, estado: SesionSemanal['estado']): SesionSemanal => ({
  id: `s-${dia}`, semana: 'sintetica', semanaInicio: '2026-10-05', dia, orden: 1, titulo: 'Práctica sintética', subtitulo: null,
  guion: [], presupuestoMin: 10, estado, cursor: 0, nbmeSessionId: null, completadaEn: null,
})
let root: Root, host: HTMLDivElement, progreso: Record<string, ProgresoConcepto>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(HOY); vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  progreso = { R: p('R'), D: p('D', { interaccion: 'direccion', resultado: 'parcial' }),
    A: p('A', { interaccion: 'caso_clinico', tipo_evidencia: 'aplicacion' }), H: p('H', { pistas_usadas: 1 }), fuera: p('fuera') }
  mock.app.mockImplementation(() => ({ estado: { ...ESTADO_INICIAL, progreso } }))
  mock.banco.mockReturnValue({ state: { attempts: {} }, catalog: null })
  mock.historial.mockResolvedValue([sesion(1, 'completada'), sesion(3, 'pendiente')])
  mock.topics.mockResolvedValue([{ id: 1, name: 'Bioquímica', status: 2 }, { id: 2, name: 'Endocrino', status: 1 }])
  mock.detalle.mockResolvedValue(conceptos)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })
async function render() {
  await act(async () => root.render(<BandaDeCifras conceptIds={ids} cargarDetalleConceptos={mock.detalle} ventana="semana" />))
}
async function toggle(open: boolean) {
  await act(async () => {
    const details = host.querySelector('details')!; details.open = open; details.dispatchEvent(new Event('toggle'))
  })
}
const texto = () => host.textContent ?? ''
const fila = (label: string) => [...host.querySelectorAll('tr')].find(tr => tr.querySelector('th')?.textContent === label)?.textContent

describe('cifras observadas y detalle solicitado', () => {
  it('el domingo opcional pertenece al final de su semana y conserva su fecha NY durante DST', () => {
    const domingo = { ...sesion(0, 'completada'), semanaInicio: '2026-10-26' }
    expect(fechaDeSesion(domingo).getTime()).toBe(Date.parse('2026-11-01T03:00:00-05:00'))
    expect(fechaDeSesion({ ...domingo, dia: 1 }).getTime()).toBe(Date.parse('2026-10-26T03:00:00-04:00'))
  })

  it('los anillos cambian de semana en el corte NY tras DST y excluyen primeras respuestas futuras', async () => {
    const antes = Date.parse('2026-11-02T02:59:00-05:00'), corte = Date.parse('2026-11-02T03:00:00-05:00')
    const previo = { ...sesion(0, 'completada'), semanaInicio: '2026-10-26' }, nuevo = { ...sesion(1, 'pendiente'), semanaInicio: '2026-11-02' }
    mock.historial.mockResolvedValue([previo, nuevo])
    const intento = (questionId: string, submittedAt: number) => ({ id: questionId, questionId, submittedAt, correct: true })
    mock.banco.mockReturnValue({ state: { attempts: { previa: intento('Qprevia', antes), actual: intento('Qactual', corte), futura: intento('Qfutura', corte + DIA) } },
      catalog: { questions: ['Qprevia', 'Qactual', 'Qfutura'].map(id => ({ id, status: 'ready', form: '27' })) } })
    const leyenda = (label: string) => [...host.querySelectorAll('.progress-ring-legend p')].find(p => p.querySelector('b')?.textContent?.includes(label))?.textContent
    vi.setSystemTime(antes)
    await render()
    expect(leyenda('Sesiones de esta semana')).toContain('100 % · 1/1 · n=1')
    expect(leyenda('Acierto inicial')).toContain('100 % · 1/1 · n=1')
    vi.setSystemTime(corte)
    await render()
    expect(leyenda('Sesiones de esta semana')).toContain('0 % · 0/1 · n=1')
    expect(leyenda('Acierto inicial')).toContain('100 % · 1/1 · n=1')
  })

  it('los indicadores generales usan IDs únicos sin cargar contenido ni temas', async () => {
    await render()
    expect(mock.historial).toHaveBeenCalledOnce()
    expect(mock.topics).not.toHaveBeenCalled()
    expect(mock.detalle).not.toHaveBeenCalled()
    expect(texto()).toContain('67 % · 2/3 · n=3')
    expect(texto()).toContain('50 % · 1/2 · n=2')
    expect(texto()).toContain('Actividad registrada: 4/5 conceptos · Dominio demostrado: 0')
    expect(texto()).toContain('Esta semana comprobaste sin ayuda 2 conceptos después de ≥24 h')
    expect(texto()).not.toContain('probabilidad')
    expect(texto()).not.toContain('azar')
  })

  it('al abrir carga el detalle una vez y conserva denominadores por tipo y sólo IDs publicados', async () => {
    await render(); await toggle(true)
    expect(mock.topics).toHaveBeenCalledExactlyOnceWith('token-sintetico')
    expect(mock.detalle).toHaveBeenCalledOnce()
    expect(fila('Recuerdo sin alternativas')).toBe('Recuerdo sin alternativas100 % · 1/1 · n=10 % · 0/1 · n=1')
    expect(fila('Discriminación entre alternativas')).toBe('Discriminación entre alternativas0 % · 0/1 · n=1100 % · 1/1 · n=1')
    expect(fila('Aplicación clínica')).toBe('Aplicación clínica100 % · 1/1 · n=10 % · 0/1 · n=1')
    expect(fila('Bioquímica')).toBe('Bioquímica67 % · 2/3 · n=333 % · 1/3 · n=3')
    expect(fila('Endocrino')).toBeUndefined()
    await toggle(false); await toggle(true)
    expect(mock.topics).toHaveBeenCalledOnce()
    expect(mock.detalle).toHaveBeenCalledOnce()
  })

  it('sin estado de topics no supone cierre ni pierde las observaciones', async () => {
    mock.topics.mockResolvedValue(null)
    await render(); await toggle(true)
    expect(texto()).toContain('No se pudo consultar el estado de los temas; no se supone que estén cerrados.')
    expect(fila('Bioquímica')).toBeUndefined()
    expect(texto()).toContain('67 % · 2/3 · n=3')
  })

  it('un error de contenido afecta sólo al desglose por tema y conserva actividad y muestra', async () => {
    mock.detalle.mockRejectedValue(new Error('fallo sintético'))
    await render(); await toggle(true)
    expect(texto()).toContain('No se pudieron leer los conceptos para asociar la evidencia a los temas.')
    expect(texto()).toContain('Actividad registrada: 4/5 conceptos')
    expect(fila('Aplicación clínica')).toContain('100 % · 1/1 · n=1')
  })

  it('mantiene el contrato anterior conceptos y no inventa datos ni hitos en reintentos inmediatos', async () => {
    progreso = { R: { ...nuevoProgreso('R'), intentos: [i(-0.1), i(0)] } }
    await act(async () => root.render(<BandaDeCifras conceptos={conceptos.filter(c => c.concept_id === 'R')} ventana="general" />))
    expect(texto()).toContain('Sin dato · n=0')
    expect(texto()).not.toContain('Esta semana comprobaste')
    expect(mock.detalle).not.toHaveBeenCalled()
    expect(mock.topics).not.toHaveBeenCalled()
    await toggle(true)
    expect(mock.topics).toHaveBeenCalledOnce()
    expect(fila('Bioquímica')).toBe('BioquímicaSin dato · n=0Sin dato · n=0')
  })
})
