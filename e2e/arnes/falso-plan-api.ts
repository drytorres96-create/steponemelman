import { plan } from './escena'
export const cargarPlanSemana = async () => plan
export const marcarCheckpoint = async () => { throw new Error('no') }
export class PlanEscrituraError extends Error {}
export const cargarAdherencia = async () => [
  { eventoId: 'S2', titulo: 'S2 · Demostración', inicio: '2026-09-07', hechas: 12, tareas: 15 },
  { eventoId: 'S3', titulo: 'S3 · Demostración', inicio: '2026-09-14', hechas: 9, tareas: 15 },
]
export const cargarTopics = async () => []
export const adherenciaDe = () => ({ eventoId: '', titulo: '', tareas: 0, hechas: 0 })
export const leerPlanSemana = () => null
