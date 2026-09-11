import { describe, expect, it } from 'vitest'
import { ConceptoZ, type Concepto } from '../schema/concept'
import { alternarFormatos, esRespuestaBreve, prepararConcepto } from './formatos'

const base = ConceptoZ.parse({
  concept_id: 'QA-VARIANTE',
  source: { doc: 'QA', doc_title: 'Ejemplo sintético', page: 1, item_id: 'QA-1', fragment: 'La letra alfa pertenece al grupo inicial.' },
  objetivo: 'Reconocer un término sintético', afirmacion: 'La letra alfa pertenece al grupo inicial.',
  respuesta_canonica: 'alfa', sinonimos: ['alpha'], explicacion: 'Explicación sintética.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'Ejemplo', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre', 'completar'] },
  evaluacion: { pregunta: '¿Qué letra pertenece al grupo inicial?' }, pistas: ['Uno', 'Dos', 'Tres'],
  calidad: { estado: 'aprobado', confianza: 1 },
})
const contexto = { semilla: 'QA-sesion:0', indice: 0, ruta: 'repaso' }
const opcion = ConceptoZ.parse({ ...base, interaccion: { recomendada: 'opcion_multiple' },
  evaluacion: { ...base.evaluacion, opciones: [
    { texto: 'alfa', correcta: true, por_que: 'Alfa corresponde al grupo inicial.' },
    { texto: 'beta', correcta: false, por_que: 'Beta corresponde a otro grupo.' },
    { texto: 'gamma', correcta: false, por_que: 'Gamma pertenece a un tercer grupo.' },
  ] },
})

describe('variación de formatos sin modificar la evidencia del concepto', () => {
  it('limita la escritura por palabras y caracteres, sin convertir un alias corto en respuesta de un mecanismo largo', () => {
    expect(esRespuestaBreve('un término formado por seis palabras')).toBe(true)
    expect(esRespuestaBreve('un término formado por más de seis palabras')).toBe(false)
    expect(esRespuestaBreve('x'.repeat(66))).toBe(false)
    expect(esRespuestaBreve('   ')).toBe(false)
    const largo = ConceptoZ.parse({ ...base, respuesta_canonica: 'Una cadena extensa de varios mecanismos relacionados que no puede evaluarse mediante una sola palabra.', sinonimos: ['alfa'] })
    const preparado = prepararConcepto(largo, contexto)
    expect(preparado.interaccion.recomendada).toBe('tarjeta')
    expect(preparado.respuesta_canonica).toBe(largo.respuesta_canonica)
  })

  it('usa opciones redactadas para una respuesta larga y conserva su identidad y referencias', () => {
    const largo = ConceptoZ.parse({ ...opcion, respuesta_canonica: 'Una cadena extensa de varios mecanismos relacionados que no puede evaluarse mediante una sola palabra.', interaccion: { recomendada: 'recuperacion_libre' } })
    const antes = JSON.stringify(largo)
    const preparado = prepararConcepto(largo, contexto)
    expect(preparado.interaccion.recomendada).toBe('opcion_multiple')
    expect(preparado.evaluacion.opciones).toEqual(largo.evaluacion.opciones)
    expect(preparado.concept_id).toBe(largo.concept_id)
    expect(preparado.source).toEqual(largo.source)
    expect(JSON.stringify(largo)).toBe(antes)
  })

  it('reproduce el V/F heredado solo para reanudar sesiones antiguas', () => {
    const antes = JSON.stringify(opcion)
    const propuestas = new Set(opcion.evaluacion.opciones!.map(o => o.texto))
    const veredictos = new Set<boolean>()
    for (let n = 0; n < 12; n++) {
      const ctx = { ...contexto, semilla: `QA-sesion:${n}`, indice: 2, version: 1 as const }
      const preparada = prepararConcepto(opcion, ctx)
      expect(preparada).toEqual(prepararConcepto(opcion, ctx))
      expect(preparada.interaccion.recomendada).toBe('verdadero_falso')
      const propuesta = preparada.evaluacion.pregunta.match(/Propuesta: «(.+)»/)?.[1]
      expect(propuestas.has(propuesta!)).toBe(true)
      const original = opcion.evaluacion.opciones!.find(o => o.texto === propuesta)!
      const verdadero = preparada.evaluacion.opciones!.find(o => o.texto === 'Verdadero')!
      expect(verdadero.correcta).toBe(original.correcta)
      expect(preparada.evaluacion.opciones!.filter(o => o.correcta)).toHaveLength(1)
      veredictos.add(verdadero.correcta)
    }
    expect(veredictos).toEqual(new Set([true, false]))
    expect(JSON.stringify(opcion)).toBe(antes)
  })

  it('las sesiones nuevas conservan todas las opciones editoriales en cualquier posición', () => {
    for (const indice of [0, 2, 5, 8]) {
      const c = prepararConcepto(opcion, { ...contexto, indice })
      expect(c.interaccion.recomendada).toBe('opcion_multiple')
      expect(c.evaluacion).toEqual(opcion.evaluacion)
    }
  })

  it('conserva opciones completas en examen, correcciones y casos clínicos', () => {
    expect(prepararConcepto(opcion, { ...contexto, indice: 2, ruta: 'examen' }).interaccion.recomendada).toBe('opcion_multiple')
    expect(prepararConcepto(opcion, { ...contexto, indice: 2, forzarReconocimiento: true }).interaccion.recomendada).toBe('opcion_multiple')
    const caso = ConceptoZ.parse({ ...opcion, interaccion: { recomendada: 'caso_clinico' } })
    const preparado = prepararConcepto(caso, { ...contexto, indice: 2 })
    expect(preparado.interaccion.recomendada).toBe('caso_clinico')
    expect(preparado.evaluacion).toEqual(caso.evaluacion)
  })

  it('completar conserva la afirmación con un hueco exacto y evita cambios ambiguos', () => {
    const preparado = prepararConcepto(base, { ...contexto, indice: 1 })
    expect(preparado.interaccion.recomendada).toBe('completar')
    expect(preparado.evaluacion.pregunta).toContain('La letra ______ pertenece al grupo inicial.')
    expect(preparado.respuesta_canonica).toBe('alfa')
    for (const afirmacion of ['Alfabeto es una palabra distinta.', 'Alfa se escribe alfa.']) {
      const ambiguo = ConceptoZ.parse({ ...base, afirmacion })
      expect(prepararConcepto(ambiguo, { ...contexto, indice: 1 }).interaccion.recomendada).toBe('recuperacion_libre')
    }
    const prohibido = ConceptoZ.parse({ ...base, interaccion: { ...base.interaccion, prohibidas: ['completar'] } })
    expect(prepararConcepto(prohibido, { ...contexto, indice: 1 }).interaccion.recomendada).toBe('recuperacion_libre')
  })

  it('no admite como sinónimo la pista que ya aparece en el enunciado', () => {
    const c = ConceptoZ.parse({ ...base, evaluacion: { pregunta: '¿Qué efecto produce beta?', respuestas_aceptadas: ['beta', 'alpha'] }, sinonimos: ['beta', 'alpha'] })
    const preparado = prepararConcepto(c, contexto)
    expect(preparado.sinonimos).toEqual(['alpha'])
    expect(preparado.evaluacion.respuestas_aceptadas).toEqual(['alpha'])
    expect(c.sinonimos).toEqual(['beta', 'alpha'])
  })

  it.each(['prediccion_direccional', 'relacionar', 'secuencia', 'clasificar', 'numerico'] as const)('conserva el formato nativo %s', formato => {
    const c = ConceptoZ.parse({ ...base, interaccion: { recomendada: formato } })
    expect(prepararConcepto(c, { ...contexto, indice: 2 }).interaccion.recomendada).toBe(formato)
  })

  it('alterna los formatos sin añadir ni perder conceptos de la selección filtrada', () => {
    const lista: Concepto[] = [
      ...Array.from({ length: 4 }, (_, i) => ConceptoZ.parse({ ...base, concept_id: `QA-TEXTO-${i}` })),
      ...Array.from({ length: 4 }, (_, i) => ConceptoZ.parse({ ...opcion, concept_id: `QA-OPCION-${i}` })),
    ]
    const antes = lista.map(c => c.concept_id)
    const mezclada = alternarFormatos(lista)
    expect(mezclada.map(c => c.concept_id).sort()).toEqual([...antes].sort())
    expect(new Set(mezclada.map(c => c.concept_id)).size).toBe(lista.length)
    expect(mezclada.every((c, i) => i === 0 || c.interaccion.recomendada !== mezclada[i - 1].interaccion.recomendada)).toBe(true)
    expect(lista.map(c => c.concept_id)).toEqual(antes)
    expect(alternarFormatos(lista, 'examen')).toEqual(lista)
  })
})
