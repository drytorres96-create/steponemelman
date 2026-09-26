/** Una fila como la de `ai_vignettes`, con texto sintético sin contenido clínico. */
export function filaSintetica(i: number, discipline = 'Bioquímica', answer = 'C') {
  return {
    id: `qa-${i}`, position: i, reviewed: false,
    payload: {
      schemaVersion: 1, conceptId: `QA-CONCEPTO-${i}`, discipline, topic: 'Tema sintético', concept: 'Objetivo sintético.',
      stem: `Synthetic case ${i} used only to test the interface.`, question: 'Which option is the synthetic answer?',
      options: ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, text: `Synthetic option ${id}` })), answer,
      explanation: {
        clues: ['Clave sintética uno', 'Clave sintética dos'], mechanism: ['Paso uno', 'Paso dos', 'Paso tres'],
        distractors: Object.fromEntries(['A', 'B', 'C', 'D', 'E'].filter(id => id !== answer).map(id => [id, `No es ${id} por una razón sintética.`])),
        pattern: 'Si ves lo sintético → piensa en la opción sintética.',
      },
    },
  }
}
