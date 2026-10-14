import { ConceptoZ } from '../../src/schema/concept'
/** All ten interaction formats, exclusively synthetic non-clinical statements. */
const formats = ['recuperacion_libre','opcion_multiple','caso_clinico','verdadero_falso','completar','numerico','prediccion_direccional','secuencia','relacionar','clasificar'] as const
export const myqbankConcepts = formats.map((format, i) => ConceptoZ.parse({
  concept_id: `QA-FORMAT-${i}`, source: { doc: 'QA', doc_title: 'Synthetic QA', page: 1, item_id: `${i}`, fragment: 'Synthetic alpha is the reference response. Beta is the alternative.' },
  ...(format === 'completar' ? { variante_id: 'QA-fixed-completar' } : {}),
  objetivo: `Synthetic ${format}`, afirmacion: 'Synthetic alpha is the reference.', respuesta_canonica: format === 'numerico' ? '4' : 'alpha',
  explicacion: 'Ejemplo sintético: alfa es la respuesta de referencia. Este contenido sirve únicamente para comprobar la interfaz.',
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: i % 2 ? 'Renal' : 'Cardiovascular', tema: 'Synthetic QA', tipo_conocimiento: 'Asociación', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: format, permitidas: [format] },
  evaluacion: { pregunta: `Synthetic ${format} question. Choose the demonstration response.`,
    ...(['opcion_multiple','caso_clinico','verdadero_falso'].includes(format) ? { opciones: [{ texto: 'alpha', correcta: true, por_que: 'Alfa coincide con la referencia sintética.' }, { texto: 'beta', correcta: false, por_que: 'Beta es la alternativa sintética.' }] } : {}),
    ...(format === 'numerico' ? { unidad: 'units', tolerancia: 0 } : {}),
    ...(format === 'prediccion_direccional' ? { flechas: [{ variable: 'Alpha', direccion: 'sube' }, { variable: 'Beta', direccion: 'baja' }] } : {}),
    ...(format === 'secuencia' ? { pasos: ['Alpha','Beta','Gamma'] } : {}),
    ...(format === 'relacionar' ? { pares: [{ izquierda: 'Alpha', derecha: 'One' }, { izquierda: 'Beta', derecha: 'Two' }] } : {}),
    ...(format === 'clasificar' ? { grupos: [{ nombre: 'First group', elementos: ['Alpha'] }, { nombre: 'Second group', elementos: ['Beta'] }] } : {}) },
  pistas: ['Synthetic clue one','Synthetic clue two','Synthetic clue three'], calidad: { confianza: 1, estado: 'aprobado' },
}))
