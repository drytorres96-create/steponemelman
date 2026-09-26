import { ConceptoZ, type Concepto } from '@app/schema/concept'
import { conceptos as ids } from './escena'
// Se valida una plantilla con un id largo y luego se le pone el id corto de la escena: así trae todos los valores por defecto.
const conceptos = ids.map((id, i) => ({ ...ConceptoZ.parse({
  concept_id: `DEMO-${i + 1}`, source: { doc: 'DEMO', doc_title: 'Fuente sintética', page: 1, item_id: String(i + 1), fragment: 'Sin material clínico' },
  objetivo: `Objetivo de práctica ${id}`, afirmacion: 'Contenido sintético de demostración.', respuesta_canonica: 'demostración', sinonimos: [], explicacion: 'Ejemplo de interfaz: aquí iría la explicación del concepto.',
  distractores_cercanos: [{ texto: 'otra cosa', por_que_incorrecto: 'Es un distractor sintético.' }],
  clasificacion: { disciplina_primaria: ['Fisiología', 'Farmacología', 'Patología'][i % 3], sistema_primario: 'Renal', tema: 'Tema de demostración', tipo_conocimiento: 'Asociación', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] }, evaluacion: { pregunta: '¿Cuál es la respuesta de demostración?' },
  pistas: ['uno', 'dos', 'tres'], calidad: { confianza: 1, estado: 'aprobado' },
}), concept_id: id }) as Concepto)
export const cargarTodo = async () => conceptos
export const cargarConceptos = async (lista: string[]) => new Map(conceptos.filter(c => lista.includes(c.concept_id)).map(c => [c.concept_id, c]))
export const cargarModulo = async () => conceptos
export const cargarIndice = async () => { throw new Error('no') }
export const cargarCuarentena = async () => ({ n: 0, conceptos: [] })
export const cargarMigraciones = async () => ({})
export const conceptosDeModulo = () => []
