import { z } from 'zod'
import { MAX_CITA_RECUPERACION, PREFIJO_FALSO, validarRecuperacionNbme, type EjercicioRecuperacion,
  type FuenteRecuperacion, type RecuperacionNbme } from './recuperacion-nbme'

/** Candidate IDs identify server-owned text; the model cannot supply medical statements. */
export type CatalogoRecuperacion = { objetivo: string; ejercicios: EjercicioRecuperacion[] }
const MAX_CANDIDATOS = 36
const MAX_CITA_CORTA = 200
const normalizar = (t: string) => t.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
const SeleccionZ = z.object({ ejercicios: z.array(z.string().regex(/^e-[1-9]\d?$/)).min(3).max(6) }).strict()

// These words do not identify the mechanism, structure, target or consequence being recalled.
const FUNCIONALES = new Set(`a an the and or but nor for yet so to of in on at by as from with without
  into onto over under through during before after between among about against within than that this
  these those it its they their them he his she her you your we our who whom whose which what when
  where why how if unless until while whereas although though because therefore thus hence also
  not no none neither either both all any some such each every other another same only very more
  most less least much many several few may might can could should would will shall must do does
  did done doing be been being is are was were has have had having there here then now often usually
  typically generally commonly particularly especially respectively include includes including
  associated association patient patients man woman year years old age aged study studies shown
  show shows found finding findings seen following given result results resulting leads lead
  due occurs occur caused cause causes causing presents present presentation clinical characteristic
  characteristics characterized common uncommon rare normal abnormal abnormality abnormalities
  increased increase increases decreased decrease decreases higher lower low high elevated reduced
  important particular specific certain likely least most known involved involves involve example
  examples answer option options statement statements question questions explanation objective
  educational figure figures table tables see note notes described determined indicates indicate
  however additionally subsequently initially finally these such regarding related called termed
  activate activates activated activating inhibit inhibits inhibited inhibiting reduce reduces reducing
  stimulate stimulates stimulated stimulating convert converts converted converting produce produces
  produced producing bind binds bound binding release releases released releasing secrete secretes
  secreted secreting mediate mediates mediated mediating form forms formed forming induce induces
  induced inducing express expresses expressed expressing increasing decreasing require requires
  required requiring allow allows allowed allowing block blocks blocked blocking cleave cleaves
  cleaved cleaving hydrolyze hydrolyzes hydrolyzed hydrolyzing maintain maintains maintained maintaining
  one two three four five six seven eight nine ten first second third fourth fifth sixth`.split(/\s+/))
const ABREVIATURA = /(?:\b(?:e\.g|i\.e|etc|vs|fig|no|dr|mr|mrs|ms|prof|st|approx)|\b[A-Z])\.$/i
const INSTRUCCION_DOCENTE = /^(?:Educational objective:\s*)?(?:identify|recognize|distinguish|explain|describe|select|determine|understand|recall|learn|remember|compare|list|review|note|see)\b/i
const CLAUSULA_DEPENDIENTE = /^(?:which|that|whose|whom|and|or|including|such as)\b/i
const ANAFORA = /^(?:(?:it|its|they|their|them|he|his|she|her|this|these|that|those|such|both|the former|the latter)\b|(?:due to|because of|as a result of|in response to|owing to|for|by|with|without|following)\s+(?:this|these|that|those|its|their)\b|(?:from|to|at)\s+(?:here|there)\b)/i

/** Whole authored sentences only: no truncation, whitespace rewriting or detached negations. */
function oraciones(fragment: string, limiteContexto: number): string[] {
  const segmentador = new Intl.Segmenter('en', { granularity: 'sentence' })
  // ICU can retain several sentences in one segment when the next starts with β/β₂.
  // Refine only punctuation boundaries; the abbreviation merge below restores S. pyogenes.
  const partes: string[] = []
  for (const { segment } of segmentador.segment(fragment)) for (const parte of segment.split(/(?<=[.!?])(?=\s+)/u)) {
    // Keep a segment's trailing whitespace with its preceding text. A whitespace-only
    // token must not hide that the following ICU sentence starts with an anaphora.
    if (!parte.trim() && partes.length) partes[partes.length - 1] += parte
    else partes.push(parte)
  }
  const completas: string[] = []
  let actual = ''
  for (let i = 0; i < partes.length; i++) {
    actual += partes[i]
    const texto = actual.trim()
    if (i < partes.length - 1 && (ABREVIATURA.test(texto) || !/[.!?][\s"'’”)]*$/.test(texto)
      || CLAUSULA_DEPENDIENTE.test(partes[i + 1].trim()))) continue
    if (texto) completas.push(texto)
    actual = ''
  }
  if (actual.trim()) completas.push(actual.trim())
  const respaldadas: string[] = []
  let cursor = 0, inicioAntecedente: number | null = null
  for (const frase of completas) {
    const inicio = fragment.indexOf(frase, cursor)
    if (inicio < 0) continue
    cursor = inicio + frase.length
    if (ANAFORA.test(frase)) {
      // Keep the whole preceding chain, not just the most recent pronoun-led sentence.
      // If it no longer fits, omit the dependent action; its independent antecedent
      // remains available. The slice uses authored boundaries and original whitespace.
      if (inicioAntecedente !== null) {
        const contexto = fragment.slice(inicioAntecedente, cursor)
        if (contexto.length <= limiteContexto) respaldadas.push(contexto)
      }
    } else {
      respaldadas.push(frase)
      inicioAntecedente = CLAUSULA_DEPENDIENTE.test(frase) ? null : inicio
    }
  }
  return respaldadas
}

function respuestaAdmisible(respuesta: string, evidencia: string): boolean {
  return respuesta === respuesta.trim() && respuesta.length >= 2 && respuesta.length <= 65
    && respuesta.split(/\s+/).length <= 6 && evidencia.split(respuesta).length === 2
    && evidencia.replace(respuesta, '____').length >= 15
    && /\p{L}/u.test(respuesta) && !FUNCIONALES.has(normalizar(respuesta))
}

/** Literal terms retain original spelling, symbols and line breaks. No aliases are generated. */
function terminos(evidencia: string, originales: string[]): string[] {
  const opciones = originales.filter(r => respuestaAdmisible(r, evidencia))
  const compuestos = [...evidencia.matchAll(/(?:[\p{L}\p{N}][\p{L}\p{N}⁺⁻+/'’−–-]*\s+){0,3}(?:receptors?|channels?|exchangers?|kinases?|cyclases?|proteins?|enzymes?|hormones?|transporters?|antigens?|antibodies?|inhibitors?)/giu)]
    .map(m => {
      const palabras = [...m[0].matchAll(/\S+/g)]
      const ultimaFuncional = palabras.filter(p => FUNCIONALES.has(normalizar(p[0]))).at(-1)
      return ultimaFuncional ? m[0].slice(ultimaFuncional.index! + ultimaFuncional[0].length).trim() : m[0]
    }).filter(r => respuestaAdmisible(r, evidencia))
  const palabras = [...evidencia.matchAll(/[\p{L}\p{N}][\p{L}\p{N}⁺⁻+/'’−–-]*/gu)].map(m => m[0])
    .filter(r => respuestaAdmisible(r, evidencia) && (r.length >= 4 || /^[A-Z\p{N}⁺⁻+/'’−–-]{2,}$/u.test(r)))
    .sort((a, b) => Number(/(?:receptor|ase|itis|osis|genic|ergic|bacter|coccus|vir|thyro|adren|cardi|neuro|horm|immun|glyc|prot|nucle|renal|vasc)/i.test(b))
      - Number(/(?:receptor|ase|itis|osis|genic|ergic|bacter|coccus|vir|thyro|adren|cardi|neuro|horm|immun|glyc|prot|nucle|renal|vasc)/i.test(a))
      || b.length - a.length || evidencia.indexOf(a) - evidencia.indexOf(b))
  return [...new Set([...opciones, ...compuestos, ...palabras])].slice(0, 6)
}

function alternativas(respuesta: string, originales: string[]): string[] | null {
  if (!originales.includes(respuesta)) return null
  const usadas = new Set([normalizar(respuesta)])
  const otras = originales.filter(r => {
    const n = normalizar(r), correcta = normalizar(respuesta)
    if (!n || r.length > 180 || usadas.has(n) || n.includes(correcta) || correcta.includes(n)) return false
    usadas.add(n); return true
  }).slice(0, 5)
  return otras.length ? [respuesta, ...otras] : null
}

function sinMetadatos(e: EjercicioRecuperacion) {
  const { id: _id, source: _source, ...contenido } = e
  return contenido
}

function validarLote(objetivo: string, ejercicios: EjercicioRecuperacion[], fuentes: FuenteRecuperacion[],
  alternativasOriginales: string[]): RecuperacionNbme | null {
  return validarRecuperacionNbme({ response: { objetivo, ejercicios: ejercicios.map(sinMetadatos) } },
    fuentes.map(f => f.fragment).join('\n'), alternativasOriginales, fuentes)
}

/** Builds bounded retrieval material before inference; unusable sources never become questions. */
export function crearCatalogoRecuperacion(fuentes: FuenteRecuperacion[], alternativasOriginales: string[],
  objetivoOriginal?: string, respuestaCorrecta?: string): CatalogoRecuperacion | null {
  // Keep the short practice unchanged whenever it already supports a valid finite lot.
  // Only an unusable short catalogue gets a second pass with complete longer context.
  return crearCatalogoHasta(fuentes, alternativasOriginales, MAX_CITA_CORTA, objetivoOriginal, respuestaCorrecta)
    ?? crearCatalogoHasta(fuentes, alternativasOriginales, MAX_CITA_RECUPERACION, objetivoOriginal, respuestaCorrecta)
}

function crearCatalogoHasta(fuentes: FuenteRecuperacion[], alternativasOriginales: string[], limiteCita: number,
  objetivoOriginal?: string, respuestaCorrecta?: string): CatalogoRecuperacion | null {
  const primera = fuentes[0]?.fragment
  if (!primera) return null
  const propuesto = objetivoOriginal?.trim()
  const objetivoLiteral = propuesto && primera.includes(propuesto) ? propuesto : undefined
  const palabrasClave = (respuestaCorrecta?.match(/[\p{L}][\p{L}-]{3,}/gu) ?? [])
    .filter(p => !FUNCIONALES.has(normalizar(p)))
  const nombreBinomial = respuestaCorrecta?.match(/^([\p{Lu}][\p{L}-]+)\s+([\p{Ll}][\p{L}-]+)/u)
  const abreviada = nombreBinomial ? `${nombreBinomial[1][0]}. ${nombreBinomial[2]}` : undefined
  const relevancia = (texto: string) => {
    const t = normalizar(texto)
    return palabrasClave.reduce((score, p) => score + (t.includes(normalizar(p)) ? 20 : 0), 0)
      + (respuestaCorrecta && t.includes(normalizar(respuestaCorrecta)) ? 50 : 0)
      + (abreviada && t.includes(normalizar(abreviada)) ? 20 : 0)
  }
  const frasesObjetivo = objetivoLiteral ? oraciones(objetivoLiteral, limiteCita) : []
  const objetivos = frasesObjetivo.filter(o => o.length >= 15 && o.length <= 350 && !o.endsWith('?'))
    .sort((a, b) => relevancia(b) - relevancia(a) || frasesObjetivo.indexOf(b) - frasesObjetivo.indexOf(a))
  const objetivo = objetivoLiteral && objetivoLiteral.length >= 15 && objetivoLiteral.length <= 350
    ? objetivoLiteral : objetivos[0] ?? oraciones(primera, limiteCita).find(o => o.length >= 15 && o.length <= 350 && !o.endsWith('?'))
  if (!objetivo) return null
  const opcionesPrioritarias = respuestaCorrecta && alternativasOriginales.includes(respuestaCorrecta)
    ? [respuestaCorrecta, ...alternativasOriginales.filter(o => o !== respuestaCorrecta)] : alternativasOriginales
  const porFuente = fuentes.slice(0, 4).map((f, i) => {
    // The NBME objective is a separate authored field, even when an explanation lacks a final dot.
    // Separating that known boundary prevents merging two fields into an unusably long sentence.
    const inicioObjetivo = i === 0 && objetivoLiteral ? f.fragment.lastIndexOf(objetivoLiteral) : -1
    const partes = inicioObjetivo >= 0 ? [f.fragment.slice(0, inicioObjetivo), objetivoLiteral!,
      f.fragment.slice(inicioObjetivo + objetivoLiteral!.length)] : [f.fragment]
    return partes.flatMap(p => oraciones(p, limiteCita))
      .filter(o => o.length >= 15 && o.length <= limiteCita && !o.endsWith('?')
        && !INSTRUCCION_DOCENTE.test(o) && !CLAUSULA_DEPENDIENTE.test(o) && !ANAFORA.test(o)
        && terminos(o, opcionesPrioritarias).length > 0)
      .sort((a, b) => {
        const score = (t: string) => relevancia(t) + (i === 0 && objetivoLiteral?.includes(t)
          ? 1000 + Math.max(0, frasesObjetivo.indexOf(t)) * 30 : 0)
        return score(b) - score(a)
      }).slice(0, 6)
  })
  const citas: string[] = []
  // Keep the original objective foremost and reserve room for linked concepts.
  for (let fila = 0; fila < 6; fila++) for (const lista of porFuente) {
    const cita = lista[fila]
    if (cita && !citas.includes(cita)) citas.push(cita)
  }
  const ejercicios: EjercicioRecuperacion[] = []
  const preguntas = new Set<string>()
  const añadir = (e: Omit<EjercicioRecuperacion, 'id'>) => {
    if (ejercicios.length >= MAX_CANDIDATOS || preguntas.has(e.pregunta)) return
    preguntas.add(e.pregunta)
    ejercicios.push({ id: `e-${ejercicios.length + 1}`, ...e })
  }
  for (const [i, evidencia] of citas.entries()) {
    const respuestas = terminos(evidencia, opcionesPrioritarias)
    const respuestaOpcion = respuestas.find(r => alternativas(r, alternativasOriginales) !== null)
    if (respuestaOpcion) {
      const opciones = alternativas(respuestaOpcion, alternativasOriginales)!
      const discriminar = opciones.length === 2 || i % 2 === 1
      const elegidas = discriminar ? opciones.slice(0, 2) : opciones
      const desplazamiento = (discriminar ? Math.floor(i / 2) + 1 : i + 1) % elegidas.length
      const ordenadas = [...elegidas.slice(desplazamiento), ...elegidas.slice(0, desplazamiento)]
      añadir({ tipo: discriminar ? 'discriminar' : 'seleccion', pregunta: evidencia.replace(respuestaOpcion, '____'),
        respuesta: respuestaOpcion, alternativas: ordenadas,
        explicacion: evidencia, evidencia })
    }
    for (const respuesta of respuestas.filter(r => r !== respuestaOpcion).slice(0, 2)) {
      añadir({ tipo: 'completar', pregunta: evidencia.replace(respuesta, '____'), respuesta,
        explicacion: evidencia, evidencia })
    }
    const falso = i % 2 === 1
    añadir({ tipo: 'verdadero_falso', pregunta: falso ? PREFIJO_FALSO + evidencia : evidencia,
      respuesta: falso ? 'Falso' : 'Verdadero', explicacion: evidencia, evidencia })
    if (ejercicios.length >= MAX_CANDIDATOS) break
  }
  const catalogo = { objetivo, ejercicios }
  return elegirRecuperacionVerificada(catalogo, fuentes, alternativasOriginales) ? catalogo : null
}

/** A model selection can only reorder known IDs; every returned plan passes the original gate. */
export function resolverSeleccionRecuperacion(raw: unknown, catalogo: CatalogoRecuperacion,
  fuentes: FuenteRecuperacion[], alternativasOriginales: string[]): RecuperacionNbme | null {
  try {
    const response = (raw as { response?: unknown } | null)?.response
    const parsed = typeof response === 'string'
      ? JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/g, '')) : response
    const leido = SeleccionZ.safeParse(parsed)
    if (!leido.success || new Set(leido.data.ejercicios).size !== leido.data.ejercicios.length) return null
    const elegidos = leido.data.ejercicios.map(id => catalogo.ejercicios.find(e => e.id === id))
    if (elegidos.some(e => !e)) return null
    return validarLote(catalogo.objetivo, elegidos as EjercicioRecuperacion[], fuentes, alternativasOriginales)
  } catch { return null }
}

/** Finite fallback uses the same vetted catalogue; it never makes a second inference. */
export function elegirRecuperacionVerificada(catalogo: CatalogoRecuperacion, fuentes: FuenteRecuperacion[],
  alternativasOriginales: string[]): RecuperacionNbme | null {
  // Find a small valid seed instead of assuming that the first three candidates are diverse.
  for (let a = 0; a < catalogo.ejercicios.length; a++) for (let b = a + 1; b < catalogo.ejercicios.length; b++) {
    const primero = catalogo.ejercicios[a], segundo = catalogo.ejercicios[b]
    if (primero.tipo === segundo.tipo || primero.evidencia === segundo.evidencia) continue
    for (let c = 0; c < catalogo.ejercicios.length; c++) {
      if (c === a || c === b) continue
      const elegidos = [primero, segundo, catalogo.ejercicios[c]]
      if (!validarLote(catalogo.objetivo, elegidos, fuentes, alternativasOriginales)) continue
      const restantes = catalogo.ejercicios.filter(e => !elegidos.includes(e))
        .sort((x, y) => Number(elegidos.some(e => e.evidencia === x.evidencia)) - Number(elegidos.some(e => e.evidencia === y.evidencia))
          || Number(elegidos.some(e => e.tipo === x.tipo)) - Number(elegidos.some(e => e.tipo === y.tipo)))
      for (const extra of restantes) {
        if (elegidos.length === 6) break
        if (validarLote(catalogo.objetivo, [...elegidos, extra], fuentes, alternativasOriginales)) elegidos.push(extra)
      }
      return validarLote(catalogo.objetivo, elegidos, fuentes, alternativasOriginales)
    }
  }
  return null
}
