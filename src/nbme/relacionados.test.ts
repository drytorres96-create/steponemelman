import { describe, expect, it } from 'vitest'
import { ConceptoZ, type Concepto } from '../schema/concept'
import type { NbmeCatalog, NbmeConceptLink, NbmeQuestion } from './types'
import { recomendarConceptosNbme } from './relacionados'

function concepto(id: string, objetivo = 'Recover the TSH receptor signaling pathway', extra: Partial<Concepto> = {}): Concepto {
  return ConceptoZ.parse({
    concept_id: id,
    source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: id, fragment: objetivo },
    objetivo, afirmacion: objetivo, respuesta_canonica: 'Gs', explicacion: objetivo,
    clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Endocrino',
      tema: 'Receptor signaling', subtema: 'TSH', tipo_conocimiento: 'Mecanismo', dificultad: 1 },
    step: 'step1', interaccion: { recomendada: 'recuperacion_libre' }, evaluacion: { pregunta: objetivo },
    pistas: ['Uno', 'Dos', 'Tres'], calidad: { confianza: .9, estado: 'aprobado' }, ...extra,
  })
}

function pregunta(extra: Partial<NbmeQuestion> = {}): NbmeQuestion {
  return {
    id: 'QA-NBME-01', revision: 'historia', form: '29', section: 1, item: 1, page: 1,
    systems: ['Endocrino'], disciplines: ['Fisiología'], topic: 'Receptor signaling',
    objective: 'TSH activates a Gs signaling pathway to increase cAMP.', status: 'ready', reasons: [], figureRequired: false,
    conceptLinks: [], stem: 'Which receptor mediates TSH signaling?',
    options: [{ id: 'A', text: 'Gs' }, { id: 'B', text: 'Tyrosine kinase' }], answer: 'A', explanation: 'TSH signals through Gs.',
    figures: [], provenance: { sourceFile: 'QA', sourceRecordId: 'QA', notes: [] }, ...extra,
  }
}

const enlace = (id: string, extra: Partial<NbmeConceptLink> = {}): NbmeConceptLink => ({
  conceptId: id, relation: 'tested', confidence: .8, review: 'suggested', ...extra,
})
const catalogo = (q: NbmeQuestion): NbmeCatalog => ({ schemaVersion: 1, bankVersion: 'QA', total: 1, questions: [q] })
const ids = (r: ReturnType<typeof recomendarConceptosNbme>) => r.map(x => x.concepto.concept_id)

describe('fundamentos actuales y ampliación del repaso NBME', () => {
  it('recupera tested y foundation desde el catálogo actual, sin el cap anterior de tres', () => {
    const cs = Array.from({ length: 8 }, (_, i) => concepto(`QA-concept-${i}`))
    const antiguo = pregunta({ conceptLinks: [enlace('retirado')] })
    const vigente = pregunta({ revision: 'actual', conceptLinks: cs.map((c, i) => enlace(c.concept_id,
      { relation: i < 4 ? 'tested' : 'foundation', confidence: .5 })) })
    const r = recomendarConceptosNbme({ pregunta: antiguo, catalogo: catalogo(vigente), conceptos: cs })
    expect(ids(r)).toHaveLength(8)
    expect(r.every(x => x.origen === 'catalogo' && x.sugerido)).toBe(true)
    expect(r.map(x => x.relacion)).toEqual(['tested', 'tested', 'tested', 'tested', 'foundation', 'foundation', 'foundation', 'foundation'])
    expect(antiguo.revision).toBe('historia')
    expect(antiguo.conceptLinks[0].conceptId).toBe('retirado')
  })

  it('deduplica IDs, selecciona la mejor relación y descarta IDs inexistentes, bajas confianzas y cuarentena', () => {
    const cs = [concepto('QA-enlace'), concepto('QA-no-relevante', 'Alveolar gas exchange', { respuesta_canonica: 'diffusion' }),
      concepto('QA-cuarentena', 'TSH signaling', { calidad: { confianza: .9, estado: 'cuarentena', alertas: [] } })]
    const q = pregunta({ conceptLinks: [enlace('QA-enlace', { relation: 'foundation', confidence: .95 }),
      enlace('QA-enlace', { confidence: .7, review: 'reviewed' }), enlace('inventado'),
      enlace('QA-no-relevante', { confidence: .49 }), enlace('QA-cuarentena'), enlace('QA-no-relevante', { confidence: NaN })] })
    const r = recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: [...cs, cs[0]] })
    expect(ids(r)).toEqual(['QA-enlace'])
    expect(r[0]).toMatchObject({ relacion: 'tested', sugerido: false, confianza: .7 })
  })

  it('no resucita enlaces retirados cuando la entrada vigente no tiene enlaces', () => {
    const antiguo = pregunta({ conceptLinks: [enlace('QA-retirado')] })
    const vigente = pregunta({ revision: 'actual', conceptLinks: [] })
    const retirado = concepto('QA-retirado', 'Adrenal cortisol secretion', { respuesta_canonica: 'cortisol' })
    const r = recomendarConceptosNbme({ pregunta: antiguo, catalogo: catalogo(vigente), conceptos: [retirado, concepto('QA-TSH')] })
    expect(ids(r)).toEqual(['QA-TSH'])
    expect(r[0]).toMatchObject({ origen: 'ampliacion', sugerido: true, relacion: 'related' })
  })

  it('amplía varios componentes de TSH, con evidencia, sin añadir todos los conceptos del órgano', () => {
    const cs = [concepto('QA-receptor'), concepto('QA-Gs', 'TSH uses Gs to activate adenylyl cyclase'),
      concepto('QA-cAMP', 'TSH raises cAMP through Gs'),
      concepto('QA-insulin', 'Insulin binds a tyrosine kinase receptor', { respuesta_canonica: 'tyrosine kinase' }),
      concepto('QA-cortisol', 'Cortisol binds an intracellular receptor', { respuesta_canonica: 'intracellular' })]
    const q = pregunta()
    const r = recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: cs })
    expect(new Set(ids(r))).toEqual(new Set(['QA-receptor', 'QA-Gs', 'QA-cAMP']))
    expect(r.every(x => x.origen === 'ampliacion' && x.sugerido && x.confianza === undefined)).toBe(true)
    expect(r.every(x => x.evidencia.join(' ').includes('tsh'))).toBe(true)
  })

  it('no usa el medicamento de un distractor ni cambia metoprolol por propranolol por compartir mecanismo', () => {
    const q = pregunta({ systems: ['Cardiovascular'], disciplines: ['Farmacología'], topic: 'Beta blockade',
      objective: 'Metoprolol selectively blocks beta1 adrenergic receptors.',
      stem: 'Which mechanism explains the effect of metoprolol?',
      options: [{ id: 'A', text: 'Beta1 blockade' }, { id: 'B', text: 'Verapamil blocks calcium channels' }], answer: 'A' })
    const cs = [concepto('QA-metoprolol', 'Metoprolol blocks beta1 adrenergic receptors', { respuesta_canonica: 'beta1' }),
      concepto('QA-propranolol', 'Propranolol blocks beta1 and beta2 adrenergic receptors', { respuesta_canonica: 'beta1 and beta2' }),
      concepto('QA-verapamil', 'Verapamil blocks calcium channels', { respuesta_canonica: 'calcium channels' }),
      concepto('QA-comparacion', 'Propranolol blocks beta1 and beta2 receptors', { respuesta_canonica: 'propranolol',
        explicacion: 'Unlike metoprolol, propranolol is nonselective.' })]
    expect(ids(recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: cs }))).toEqual(['QA-metoprolol'])
  })

  it('conserva los fundamentos explícitos aunque no nombren el medicamento', () => {
    const base = concepto('QA-fundamento', 'Gs activates adenylyl cyclase')
    const q = pregunta({ objective: 'Metoprolol selectively blocks beta1 adrenergic receptors.',
      conceptLinks: [enlace(base.concept_id, { relation: 'foundation', confidence: .6 })] })
    const r = recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: [base] })
    expect(ids(r)).toEqual([base.concept_id])
    expect(r[0].relacion).toBe('foundation')
  })

  it('reconoce el mismo mecanismo con NBME inglés y concepto español', () => {
    const q = pregunta({ objective: 'Carotid sinus baroreceptors detect orthostatic hypotension and hypovolemia.',
      topic: 'Baroreflex', options: [{ id: 'A', text: 'Reduced baroreceptor firing' }], answer: 'A' })
    const cs = [concepto('QA-baro', 'Los barorreceptores del seno carotídeo responden a la hipovolemia.',
      { respuesta_canonica: 'Disminuye la descarga barorreceptora' }),
      concepto('QA-enalapril', 'El enalapril disminuye la poscarga', { respuesta_canonica: 'Poscarga baja' })]
    expect(ids(recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: cs }))).toEqual(['QA-baro'])
  })

  it('no sustituye el mecanismo por otra etiología que solo comparte el síntoma', () => {
    const q = pregunta({ objective: 'Carotid sinus baroreceptors adjust to orthostatic hypotension.',
      options: [{ id: 'A', text: 'Reduced baroreceptor firing' }], answer: 'A' })
    const otro = concepto('QA-otra-causa', 'Enzyme deficiency causes orthostatic hypotension.',
      { respuesta_canonica: 'Enzyme deficiency' })
    const relevante = concepto('QA-mecanismo', 'Carotid sinus baroreceptors sense stretch.',
      { respuesta_canonica: 'Baroreceptor firing decreases' })
    expect(ids(recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: [otro, relevante] }))).toEqual(['QA-mecanismo'])
  })

  it('normaliza nombres equivalentes de fármaco, letras griegas y subíndices', () => {
    const q = pregunta({ objective: 'Nifedipine blocks calcium channels.',
      options: [{ id: 'A', text: 'Nifedipine' }], answer: 'A' })
    const cs = [concepto('QA-nifedipino', 'El nifedipino bloquea canales de calcio.', { respuesta_canonica: 'Nifedipino' }),
      concepto('QA-amlodipino', 'El amlodipino bloquea canales de calcio.', { respuesta_canonica: 'Amlodipino' })]
    expect(ids(recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: cs }))).toEqual(['QA-nifedipino'])
    const ionica = pregunta({ objective: 'A Na⁺/Ca²⁺ exchanger removes calcium from the cytoplasm.',
      options: [{ id: 'A', text: 'Na⁺/Ca²⁺ exchanger' }], answer: 'A' })
    const intercambiador = concepto('QA-iones', 'El intercambiador Na+/Ca2+ retira calcio del citoplasma.',
      { respuesta_canonica: 'Na+/Ca2+' })
    expect(ids(recomendarConceptosNbme({ pregunta: ionica, catalogo: catalogo(ionica), conceptos: [intercambiador] }))).toEqual(['QA-iones'])
  })

  it('prioriza el mecanismo del concepto frente a menciones incidentales en la fuente', () => {
    const q = pregunta({ objective: 'TSH receptor antibodies cause Graves thyroid hyperplasia.', topic: 'Graves' })
    const principal = concepto('QA-principal', 'En Graves los anticuerpos estimulan el receptor TSH en la tiroides.',
      { respuesta_canonica: 'Autoanticuerpos TSH' })
    const incidental = concepto('QA-incidental', 'TSH baja en la tirotoxicosis facticia', { respuesta_canonica: 'TSH baja',
      source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: 'QA',
        fragment: 'TSH receptor antibodies cause Graves thyroid hyperplasia. Compare factitious thyroid disease.' } })
    const r = recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: [incidental, principal] })
    expect(ids(r)).toEqual(['QA-principal', 'QA-incidental'])
    expect(r[0].evidencia[0]).toContain('antibody')
  })

  it('no confunde compartir HIV con explicar el procesamiento proteico probado', () => {
    const q = pregunta({ objective: 'HIV protease cleaves polyproteins during viral maturation.', topic: 'Protease and polyproteins',
      options: [{ id: 'A', text: 'Protein processing' }], answer: 'A' })
    const cs = [concepto('QA-protease', 'HIV protease cleaves polyproteins', { respuesta_canonica: 'polyproteins' }),
      concepto('QA-CD4', 'HIV infection decreases CD4 lymphocytes', { respuesta_canonica: 'CD4 lymphocytes' })]
    expect(ids(recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: cs }))).toEqual(['QA-protease'])
  })

  it('sin evidencia no inventa ni fuerza conceptos, ni modifica entradas', () => {
    const q = pregunta({ objective: null, stem: 'Which mechanism is most likely?', options: [], answer: null })
    const cs = [concepto('QA-alveolar', 'Alveolar ventilation', { respuesta_canonica: 'ventilation' })]
    const anterior = JSON.stringify({ q, cs })
    expect(recomendarConceptosNbme({ pregunta: q, catalogo: catalogo(q), conceptos: cs })).toEqual([])
    expect(JSON.stringify({ q, cs })).toBe(anterior)
  })

  it('respeta doce como techo y seis como tamaño inicial, con orden determinista', () => {
    const cs = Array.from({ length: 20 }, (_, i) => concepto(`QA-${String(i).padStart(2, '0')}`))
    const q = pregunta()
    const opciones = { pregunta: q, catalogo: catalogo(q), conceptos: cs }
    expect(recomendarConceptosNbme(opciones)).toHaveLength(12)
    expect(recomendarConceptosNbme({ ...opciones, limite: 6 })).toHaveLength(6)
    expect(recomendarConceptosNbme({ ...opciones, limite: 100 })).toHaveLength(12)
    expect(recomendarConceptosNbme({ ...opciones, limite: 0 })).toEqual([])
    expect(ids(recomendarConceptosNbme({ ...opciones, conceptos: [...cs].reverse() }))).toEqual(ids(recomendarConceptosNbme(opciones)))
  })
})
