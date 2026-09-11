import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validarIndicePublicado, validarModuloPublicado } from '../data/integridad'
import { referenciaPagina } from '../lib/fuente'
import { esRespuestaBreve, prepararConcepto, tieneOpcionesValidas } from '../lib/formatos'
import { ConceptoZ, type Concepto } from '../schema/concept'

const ESCRITAS = new Set(['recuperacion_libre', 'completar', 'tarjeta', 'escritura_correctiva'])
const CON_OPCIONES = new Set(['opcion_multiple', 'caso_clinico', 'verdadero_falso'])
const ESTRUCTURADAS = new Set(['prediccion_direccional', 'relacionar', 'secuencia', 'clasificar', 'numerico'])

function cargarActivos(carpeta: string) {
  const indice = validarIndicePublicado(JSON.parse(readFileSync(join(carpeta, 'index.json'), 'utf8')))
  const conceptos = indice.modulos.flatMap(m => validarModuloPublicado(
    JSON.parse(readFileSync(join(carpeta, 'modules', `${m.module_id}.json`), 'utf8')), m, indice.corpus_version))
  return { indice, conceptos }
}

/** La publicación debe ser evaluable: la protección para datos antiguos no es un formato publicable. */
function comprobarFormatos(conceptos: Concepto[]) {
  for (const c of conceptos) {
    const tipo = c.interaccion.recomendada
    expect(ESCRITAS.has(tipo) || CON_OPCIONES.has(tipo) || ESTRUCTURADAS.has(tipo), `${c.concept_id}: formato sin evaluación`).toBe(true)
    if (ESCRITAS.has(tipo)) expect(esRespuestaBreve(c.respuesta_canonica), `${c.concept_id}: escritura extensa`).toBe(true)
    if (CON_OPCIONES.has(tipo)) expect(tieneOpcionesValidas(c), `${c.concept_id}: opciones ambiguas`).toBe(true)
    if (c.escritura_correctiva.elegible) {
      expect(esRespuestaBreve(c.escritura_correctiva.termino ?? ''), `${c.concept_id}: transcripción extensa`).toBe(true)
    }
  }
}

/** Las opciones nuevas conservan la respuesta completa y la identidad del concepto previo. */
function comprobarConversiones(anteriores: Concepto[], actuales: Concepto[]) {
  const publicados = new Map(actuales.map(c => [c.concept_id, c]))
  for (const anterior of anteriores.filter(c => ESCRITAS.has(c.interaccion.recomendada) && !esRespuestaBreve(c.respuesta_canonica))) {
    const actual = publicados.get(anterior.concept_id)
    // Un concepto apartado de la publicación puede requerir revisión médica; no se recrea con otro ID.
    if (!actual) continue
    expect(actual.interaccion.recomendada, actual.concept_id).toBe('opcion_multiple')
    expect(actual.respuesta_canonica, actual.concept_id).toBe(anterior.respuesta_canonica)
    expect(actual.evaluacion.opciones!.length, actual.concept_id).toBeGreaterThanOrEqual(3)
    expect(actual.evaluacion.opciones!.filter(o => o.correcta).map(o => o.texto), actual.concept_id).toEqual([actual.respuesta_canonica])
    expect(actual.source, actual.concept_id).toEqual(anterior.source)
  }
}

/** Muestreo reproducible del resultado que recibe realmente el reproductor. */
function comprobarPresentaciones(conceptos: Concepto[], cantidad = 500) {
  expect(conceptos.length).toBeGreaterThan(0)
  let semilla = 0x5e1f2026
  const resultadosVF = new Set<boolean>()
  for (let n = 0; n < cantidad; n++) {
    semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0
    const original = conceptos[semilla % conceptos.length]
    const antes = JSON.stringify(original)
    const contexto = { semilla: `publicacion-${n}-${semilla}`, indice: n, ruta: n % 7 === 0 ? 'examen' : 'repaso' }
    const preparado = prepararConcepto(original, contexto)
    comprobarFormatos([preparado])
    expect(preparado.concept_id).toBe(original.concept_id)
    expect(preparado.respuesta_canonica).toBe(original.respuesta_canonica)
    expect(preparado.source).toEqual(original.source)
    expect(preparado).toEqual(prepararConcepto(original, contexto))
    expect(JSON.stringify(original)).toBe(antes)
    if (ESCRITAS.has(preparado.interaccion.recomendada)) {
      expect([...preparado.sinonimos, ...preparado.evaluacion.respuestas_aceptadas].every(esRespuestaBreve)).toBe(true)
    }
    if (preparado.interaccion.recomendada === 'verdadero_falso' && original.interaccion.recomendada !== 'verdadero_falso') {
      const prefijo = `${original.evaluacion.pregunta}\n\nPropuesta: «`
      const sufijo = '»\n¿Esta propuesta responde correctamente a la pregunta?'
      expect(preparado.evaluacion.pregunta.startsWith(prefijo)).toBe(true)
      expect(preparado.evaluacion.pregunta.endsWith(sufijo)).toBe(true)
      const texto = preparado.evaluacion.pregunta.slice(prefijo.length, -sufijo.length)
      const propuesta = original.evaluacion.opciones!.find(o => o.texto === texto)
      expect(propuesta, `${original.concept_id}: propuesta no revisada`).toBeDefined()
      expect(preparado.evaluacion.opciones!.map(o => o.texto)).toEqual(['Verdadero', 'Falso'])
      expect(preparado.evaluacion.opciones!.find(o => o.texto === 'Verdadero')!.correcta).toBe(propuesta!.correcta)
      expect(preparado.evaluacion.opciones!.find(o => o.texto === 'Falso')!.correcta).toBe(!propuesta!.correcta)
      resultadosVF.add(propuesta!.correcta)
    } else if (CON_OPCIONES.has(preparado.interaccion.recomendada)) {
      expect(preparado.evaluacion.opciones).toEqual(original.evaluacion.opciones)
    }
  }
  return resultadosVF
}

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

  it('impide publicar escritura extensa o transcripción extensa aunque exista un alias corto', () => {
    const largo = ConceptoZ.parse({ ...concepto,
      respuesta_canonica: 'Una explicación sintética con varios pasos que requiere más de seis palabras', sinonimos: ['B'] })
    expect(() => comprobarFormatos([largo])).toThrow()
    expect(() => comprobarFormatos([ConceptoZ.parse({ ...concepto, escritura_correctiva: {
      elegible: true, termino: 'Una explicación sintética con varios pasos que requiere más de seis palabras',
    } })])).toThrow()
    expect(() => comprobarFormatos([ConceptoZ.parse(concepto)])).not.toThrow()
  })

  it('exige tres opciones y la respuesta completa al convertir un ejercicio escrito largo', () => {
    const largo = ConceptoZ.parse({ ...concepto, respuesta_canonica: 'La secuencia sintética empieza en A y termina siempre en B.' })
    const convertido = ConceptoZ.parse({ ...largo, interaccion: { recomendada: 'opcion_multiple' },
      evaluacion: { ...largo.evaluacion, opciones: [
        { texto: largo.respuesta_canonica, correcta: true, por_que: 'Conserva la secuencia.' },
        { texto: 'La secuencia empieza y acaba en A.', correcta: false, por_que: 'Cambia el punto final.' },
        { texto: 'La secuencia empieza y acaba en B.', correcta: false, por_que: 'Cambia el punto inicial.' },
      ] } })
    expect(() => comprobarConversiones([largo], [convertido])).not.toThrow()
    expect(() => comprobarConversiones([largo], [{ ...convertido, evaluacion: {
      ...convertido.evaluacion, opciones: convertido.evaluacion.opciones!.slice(0, 2),
    } }])).toThrow()
    expect(() => comprobarConversiones([largo], [{ ...convertido, respuesta_canonica: 'B' }])).toThrow()
    expect(() => comprobarFormatos([{ ...convertido, evaluacion: { ...convertido.evaluacion,
      opciones: convertido.evaluacion.opciones!.map(o => ({ ...o, correcta: true })),
    } }])).toThrow()
    // Obliga a ejercitar tanto propuestas verdaderas como falsas con entradas sintéticas públicas.
    expect(comprobarPresentaciones([convertido], 500)).toEqual(new Set([true, false]))
  })

  // El material privado se aporta durante el control de publicación; nunca se incluye en GitHub.
  it.skipIf(!process.env.CORPUS_CHECK_DIR)('valida todos los activos privados contra el índice que se publicará', () => {
    const carpeta = process.env.CORPUS_CHECK_DIR!
    const { indice: indiceReal, conceptos: todos } = cargarActivos(carpeta)
    expect(todos).toHaveLength(indiceReal.n_conceptos)
    const cuarentena = JSON.parse(readFileSync(join(carpeta, 'quarantine.json'), 'utf8'))
    expect(cuarentena.conceptos).toHaveLength(indiceReal.cuarentena)
    const apartados = new Set(cuarentena.conceptos.map((c: { concept_id: string }) => c.concept_id))
    expect(todos.some(c => apartados.has(c.concept_id))).toBe(false)
    comprobarFormatos(todos)
    comprobarPresentaciones(todos, 500)
    if (process.env.CORPUS_BASELINE_DIR) comprobarConversiones(cargarActivos(process.env.CORPUS_BASELINE_DIR).conceptos, todos)
  })
})
