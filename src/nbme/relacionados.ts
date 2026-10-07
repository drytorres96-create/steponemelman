import type { Concepto } from '../schema/concept'
import { fragmentoDocente } from '../lib/fuente-docente'
import type { NbmeCatalog, NbmeConceptLink, NbmeQuestion } from './types'

export interface ConceptoRelacionadoNbme {
  concepto: Concepto
  origen: 'catalogo' | 'ampliacion'
  relacion: 'tested' | 'foundation' | 'related'
  /** La ampliación es una ayuda para explorar, nunca un enlace revisado. */
  sugerido: boolean
  confianza?: number
  evidencia: string[]
}

export interface OpcionesRelacionadosNbme {
  pregunta: NbmeQuestion
  catalogo: NbmeCatalog | null
  conceptos: readonly Concepto[]
  /** Se entregan hasta doce; la interfaz puede mostrar seis y permitir ampliar. */
  limite?: number
}

const GENERICAS = new Set(`a an and are as at be because been being by can could did do does during each for from has have how if in into is it its may most of on or should that the their these this those to was were what when where which who will with would you your
  al ante como con cual cuando de del el en entre es esta este la las lo los mas o para por que se sin sobre su sus un una unos unas y
  patient patients paciente pacientes man woman men women year years old aged study studies recent following likely normal abnormal increased decreased increase decrease high low serum blood level levels concentration concentrations disease diseases disorder disorders function functions treatment therapy causes cause symptoms diagnosis examination findings shows show shown result results effect effects drug drugs medication medications mechanism mechanisms primary secondary associated process processes important activity type types best characteristic changes change cell cells protein proteins hormone hormones receptor receptors receptores inhibitor inhibitors antagonist antagonists agonist agonists activation activated inhibits inhibition synthesis production response responses coupling coupled pathway pathways involved produces produce stimulates stimulation needed necessary related correct incorrect statement question answer source prueba fuente sintetica objetivo afirmacion explicacion
  cardiovascular endocrino endocrine gastrointestinal hematologico oncologico musculoesqueletico neurologico neurologic renal reproductivo reproductive respiratorio respiratory multisistemico cardiac heart kidney liver brain lung tissue organ system sistema fisiologia physiology pharmacology farmacologia pathology patologia biochemistry bioquimica medicine medical medico clinical clinico
  sodium potassium calcium oxygen glucose fluid pressure rate levels concentration activity concentration content basal systolic diastolic ventricular atrial arterial venous aortic mitral cerebral adrenal
  left right nuevo nueva detect detects detected shown characterized characterize typically generally reveals presence present given effective following capacity ability desired longer enough several many prior`.split(/\s+/))

// NBME is in English; the learning items are mainly in Spanish. These are exact
// medical equivalents for matching, not translations of the source material.
const EQUIVALENCIAS: Record<string, string> = {
  baroreceptors: 'baroreceptor', barorreceptor: 'baroreceptor', barorreceptores: 'baroreceptor',
  barorreflejo: 'baroreflex', carotideo: 'carotid', carotideos: 'carotid', carotida: 'carotid', seno: 'sinus',
  ortostatica: 'orthostatic', ortostatico: 'orthostatic', hipotension: 'hypotension',
  hipovolemia: 'hypovolemia', hipovolemico: 'hypovolemia', hipovolemica: 'hypovolemia', hypovolemic: 'hypovolemia',
  poscarga: 'afterload', precarga: 'preload', hipertrofia: 'hypertrophy',
  concentrica: 'concentric', concentrico: 'concentric', excentrica: 'eccentric', excentrico: 'eccentric',
  tiroides: 'thyroid', tiroideo: 'thyroid', tiroidea: 'thyroid', tiroideos: 'thyroid', tiroideas: 'thyroid',
  antibodies: 'antibody', autoantibody: 'antibody', autoantibodies: 'antibody',
  anticuerpo: 'antibody', anticuerpos: 'antibody', autoanticuerpo: 'antibody', autoanticuerpos: 'antibody',
  folicular: 'follicular', foliculares: 'follicular', hiperplasia: 'hyperplasia',
  senalizacion: 'signaling', adrenergico: 'adrenergic', adrenergicos: 'adrenergic', adrenergica: 'adrenergic',
  adrenergicas: 'adrenergic', contraccion: 'contraction', contractilidad: 'contractility', relajacion: 'relaxation',
  sarcoplasmico: 'sarcoplasmic', sarcoplasmatica: 'sarcoplasmic', sarcolema: 'sarcolemma', reticulo: 'reticulum',
  miocito: 'myocyte', miocitos: 'myocyte', myocytes: 'myocyte', citoplasma: 'cytoplasm', citoplasmatico: 'cytoplasmic',
  calcio: 'calcium', sodio: 'sodium', potasio: 'potassium', oxigeno: 'oxygen', glucosa: 'glucose',
  proteasa: 'protease', proteasas: 'protease', poliproteinas: 'polyproteins', maduracion: 'maturation',
  vih: 'hiv', resistencia: 'resistance', mutacion: 'mutation', mutaciones: 'mutation', mutations: 'mutation',
  nifedipino: 'nifedipine', nifedipina: 'nifedipine', amlodipino: 'amlodipine', amlodipina: 'amlodipine',
  verapamilo: 'verapamil', amiodarona: 'amiodarone', digoxina: 'digoxin',
  adrenalina: 'epinephrine', noradrenalina: 'norepinephrine', fenilefrina: 'phenylephrine',
  dopamina: 'dopamine', dobutamina: 'dobutamine', adenosina: 'adenosine',
  atropina: 'atropine', escopolamina: 'scopolamine', pilocarpina: 'pilocarpine',
  neostigmina: 'neostigmine', fisostigmina: 'physostigmine', piridostigmina: 'pyridostigmine',
  furosemida: 'furosemide', bumetanida: 'bumetanide', hidroclorotiazida: 'hydrochlorothiazide',
  espironolactona: 'spironolactone', eplerenona: 'eplerenone', triamtereno: 'triamterene', amilorida: 'amiloride',
  acetazolamida: 'acetazolamide', warfarina: 'warfarin', heparina: 'heparin', insulina: 'insulin',
  metformina: 'metformin', metimazol: 'methimazole', propiltiouracilo: 'propylthiouracil', levotiroxina: 'levothyroxine',
  aspirina: 'aspirin', aciclovir: 'acyclovir', valaciclovir: 'valacyclovir',
  omeprazol: 'omeprazole', pantoprazol: 'pantoprazole', sildenafilo: 'sildenafil', tadalafilo: 'tadalafil',
  intercambiador: 'exchanger',
}

// A shared generic action (e.g. receptor blockade) must not substitute one drug
// for another. Explicit catalogue foundations remain available above this check.
const FARMACOS_CONOCIDOS = new Set(`digoxin warfarin heparin insulin metformin methimazole propylthiouracil levothyroxine aspirin acetaminophen paracetamol ibuprofen naproxen colchicine allopurinol probenecid lithium atropine scopolamine pilocarpine bethanechol physostigmine neostigmine pyridostigmine epinephrine norepinephrine phenylephrine dopamine dobutamine adenosine amiodarone flecainide sotalol furosemide bumetanide spironolactone eplerenone hydrochlorothiazide acetazolamide triamterene amiloride clopidogrel ticagrelor dipyridamole sildenafil tadalafil vardenafil finasteride dutasteride`.split(' '))
const TERMINACION_FARMACO = /(?:olol|pril|sartan|dipine|statin|prazole|gliptin|gliflozin|cillin|cycline|floxacin|vir|mab|tinib|zepam|zolam|oxetine|triptyline|caine|parin|thiazide|semide)$/
const ACRONIMOS_GENERALES = new Set(['hiv', 'aids', 'dna', 'rna', 'atp', 'adp', 'nad', 'nadh', 'fadh2', 'pdf', 'nbme'])
const ANCLAS_MECANISMO = new Set(`baroreceptor baroreflex afterload preload hypertrophy sarcoplasmic reticulum
  protease polyproteins cyclooxygenase phosphodiesterase calcineurin thymidylate dehydrogenase acetylcholinesterase
  transcriptase telomerase topoisomerase polymerase reductase angiotensin aldosterone adrenergic tshr`.split(/\s+/))

function normalizar(texto: string): string {
  return texto.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/α/g, 'alpha').replace(/β/g, 'beta')
    .replace(/\b(alpha|beta)\s*[- ]?\s*([1-3])\b/g, '$1$2')
}

function terminos(texto: string): Set<string> {
  return new Set((normalizar(texto).match(/[a-z][a-z0-9]{1,}/g) ?? [])
    .map(p => EQUIVALENCIAS[p] ?? p)
    .filter(p => !GENERICAS.has(p) && !/^\d+$/.test(p)))
}

function textoPrincipal(c: Concepto): string {
  return [c.objetivo, c.afirmacion, c.respuesta_canonica, c.evaluacion.pregunta].join(' ')
}

function preferenciaEnlace(a: NbmeConceptLink, b: NbmeConceptLink): number {
  return Number(b.relation === 'tested') - Number(a.relation === 'tested')
    || Number(b.review === 'reviewed') - Number(a.review === 'reviewed')
    || b.confidence - a.confidence
    || a.conceptId.localeCompare(b.conceptId)
}

/**
 * Repaso complementario contra el catálogo y corpus actuales. No cambia la
 * pregunta histórica, crea conceptos, modifica enlaces ni registra progreso.
 * El órgano compartido por sí solo nunca es evidencia de relevancia.
 */
export function recomendarConceptosNbme({ pregunta, catalogo, conceptos, limite = 12 }: OpcionesRelacionadosNbme): ConceptoRelacionadoNbme[] {
  const tope = Number.isFinite(limite) ? Math.max(0, Math.min(12, Math.floor(limite))) : 12
  if (!tope) return []
  const existentes = new Map<string, Concepto>()
  for (const c of conceptos) {
    if (c.calidad.estado === 'aprobado' && !existentes.has(c.concept_id)) existentes.set(c.concept_id, c)
  }
  const actual = catalogo?.questions.find(q => q.id === pregunta.id)
  // Una entrada vigente sin enlaces también es una decisión: no resucitar los
  // enlaces retirados de la revisión con la que se respondió el intento.
  const enlaces = [...(actual?.conceptLinks ?? pregunta.conceptLinks)]
    .filter(e => Number.isFinite(e.confidence) && e.confidence >= .5 && existentes.has(e.conceptId))
    .sort(preferenciaEnlace)
  const salida: ConceptoRelacionadoNbme[] = []
  const incluidos = new Set<string>()
  for (const enlace of enlaces) {
    if (incluidos.has(enlace.conceptId)) continue
    incluidos.add(enlace.conceptId)
    salida.push({ concepto: existentes.get(enlace.conceptId)!, origen: 'catalogo', relacion: enlace.relation,
      sugerido: enlace.review !== 'reviewed', confianza: enlace.confidence,
      evidencia: [enlace.relation === 'tested' ? 'Enlazado al objetivo de esta pregunta en el catálogo vigente.'
        : 'Enlazado como fundamento de esta pregunta en el catálogo vigente.'] })
    if (salida.length === tope) return salida
  }

  const objetivo = actual ? actual.objective : pregunta.objective
  const respuesta = pregunta.options.find(o => o.id === pregunta.answer)?.text ?? ''
  // Los distractores no aportan anclas: mencionarlos no convierte sus mecanismos
  // en el objetivo fallado. Sin objetivo, se conserva el contexto del enunciado.
  const foco = [objetivo || pregunta.stem, respuesta].join(' ')
  const anclas = terminos(foco)
  if (!anclas.size) return salida
  const tema = terminos(actual?.topic ?? pregunta.topic)
  const farmacos = [...anclas].filter(p => FARMACOS_CONOCIDOS.has(p) || TERMINACION_FARMACO.test(p))
  const mecanismos = [...anclas].filter(p => ANCLAS_MECANISMO.has(p))
  const especificos = new Set((foco.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []).map(p => p.toLowerCase())
    .filter(p => anclas.has(p) && !ACRONIMOS_GENERALES.has(p)))
  for (const p of anclas) if (/^(?:alpha|beta)[1-3]$/.test(p)) especificos.add(p)

  const documentos = [...existentes.values()].map(c => ({ c, principal: terminos(textoPrincipal(c)),
    contenido: terminos([textoPrincipal(c), c.explicacion, fragmentoDocente(c)].join(' ')),
    tema: terminos([c.clasificacion.tema, c.clasificacion.subtema].join(' ')) }))
  const frecuencia = new Map<string, number>()
  for (const d of documentos) for (const p of d.contenido) frecuencia.set(p, (frecuencia.get(p) ?? 0) + 1)
  const n = documentos.length
  const peso = (p: string) => 1 + Math.log((n + 1) / ((frecuencia.get(p) ?? 0) + 1))
  // Too frequent corpus words provide context but cannot justify expansion.
  const utiles = [...anclas].filter(p => (frecuencia.get(p) ?? 0) > 0
    && (n < 24 || (frecuencia.get(p) ?? 0) / n <= .25 || especificos.has(p) || farmacos.includes(p)))
  const ampliaciones: { item: ConceptoRelacionadoNbme; puntuacion: number }[] = []
  for (const d of documentos) {
    if (incluidos.has(d.c.concept_id)) continue
    if (farmacos.length && !farmacos.some(p => d.principal.has(p))) continue
    // A shared symptom (e.g. orthostatic hypotension) is not sufficient when
    // the learning objective explicitly asks about a particular mechanism.
    if (mecanismos.length && !mecanismos.some(p => d.principal.has(p))) continue
    const comunes = utiles.filter(p => d.contenido.has(p))
    const principales = comunes.filter(p => d.principal.has(p))
    const precisas = comunes.filter(p => especificos.has(p) || farmacos.includes(p)
      || (p.length >= 7 && (n < 24 || (frecuencia.get(p) ?? 0) / n <= .12)))
    const coincideTema = [...tema].filter(p => d.tema.has(p)).length
    // Evidence must reach the learning item itself, not merely a long source
    // fragment. One distinctive drug/abbreviation can stand alone; other cases
    // require several objective terms or a distinctive term and shared topic.
    const singularEspecifica = principales.some(p => especificos.has(p) || farmacos.includes(p))
    const relevante = singularEspecifica || (principales.length >= 2 && comunes.length >= 2)
      || (principales.length >= 1 && precisas.length >= 1 && coincideTema >= 1)
    if (!relevante) continue
    const evidencia = comunes.sort((a, b) => Number(d.principal.has(b)) - Number(d.principal.has(a))
      || peso(b) - peso(a) || a.localeCompare(b)).slice(0, 4)
    ampliaciones.push({ item: { concepto: d.c, origen: 'ampliacion', relacion: 'related', sugerido: true,
      evidencia: [`Coincide con el objetivo en: ${evidencia.join(', ')}.`, 'Sugerencia de exploración del corpus; no es un enlace revisado.'] },
      puntuacion: comunes.reduce((s, p) => s + peso(p) * (d.principal.has(p) ? 4 : .25), 0) + Math.min(coincideTema, 2) })
  }
  ampliaciones.sort((a, b) => b.puntuacion - a.puntuacion || a.item.concepto.concept_id.localeCompare(b.item.concepto.concept_id))
  return [...salida, ...ampliaciones.slice(0, tope - salida.length).map(a => a.item)]
}
