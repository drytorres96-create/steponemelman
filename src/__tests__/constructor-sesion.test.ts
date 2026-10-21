import { describe, expect, it, vi } from 'vitest'
import {
  aItemRevision, armarSesion, conceptosParaLeer, describirConsulta, esTematica, etiquetaDeRevision, fichasDeSesion, filtrarFichas, MAX_PREGUNTAS_SESION,
  repartirPorTemas, resolverSesion, RITMO_PREDETERMINADO, ritmoDe, type EntradaFichas, type FichaSesion, type LecturaBanco,
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

describe('qué conceptos se leen con Claude', () => {
  const muchos = (n: number, titulo = (i: number) => `Concepto ${i}`) => fichasDeSesion(entrada({
    conceptos: Array.from({ length: n }, (_, i) => concepto(`c-${i}`, 'Endocrino', titulo(i))) }))
  const variados = fichasDeSesion(entrada({ conceptos: [
    concepto('c-cardio-fisio', 'Cardiovascular', 'Ciclo cardíaco'),
    concepto('c-renal-farma', 'Renal', 'Diuréticos de asa', { disciplina_primaria: 'Farmacología' }),
    concepto('c-micro', 'Multisistémico', 'Vancomicina', { disciplina_primaria: 'Microbiología' }, 'Mecanismo de los antimicrobianos glucopeptídicos'),
    concepto('c-endo', 'Endocrino', 'Cushing'),
  ] }))

  it('las pistas se suman con «o»: basta un sistema, una disciplina o un término para entrar a lectura', () => {
    const c = consulta({ sistemas: ['Cardiovascular'], disciplinas: ['Farmacología'], terminos: ['farmacología antimicrobiana'] })
    expect(ids(conceptosParaLeer(variados, c))).toEqual(['c-cardio-fisio', 'c-renal-farma'])
    // Un concepto sólo de Microbiología entra si se da esa pista o si su texto nombra el tema pedido.
    expect(ids(conceptosParaLeer(variados, { ...c, disciplinas: ['Farmacología', 'Microbiología'] }))).toEqual(['c-cardio-fisio', 'c-renal-farma', 'c-micro'])
    expect(ids(conceptosParaLeer(variados, consulta({ sistemas: ['Cardiovascular'], terminos: ['antimicrobianos'] })))).toEqual(['c-cardio-fisio', 'c-micro'])
  })
  it('sin pistas de clasificación entran todos, primero los que nombran algún término, sin tildes ni mayúsculas', () => {
    const f = muchos(1000, i => (i === 999 ? 'Síndrome de ÁNEMIA' : `Concepto ${i}`))
    const v = conceptosParaLeer(f, consulta({ terminos: ['anemia'] }))
    expect(v).toHaveLength(900)
    expect(v.some(x => x.id === 'c-999')).toBe(true)
    expect(v[0].id).toBe('c-0') // conserva el orden de estudio; el tope sólo decide quién entra
  })
  it('nunca pasa del máximo', () => {
    expect(conceptosParaLeer(muchos(1200), consulta({ sistemas: ['Endocrino'] }))).toHaveLength(900)
    expect(conceptosParaLeer(muchos(10), consulta({ sistemas: ['Endocrino'] }), 4)).toHaveLength(4)
  })
  it('una consulta es temática si nombra un sistema, una disciplina o un bloque libre', () => {
    expect(esTematica(consulta())).toBe(false)
    expect(esTematica(consulta({ estados: ['falladas'] }))).toBe(false)
    for (const extra of [{ sistemas: ['Renal' as const] }, { disciplinas: ['Farmacología' as const] }, { terminos: ['anemias'] }]) expect(esTematica(consulta(extra))).toBe(true)
  })
  it('la etiqueta lleva tema y objetivo (o tema y sistema), nunca pasa del tope y no incluye identificadores', () => {
    const largo = muchos(1, () => 'T'.repeat(300))[0]
    expect(etiquetaDeRevision(largo).length).toBeLessThanOrEqual(MAX_ETIQUETA_REVISION)
    const c = fichasDeSesion(entrada({ conceptos: [concepto('c-1', 'Endocrino', 'Cushing', {}, 'Reconocer el exceso de cortisol')] }))[0]
    expect(etiquetaDeRevision(c)).toBe('Cushing: Reconocer el exceso de cortisol')
    const q = fichasDeSesion(entrada({ preguntas: [pregunta('q-secreta-1', ['Endocrino', 'Renal'], 'Addison')] }))[0]
    expect(etiquetaDeRevision(q)).toBe('Addison · Endocrino/Renal')
    expect(aItemRevision(q)).toEqual({ tipo: 'pregunta', id: 'q-secreta-1', revision: 'r1', etiqueta: 'Pregunta NBME' })
  })
})

describe('repartir entre los temas pedidos', () => {
  const f = fichasDeSesion(entrada({
    conceptos: ['a1', 'a2', 'a3', 'b1', 'c1', 'c2'].map(id => concepto(id, 'Cardiovascular', id)),
    preguntas: ['qa', 'qb'].map(id => pregunta(id, ['Cardiovascular'], id)) }))
  const tema = new Map([['a1', 1], ['a2', 1], ['a3', 1], ['b1', 2], ['c1', 3], ['c2', 3], ['qa', 1], ['qb', 2]])
  it('alterna los temas por turnos y conserva el orden dentro de cada uno, por separado en conceptos y preguntas', () => {
    expect(ids(repartirPorTemas(f, tema, 3))).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3', 'qa', 'qb'])
  })
  it('con un solo tema no cambia nada', () => {
    expect(repartirPorTemas(f, tema, 1)).toEqual(f)
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
  it('con una cantidad pedida manda el número de ítems, no los minutos', () => {
    const s = armarSesion(mezcla(60, 30), { fuente: 'mixto', minutos: 10, cantidad: 40 }, ritmo)
    expect(s.conceptIds).toHaveLength(30)
    expect(s.preguntas).toHaveLength(10)
    expect(s.minutos).toBeGreaterThan(10)
    expect(armarSesion(conceptos(60), { fuente: 'conceptos', minutos: 30, cantidad: 12 }, ritmo).conceptIds).toHaveLength(12)
  })
  it('con una cantidad pedida, si falta de un tipo sigue con el otro; un bloque NBME no pasa de veinte', () => {
    const pocas = armarSesion(mezcla(60, 3), { fuente: 'mixto', minutos: 10, cantidad: 40 }, ritmo)
    expect([pocas.conceptIds.length, pocas.preguntas.length]).toEqual([37, 3])
    expect(armarSesion(preguntas(40), { fuente: 'nbme', minutos: 5, cantidad: 40 }, ritmo).preguntas).toHaveLength(MAX_PREGUNTAS_SESION)
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
    // Con temas nombrados, sistemas y disciplinas son pistas: se enseña lo que se pidió.
    expect(describirConsulta(consulta({ sistemas: ['Cardiovascular', 'Respiratorio'], disciplinas: ['Farmacología'], terminos: ['farmacología cardiovascular', 'farmacología respiratoria'], cantidad: 40 })))
      .toBe('«farmacología cardiovascular» + «farmacología respiratoria» · conceptos y preguntas · 40 ítems')
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

  it('sin un tema no llama a la IA: la plataforma decide sola con el historial', async () => {
    const revisar = vi.fn()
    const r = await resolverSesion({ ...base, consulta: consulta({ estados: ['falladas'], titulo: 'Endocrino fallado' }), revisar })
    expect(revisar).not.toHaveBeenCalled()
    expect(r).toMatchObject({ estado: 'lista', conceptos: 1, preguntas: 0, sinRevisar: 0 })
    if (r.estado !== 'lista') return
    expect(r.material).toMatchObject({ conceptIds: ['c-endo-1'], titulo: 'Endocrino fallado', nbmeSessionId: null, cada: 3, subtitulo: 'una sesión' })
    expect(r.revision).toBeUndefined()
  })
  it('con un tema, Claude lee todas las preguntas NBME y los conceptos con alguna pista, y la sesión lleva lo que deja', async () => {
    const revisar = vi.fn(async (_p: string, _c: ConsultaSesion, _items: ItemRevision[]) => ({ estado: 'ok' as const, ids: ['c-hema-2', 'q-hema', 'c-endo-1'], sinRevisar: 0 }))
    const r = await resolverSesion({ ...base, pedido: 'hematología y oncología', consulta: consulta({ sistemas: ['Hematológico y oncológico'], terminos: ['oncología'], minutos: 30 }), revisar })
    expect(revisar).toHaveBeenCalledTimes(1)
    const items = revisar.mock.calls[0][2]
    expect(items.map(i => i.id).sort()).toEqual(['c-hema-1', 'c-hema-2', 'c-hema-3', 'q-hema'])
    expect(items.every(i => i.etiqueta.length <= MAX_ETIQUETA_REVISION)).toBe(true)
    expect(r).toMatchObject({ estado: 'lista', conceptos: 1, preguntas: 1, revision: { revisadas: 4, encajan: 2, deTotal: 6 } })
    if (r.estado !== 'lista') return
    // «c-endo-1» no se mandó a leer: aunque la IA lo devolviera, no entra.
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
    const revisar = vi.fn(async () => ({ estado: 'ok' as const, ids: [], sinRevisar: 0 }))
    const r = await resolverSesion({ ...base, consulta: consulta({ sistemas: ['Cardiovascular'] }), revisar })
    expect(r.estado).toBe('vacio')
    if (r.estado === 'vacio') expect(r.motivo).toContain('Cardiovascular')
    if (r.estado === 'vacio') expect(r.motivo).not.toMatch(/atrasad|pendiente|debes|deuda/i)
  })
  it('el subtítulo no pasa de 140 caracteres', async () => {
    const todas = vi.fn(async (_p: string, _c: ConsultaSesion, items: ItemRevision[]) => ({ estado: 'ok' as const, ids: items.map(i => i.id), sinRevisar: 0 }))
    const r = await resolverSesion({ ...base, pedido: 'x'.repeat(300), consulta: consulta({ sistemas: ['Endocrino'] }), revisar: todas })
    expect(r.estado).toBe('lista')
    if (r.estado === 'lista') expect(r.material.subtitulo!.length).toBeLessThanOrEqual(140)
  })
})

describe('leer cada ítem por su contenido, no por su etiqueta', () => {
  const c = consulta({ sistemas: ['Cardiovascular'], disciplinas: ['Farmacología'], terminos: ['farmacología cardiovascular'] })
  const concept = concepto('c-alpha', 'Cardiovascular', 'Amiodarona', { disciplina_primaria: 'Farmacología' })
  const bank = [pregunta('q-held', ['Cardiovascular'], '', { disciplines: ['Farmacología'] }),
    pregunta('q-neighbor', ['Renal'], '', { disciplines: ['Fisiología'] })]
  const fichas = fichasDeSesion(entrada({ conceptos: [concept], preguntas: bank }))
  const todas = () => vi.fn(async (_p: string, _c: ConsultaSesion, items: ItemRevision[]) => ({ estado: 'ok' as const, ids: items.map(i => i.id), sinRevisar: 0 }))
  const lectura = (faltan: string[] = [], leer?: LecturaBanco['leer']): LecturaBanco & { pendientes: ReturnType<typeof vi.fn>; leer: ReturnType<typeof vi.fn> } => ({
    pendientes: vi.fn(async () => ({ estado: 'ok' as const, faltan })),
    leer: vi.fn(leer ?? (async refs => ({ estado: 'ok' as const, leidas: refs.length, sinFuente: 0, pendientes: 0 }))),
  })

  it('una pregunta mal etiquetada entra si Claude, al leerla, ve que trata el tema pedido', async () => {
    const revisar = vi.fn().mockResolvedValue({ estado: 'ok', ids: ['c-alpha', 'q-neighbor', 'invented-id'], grupos: [1, 1, 1], sinRevisar: 0, revisadas: 3 })
    const r = await resolverSesion({ consulta: c, pedido: 'farmacología cardiovascular', fichas, ritmo: RITMO_PREDETERMINADO, revisar, lectura: lectura() })
    expect(revisar).toHaveBeenCalledTimes(1)
    expect(revisar.mock.calls[0][2]).toEqual(expect.arrayContaining([{ tipo: 'pregunta', id: 'q-neighbor', revision: 'r1', etiqueta: 'Pregunta NBME' }]))
    expect(r).toMatchObject({ estado: 'lista', conceptos: 1, preguntas: 1, material: { preguntas: [{ id: 'q-neighbor', revision: 'r1' }] }, revision: { revisadas: 3, encajan: 2 } })
  })
  it('antes de seleccionar lee sólo las preguntas sin ficha, en lotes de veinte, y va contando', async () => {
    const banco = Array.from({ length: 70 }, (_, i) => ({ ...fichas[1], id: `q-${i}` }))
    const lee = lectura(banco.slice(5).map(f => f.id))
    const progreso: string[] = []
    const r = await resolverSesion({ consulta: { ...c, fuente: 'nbme' }, pedido: 'x', fichas: banco, ritmo: RITMO_PREDETERMINADO, revisar: todas(), lectura: lee, onProgreso: t => progreso.push(t) })
    expect(lee.pendientes).toHaveBeenCalledWith(banco.map(f => ({ id: f.id, revision: 'r1' })), undefined)
    expect(lee.leer.mock.calls.map(call => call[0].length)).toEqual([20, 20, 20, 5])
    expect(lee.leer.mock.calls.flatMap(call => call[0].map((x: { id: string }) => x.id))).toEqual(banco.slice(5).map(f => f.id))
    expect(progreso.some(t => t.includes('65 de 65'))).toBe(true)
    expect(progreso.at(-1)).toMatch(/revisa las candidatas una por una: 70 de 70/)
    expect(r).toMatchObject({ estado: 'lista' })
  })
  it('un lote de lectura que falla no tumba la sesión: lo dice; si fallan todos, avisa con el motivo', async () => {
    const banco = Array.from({ length: 40 }, (_, i) => ({ ...fichas[1], id: `q-${i}` }))
    const parcial = lectura(banco.map(f => f.id), async refs => refs[0].id === 'q-0' ? { estado: 'sin_ia', motivo: 'Saturado' } : { estado: 'ok', leidas: refs.length, sinFuente: 0, pendientes: 0 })
    // Después de leer se vuelve a preguntar qué falta: las veinte del lote caído.
    parcial.pendientes.mockResolvedValueOnce({ estado: 'ok', faltan: banco.map(f => f.id) }).mockResolvedValueOnce({ estado: 'ok', faltan: banco.slice(0, 20).map(f => f.id) })
    const seleccion = todas()
    const r = await resolverSesion({ consulta: { ...c, fuente: 'nbme' }, pedido: 'x', fichas: banco, ritmo: RITMO_PREDETERMINADO, revisar: seleccion, lectura: parcial })
    expect(r).toMatchObject({ estado: 'lista', sinLeer: 20, sinRevisar: 0 })
    // Lo no leído no se manda a seleccionar, así que no se confunde con «sin fuente».
    expect(seleccion.mock.calls[0][2].map(i => i.id)).toEqual(banco.slice(20).map(f => f.id))
    const nada = lectura(banco.map(f => f.id), async () => ({ estado: 'sin_ia', motivo: 'Claude no tiene saldo disponible.' }))
    const revisar = todas()
    expect(await resolverSesion({ consulta: { ...c, fuente: 'nbme' }, pedido: 'x', fichas: banco, ritmo: RITMO_PREDETERMINADO, revisar, lectura: nada }))
      .toEqual({ estado: 'sin_ia', motivo: 'Claude no tiene saldo disponible.' })
    expect(revisar).not.toHaveBeenCalled()
  })
  it('never relaxes the requested history filter to fill the missing type', async () => {
    const revisar = vi.fn(async () => ({ estado: 'ok' as const, ids: ['q-neighbor'], sinRevisar: 0 }))
    const r = await resolverSesion({ consulta: { ...c, estados: ['falladas'] }, pedido: 'tema alfa fallado', fichas, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(revisar).not.toHaveBeenCalled()
    expect(r.estado).toBe('vacio')
  })
  it('revisa en lotes de ciento cincuenta, sin repetir candidatas ni dar por buena una no revisada', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...fichas[1], id: `q-${i}` }))
    const revisar = vi.fn(async (_p, _c, _items: ItemRevision[]) => ({ estado: 'ok' as const, ids: [], sinRevisar: 0 }))
    const r = await resolverSesion({ consulta: { ...c, fuente: 'nbme' }, pedido: 'tema alfa', fichas: many, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(revisar.mock.calls.map(call => call[2].length)).toEqual([150, 150, 150, 150, 150, 150, 100])
    const vistos = revisar.mock.calls.flatMap(call => call[2].map(i => i.id))
    expect(new Set(vistos).size).toBe(1000)
    expect(r.estado).toBe('vacio')
  })
  it('si falla un lote de la selección, no presenta una sesión a medias', async () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ ...fichas[1], id: `q-${i}` }))
    const revisar = vi.fn().mockResolvedValueOnce({ estado: 'ok', ids: ['q-1'], sinRevisar: 0 }).mockResolvedValue({ estado: 'sin_ia', motivo: 'Claude tardó demasiado.', codigo: 'tiempo' })
    expect(await resolverSesion({ consulta: { ...c, fuente: 'nbme' }, pedido: 'x', fichas: many, ritmo: RITMO_PREDETERMINADO, revisar }))
      .toEqual({ estado: 'sin_ia', motivo: 'Claude tardó demasiado.' })
    // Un plazo agotado pudo facturarse: no se repite por su cuenta.
    expect(revisar).toHaveBeenCalledTimes(3)
  })
  it('un límite de ritmo o una saturación, que no se facturan, se reintentan una vez; otros fallos no', async () => {
    const limite = { estado: 'sin_ia', motivo: 'Demasiadas consultas.', codigo: 'limite' }
    const revisar = vi.fn().mockResolvedValueOnce(limite).mockResolvedValue({ estado: 'ok', ids: ['c-alpha'], sinRevisar: 0 })
    const r = await resolverSesion({ consulta: { ...c, fuente: 'conceptos' }, pedido: 'x', fichas, ritmo: RITMO_PREDETERMINADO, revisar, esperaReintentoMs: 1 })
    expect(revisar).toHaveBeenCalledTimes(2)
    expect(r).toMatchObject({ estado: 'lista', conceptos: 1 })
    const dosVeces = vi.fn().mockResolvedValue({ ...limite, codigo: 'sobrecarga' })
    expect(await resolverSesion({ consulta: { ...c, fuente: 'conceptos' }, pedido: 'x', fichas, ritmo: RITMO_PREDETERMINADO, revisar: dosVeces, esperaReintentoMs: 1 }))
      .toMatchObject({ estado: 'sin_ia' })
    expect(dosVeces).toHaveBeenCalledTimes(2)
    const credito = vi.fn().mockResolvedValue({ ...limite, codigo: 'credito' })
    await resolverSesion({ consulta: { ...c, fuente: 'conceptos' }, pedido: 'x', fichas, ritmo: RITMO_PREDETERMINADO, revisar: credito, esperaReintentoMs: 1 })
    expect(credito).toHaveBeenCalledTimes(1)
    const lee = lectura(['q-held'], vi.fn().mockResolvedValueOnce({ ...limite }).mockResolvedValue({ estado: 'ok', leidas: 1, sinFuente: 0, pendientes: 0 }))
    await resolverSesion({ consulta: { ...c, fuente: 'nbme' }, pedido: 'x', fichas, ritmo: RITMO_PREDETERMINADO, revisar: todas(), lectura: lee, esperaReintentoMs: 1 })
    expect(lee.leer).toHaveBeenCalledTimes(2)
  })
  it('una sesión de varios temas los reparte por turnos y dice cuántos lleva de cada uno', async () => {
    const tres = consulta({ fuente: 'conceptos', sistemas: ['Cardiovascular', 'Respiratorio'], disciplinas: ['Farmacología', 'Microbiología'],
      terminos: ['farmacología cardiovascular', 'farmacología respiratoria', 'farmacología antimicrobiana'], cantidad: 6 })
    const conceptos = [...['cv1', 'cv2', 'cv3', 'cv4', 'cv5'].map(id => concepto(id, 'Cardiovascular', id, { disciplina_primaria: 'Farmacología' })),
      ...['re1', 're2'].map(id => concepto(id, 'Respiratorio', id, { disciplina_primaria: 'Farmacología' })),
      ...['am1', 'am2', 'am3'].map(id => concepto(id, 'Multisistémico', id, { disciplina_primaria: 'Microbiología' }))]
    const f = fichasDeSesion(entrada({ conceptos }))
    const grupo: Record<string, number> = { cv: 1, re: 2, am: 3 }
    const revisar = vi.fn(async (_p: string, _c: ConsultaSesion, items: ItemRevision[]) => ({ estado: 'ok' as const, ids: items.map(i => i.id), grupos: items.map(i => grupo[i.id.slice(0, 2)]), sinRevisar: 0 }))
    const r = await resolverSesion({ consulta: tres, pedido: 'x', fichas: f, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(r).toMatchObject({ estado: 'lista', conceptos: 6, reparto: [
      { tema: 'farmacología cardiovascular', n: 2 }, { tema: 'farmacología respiratoria', n: 2 }, { tema: 'farmacología antimicrobiana', n: 2 }] })
    if (r.estado === 'lista') expect(r.material.conceptIds).toEqual(['cv1', 're1', 'am1', 'cv2', 're2', 'am2'])
  })
  it('si pide más ítems de los que encajan, lo dice; un bloque sólo NBME no pasa de veinte', async () => {
    const r = await resolverSesion({ consulta: { ...c, cantidad: 40 }, pedido: 'x', fichas, ritmo: RITMO_PREDETERMINADO, revisar: todas() })
    expect(r).toMatchObject({ estado: 'lista', conceptos: 1, preguntas: 2, aviso: 'Pediste 40 ítems y encontré 3 que encajan con lo pedido.' })
    const banco = Array.from({ length: 30 }, (_, i) => ({ ...fichas[1], id: `q-${i}` }))
    const nbme = await resolverSesion({ consulta: { ...c, fuente: 'nbme', cantidad: 40 }, pedido: 'x', fichas: banco, ritmo: RITMO_PREDETERMINADO, revisar: todas() })
    expect(nbme).toMatchObject({ estado: 'lista', preguntas: 20, aviso: expect.stringContaining('como mucho 20 preguntas') })
  })
  it('keeps both types in a short session when they fit the existing time allowance', () => {
    const many = [...Array.from({ length: 10 }, (_, i) => ({ ...fichas[0], id: `c-${i}` })), fichas[1]]
    const r = armarSesion(many, { fuente: 'mixto', minutos: 5 }, RITMO_PREDETERMINADO)
    expect(r.conceptIds).toHaveLength(2)
    expect(r.preguntas).toHaveLength(1)
  })
  it('offers an explicitly partial session when no question fits the topic', async () => {
    const revisar = vi.fn().mockResolvedValue({ estado: 'ok', ids: ['c-alpha'], sinRevisar: 1 })
    const r = await resolverSesion({ consulta: c, pedido: 'tema alfa', fichas, ritmo: RITMO_PREDETERMINADO, revisar })
    expect(r).toMatchObject({ estado: 'lista', incompleta: 'preguntas', aviso: expect.stringContaining('No encontré preguntas verificables') })
  })
  it('cancels and does not call an unchecked result complete', async () => {
    const control = new AbortController()
    const revisar = vi.fn(async () => { control.abort(); return { estado: 'ok' as const, ids: ['c-alpha'], sinRevisar: 1 } })
    const r = await resolverSesion({ consulta: c, pedido: 'tema alfa', fichas, ritmo: RITMO_PREDETERMINADO, revisar, signal: control.signal })
    expect(revisar).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ estado: 'sin_ia', motivo: 'Se canceló la búsqueda.' })
  })
})
