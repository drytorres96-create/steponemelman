import { describe, expect, it } from 'vitest'
import { ConceptoZ } from '../schema/concept'
import { nuevoProgreso } from '../srs/fsrs'
import { ESTADO_INICIAL, combinarEstados, leerEstadoDesconocido } from '../store/model'
import type { Intento } from '../srs/tipos'
import { aplicarVariante, aplicacionComprobada, priorizarVariantes, resumenTransferencia } from './variantes'
const c = ConceptoZ.parse({ concept_id: 'QA-001', source: { doc: 'QA', doc_title: 'QA', page: 1, item_id: 'I1', fragment: 'Alfa es el primer elemento sintético.' }, objetivo: 'Identificar alfa', afirmacion: 'Alfa es primero.', respuesta_canonica: 'alfa', explicacion: 'Alfa es el primer elemento.', clasificacion: { disciplina_primaria: 'Fisiología', disciplinas_secundarias: ['Farmacología'], sistema_primario: 'Cardiovascular', sistemas_secundarios: ['Endocrino'], tema: 'QA', tipo_conocimiento: 'Asociación', dificultad: 1 }, step: 'step1', interaccion: { recomendada: 'recuperacion_libre' }, evaluacion: { pregunta: '¿Cuál es el primer elemento?' }, pistas: ['uno', 'dos', 'tres'], calidad: { estado: 'aprobado', confianza: 1 }, variantes: [{ variant_id: 'QA-001-a1', nivel: 'aplicacion', pregunta: 'En un caso sintético, ¿qué elemento ocupa el primer lugar?', opciones: [{ texto: 'alfa', correcta: true }, { texto: 'beta', correcta: false }, { texto: 'gamma', correcta: false }], explicacion: 'La regla sitúa alfa primero.' }] })
const attempt = (extra: Partial<Intento> = {}): Intento => ({ ts: 1000, ms: 20000, pistas_usadas: 0, interaccion: 'caso_clinico', resultado: 'correcta', tipo_error: 'correcta', recuperacion_activa: false, respuesta_dada: 'alfa', fuente_consultada: false, explicacion_previa: false, variante_id: 'QA-001-a1', primera_presentacion: true, ...extra } as Intento)
const progress = (ts: Intento[]) => ({ ...nuevoProgreso(c.concept_id), intentos: ts })
describe('variantes y mapa accionable', () => {
  it('preserva concepto, fuente e historial y prioriza casos todavía no vistos', () => {
    const other = ConceptoZ.parse({ ...c, concept_id: 'QA-002', variantes: c.variantes!.map(v => ({ ...v, variant_id: 'QA-002-a1' })) })
    const result = aplicarVariante(c, 'QA-001-a1')
    expect(result.concept_id).toBe(c.concept_id)
    expect(result.source).toEqual(c.source)
    expect(result.interaccion.recomendada).toBe('caso_clinico')
    expect(c.variante_id).toBeUndefined()
    expect(priorizarVariantes([c, other], { [c.concept_id]: progress([attempt()]) })[0]).toBe(other)
  })
  it('no convierte repetición, ayuda o historial antiguo en aplicación nueva', () => {
    expect(aplicacionComprobada(c, progress([attempt()]))).toBe(true)
    for (const a of [attempt({ primera_presentacion: false }), attempt({ pistas_usadas: 1 }), attempt({ primera_presentacion: undefined, variante_id: undefined })]) expect(aplicacionComprobada(c, progress([a]))).toBe(false)
    const p = progress([attempt({ resultado: 'incorrecta' }), attempt({ ts: 2000, primera_presentacion: false })])
    expect(aplicacionComprobada(c, p)).toBe(false)
    expect(resumenTransferencia([c], { [c.concept_id]: p })).toMatchObject({ disponibles: 1, vistos: 1, evaluados: 1, correctos: 0 })
  })
  it('una copia antigua de la misma sesión no borra la versión de presentación conocida', () => {
    const resume = { modulo: 'M', sesion: 'repaso', indice: 2, ts: 1000, sessionId: 'S', conceptIds: ['A', 'B', 'C'], versionFormato: 2 as const }
    const a = { ...ESTADO_INICIAL, reanudable: resume, fieldUpdatedAt: { criterios: 0, reanudable: 1000 } }
    const b = { ...a, reanudable: { ...resume, versionFormato: undefined, ts: 2000 }, fieldUpdatedAt: { criterios: 0, reanudable: 2000 } }
    expect(leerEstadoDesconocido(a)?.reanudable?.versionFormato).toBe(2)
    expect(combinarEstados(a, b).reanudable?.versionFormato).toBe(2)
    expect(combinarEstados(b, a).reanudable?.versionFormato).toBe(2)
  })
  it('preserva tiempo, variantes y continuación al importar y combinar dispositivos', () => {
    const resume = { modulo: 'M', sesion: 'aplicacion', indice: 0, ts: 1000, sessionId: 'S', conceptIds: [c.concept_id], cantidadInicial: 1, presupuestoMinutos: 10 as const, msVisibles: 600000, pausaPorTiempoPendiente: true, variantes: ['QA-001-a1'] }
    const a = { ...ESTADO_INICIAL, reanudable: resume, fieldUpdatedAt: { criterios: 0, reanudable: 1000 } }
    const b = { ...a, reanudable: { ...resume, ts: 2000, msVisibles: 620000, continuarSinLimite: true, pausaPorTiempoPendiente: false }, fieldUpdatedAt: { criterios: 0, reanudable: 2000 } }
    expect(leerEstadoDesconocido(b)?.reanudable).toMatchObject({ variantes: ['QA-001-a1'], msVisibles: 620000 })
    expect(combinarEstados(a,b).reanudable).toMatchObject({ msVisibles: 620000, continuarSinLimite: true, pausaPorTiempoPendiente: false })
    expect(combinarEstados(b,a).reanudable).toMatchObject({ msVisibles: 620000, continuarSinLimite: true })
  })
})
