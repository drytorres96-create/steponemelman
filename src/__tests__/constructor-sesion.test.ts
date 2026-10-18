import { describe, expect, it, vi } from 'vitest'
import {
  aItemRevision, armarSesion, describirConsulta, etiquetaDeRevision, fichasDeSesion, filtrarFichas, MAX_PREGUNTAS_SESION,
  resolverSesion, RITMO_PREDETERMINADO, ritmoDe, ventanaDeRevision, type EntradaFichas, type FichaSesion,
} from '../lib/constructor-sesion'
import { MAX_ETIQUETA_REVISION, type ConsultaSesion, type ItemRevision } from '../lib/contexto-sesion'
import { emptyNbmeState } from '../nbme/model'
import type { NbmeAttempt, NbmeQuestionMeta, NbmeSession, NbmeState } from '../nbme/types'
import { CRITERIOS_POR_DEFECTO } from '../srs/mastery'
import type { Intento, ProgresoConcepto } from '../srs/tipos'
import { reconstruirProgreso } from '../store/model'

/** Sábado 17 de octubre de 2026 a las 10:00 en Nueva York. El día de estudio empieza a las 3:00. */
const F = (d: number, h: number, m = 0) => Date.parse(`2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`)
const AHORA = F(17, 10)

let serie = 0
const acierto = (ts: number, extra: Partial<Intento> = {}): Intento => ({
  attempt_id: `a-${++serie}`, session_id: `s-${serie}`, ts, calificacion: 3, resultado: 'correcta',
  interaccion: 'recuperacion_libre', recuperacion_activa: true, tipo_evidencia: 'recuerdo',
  pistas_usadas: 0, fuente_consultada: false, explicacion_previa: false,
  ms: 1000, tipo_error: 'ninguno', confianza_declarada: null, ...extra,
})
const fallo = (ts: number) => acierto(ts, { resultado: 'incorrecta', tipo_error: 'desconocimiento', calificacion: 1 })
const conAyuda = (ts: number) => acierto(ts, { pistas_usadas: 1, tipo_error: 'correcta_con_pistas' })
const progreso = (id: string, intentos: Intento[]): ProgresoConcepto => reconstruirProgreso(id, intentos, CRITERIOS_POR_DEFECTO)

type C = EntradaFichas['conceptos'][number]
const concepto = (id: string, sistema: C['clasificacion']['sistema_primario'], tema: string, extra: Partial<C['clasificacion']> = {}, objetivo = `Objetivo de ${tema}`): C => ({
  concept_id: id, objetivo,
  clasificacion: { sistema_primario: sistema, sistemas_secundarios: [], disciplina_primaria: 'Fisiología', disciplinas_secundarias: [], tema, ...extra } as C['clasificacion'],
})
const pregunta = (id: string, systems: string[], topic: string, extra: Partial<NbmeQuestionMeta> = {}): NbmeQuestionMeta => ({
  id, revision: 'r1', form: '27', section: 1, item: 1, page: 1, systems, disciplines: ['Patología'], topic, objective: null,
  status: 'ready', reasons: [], figureRequired: false, conceptLinks: [], ...extra,
})
const intentoNbme = (questionId: string, submittedAt: number, correct: boolean, extra: Partial<NbmeAttempt> = {}): NbmeAttempt => ({
  id: `n-${++serie}:0`, sessionId: `n-${serie}`, position: 0, questionId, revision: 'r1', optionId: correct ? 'A' : 'B',
  correct, submittedAt, reviewedAt: submittedAt, durationMs: 1000, ...extra,
})
const estadoNbme = (...intentos: NbmeAttempt[]): NbmeState => ({ ...emptyNbmeState('b'), attempts: Object.fromEntries(intentos.map(a => [a.id, a])) })

const consulta = (extra: Partial<ConsultaSesion> = {}): ConsultaSesion => ({
  fuente: 'mixto', sistemas: [], disciplinas: [], terminos: [], estados: [], minutos: 10, titulo: 'Sesión a tu medida', ...extra,
})

const entrada = (e: Partial<EntradaFichas> = {}): EntradaFichas => ({
  conceptos: [], preguntas: [], progreso: {}, nbme: emptyNbmeState('b'), criterios: CRITERIOS_POR_DEFECTO,
  enCajasHoy: new Set(), conceptoDisponible: () => true, ahora: AHORA, ...e,
})
const por = (fichas: FichaSesion[], id: string) => fichas.find(f => f.id === id)!
const ids = (fichas: FichaSesion[]) => fichas.map(f => f.id)

describe('fichas de sesión: el historial se interpreta en la plataforma, no en la IA', () => {
  const conceptos = [
    concepto('c-nuevo', 'Endocrino', 'Eje hipotálamo-hipófisis'),
    concepto('c-fallo', 'Endocrino', 'Hiperplasia suprarrenal congénita'),
    concepto('c-corregido', 'Endocrino', 'Cetoacidosis diabética'),
    concepto('c-limpio', 'Cardiovascular', 'Ciclo cardíaco'),
    concepto('c-ayuda', 'Renal', 'Nefrona'),
    concepto('c-trabajo', 'Renal', 'Glomerulopatías'),
    concepto('c-cajas', 'Respiratorio', 'Espirometría'),
  ]
  const prog = {
    'c-fallo': progreso('c-fallo', [fallo(F(15, 9))]),
    'c-corregido': progreso('c-corregido', [fallo(F(10, 9)), acierto(F(12, 9)), acierto(F(14, 9))]),
    'c-limpio': progreso('c-limpio', [acierto(F(10, 9))]),
    'c-ayuda': progreso('c-ayuda', [conAyuda(F(15, 9))]),
    'c-trabajo': progreso('c-trabajo', [fallo(F(2, 9)), fallo(F(4, 9)), acierto(F(9, 9))]),
    'c-cajas': progreso('c-cajas', [acierto(F(16, 9))]),
  }
  const fichas = fichasDeSesion(entrada({ conceptos, progreso: prog, enCajasHoy: new Set(['concepto:c-cajas']) }))

  it('cada concepto disponible tiene una ficha con su tema, sistema y detalle', () => {
    expect(fichas).toHaveLength(7)
    const f = por(fichas, 'c-fallo')
    expect(f).toMatchObject({ tipo: 'concepto', titulo: 'Hiperplasia suprarrenal congénita', sistemas: ['Endocrino'], disciplinas: ['Fisiología'] })
    expect(f.detalle).toContain('Objetivo de')
  })
  it('«nuevas» es lo que nunca se ha intentado, y sólo eso', () => {
    expect([...por(fichas, 'c-nuevo').estados]).toEqual(['nuevas'])
    expect(por(fichas, 'c-fallo').estados.has('nuevas')).toBe(false)
  })
  it('un fallo reciente es «falladas», «falladas sin recuperar» y «por repasar»', () => {
    const e = por(fichas, 'c-fallo').estados
    expect(e.has('falladas') && e.has('falladas_sin_recuperar') && e.has('por_repasar')).toBe(true)
    expect(e.has('acertadas')).toBe(false)
  })
  it('corregirse otro día cierra «sin recuperar» pero sigue siendo «falladas» y «acertadas»', () => {
    const e = por(fichas, 'c-corregido').estados
    expect(e.has('falladas')).toBe(true)
    expect(e.has('falladas_sin_recuperar')).toBe(false)
    expect(e.has('acertadas')).toBe(true)
    expect(e.has('acertadas_primera')).toBe(false)
    expect(e.has('por_repasar')).toBe(false)
  })
  it('lo acertado a la primera y sin ayuda es «acertadas a la primera»', () => {
    const e = por(fichas, 'c-limpio').estados
    expect(e.has('acertadas') && e.has('acertadas_primera')).toBe(true)
    expect(e.has('falladas') || e.has('por_repasar')).toBe(false)
  })
  it('un acierto con ayuda es «por repasar» y no «a la primera»', () => {
    const e = por(fichas, 'c-ayuda').estados
    expect(e.has('por_repasar')).toBe(true)
    expect(e.has('acertadas_primera')).toBe(false)
  })
  it('«las que más trabajo dieron» exige fallos y ayuda acumulados, no un solo tropiezo', () => {
    expect(por(fichas, 'c-trabajo').estados.has('mas_trabajo')).toBe(true)
    expect(por(fichas, 'c-trabajo').trabajo).toBe(4)
    expect(por(fichas, 'c-fallo').estados.has('mas_trabajo')).toBe(false)
    expect(por(fichas, 'c-ayuda').estados.has('mas_trabajo')).toBe(false)
  })
  it('lo que hoy tiene sitio en las cajas cuenta como «por repasar» aunque no esté frágil', () => {
    expect(por(fichas, 'c-cajas').estados.has('por_repasar')).toBe(true)
    expect(por(fichas, 'c-limpio').estados.has('por_repasar')).toBe(false)
  })
  it('lo nunca visto no es «por repasar» aunque esté en la lista de cajas', () => {
    const f = fichasDeSesion(entrada({ conceptos, enCajasHoy: new Set(['concepto:c-nuevo']) }))
    expect(por(f, 'c-nuevo').estados.has('por_repasar')).toBe(false)
  })
  it('un concepto que no está disponible no genera ficha', () => {
    const f = fichasDeSesion(entrada({ conceptos, conceptoDisponible: id => id !== 'c-nuevo' }))
    expect(ids(f)).not.toContain('c-nuevo')
  })
  it('un intento futuro no cuenta: lo que aún no ha pasado no es historial', () => {
    const f = fichasDeSesion(entrada({ conceptos: [conceptos[0]], progreso: { 'c-nuevo': progreso('c-nuevo', [fallo(F(18, 9))]) } }))
    expect([...f[0].estados]).toEqual(['nuevas'])
  })
})

describe('fichas de preguntas NBME', () => {
  const preguntas = [
    pregunta('q-nueva', ['Endocrino'], 'Hipotiroidismo'),
    pregunta('q-fallada', ['Endocrino'], 'Feocromocitoma'),
    pregunta('q-limpia', ['Cardiovascular'], 'Estenosis aórtica'),
    pregunta('q-bloqueada', ['Endocrino'], 'Bloqueada', { status: 'blocked' }),
    pregunta('q-conflicto', ['Renal'], 'Acidosis tubular'),
    pregunta('q-cerrada', ['Renal'], 'Síndrome nefrótico'),
  ]
  const nbme = estadoNbme(
    intentoNbme('q-fallada', F(15, 9), false),
    intentoNbme('q-limpia', F(10, 9), true),
    intentoNbme('q-conflicto', F(16, 9), true, { conflict: true }),
    intentoNbme('q-cerrada', F(1, 9), false), intentoNbme('q-cerrada', F(3, 9), true), intentoNbme('q-cerrada', F(5, 9), true), intentoNbme('q-cerrada', F(8, 9), true),
  )
  const fichas = fichasDeSesion(entrada({ preguntas, nbme }))

  it('sólo hay ficha para las preguntas listas, con la revisión con la que se abren', () => {
    expect(ids(fichas)).not.toContain('q-bloqueada')
    expect(por(fichas, 'q-nueva')).toMatchObject({ tipo: 'pregunta', revision: 'r1', titulo: 'Hipotiroidismo', sistemas: ['Endocrino'] })
  })
  it('lo nunca respondido es «nuevas»; fallada es «falladas»; limpia es «a la primera»', () => {
    expect(por(fichas, 'q-nueva').estados.has('nuevas')).toBe(true)
    expect(por(fichas, 'q-fallada').estados.has('falladas')).toBe(true)
    expect(por(fichas, 'q-fallada').estados.has('por_repasar')).toBe(true)
    expect(por(fichas, 'q-limpia').estados.has('acertadas_primera')).toBe(true)
  })
  it('un envío en conflicto se trata con cautela, como un fallo', () => {
    const e = por(fichas, 'q-conflicto').estados
    expect(e.has('falladas')).toBe(true)
    expect(e.has('acertadas')).toBe(false)
  })
  it('una pregunta con la escalera de cajas cerrada es «dominadas»; la limpia sin fallos no se da por dominada', () => {
    expect(por(fichas, 'q-cerrada').estados.has('dominadas')).toBe(true)
    expect(por(fichas, 'q-limpia').estados.has('dominadas')).toBe(false)
  })
  it('los intentos de un examen sin terminar siguen ocultos y no cuentan', () => {
    const intento = intentoNbme('q-nueva', F(16, 9), false, { sessionId: 'oculto' })
    const sesion = { id: 'oculto', title: 'Examen', initial: [], startedAt: F(16, 8), paused: false, controlChangedAt: 0, elapsedMs: 0,
      budgetMinutes: null, continueUnlimited: false, drafts: {}, mode: 'test' } as NbmeSession
    const oculto: NbmeState = { ...estadoNbme(intento), sessions: { oculto: sesion } }
    const f = fichasDeSesion(entrada({ preguntas: [preguntas[0]], nbme: oculto }))
    expect([...f[0].estados]).toEqual(['nuevas'])
  })
  it('lo que hoy está en las cajas de preguntas cuenta como «por repasar»', () => {
    const f = fichasDeSesion(entrada({ preguntas, nbme, enCajasHoy: new Set(['pregunta:q-limpia']) }))
    expect(por(f, 'q-limpia').estados.has('por_repasar')).toBe(true)
  })
})

describe('filtrar: los filtros cerrados los aplica la plataforma', () => {
  const conceptos = [
    concepto('c-hema', 'Hematológico y oncológico', 'Anemia ferropénica', { disciplina_primaria: 'Patología' }),
    concepto('c-onco', 'Hematológico y oncológico', 'Linfoma de Hodgkin', { disciplina_primaria: 'Patología', sistemas_secundarios: ['Multisistémico'] }),
    concepto('c-endo', 'Endocrino', 'Cushing', { disciplina_primaria: 'Fisiología', disciplinas_secundarias: ['Farmacología'] }),
    concepto('c-sec', 'Renal', 'Policitemia secundaria', { sistemas_secundarios: ['Hematológico y oncológico'] }),
  ]
  const preguntas = [pregunta('q-hema', ['Hematológico y oncológico'], 'Leucemia aguda'), pregunta('q-endo', ['Endocrino'], 'Addison')]
  const prog = {
    'c-hema': progreso('c-hema', [fallo(F(15, 9))]),
    'c-endo': progreso('c-endo', [acierto(F(10, 9))]),
  }
  const fichas = fichasDeSesion(entrada({ conceptos, preguntas, progreso: prog }))

  it('sin filtros devuelve todo', () => {
    expect(filtrarFichas(fichas, consulta())).toHaveLength(6)
  })
  it('la fuente separa conceptos de preguntas', () => {
    expect(ids(filtrarFichas(fichas, consulta({ fuente: 'nbme' })))).toEqual(expect.arrayContaining(['q-hema', 'q-endo']))
    expect(filtrarFichas(fichas, consulta({ fuente: 'nbme' })).every(f => f.tipo === 'pregunta')).toBe(true)
    expect(filtrarFichas(fichas, consulta({ fuente: 'conceptos' })).every(f => f.tipo === 'concepto')).toBe(true)
  })
  it('un sistema incluye también lo que lo tiene de secundario, y pone antes lo que lo tiene de primario', () => {
    const r = filtrarFichas(fichas, consulta({ sistemas: ['Hematológico y oncológico'] }))
    expect(new Set(ids(r))).toEqual(new Set(['c-hema', 'c-onco', 'c-sec', 'q-hema']))
    expect(ids(r).indexOf('c-sec')).toBe(r.length - 1)
  })
  it('varios sistemas se combinan con «o» dentro del filtro', () => {
    const r = filtrarFichas(fichas, consulta({ sistemas: ['Endocrino', 'Renal'], fuente: 'conceptos' }))
    expect(new Set(ids(r))).toEqual(new Set(['c-endo', 'c-sec']))
  })
  it('sistema y disciplina se combinan con «y»', () => {
    const r = filtrarFichas(fichas, consulta({ sistemas: ['Endocrino'], disciplinas: ['Farmacología'] }))
    expect(ids(r)).toEqual(['c-endo'])
    expect(filtrarFichas(fichas, consulta({ sistemas: ['Cardiovascular'] }))).toEqual([])
  })
  it('los estados se combinan con «o»', () => {
    const r = filtrarFichas(fichas, consulta({ estados: ['falladas', 'acertadas'] }))
    expect(new Set(ids(r))).toEqual(new Set(['c-hema', 'c-endo']))
  })
  it('compara sin tildes ni mayúsculas, porque el banco y el material no siempre escriben igual', () => {
    const f = fichasDeSesion(entrada({ preguntas: [pregunta('q-x', ['hematologico y oncologico'], 'Tema')] }))
    expect(ids(filtrarFichas(f, consulta({ sistemas: ['Hematológico y oncológico'] })))).toEqual(['q-x'])
  })
  it('lo más frágil va primero cuando se pide «por repasar»', () => {
    const f = fichasDeSesion(entrada({ conceptos, progreso: { 'c-hema': progreso('c-hema', [fallo(F(15, 9))]), 'c-endo': progreso('c-endo', [conAyuda(F(15, 9))]) } }))
    const r = filtrarFichas(f, consulta({ estados: ['por_repasar'] }))
    expect(ids(r)).toEqual(['c-hema', 'c-endo'])
  })
  it('«las que más trabajo dieron» ordena por trabajo acumulado', () => {
    const trabajo = [concepto('c-a', 'Renal', 'A'), concepto('c-b', 'Renal', 'B')]
    const f = fichasDeSesion(entrada({ conceptos: trabajo, progreso: {
      'c-a': progreso('c-a', [fallo(F(1, 9)), fallo(F(2, 9))]),
      'c-b': progreso('c-b', [fallo(F(1, 9)), fallo(F(2, 9)), fallo(F(3, 9)), acierto(F(8, 9))]),
    } }))
    expect(ids(filtrarFichas(f, consulta({ estados: ['mas_trabajo'] })))).toEqual(['c-b', 'c-a'])
  })
  it('no cambia las fichas de entrada', () => {
    const copia = [...fichas]
    filtrarFichas(fichas, consulta({ estados: ['falladas'] }))
    expect(fichas).toEqual(copia)
  })
})

describe('ventana de revisión', () => {
  const muchos = (n: number, titulo = (i: number) => `Concepto ${i}`) => fichasDeSesion(entrada({
    conceptos: Array.from({ length: n }, (_, i) => concepto(`c-${i}`, 'Endocrino', titulo(i))) }))

  it('si caben, se revisan todas y en el mismo orden', () => {
    const f = muchos(30)
    expect(ventanaDeRevision(f, ['x'])).toEqual(f)
  })
  it('si no caben, entran primero las que ya mencionan lo pedido, sin tildes ni mayúsculas', () => {
    const f = muchos(400, i => (i === 399 ? 'Síndrome de ÁNEMIA' : `Concepto ${i}`))
    const v = ventanaDeRevision(f, ['anemia'])
    expect(v).toHaveLength(150)
    expect(v[0].id).toBe('c-399')
    expect(v[1].id).toBe('c-0')
  })
  it('nunca pasa del máximo, con o sin coincidencias', () => {
    const f = muchos(400, i => `anemia ${i}`)
    expect(ventanaDeRevision(f, ['anemia'])).toHaveLength(150)
    expect(ventanaDeRevision(f, [])).toHaveLength(150)
  })
  it('la etiqueta lleva tema y objetivo (o tema y sistema), nunca pasa de 90 caracteres y no incluye identificadores', () => {
    const largo = muchos(1, () => 'T'.repeat(200))[0]
    expect(etiquetaDeRevision(largo).length).toBeLessThanOrEqual(MAX_ETIQUETA_REVISION)
    const c = fichasDeSesion(entrada({ conceptos: [concepto('c-1', 'Endocrino', 'Cushing', {}, 'Reconocer el exceso de cortisol')] }))[0]
    expect(etiquetaDeRevision(c)).toBe('Cushing: Reconocer el exceso de cortisol')
    const q = fichasDeSesion(entrada({ preguntas: [pregunta('q-secreta-1', ['Endocrino', 'Renal'], 'Addison')] }))[0]
    expect(etiquetaDeRevision(q)).toBe('Addison · Endocrino/Renal')
    expect(aItemRevision(q)).toEqual({ tipo: 'pregunta', id: 'q-secreta-1', revision: 'r1', etiqueta: 'Pregunta NBME' })
  })
})

describe('armar la sesión según los minutos', () => {
  const conceptos = (n: number) => fichasDeSesion(entrada({ conceptos: Array.from({ length: n }, (_, i) => concepto(`c-${i}`, 'Endocrino', `Tema ${i}`)) }))
  const preguntas = (n: number) => fichasDeSesion(entrada({ preguntas: Array.from({ length: n }, (_, i) => pregunta(`q-${i}`, ['Endocrino'], `Pregunta ${i}`)) }))
  const mezcla = (c: number, q: number) => [...conceptos(c), ...preguntas(q)]
  const ritmo = RITMO_PREDETERMINADO

  it('sólo conceptos: llena los minutos con el ritmo de un concepto', () => {
    const s = armarSesion(conceptos(40), { fuente: 'conceptos', minutos: 10 }, ritmo)
    expect(s.preguntas).toEqual([])
    expect(s.conceptIds.length).toBe(7) // 7 × 1,5 = 10,5 ≤ 11,5; el octavo se pasaría
    expect(s.minutos).toBe(11)
  })
  it('sólo NBME: llena los minutos con el ritmo de una pregunta y respeta la revisión', () => {
    const s = armarSesion(preguntas(40), { fuente: 'nbme', minutos: 10 }, ritmo)
    expect(s.conceptIds).toEqual([])
    expect(s.preguntas).toHaveLength(4)
    expect(s.preguntas[0]).toEqual({ id: 'q-0', revision: 'r1' })
  })
  it('mixto: tres conceptos por cada pregunta', () => {
    const s = armarSesion(mezcla(40, 40), { fuente: 'mixto', minutos: 20 }, ritmo)
    expect(s.cada).toBe(3)
    const ratio = s.conceptIds.length / s.preguntas.length
    expect(ratio).toBeGreaterThanOrEqual(2.5)
    expect(ratio).toBeLessThanOrEqual(3.5)
  })
  it('mixto con una sola clase de material sigue con lo que hay', () => {
    expect(armarSesion(conceptos(10), { fuente: 'mixto', minutos: 5 }, ritmo).preguntas).toEqual([])
    expect(armarSesion(preguntas(10), { fuente: 'mixto', minutos: 5 }, ritmo).conceptIds).toEqual([])
  })
  it('pide conceptos y no usa preguntas aunque lleguen en la lista', () => {
    expect(armarSesion(mezcla(5, 5), { fuente: 'conceptos', minutos: 30 }, ritmo).preguntas).toEqual([])
    expect(armarSesion(mezcla(5, 5), { fuente: 'nbme', minutos: 30 }, ritmo).conceptIds).toEqual([])
  })
  it('nunca abre más de veinte preguntas NBME', () => {
    const s = armarSesion(preguntas(60), { fuente: 'nbme', minutos: 30 }, { conceptoMin: 1, preguntaMin: 1 })
    expect(s.preguntas).toHaveLength(MAX_PREGUNTAS_SESION)
  })
  it('conserva el orden recibido (lo más frágil primero)', () => {
    const s = armarSesion(conceptos(5), { fuente: 'conceptos', minutos: 5 }, ritmo)
    expect(s.conceptIds).toEqual(['c-0', 'c-1', 'c-2']) // 3 × 1,5 = 4,5 ≤ 5,75; el cuarto (6) se pasaría
  })
  it('aunque un solo ítem exceda los minutos, la sesión no sale vacía', () => {
    const s = armarSesion(preguntas(3), { fuente: 'nbme', minutos: 5 }, { conceptoMin: 1, preguntaMin: 30 })
    expect(s.preguntas).toHaveLength(1)
  })
  it('sin candidatas, no hay sesión', () => {
    const s = armarSesion([], { fuente: 'mixto', minutos: 10 }, ritmo)
    expect(s.conceptIds).toEqual([])
    expect(s.preguntas).toEqual([])
  })
  it('un ritmo más lento mete menos material en los mismos minutos', () => {
    const rapido = armarSesion(conceptos(40), { fuente: 'conceptos', minutos: 10 }, { conceptoMin: 1, preguntaMin: 2 })
    const lento = armarSesion(conceptos(40), { fuente: 'conceptos', minutos: 10 }, { conceptoMin: 3, preguntaMin: 4 })
    expect(lento.conceptIds.length).toBeLessThan(rapido.conceptIds.length)
  })
  it('el ritmo propio usa su mediana, con un suelo, y el de siempre si aún no hay datos', () => {
    expect(ritmoDe({ conceptoMs: null, preguntaMs: null })).toEqual(RITMO_PREDETERMINADO)
    const r = ritmoDe({ conceptoMs: 60_000, preguntaMs: 120_000 })
    expect(r.conceptoMin).toBeCloseTo(1.5)
    expect(r.preguntaMin).toBeCloseTo(3)
    const rapido = ritmoDe({ conceptoMs: 1000, preguntaMs: 1000 })
    expect(rapido.conceptoMin).toBeGreaterThanOrEqual(0.75)
    expect(rapido.preguntaMin).toBeGreaterThanOrEqual(1.5)
  })
})

describe('describir lo entendido', () => {
  it('resume tema, estado, fuente y minutos con las palabras de la plataforma', () => {
    expect(describirConsulta(consulta({ sistemas: ['Endocrino'], estados: ['por_repasar'], fuente: 'nbme', minutos: 20 })))
      .toBe('Endocrino · por repasar · preguntas NBME · ≈ 20 min')
    expect(describirConsulta(consulta({ sistemas: ['Hematológico y oncológico'], terminos: ['oncología'] })))
      .toBe('Hematológico y oncológico + «oncología» · conceptos y preguntas · ≈ 10 min')
    expect(describirConsulta(consulta())).toBe('todo el material · conceptos y preguntas · ≈ 10 min')
  })
})

describe('de la consulta a la sesión', () => {
  const conceptos = [
    concepto('c-hema-1', 'Hematológico y oncológico', 'Anemia ferropénica'),
    concepto('c-hema-2', 'Hematológico y oncológico', 'Linfoma de Hodgkin'),
    concepto('c-hema-3', 'Hematológico y oncológico', 'Leucemia mieloide crónica'),
    concepto('c-endo-1', 'Endocrino', 'Cushing'),
    concepto('c-endo-2', 'Endocrino', 'Addison'),
  ]
  const preguntas = [pregunta('q-hema', ['Hematológico y oncológico'], 'Linfoma folicular')]
  const prog = { 'c-endo-1': progreso('c-endo-1', [fallo(F(15, 9))]) }
  const fichas = fichasDeSesion(entrada({ conceptos, preguntas, progreso: prog }))
  const base = { pedido: 'una sesión', fichas, ritmo: RITMO_PREDETERMINADO }

  it('sin términos libres no llama a la IA: la plataforma decide sola', async () => {
    const revisar = vi.fn()
    const r = await resolverSesion({ ...base, consulta: consulta({ sistemas: ['Endocrino'], estados: ['falladas'], titulo: 'Endocrino fallado' }), revisar })
    expect(revisar).not.toHaveBeenCalled()
    expect(r).toMatchObject({ estado: 'lista', conceptos: 1, preguntas: 0, sinRevisar: 0 })
    if (r.estado !== 'lista') return
    expect(r.material).toMatchObject({ conceptIds: ['c-endo-1'], titulo: 'Endocrino fallado', nbmeSessionId: null, cada: 3, subtitulo: 'una sesión' })
    expect(r.revision).toBeUndefined()
  })
  it('con términos libres revisa sólo la lista ya filtrada y se queda con lo que la IA deja', async () => {
    const revisar = vi.fn(async (_p: string, _c: ConsultaSesion, _items: ItemRevision[]) => ({ estado: 'ok' as const, ids: ['c-hema-2', 'q-hema', 'c-endo-1'], sinRevisar: 0 }))
    const r = await resolverSesion({ ...base, pedido: 'hematología y oncología', consulta: consulta({ sistemas: ['Hematológico y oncológico'], terminos: ['oncología'], minutos: 30 }), revisar })
    expect(revisar).toHaveBeenCalledTimes(1)
    const items = revisar.mock.calls[0][2]
    expect(items.map(i => i.id).sort()).toEqual(['c-hema-1', 'c-hema-2', 'c-hema-3', 'q-hema'])
    expect(items.every(i => i.etiqueta.length <= MAX_ETIQUETA_REVISION)).toBe(true)
    expect(r).toMatchObject({ estado: 'lista', conceptos: 1, preguntas: 1, revision: { revisadas: 4, encajan: 2, deTotal: 4 } })
    if (r.estado !== 'lista') return
    // «c-endo-1» no se filtró por la consulta: aunque la IA lo devolviera, no entra.
    expect(r.material.conceptIds).toEqual(['c-hema-2'])
    expect(r.material.preguntas).toEqual([{ id: 'q-hema', revision: 'r1' }])
  })
  it('pasa el pedido original, la consulta y la señal de cancelación a la revisión', async () => {
    const revisar = vi.fn(async () => ({ estado: 'ok' as const, ids: ['c-hema-1'], sinRevisar: 0 }))
    const ctl = new AbortController()
    const c = consulta({ sistemas: ['Hematológico y oncológico'], terminos: ['anemia'] })
    await resolverSesion({ ...base, pedido: 'anemias', consulta: c, revisar, signal: ctl.signal })
    expect(revisar).toHaveBeenCalledWith('anemias', c, expect.any(Array), ctl.signal)
  })
  it('informa de las preguntas que la política de fuentes no deja juzgar con la IA', async () => {
    const revisar = vi.fn(async () => ({ estado: 'ok' as const, ids: ['c-hema-1'], sinRevisar: 3 }))
    const r = await resolverSesion({ ...base, consulta: consulta({ sistemas: ['Hematológico y oncológico'], terminos: ['anemia'] }), revisar })
    expect(r).toMatchObject({ estado: 'lista', sinRevisar: 3 })
  })
  it('si la IA no deja ninguna, no arma nada y lo explica', async () => {
    const revisar = vi.fn(async () => ({ estado: 'ok' as const, ids: [], sinRevisar: 0 }))
    const r = await resolverSesion({ ...base, consulta: consulta({ sistemas: ['Hematológico y oncológico'], terminos: ['oncología'] }), revisar })
    expect(r.estado).toBe('vacio')
    if (r.estado === 'vacio') expect(r.motivo).toContain('«oncología»')
  })
  it('si la IA no responde, no inventa una sesión: avisa y no usa los candidatos sin revisar', async () => {
    const revisar = vi.fn(async () => ({ estado: 'sin_ia' as const, motivo: 'Sin conexión' }))
    const r = await resolverSesion({ ...base, consulta: consulta({ terminos: ['anemia'] }), revisar })
    expect(r).toEqual({ estado: 'sin_ia', motivo: 'Sin conexión' })
  })
  it('sin nada que cumpla los filtros, explica qué hay sin el estado más estricto y no cuenta deuda', async () => {
    const revisar = vi.fn()
    const r = await resolverSesion({ ...base, consulta: consulta({ sistemas: ['Hematológico y oncológico'], estados: ['falladas'] }), revisar })
    expect(revisar).not.toHaveBeenCalled()
    expect(r.estado).toBe('vacio')
    if (r.estado !== 'vacio') return
    expect(r.motivo).toContain('falladas')
    expect(r.motivo).toMatch(/3 conceptos y 1 pregunta/)
    expect(r.motivo).not.toMatch(/atrasad|pendiente|debes|deuda/i)
  })
  it('sin material de ese tema, lo dice sin sugerir que falta estudio', async () => {
    const r = await resolverSesion({ ...base, consulta: consulta({ sistemas: ['Cardiovascular'] }), revisar: vi.fn() })
    expect(r.estado).toBe('vacio')
    if (r.estado === 'vacio') expect(r.motivo).toContain('Cardiovascular')
  })
  it('el subtítulo no pasa de 140 caracteres', async () => {
    const r = await resolverSesion({ ...base, pedido: 'x'.repeat(300), consulta: consulta({ sistemas: ['Endocrino'] }), revisar: vi.fn() })
    expect(r.estado).toBe('lista')
    if (r.estado === 'lista') expect(r.material.subtitulo!.length).toBeLessThanOrEqual(140)
  })
})

describe('complete the requested mix before offering a partial session', () => {
  const c = consulta({ sistemas: ['Cardiovascular'], disciplinas: ['Farmacología'], terminos: ['tema alfa'] })
  const concept = concepto('c-alpha', 'Cardiovascular', 'Tema alfa', { disciplina_primaria: 'Farmacología' })
  const bank = [pregunta('q-held', ['Cardiovascular'], '', { disciplines: ['Farmacología'] }),
    pregunta('q-neighbor', ['Renal'], '', { disciplines: ['Fisiología'] })]
  const fichas = fichasDeSesion(entrada({ conceptos: [concept], preguntas: bank }))
  it('finds a verified replacement in another classification while preserving the topic and question revision', async () => {
    const revisar = vi.fn().mockResolvedValueOnce({ estado: 'ok', ids: ['c-alpha'], sinRevisar: 1, revisadas: 1 })
      .mockResolvedValueOnce({ estado: 'ok', ids: ['q-neighbor', 'invented-id'], sinRevisar: 0, revisadas: 1 })
    const r = await resolverSesion({ consulta: c, pedido: 'tema alfa', fichas, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(revisar).toHaveBeenCalledTimes(2)
    expect(revisar.mock.calls[1][1]).toEqual(c)
    expect(revisar.mock.calls[1][2]).toEqual([{ tipo: 'pregunta', id: 'q-neighbor', revision: 'r1', etiqueta: 'Pregunta NBME' }])
    expect(r).toMatchObject({ estado: 'lista', conceptos: 1, preguntas: 1, sinRevisar: 1,
      material: { preguntas: [{ id: 'q-neighbor', revision: 'r1' }] }, revision: { revisadas: 2, encajan: 2, ampliada: true } })
  })
  it('never relaxes the requested history filter to fill the missing type', async () => {
    const revisar = vi.fn(async () => ({ estado: 'ok' as const, ids: ['q-neighbor'], sinRevisar: 0 }))
    const r = await resolverSesion({ consulta: { ...c, estados: ['falladas'] }, pedido: 'tema alfa fallado', fichas, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(revisar).not.toHaveBeenCalled()
    expect(r.estado).toBe('vacio')
  })
  it('reserves NBME candidates in a large mixed list instead of reviewing only concepts', async () => {
    const many = [...Array.from({ length: 200 }, (_, i) => ({ ...fichas[0], id: `c-${i}` })), fichas[1]]
    const revisar = vi.fn(async (_p, _c, items: ItemRevision[]) => ({ estado: 'ok' as const, ids: items.map(i => i.id), sinRevisar: 0 }))
    const r = await resolverSesion({ consulta: c, pedido: 'tema alfa', fichas: many, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(revisar.mock.calls[0][2]).toHaveLength(150)
    expect(revisar.mock.calls[0][2].some(i => i.id === 'q-held')).toBe(true)
    expect(r).toMatchObject({ estado: 'lista', preguntas: 1 })
  })
  it('keeps both types in a short session when they fit the existing time allowance', () => {
    const many = [...Array.from({ length: 10 }, (_, i) => ({ ...fichas[0], id: `c-${i}` })), fichas[1]]
    const r = armarSesion(many, { fuente: 'mixto', minutos: 5 }, RITMO_PREDETERMINADO)
    expect(r.conceptIds).toHaveLength(2)
    expect(r.preguntas).toHaveLength(1)
  })
  it('offers an explicitly partial session only after checking alternatives', async () => {
    const revisar = vi.fn().mockResolvedValueOnce({ estado: 'ok', ids: ['c-alpha'], sinRevisar: 1 })
      .mockResolvedValue({ estado: 'ok', ids: [], sinRevisar: 0 })
    const r = await resolverSesion({ consulta: c, pedido: 'tema alfa', fichas, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(revisar).toHaveBeenCalledTimes(2)
    expect(r).toMatchObject({ estado: 'lista', incompleta: 'preguntas', aviso: expect.stringContaining('No encontré preguntas verificables') })
  })
  it('cancels before starting another search and does not call an unchecked result complete', async () => {
    const control = new AbortController()
    const revisar = vi.fn(async () => { control.abort(); return { estado: 'ok' as const, ids: ['c-alpha'], sinRevisar: 1 } })
    const r = await resolverSesion({ consulta: c, pedido: 'tema alfa', fichas, ritmo: RITMO_PREDETERMINADO, revisar, signal: control.signal })
    expect(revisar).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ estado: 'sin_ia', motivo: 'Se canceló la búsqueda.' })
  })
  it('bounds unsuccessful searches without repeating candidates or calling unchecked items a match', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...fichas[1], id: `q-${i}` }))
    const revisar = vi.fn(async (_p, _c, _items: ItemRevision[]) => ({ estado: 'ok' as const, ids: [], sinRevisar: 0 }))
    const r = await resolverSesion({ consulta: { ...c, fuente: 'nbme' }, pedido: 'tema alfa', fichas: many, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(revisar).toHaveBeenCalledTimes(5)
    const ids = revisar.mock.calls.flatMap(call => call[2].map(i => i.id))
    expect(ids).toHaveLength(750)
    expect(new Set(ids).size).toBe(ids.length)
    expect(r.estado).toBe('vacio')
  })
})
