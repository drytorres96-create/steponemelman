import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validarIndicePublicado, validarModuloPublicado } from '../data/integridad'
import { referenciaPagina } from '../lib/fuente'

const concepto = {
  concept_id: 'CPT-PRUEBA-001-12345678',
  source: { doc: 'prueba', doc_title: 'Fuente de prueba', page: 1, item_id: 'prueba:1', fragment: 'Fragmento sintético de prueba.' },
  objetivo: 'Identificar un concepto', afirmacion: 'A corresponde a B', respuesta_canonica: 'B', explicacion: 'Relación de prueba.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'Prueba', tipo_conocimiento: 'Asociación', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre' },
  evaluacion: { pregunta: '¿Qué corresponde a A?', respuestas_aceptadas: ['B'] },
  pistas: ['Primera orientación', 'Segunda orientación', 'Tercera orientación'], calidad: { confianza: 0.9, estado: 'aprobado' },
}
const modulo = { module_id: 'M', nombre: 'Prueba', proposito: 'Prueba', prerrequisitos: [], disciplinas: [], sistemas: [], temas: [],
  n_conceptos: 1, minutos_estimados: 1, cobertura_documental: ['prueba'], orden: 0,
  sesiones: [{ session_id: 'S', titulo: 'Prueba', objetivo: 'Prueba', conceptos: [concepto.concept_id] }] }
const indice = { schema_version: '1.0.0', corpus_version: '1.0.3', n_conceptos: 1, modulos: [modulo], glosario: [], documentos: ['prueba'], cuarentena: 0 }
const activo = { module_id: 'M', corpus_version: '1.0.3', conceptos: [concepto] }

describe('integridad del contenido publicado', () => {
  it('conserva la página física y metadatos de cobertura al validar', () => {
    const cobertura = { estado: 'parcial', lotes_procesados: 21, lotes_totales: 50, documentos_publicados: 10, documentos_totales: 22, revision: 'IA' }
    expect(validarIndicePublicado({ ...indice, cobertura }).cobertura).toEqual(cobertura)
    const c = validarModuloPublicado({ ...activo, conceptos: [{ ...concepto, source: { ...concepto.source, pdf_page: 2 } }] }, modulo, '1.0.3')[0]
    expect(referenciaPagina(c.source)).toBe('Página PDF: 2')
    expect(c.source.page).toBe(1)
    expect(referenciaPagina({ ...c.source, pdf_page_fin: 3 })).toBe('Página PDF: 2–3')
  })
  it('rechaza contenido Step2, cuarentena y baja confianza incluso con esquema válido', () => {
    for (const c of [{ ...concepto, step: 'step2' }, { ...concepto, calidad: { confianza: 0.9, estado: 'cuarentena' } },
      { ...concepto, calidad: { confianza: 0.6, estado: 'aprobado' } }]) {
      expect(() => validarModuloPublicado({ ...activo, conceptos: [c] }, modulo, '1.0.3')).toThrow()
    }
  })
  it('no mezcla versiones, módulos incompletos ni identificadores repetidos', () => {
    expect(() => validarModuloPublicado(activo, modulo, '1.0.2')).toThrow()
    expect(() => validarModuloPublicado({ ...activo, conceptos: [] }, modulo, '1.0.3')).toThrow()
    expect(() => validarModuloPublicado({ ...activo, conceptos: [concepto, concepto] }, modulo, '1.0.3')).toThrow()
    expect(() => validarIndicePublicado({ ...indice, n_conceptos: 2 })).toThrow()
    expect(() => validarIndicePublicado({ ...indice, modulos: [modulo, modulo], n_conceptos: 2 })).toThrow()
  })
  it('permite módulos históricos sin marca de versión si su pertenencia coincide', () => {
    const { corpus_version: _v, ...antiguo } = activo
    expect(validarModuloPublicado(antiguo, modulo, '1.0.3')).toHaveLength(1)
  })

  // El material privado se aporta durante el control de publicación; nunca se incluye en GitHub.
  it.skipIf(!process.env.CORPUS_CHECK_DIR)('valida todos los activos privados contra el índice que se publicará', () => {
    const carpeta = process.env.CORPUS_CHECK_DIR!
    const indiceReal = validarIndicePublicado(JSON.parse(readFileSync(join(carpeta, 'index.json'), 'utf8')))
    const todos = indiceReal.modulos.flatMap(m => validarModuloPublicado(
      JSON.parse(readFileSync(join(carpeta, 'modules', `${m.module_id}.json`), 'utf8')), m, indiceReal.corpus_version))
    expect(todos).toHaveLength(indiceReal.n_conceptos)
    const cuarentena = JSON.parse(readFileSync(join(carpeta, 'quarantine.json'), 'utf8'))
    expect(cuarentena.conceptos).toHaveLength(indiceReal.cuarentena)
    const apartados = new Set(cuarentena.conceptos.map((c: { concept_id: string }) => c.concept_id))
    expect(todos.some(c => apartados.has(c.concept_id))).toBe(false)
  })
})
