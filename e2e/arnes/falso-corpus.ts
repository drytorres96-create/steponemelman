import { ConceptoZ, type Concepto } from '@app/schema/concept'
import { conceptos as ids } from './escena'
import { conceptoAplicacionSintetico, IDS_APLICACION } from './aplicacion-fixture'
// Se valida una plantilla con un id largo y luego se le pone el id corto de la escena: así trae todos los valores por defecto.
const conceptos = ids.map((id, i) => IDS_APLICACION.includes(id) ? conceptoAplicacionSintetico(id) : ({ ...ConceptoZ.parse({
  concept_id: `DEMO-${i + 1}`, source: { doc: 'DEMO', doc_title: 'Fuente sintética', page: 1, item_id: String(i + 1), fragment: 'Sin material clínico' },
  objetivo: `Objetivo de práctica ${id}`, afirmacion: 'Contenido sintético de demostración.', respuesta_canonica: 'demostración', sinonimos: [], explicacion: 'Ejemplo de interfaz: aquí iría la explicación del concepto.',
  distractores_cercanos: [{ texto: 'otra cosa', por_que_incorrecto: 'Es un distractor sintético.' }],
  clasificacion: { disciplina_primaria: ['Fisiología', 'Farmacología', 'Patología'][i % 3], sistema_primario: 'Renal', tema: 'Tema de demostración', tipo_conocimiento: 'Asociación', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] }, evaluacion: { pregunta: '¿Cuál es la respuesta de demostración?' },
  pistas: ['uno', 'dos', 'tres'], calidad: { confianza: 1, estado: 'aprobado' },
}), concept_id: id }) as Concepto)
declare global { interface Window { __cargasCorpusSintetico: number } }
window.__cargasCorpusSintetico = 0
export const cargarTodo = async () => { window.__cargasCorpusSintetico++; return conceptos }
let cargas = 0
export const cargarConceptos = async (lista: string[]) => {
  if (new URLSearchParams(location.search).get('retomar') === 'concepto-error' && ++cargas === 1) throw new Error('No se pudo cargar la sesión sintética. Vuelve a intentarlo.')
  return new Map(conceptos.filter(c => lista.includes(c.concept_id)).map(c => [c.concept_id, c]))
}
export const cargarModulo = async () => conceptos
export const cargarIndice = async () => { throw new Error('no') }
export const cargarCuarentena = async () => ({ n: 0, conceptos: [] })
export const cargarMigraciones = async () => ({})
export const conceptosDeModulo = () => []
