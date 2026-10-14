import type { EligibleItem, ExplanationSection } from '../contracts'

/** Entirely synthetic. These IDs, questions and statistics never come from a private bank. */
export const systems = [
  ['cardio', 'Cardiovascular'], ['renal', 'Renal'], ['endo', 'Endocrine'],
  ['neuro', 'Neurology'], ['micro', 'Microbiology'], ['pulm', 'Pulmonary'],
  ['gastro', 'Gastrointestinal'], ['immune', 'Immunology'], ['bio', 'Biochemistry'],
] as const
export interface DemoItem extends EligibleItem { firstCorrect: boolean | null; template: 'case' | 'recall' | 'calculation' }
export const items: DemoItem[] = systems.flatMap(([system], si) => Array.from({ length: 8 }, (_, i) => ({
  id: `demo-${system}-${i}`, kind: i < 5 ? 'nbme' as const : 'concept' as const,
  systems: [system], firstCorrect: i < 3 ? (i + si) % 3 !== 0 : null,
  pools: [...(i >= 3 ? ['unused' as const] : (i + si) % 3 === 0 ? ['incorrect' as const] : []),
    ...(i === 1 || i === 4 ? ['flagged' as const] : []), ...(i === 6 ? ['skipped' as const] : [])],
  template: i < 5 ? 'case' as const : i % 2 === 0 ? 'calculation' as const : 'recall' as const,
})))
export interface DemoQuestion {
  stem: string
  prompt: string
  options?: readonly { id: string; text: string }[]
  answer: string
  accepts?: readonly string[]
  vitals?: readonly [string, string][]
  sections: readonly ExplanationSection[]
}
// The case mirrors the user-supplied visual example, never an imported NBME question.
const caseQuestion: DemoQuestion = {
  stem: 'A postoperative patient develops fever, confusion, and decreased urine output. The extremities are warm and flushed, and capillary refill is under 2 seconds. The surgical wound has purulent drainage. The lungs are clear to auscultation.',
  prompt: 'Which hemodynamic pattern is most consistent with early distributive shock?',
  vitals: [['Temperature', '39.1 °C'], ['Heart rate', '124/min'], ['Blood pressure', '78/40 mm Hg'], ['Resp. rate', '26/min']],
  options: [{ id: 'A', text: '↓ Cardiac output · ↑ Systemic vascular resistance' }, { id: 'B', text: '↓ Cardiac output · ↓ Systemic vascular resistance' },
    { id: 'C', text: '↑ Cardiac output · ↓ Systemic vascular resistance' }, { id: 'D', text: '↑ Cardiac output · ↑ Systemic vascular resistance' }],
  answer: 'C',
  sections: [
    { id: 'stem', label: 'Read the stem', status: 'available', heading: 'Las pistas que deciden', bullets: [
      'Hipotensión con piel caliente: la resistencia vascular está baja.',
      'Fiebre y secreción purulenta: hay un foco infeccioso.',
      'En el patrón temprano descrito, el gasto cardíaco puede estar elevado. La pista central es la vasodilatación.',
    ] },
    { id: 'mechanism', label: 'Mechanism', status: 'available', heading: 'Una cadena, tres pasos', paragraphs: [
      'Respuesta inflamatoria → vasodilatación → disminución de la resistencia vascular sistémica.',
      'La taquicardia y el aumento del gasto pueden compensar al inicio. Esto no garantiza una perfusión tisular adecuada.',
    ] },
    { id: 'choices', label: 'Every choice', status: 'available', heading: 'Qué cambia entre las opciones', bullets: [
      'A: la resistencia elevada no concuerda con la vasodilatación descrita.',
      'B: un gasto bajo puede aparecer en otros momentos; no es el patrón temprano que pregunta el ejemplo.',
      'C: combina gasto elevado con resistencia baja; encaja con el patrón planteado.',
      'D: la resistencia elevada contradice la pista principal.',
    ] },
    { id: 'pattern', label: 'Pattern', status: 'available', heading: 'La regla que conviene recordar', paragraphs: [
      'Piel caliente + hipotensión + foco infeccioso orientan hacia vasodilatación. No conviertas «gasto alto» en una regla para todas las etapas del shock séptico.',
    ] },
    { id: 'drills', label: 'Drills', status: 'available', heading: 'Recupera la idea sin mirar', drill: {
      prompt: 'Si la vasodilatación aumenta, ¿qué ocurre con la resistencia vascular sistémica?', answer: 'Disminuye. Esa es la relación central del ejemplo.',
    } },
  ],
}
const recallQuestion: DemoQuestion = {
  stem: 'Recall the endocrine function of the pancreatic islets.', prompt: 'Which pancreatic cell type secretes insulin?',
  answer: 'Beta cells', accepts: ['beta', 'beta cells', 'beta cell', 'células beta', 'celulas beta'],
  sections: [
    { id: 'key', label: 'Key idea', status: 'available', heading: 'Una asociación esencial', paragraphs: ['Las células beta de los islotes pancreáticos secretan insulina. Recupera primero la pareja «beta → insulina». No necesitas una viñeta clínica para practicar esta relación.'] },
    { id: 'choices', label: 'Every choice', status: 'not_applicable', heading: '' },
    { id: 'pattern', label: 'Pattern', status: 'pending', heading: '' },
  ],
}
const calculationQuestion: DemoQuestion = {
  stem: 'For this calculation, use MAP ≈ DBP + (SBP − DBP) / 3. Blood pressure is 120/60 mm Hg.',
  prompt: 'What is the approximate mean arterial pressure, in mm Hg?', answer: '80', accepts: ['80', '80 mm hg'],
  sections: [
    { id: 'data', label: 'Key data', status: 'available', heading: 'Solo necesitas dos valores', bullets: ['Sistólica: 120 mm Hg.', 'Diastólica: 60 mm Hg.', 'La presión de pulso es 120 − 60 = 60 mm Hg.'] },
    { id: 'steps', label: 'Steps', status: 'available', heading: 'Sustituye y conserva las unidades', paragraphs: ['PAM ≈ 60 + (120 − 60) / 3 = 60 + 20 = 80 mm Hg.'] },
    { id: 'choices', label: 'Every choice', status: 'not_applicable', heading: '' },
  ],
}
export const questions: Record<DemoItem['template'], DemoQuestion> = { case: caseQuestion, recall: recallQuestion, calculation: calculationQuestion }
