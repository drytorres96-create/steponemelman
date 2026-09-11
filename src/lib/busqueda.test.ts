import { describe, expect, it } from 'vitest'
import type { Concepto } from '../schema/concept'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import {
  agregarSeleccion, alternarSeleccion, buscarConceptos, construirSesionPersonalizada, estadoDeBusqueda, FILTROS_BUSQUEDA_INICIALES,
  indexarConceptos, normalizarBusqueda, paginarConceptos,
} from './busqueda'

const ahora = Date.UTC(2026, 8, 10)
const crear = (id: string, patch: Partial<Concepto> = {}): Concepto => ({
  concept_id: id, objetivo: 'Explicar la fisiología renal', afirmacion: 'Texto de estudio reservado',
  evaluacion: { pregunta: '¿Cómo se interpreta el equilibrio ácido-base?', respuestas_aceptadas: [] }, sinonimos: ['buffer'],
  escritura_correctiva: { elegible: true, termino: 'Bicarbonato' },
  clasificacion: { disciplina_primaria: 'Fisiología', disciplinas_secundarias: ['Bioquímica'], sistema_primario: 'Renal',
    sistemas_secundarios: ['Respiratorio'], tema: 'Equilibrio ácido-base', subtema: 'Regulación', tipo_conocimiento: 'Mecanismo', dificultad: 1 },
  ...patch,
} as Concepto)
const intento = (resultado: Intento['resultado'], ts = ahora): Intento => ({
  ts, resultado, calificacion: 3, interaccion: 'recuperacion_libre', recuperacion_activa: true, pistas_usadas: 0,
  ms: 5000, tipo_error: 'ninguno', confianza_declarada: 2,
})
const progreso = (intentos: Intento[], proxima: number | null): ProgresoConcepto => ({
  concept_id: 'a', intentos, proxima, ultimo: ahora, estado: 'en_aprendizaje', dificultad: 5, estabilidad: 1,
  aciertos: 0, fallos: 0, dominado_en: null,
})

describe('buscador local de conceptos', () => {
  it('normaliza mayúsculas, tildes compuestas y puntuación sin perder números', () => {
    expect(normalizarBusqueda('  FISIOLOGÍA / ÁCIDO-base: T4  ')).toBe('fisiologia acido base t4')
  })

  it('requiere todos los términos y busca pregunta, sinónimos y terminología', () => {
    const indice = indexarConceptos([crear('a'), crear('b', { objetivo: 'Explicar histología', sinonimos: [],
      clasificacion: { ...crear('base').clasificacion, disciplina_primaria: 'Histología', disciplinas_secundarias: [], tema: 'Tejidos' },
      escritura_correctiva: { elegible: false, termino: null }, evaluacion: { pregunta: 'Otra pregunta', respuestas_aceptadas: [] } })])
    const buscar = (texto: string) => buscarConceptos(indice, { ...FILTROS_BUSQUEDA_INICIALES, texto }, {}).map(c => c.concept_id)
    expect(buscar('FISIOLOGIA acido')).toEqual(['a'])
    expect(buscar('buffer bicarbonato')).toEqual(['a'])
    expect(buscar('buffer inexistente')).toEqual([])
    expect(buscar('   ')).toEqual(['a', 'b'])
  })

  it('combina etiquetas secundarias y tema con estado sin cambiar la fuente', () => {
    const c = crear('a')
    const indice = indexarConceptos([c, c])
    const filtros = { ...FILTROS_BUSQUEDA_INICIALES, disciplina: 'Bioquímica', sistema: 'Respiratorio', tema: 'EQUILIBRIO ACIDO-BASE', estado: 'pendiente' as const }
    expect(buscarConceptos(indice, filtros, { a: progreso([intento('correcta')], ahora - 1) }, ahora)).toEqual([c])
    expect(buscarConceptos(indice, { ...filtros, sistema: 'Cardiovascular' }, {}, ahora)).toEqual([])
    expect(indice).toHaveLength(1)
  })

  it('separa nuevos, repasos pendientes y respuestas por revisar usando la última fecha', () => {
    expect(estadoDeBusqueda(undefined, ahora)).toBe('nuevo')
    expect(estadoDeBusqueda(progreso([], ahora - 1), ahora)).toBe('nuevo')
    expect(estadoDeBusqueda(progreso([intento('correcta')], ahora - 1), ahora)).toBe('pendiente')
    expect(estadoDeBusqueda(progreso([intento('revision'), intento('correcta', ahora - 20)], ahora - 1), ahora)).toBe('por_revisar')
    expect(estadoDeBusqueda(progreso([intento('correcta')], ahora + 10000), ahora)).toBe('al_dia')
  })

  it('pagina de 20 en 20 y ajusta el índice cuando los filtros reducen resultados', () => {
    const datos = Array.from({ length: 43 }, (_, n) => n)
    expect(paginarConceptos(datos, 2)).toEqual({ elementos: datos.slice(20, 40), pagina: 2, paginas: 3, inicio: 21, fin: 40 })
    expect(paginarConceptos(datos.slice(0, 3), 3).elementos).toEqual([0, 1, 2])
    expect(paginarConceptos([], -5)).toEqual({ elementos: [], pagina: 1, paginas: 1, inicio: 0, fin: 0 })
  })

  it('mantiene selección única con máximo 20 entre páginas y permite retirar objetivos', () => {
    const primera = Array.from({ length: 20 }, (_, n) => `c${n}`)
    expect(agregarSeleccion(['c0'], primera)).toEqual(primera)
    expect(agregarSeleccion(primera, ['c20', 'c21'])).toEqual(primera)
    expect(alternarSeleccion(primera, 'c20')).toEqual(primera)
    const retirada = alternarSeleccion(primera, 'c5')
    expect(retirada).not.toContain('c5')
    expect(alternarSeleccion(retirada, 'c20')).toHaveLength(20)
  })

  it('prepara una sesión aunque todos los conceptos filtrados estén vistos y al día', () => {
    const cs = [crear('a'), crear('b')]
    const vistos = { a: progreso([intento('correcta', ahora - 10)], ahora + 10000), b: progreso([intento('correcta', ahora - 20)], ahora + 10000) }
    expect(construirSesionPersonalizada(cs, vistos, 10, ahora).map(c => c.concept_id)).toEqual(['b', 'a'])
  })

  it('prioriza pendientes sin salir de la selección y luego completa con conceptos al día', () => {
    const cs = [crear('al_dia'), crear('nuevo'), crear('vencido')]
    const ps = { al_dia: progreso([intento('correcta')], ahora + 10000), vencido: progreso([intento('correcta')], ahora - 10),
      fuera_de_filtros: progreso([intento('incorrecta')], ahora - 20) }
    expect(construirSesionPersonalizada([...cs, ...cs], ps, 20, ahora).map(c => c.concept_id)).toEqual(['vencido', 'nuevo', 'al_dia'])
    expect(construirSesionPersonalizada(Array.from({ length: 30 }, (_, i) => crear(String(i))), {}, 999, ahora)).toHaveLength(20)
    expect(construirSesionPersonalizada(cs, ps, 0, ahora)).toEqual([])
  })
})
