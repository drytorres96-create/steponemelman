import { reconstruirProgreso } from '@app/store/model'
import { CRITERIOS_POR_DEFECTO } from '@app/srs/mastery'
import { fechaISO, lunesDe } from '@app/lib/tiempo'
import { inicioDelDia } from '@app/lib/dia'
import type { Intento } from '@app/srs/tipos'

/**
 * Escenas sintéticas para las pruebas de navegador: `?escena=abierto` (un día a medias),
 * `cerrado`, `vacio`, `meta` y `muchas` (25 cajas vencidas, para la pausa de las 20).
 * Ningún dato es clínico: ids inventados y textos de demostración.
 */
const escena = new URLSearchParams(location.search).get('escena') ?? 'abierto'
const ahora = Date.now()
const D0 = inicioDelDia(ahora)
const hoy = (min: number) => D0 + 60 * 60_000 + min * 60_000
const haceDias = (d: number, h = 9) => D0 - d * 86_400_000 + h * 3_600_000
let n = 0
const intento = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: `a-${++n}`, session_id: `s-${n}`, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const fallo = (ts: number) => intento(ts, { resultado: 'incorrecta', tipo_error: 'desconocimiento', calificacion: 1 })
const ids = (p: string, k: number) => Array.from({ length: k }, (_, i) => `${p}${i + 1}`)

const semana = ids('C', 14)
const vistosHoy = escena === 'cerrado' ? 10 : escena === 'vacio' ? 0 : 3
export const progreso: Record<string, ReturnType<typeof reconstruirProgreso>> = {}
if (escena !== 'vacio') {
  semana.slice(0, vistosHoy).forEach((id, i) => { progreso[id] = reconstruirProgreso(id, [intento(hoy(i))], CRITERIOS_POR_DEFECTO) })
  // Cuatro conceptos de otros días en la escalera y uno ya cerrado.
  progreso.X1 = reconstruirProgreso('X1', [fallo(haceDias(3))], CRITERIOS_POR_DEFECTO)
  progreso.X2 = reconstruirProgreso('X2', [intento(haceDias(2))], CRITERIOS_POR_DEFECTO)
  progreso.X3 = reconstruirProgreso('X3', [fallo(haceDias(4)), intento(haceDias(3))], CRITERIOS_POR_DEFECTO)
  progreso.C12 = reconstruirProgreso('C12', [intento(haceDias(9)), intento(haceDias(6)), intento(haceDias(2))], CRITERIOS_POR_DEFECTO)
  if (escena === 'cerrado') for (const id of ['X1', 'X2', 'X3']) progreso[id] = reconstruirProgreso(id, [...progreso[id].intentos, intento(hoy(30))], CRITERIOS_POR_DEFECTO)
}

if (escena === 'meta') {
  const inicio = new Date(2026, 8, 25, 9).getTime()
  const dia = (k: number) => inicio + (k - 1) * 86_400_000
  for (let i = 0; i < 170; i++) {
    const k = 3 + Math.floor(i * 22 / 170)
    progreso[`M${i}`] = reconstruirProgreso(`M${i}`, [intento(dia(k) - 5 * 86_400_000), intento(dia(k) - 3 * 86_400_000), intento(dia(k))], CRITERIOS_POR_DEFECTO)
  }
}
export const conceptosMeta = escena === 'meta' ? Array.from({ length: 600 }, (_, i) => `M${i}`) : []
export const respuestasMeta = escena === 'meta' ? Array.from({ length: 90 }, (_, i) => {
  const ts = new Date(2026, 8, 26 + Math.floor(i * 24 / 90), 11).getTime()
  return { id: `r${i}:0`, sessionId: `r${i}`, position: 0, questionId: `P${i}`, revision: 'r1', optionId: 'A', correct: i % 4 !== 0, submittedAt: ts, reviewedAt: ts, durationMs: 1000 }
}) : []
export const catalogoMeta = escena === 'meta' ? Array.from({ length: 300 }, (_, i) => ({ id: `P${i}`, revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [], topic: 'T', objective: null, status: 'ready', reasons: [], figureRequired: false, conceptLinks: [] })) : []

if (escena === 'muchas') {
  // Veinticinco conceptos vistos hace dos días con un acierto: caja 2, vencidos hoy.
  for (let i = 0; i < 25; i++) progreso[`K${i}`] = reconstruirProgreso(`K${i}`, [intento(haceDias(2, 9))], CRITERIOS_POR_DEFECTO)
}
export const conceptosMuchas = escena === 'muchas' ? Array.from({ length: 25 }, (_, i) => `K${i}`) : []
export const conceptos = [...semana, 'X1', 'X2', 'X3', ...conceptosMeta, ...conceptosMuchas]
const preguntas = ids('Q', 5)
export const respuestasBase = escena === 'cerrado'
  ? preguntas.map((q, i) => ({ id: `n${i}:0`, sessionId: `n${i}`, position: 0, questionId: q, revision: 'r1', optionId: 'A', correct: i !== 1, submittedAt: hoy(40 + i), reviewedAt: hoy(40 + i), durationMs: 1000 }))
  : escena === 'vacio' ? [] : [{ id: 'm1:0', sessionId: 'm1', position: 0, questionId: 'Q9', revision: 'r1', optionId: 'B', correct: false, submittedAt: haceDias(1), reviewedAt: haceDias(1), durationMs: 1000 }]
export const catalogoBase = [...preguntas, 'Q9'].map(id => ({ id, revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems: [], disciplines: [], topic: 'T', objective: null, status: 'ready', reasons: [], figureRequired: false, conceptLinks: [] }))
const lunes = fechaISO(lunesDe(D0))
const sesion = (id: string, dia: number, cs: string[], qs: string[]) => ({ id, semana: 'S4', semanaInicio: lunes, dia, orden: 1, titulo: id, subtitulo: null,
  guion: [...cs.map(c => ({ kind: 'concepto', id: c })), ...qs.map(q => ({ kind: 'pregunta', id: q, revision: 'r1' }))],
  presupuestoMin: 30, estado: 'pendiente', cursor: 0, nbmeSessionId: null, completadaEn: null })
export const sesiones = escena === 'vacio' ? [] : [
  sesion('Renal 1/3', 1, semana.slice(0, 5), preguntas.slice(0, 2)),
  sesion('Renal 2/3', 2, semana.slice(5, 10), preguntas.slice(2, 4)),
  sesion('Renal 3/3', 3, semana.slice(10), preguntas.slice(4)),
]
export const plan = escena === 'vacio' ? null : {
  eventoId: 'S4', titulo: `S4 · 21–26 sep · Renal y ácido-base`, inicio: lunes, fin: lunes, nota: 'Plan sintético para revisar la composición.', checkpoints: [
    { id: 1, idx: 1, dia: 1, kind: 'tarjetas', label: 'StepOneMelman · Sesión de la semana 1/3 · Renal', done: true, doneAt: null },
    { id: 2, idx: 2, dia: 5, kind: 'qbank', label: 'Bloque de práctica · 20 preguntas', done: false, doneAt: null },
    { id: 3, idx: 3, dia: 5, kind: 'podcast', label: 'Audio de repaso', done: false, doneAt: null },
    { id: 4, idx: 4, dia: 5, kind: 'tarjetas', label: 'StepOneMelman · Sesión de la semana 3/3 · Renal', done: false, doneAt: null },
    { id: 5, idx: 5, dia: 6, kind: 'descanso', label: 'Descanso', done: false, doneAt: null },
  ],
}

export const catalogo = [...catalogoBase, ...catalogoMeta]
export const respuestas = [...respuestasBase, ...respuestasMeta]
