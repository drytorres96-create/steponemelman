import { leerVineta, type Vineta } from '@app/vinetas/modelo'

// Doble de la carga de viñetas: tres filas sintéticas, sin contenido clínico.
const fila = (i: number, discipline: string) => ({
  id: `demo-${i}`, position: i, reviewed: false,
  payload: {
    schemaVersion: 1, conceptId: `DEMO-${i}`, discipline, topic: 'Tema de demostración', concept: 'Objetivo de demostración.',
    stem: `Synthetic demonstration case ${i} for the interface.`, question: 'Which option is the demonstration answer?',
    options: ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, text: `Demonstration option ${id}` })), answer: 'C',
    explanation: {
      clues: ['Clave de demostración'], mechanism: ['Paso uno', 'Paso dos'],
      distractors: { A: 'Razón A.', B: 'Razón B.', D: 'Razón D.', E: 'Razón E.' },
      pattern: 'Si ves la demostración → piensa en C.',
    },
  },
})
const filas = [fila(0, 'Bioquímica'), fila(1, 'Bioquímica'), fila(2, 'Microbiología')]
export const cargarVinetas = async () => ({ vinetas: filas.map(leerVineta) as Vineta[], descartadas: 0, desdeCopia: false })
