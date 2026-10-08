// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { crearCatalogoRecuperacion, elegirRecuperacionVerificada, resolverSeleccionRecuperacion,
  type CatalogoRecuperacion } from './catalogo-recuperacion'
import { PREFIJO_FALSO, validarRecuperacionNbme, type FuenteRecuperacion } from './recuperacion-nbme'

const mecanismo = 'Norepinephrine activates β₁-adrenergic receptors.'
const consecuencia = 'Activation of these receptors increases myocardial contractility.'
const objetivo = 'Identify the receptor mediating increased myocardial contractility.'
const fuentes: FuenteRecuperacion[] = [{ fragment: [mecanismo, consecuencia, objetivo].join('\n'),
  title: 'Synthetic cardiovascular teaching source', page: 1 }]
const opciones = ['Norepinephrine', 'Acetylcholine', 'Histamine', 'Dopamine']
const crear = () => crearCatalogoRecuperacion(fuentes, opciones, objetivo)!
const raw = (ejercicios: string[]) => ({ response: JSON.stringify({ ejercicios }) })

function seleccionValida(catalogo: CatalogoRecuperacion): string[] {
  for (const primero of catalogo.ejercicios) for (const segundo of catalogo.ejercicios) {
    if (primero === segundo || primero.tipo === segundo.tipo || primero.evidencia === segundo.evidencia) continue
    for (const tercero of catalogo.ejercicios) {
      const ids = [primero.id, segundo.id, tercero.id]
      if (resolverSeleccionRecuperacion(raw(ids), catalogo, fuentes, opciones)) return ids
    }
  }
  throw new Error('The synthetic teaching source must support a diverse selection')
}

describe('catálogo servidor de recuperación respaldada', () => {
  it('prepara práctica finita que vuelve a pasar el validador original y conserva el objetivo', () => {
    const catalogo = crear()
    const recuperacion = elegirRecuperacionVerificada(catalogo, fuentes, opciones)!
    expect(catalogo.objetivo).toBe(objetivo)
    expect(recuperacion.ejercicios.length).toBeGreaterThanOrEqual(3)
    expect(recuperacion.ejercicios.length).toBeLessThanOrEqual(6)
    expect(new Set(recuperacion.ejercicios.map(e => e.tipo)).size).toBeGreaterThanOrEqual(2)
    expect(new Set(recuperacion.ejercicios.map(e => e.evidencia)).size).toBeGreaterThanOrEqual(2)
    const sinMetadatos = recuperacion.ejercicios.map(({ id: _id, source: _source, ...e }) => e)
    expect(validarRecuperacionNbme({ response: { objetivo, ejercicios: sinMetadatos } },
      fuentes[0].fragment, opciones, fuentes)).toEqual(recuperacion)
    expect(recuperacion.ejercicios.map(e => e.id)).toEqual(recuperacion.ejercicios.map((_, i) => `rec-${i + 1}`))
  })

  it('ofrece frases originales con símbolos intactos, respuestas útiles y preguntas distintas', () => {
    const catalogo = crear()
    expect(catalogo.ejercicios.some(e => e.evidencia.includes('β₁'))).toBe(true)
    expect(catalogo.ejercicios.every(e => e.evidencia !== objetivo)).toBe(true)
    expect(new Set(catalogo.ejercicios.map(e => e.pregunta)).size).toBe(catalogo.ejercicios.length)
    for (const ejercicio of catalogo.ejercicios) {
      expect(fuentes[0].fragment).toContain(ejercicio.evidencia)
      expect(ejercicio.explicacion).toBe(ejercicio.evidencia)
      if (ejercicio.tipo !== 'verdadero_falso') {
        expect(['the', 'these', 'of', 'and', 'is', 'increases']).not.toContain(ejercicio.respuesta.toLowerCase())
        expect(ejercicio.evidencia.split(ejercicio.respuesta)).toHaveLength(2)
      }
    }
  })

  it('intercala evidencia editorial de un concepto relacionado y atribuye su fuente', () => {
    const editorial = 'Adenylate cyclase converts ATP to cyclic AMP.'
    const vinculadas = [...fuentes, { fragment: editorial, title: 'Revisión docente · Synthetic linked source',
      page: 2, conceptId: 'QA-C1' }]
    const catalogo = crearCatalogoRecuperacion(vinculadas, opciones, objetivo)!
    expect(catalogo.ejercicios.some(e => e.evidencia === editorial)).toBe(true)
    const practica = elegirRecuperacionVerificada(catalogo, vinculadas, opciones)!
    expect(practica.ejercicios.find(e => e.evidencia === editorial)?.source).toEqual({
      title: 'Revisión docente · Synthetic linked source', page: 2, conceptId: 'QA-C1' })
  })

  it('usa exclusivamente las alternativas originales y nunca crea alias o distractores', () => {
    const catalogo = crear()
    const ejercicios = catalogo.ejercicios.filter(e => e.alternativas)
    expect(ejercicios.length).toBeGreaterThan(0)
    for (const ejercicio of ejercicios) {
      expect(opciones).toContain(ejercicio.respuesta)
      expect(ejercicio.alternativas!.every(a => opciones.includes(a))).toBe(true)
      expect(ejercicio.alternativas!.filter(a => a === ejercicio.respuesta)).toHaveLength(1)
    }
    const sinOpciones = crearCatalogoRecuperacion(fuentes, [], objetivo)!
    expect(sinOpciones.ejercicios.every(e => !e.alternativas)).toBe(true)
    expect(elegirRecuperacionVerificada(sinOpciones, fuentes, [])).not.toBeNull()
  })

  it('conserva especies abreviadas, valores decimales y saltos dentro de la oración', () => {
    const primera = 'S. pyogenes expresses M protein and\nstreptococcal pyrogenic exotoxins.'
    const segunda = 'At a plasma potassium concentration of 3.5 mmol/L, potassium is filtered by the glomerulus.'
    const originales = [{ fragment: primera + '\n' + segunda, title: 'Synthetic mechanism source', page: 1 }]
    const catalogo = crearCatalogoRecuperacion(originales, [])!
    expect(catalogo.objetivo).toBe(primera)
    expect(catalogo.ejercicios.some(e => e.evidencia === primera)).toBe(true)
    expect(catalogo.ejercicios.some(e => e.evidencia === segunda)).toBe(true)
    expect(catalogo.ejercicios.every(e => !/^pyogenes\b|^5 mmol/.test(e.evidencia))).toBe(true)
  })

  it('no corta una abreviación e.g. que el segmentador puede confundir con fin de oración', () => {
    const primera = 'Some catecholamines, e.g. norepinephrine, activate adrenergic receptors.'
    const fuente = [{ ...fuentes[0], fragment: primera + ' ' + consecuencia }]
    const catalogo = crearCatalogoRecuperacion(fuente, [])!
    expect(catalogo.ejercicios.some(e => e.evidencia === primera)).toBe(true)
    expect(catalogo.ejercicios.every(e => !e.evidencia.startsWith('norepinephrine,'))).toBe(true)
  })

  it('separa oraciones completas cuando la siguiente empieza por un receptor β', () => {
    const primera = 'β₁ receptors mediate increased myocardial contractility.'
    const segunda = 'β₂ receptors mediate relaxation of bronchial smooth muscle.'
    const fuente = [{ ...fuentes[0], fragment: primera + ' ' + segunda }]
    const catalogo = crearCatalogoRecuperacion(fuente, [])!
    expect(new Set(catalogo.ejercicios.map(e => e.evidencia))).toEqual(new Set([primera, segunda]))
    expect(elegirRecuperacionVerificada(catalogo, fuente, [])).not.toBeNull()
  })

  it('restaura el antecedente de cláusulas dependientes después de puntuación defectuosa', () => {
    const original = 'Aromatase converts androgens to estrogens. which are synthesized in several tissues.'
    const segunda = 'Aromatase inhibitors reduce estrogen synthesis.'
    const fuente = [{ ...fuentes[0], fragment: original + ' ' + segunda }]
    const catalogo = crearCatalogoRecuperacion(fuente, [])!
    expect(catalogo.ejercicios.some(e => e.evidencia === original)).toBe(true)
    expect(catalogo.ejercicios.every(e => !/^(which|and|including)\b/i.test(e.evidencia))).toBe(true)
    expect(elegirRecuperacionVerificada(catalogo, fuente, [])).not.toBeNull()
  })

  it('conserva el antecedente de It para no atribuir el efecto de Zeta al objetivo Alpha', () => {
    const alpha = 'Drug Alpha inhibits enzyme Beta.'
    const zeta = 'Drug Zeta stimulates receptor Delta.'
    const efecto = 'It reduces hormone Gamma secretion.'
    const fuente = [{ ...fuentes[0], fragment: [alpha, zeta, efecto].join(' ') }]
    const catalogo = crearCatalogoRecuperacion(fuente, [], alpha)!
    expect(catalogo.ejercicios.some(e => e.evidencia === zeta + ' ' + efecto)).toBe(true)
    expect(catalogo.ejercicios.every(e => e.evidencia !== efecto && !e.evidencia.startsWith('It '))).toBe(true)
    const practica = elegirRecuperacionVerificada(catalogo, fuente, [])!
    for (const e of practica.ejercicios.filter(e => e.evidencia.includes('Gamma'))) {
      expect(e.evidencia).toContain(zeta)
      expect(e.pregunta.replace('____', e.respuesta)).toContain(zeta)
    }
    expect(catalogo.ejercicios.filter(e => e.tipo !== 'verdadero_falso')
      .every(e => !/\b(?:reduces|stimulates|inhibits)\b/i.test(e.respuesta))).toBe(true)
  })

  it('mantiene They, These receptors y This enzyme con su sujeto explícito', () => {
    const pares = [
      ['Adrenal cells produce catecholamines.', 'They release norepinephrine.'],
      ['β₁ receptors are adrenergic receptors.', 'These receptors mediate increased contractility.'],
      ['Adenylate cyclase converts ATP to cyclic AMP.', 'This enzyme participates in Gs signaling.'],
      ['Dopamine receptors mediate inhibitory and excitatory signaling.', 'Those receptors are G protein-coupled receptors.'],
      ['Hyperthyroidism can cause palpitations and tremor.', 'Such symptoms can reflect increased adrenergic signaling.'],
      ['Gs activates adenylate cyclase.', 'This pathway increases intracellular cyclic AMP.'],
    ]
    for (const [antecedente, anaforica] of pares) {
      const extra = 'Insulin receptors exhibit intrinsic tyrosine kinase activity.'
      const fuente = [{ ...fuentes[0], fragment: [antecedente, anaforica, extra].join(' ') }]
      const catalogo = crearCatalogoRecuperacion(fuente, [])!
      expect(catalogo.ejercicios.some(e => e.evidencia === antecedente + ' ' + anaforica)).toBe(true)
      expect(catalogo.ejercicios.every(e => e.evidencia !== anaforica)).toBe(true)
    }
  })

  it('descarta anáforas cuyo antecedente completo supera el límite en vez de dejarlas solas', () => {
    const antecedente = 'Drug Zeta stimulates receptor Delta when ' + 'the synthetic condition is maintained '.repeat(5) + 'in the model.'
    const anaforica = 'It reduces hormone Gamma secretion.'
    expect((antecedente + ' ' + anaforica).length).toBeGreaterThan(200)
    const restantes = 'Drug Alpha inhibits enzyme Beta. Drug Eta blocks receptor Theta.'
    const fuente = [{ ...fuentes[0], fragment: antecedente + ' ' + anaforica + ' ' + restantes }]
    const catalogo = crearCatalogoRecuperacion(fuente, [])!
    expect(catalogo.ejercicios.every(e => !e.evidencia.includes('Gamma') && !e.evidencia.includes('Zeta'))).toBe(true)
    expect(elegirRecuperacionVerificada(catalogo, fuente, [])).not.toBeNull()
  })

  it('conserva una frase independiente válida aunque las anáforas posteriores ya no quepan', () => {
    const antecedente = 'Drug Zeta stimulates receptor Delta when the synthetic concentration is maintained within the defined range.'
    const primera = 'It reduces hormone Gamma secretion.'
    const segunda = 'This effect persists when the additional synthetic condition remains present.'
    expect((antecedente + ' ' + primera).length).toBeLessThanOrEqual(200)
    expect((antecedente + ' ' + primera + ' ' + segunda).length).toBeGreaterThan(200)
    const independiente = 'Drug Alpha inhibits enzyme Beta.'
    const fuente = [{ ...fuentes[0], fragment: [antecedente, primera, segunda, independiente].join('\n') }]
    const catalogo = crearCatalogoRecuperacion(fuente, [], independiente)!
    expect(catalogo.ejercicios.some(e => e.evidencia === antecedente)).toBe(true)
    expect(catalogo.ejercicios.some(e => e.evidencia === antecedente + '\n' + primera)).toBe(true)
    expect(catalogo.ejercicios.every(e => !e.evidencia.includes('This effect'))).toBe(true)
    expect(catalogo.ejercicios.every(e => !/^(It|This)\b/.test(e.evidencia))).toBe(true)
  })

  it('conserva anclaje literal para Due to this difference, Because of its y From here', () => {
    const pares = [
      ['Drug Alpha has lower intrinsic efficacy than Drug Zeta.', 'Due to this difference, it produces a smaller maximal effect.'],
      ['Drug Alpha binds receptor Beta with high affinity.', 'Because of its high affinity, it occupies the receptor at low concentrations.'],
      ['The hypothalamus projects neurons to the posterior pituitary.', 'From here, vasopressin enters the circulation.'],
    ]
    for (const [antecedente, referencia] of pares) {
      const independiente = 'Insulin receptors exhibit intrinsic tyrosine kinase activity.'
      const fuente = [{ ...fuentes[0], fragment: [antecedente, referencia, independiente].join(' ') }]
      const catalogo = crearCatalogoRecuperacion(fuente, [])!
      expect(catalogo.ejercicios.some(e => e.evidencia === antecedente + ' ' + referencia)).toBe(true)
      expect(catalogo.ejercicios.every(e => e.evidencia !== referencia)).toBe(true)
    }
  })

  it('usa un segundo pase con contexto completo sólo cuando citas cortas no forman un lote válido', () => {
    const frase = (prefijo: string, largo: number) => prefijo + 'x'.repeat(largo - prefijo.length - 1) + '.'
    const antecedente = frase('Drug Alpha inhibits enzyme Beta under the synthetic condition ', 150)
    const referencia = frase('It reduces hormone Gamma secretion when the synthetic condition is ', 149)
    const contexto = antecedente + '\n' + referencia
    expect(contexto.length).toBe(300)
    const fuente = [{ ...fuentes[0], fragment: contexto }]
    const catalogo = crearCatalogoRecuperacion(fuente, [])!
    expect(catalogo.ejercicios.some(e => e.evidencia === antecedente)).toBe(true)
    expect(catalogo.ejercicios.some(e => e.evidencia === contexto)).toBe(true)
    expect(catalogo.ejercicios.every(e => e.evidencia !== referencia)).toBe(true)
    const practica = elegirRecuperacionVerificada(catalogo, fuente, [])!
    expect(practica.ejercicios.some(e => e.evidencia === contexto)).toBe(true)
    expect(practica.ejercicios.every(e => e.pregunta.length <= 350)).toBe(true)
    const demasiado = [{ ...fuente[0], fragment: antecedente + '\n' + referencia.replace('Gamma', 'GammaX') }]
    expect(demasiado[0].fragment.length).toBe(301)
    expect(crearCatalogoRecuperacion(demasiado, [])).toBeNull()
  })

  it('mantiene el primer pase corto cuando ya admite práctica aunque haya otras citas largas', () => {
    const antecedente = 'Drug Zeta stimulates receptor Delta under the documented synthetic experimental condition.'
    const referencia = 'It reduces hormone Gamma secretion when the documented synthetic experimental condition is maintained throughout the observation.'
    const larga = antecedente + ' ' + referencia
    expect(larga.length).toBeGreaterThan(200)
    expect(larga.length).toBeLessThanOrEqual(300)
    const independientes = 'Drug Alpha inhibits enzyme Beta. Drug Eta blocks receptor Theta.'
    const fuente = [{ ...fuentes[0], fragment: larga + ' ' + independientes }]
    const catalogo = crearCatalogoRecuperacion(fuente, [])!
    expect(catalogo.ejercicios.every(e => e.evidencia.length <= 200)).toBe(true)
    expect(catalogo.ejercicios.every(e => !e.evidencia.includes('Gamma'))).toBe(true)
    expect(elegirRecuperacionVerificada(catalogo, fuente, [])).not.toBeNull()
  })

  it('prioriza la frase del objetivo que discrimina el organismo frente a datos generales de celulitis', () => {
    const decisiva = 'S. pyogenes forms gram-positive chains, exhibits β-hemolysis, and is typically sensitive to bacitracin.'
    const objetivoLargo = [
      'Cellulitis is a bacterial infection of the dermis and subcutaneous tissue characterized by erythema, warmth, swelling, and tenderness.',
      'Staphylococcus aureus and Streptococcus pyogenes are common causes of bacterial cellulitis.',
      'Recurrent infection can occur when the skin barrier remains disrupted or predisposing local factors are unresolved.',
      decisiva,
    ].join(' ')
    expect(objetivoLargo.length).toBeGreaterThan(350)
    const fuente = [{ ...fuentes[0], fragment: 'Cellulitis frequently involves the lower extremities\n' + objetivoLargo }]
    const opcionesOriginales = ['Staphylococcus aureus', 'Streptococcus pyogenes (group A)', 'Escherichia coli']
    const catalogo = crearCatalogoRecuperacion(fuente, opcionesOriginales, objetivoLargo,
      'Streptococcus pyogenes (group A)')!
    expect(catalogo.objetivo).toBe(decisiva)
    expect(catalogo.ejercicios[0].evidencia).toBe(decisiva)
    expect(elegirRecuperacionVerificada(catalogo, fuente, opcionesOriginales)?.ejercicios
      .some(e => e.evidencia === decisiva)).toBe(true)
  })

  it('no coloca sistemáticamente la correcta en la primera alternativa', () => {
    const opcionesOriginales = ['Norepinephrine', 'Dopamine', 'Histamine']
    const fuente = [{ ...fuentes[0], fragment: 'Norepinephrine activates adrenergic receptors. Dopamine binds dopamine receptors.' }]
    const catalogo = crearCatalogoRecuperacion(fuente, opcionesOriginales)!
    const elecciones = catalogo.ejercicios.filter(e => e.alternativas)
    expect(elecciones).toHaveLength(2)
    expect(elecciones.map(e => e.alternativas!.indexOf(e.respuesta))).toEqual([2, 1])
  })

  it('mantiene la negación y condición completas en los formatos de recuerdo y V/F', () => {
    const negativa = 'Drug X does not inhibit adenylate cyclase when receptor Y is inactive.'
    const segunda = 'Receptor Y activates phospholipase C.'
    const fuente = [{ ...fuentes[0], fragment: negativa + ' ' + segunda }]
    const catalogo = crearCatalogoRecuperacion(fuente, [])!
    for (const e of catalogo.ejercicios.filter(e => e.evidencia.includes('Drug X'))) {
      expect(e.evidencia).toBe(negativa)
      expect(e.pregunta).toContain('does not')
      expect(e.pregunta.replace('____', e.respuesta)).toContain('when receptor Y is inactive')
      if (e.tipo === 'verdadero_falso') expect(e.pregunta).toBe(e.respuesta === 'Falso'
        ? PREFIJO_FALSO + negativa : negativa)
    }
  })

  it('omite frases mayores del límite sin recortarlas y busca un objetivo completo menor de 350', () => {
    const largo = 'If receptor Y is inactive, ' + 'a sufficiently long conditional context '.repeat(8)
      + 'Drug X does not inhibit adenylate cyclase.'
    const fuente = [{ ...fuentes[0], fragment: largo + ' ' + mecanismo + ' ' + consecuencia }]
    const catalogo = crearCatalogoRecuperacion(fuente, [], largo)!
    expect(catalogo.objetivo).toBe(mecanismo)
    expect(catalogo.ejercicios.every(e => !e.evidencia.includes('Drug X'))).toBe(true)
  })

  it('prefiere el objetivo NBME literal y rechaza sustituirlo por un objetivo de otra fuente', () => {
    const ajeno = 'Identify a synthetic linked biochemical mechanism.'
    const catalogo = crearCatalogoRecuperacion([...fuentes, { ...fuentes[0], fragment: ajeno }], opciones, ajeno)!
    expect(catalogo.objetivo).toBe(mecanismo)
    expect(crearCatalogoRecuperacion([], opciones, objetivo)).toBeNull()
  })

  it('no fuerza una sesión con una sola cita, sólo palabras funcionales o material demasiado largo', () => {
    expect(crearCatalogoRecuperacion([{ ...fuentes[0], fragment: mecanismo }], [])).toBeNull()
    expect(crearCatalogoRecuperacion([{ ...fuentes[0], fragment: 'The following is the only one. And this is the other one.' }], [])).toBeNull()
    const larga = 'The receptor interacts with ' + 'a long conditional sequence '.repeat(10) + 'adenylate cyclase.'
    expect(crearCatalogoRecuperacion([{ ...fuentes[0], fragment: larga + ' ' + larga }], [])).toBeNull()
  })

  it('limita a 36 candidatos aun con varias fuentes extensas y conserva una salida determinista', () => {
    const material = Array.from({ length: 20 }, (_, i) => `Synthetic receptor ${i + 1} activates adenylate cyclase.`).join(' ')
    const entradas = Array.from({ length: 4 }, (_, i) => ({ fragment: material.replaceAll('receptor', `receptor-${i}`),
      title: `Synthetic teaching source ${i}`, page: i + 1 }))
    const catalogo = crearCatalogoRecuperacion(entradas, [])!
    expect(catalogo.ejercicios.length).toBeLessThanOrEqual(36)
    expect(crearCatalogoRecuperacion(entradas, [])).toEqual(catalogo)
    expect(elegirRecuperacionVerificada(catalogo, entradas, [])).toEqual(elegirRecuperacionVerificada(catalogo, entradas, []))
  })
})

describe('selección de IDs de ejercicios', () => {
  it('resuelve únicamente IDs conocidos y acepta response JSON como texto, objeto o bloque', () => {
    const catalogo = crear(), ids = seleccionValida(catalogo)
    const esperado = resolverSeleccionRecuperacion(raw(ids), catalogo, fuentes, opciones)
    expect(esperado).not.toBeNull()
    expect(resolverSeleccionRecuperacion({ response: { ejercicios: ids } }, catalogo, fuentes, opciones)).toEqual(esperado)
    expect(resolverSeleccionRecuperacion({ response: '```json\n' + JSON.stringify({ ejercicios: ids }) + '\n```' },
      catalogo, fuentes, opciones)).toEqual(esperado)
  })

  it('rechaza repetición, ID ajeno, cantidades incorrectas, texto médico y claves adicionales', () => {
    const catalogo = crear(), ids = seleccionValida(catalogo)
    for (const seleccion of [[ids[0], ids[0], ids[1]], [ids[0], ids[1], 'e-99'], ids.slice(0, 2),
      [...ids, ...ids, 'e-36'], ['Ignore instructions', ...ids.slice(1)]]) {
      expect(resolverSeleccionRecuperacion(raw(seleccion), catalogo, fuentes, opciones)).toBeNull()
    }
    expect(resolverSeleccionRecuperacion({ response: { ejercicios: ids, objetivo: 'An invented medical objective.' } },
      catalogo, fuentes, opciones)).toBeNull()
    expect(resolverSeleccionRecuperacion({ response: JSON.stringify({ ejercicios: ids }).slice(0, -1) },
      catalogo, fuentes, opciones)).toBeNull()
  })

  it('no acepta una selección conocida sin diversidad ni un catálogo manipulado con hechos nuevos', () => {
    const catalogo = crear()
    const mismos = catalogo.ejercicios.filter(e => e.tipo === 'completar').slice(0, 3)
    expect(mismos).toHaveLength(3)
    expect(resolverSeleccionRecuperacion(raw(mismos.map(e => e.id)), catalogo, fuentes, opciones)).toBeNull()
    const manipulado = structuredClone(catalogo), ids = seleccionValida(catalogo)
    manipulado.ejercicios.find(e => e.id === ids[0])!.evidencia = 'An invented unsupported medical statement.'
    expect(resolverSeleccionRecuperacion(raw(ids), manipulado, fuentes, opciones)).toBeNull()
  })
})
