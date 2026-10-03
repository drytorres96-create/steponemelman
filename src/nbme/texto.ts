/**
 * Presentación del texto importado del banco privado.
 *
 * El material llega de una extracción OCR de PDF y conserva defectos de esa
 * extracción: guiones partidos, puntuación separada, saltos de línea a mitad
 * de frase y tablas de laboratorio desarmadas en dos columnas consecutivas.
 *
 * Regla que gobierna este módulo: se corrige la TIPOGRAFÍA y se reconstruye la
 * ESTRUCTURA, nunca el contenido. No se reescribe ningún dígito, unidad ni
 * término médico, y no se completa lo que la fuente no trae. Un valor cuya
 * lectura es dudosa se marca para que el estudiante lo verifique; no se
 * sustituye por una suposición.
 */

export interface FilaLaboratorio {
  etiqueta: string
  valor: string
  /** La lectura del valor es dudosa en la fuente; no se corrige, se advierte. */
  dudoso: boolean
}

export type BloqueTexto =
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'laboratorio'; encabezado: string; filas: FilaLaboratorio[] }
  | { tipo: 'tabla'; columnas: string[]; filas: string[][] }

/** Valores de laboratorio cualitativos que aparecen como texto, no como cifra. */
const CUALITATIVOS = /^(present|absent|increased|decreased|elevated|reduced|normal|negative|positive|trace|none|nonreactive|reactive|not detected|detected|within normal limits)\b/i

/** Lecturas que el OCR dejó ilegibles: letras incrustadas en cifras, signos imposibles. */
const LECTURA_DUDOSA = /[A-Za-z]{2}\d|\d[A-Za-z]{2}(?![a-z])|\^(?![+-]?\d)|\.'|\d:[A-Za-z]|[A-Za-z]:\d|\bQQ|[|]{2}/

/**
 * Defectos de extracción que afectan a un dato clínico, no solo a su tipografía:
 * una edad, una unidad de recuento o una cifra que la fuente dejó ilegible.
 * Se detectan para advertir al estudiante; no se corrigen por suposición.
 */
const DEFECTOS_DE_LECTURA: { patron: RegExp; motivo: string }[] = [
  { patron: /\d\s*[A-Z]\s*-\s*(year|month|week|day)/g, motivo: 'edad' },
  { patron: /\/\s*mm\s*[^³23\s]/g, motivo: 'unidad de recuento' },
  { patron: /\bQQ|\^(?![+-]?\d)|\.'(?=\s*(?:dL|mL|L|kg|mm))/g, motivo: 'símbolo ilegible' },
]

/**
 * Fragmentos del texto cuya lectura es dudosa en la fuente importada.
 * Una lista no vacía significa que la pregunta debe contrastarse con el PDF
 * antes de fiarse de sus cifras.
 */
export function detectarLecturasDudosas(texto: string): string[] {
  const encontrados = new Set<string>()
  for (const { patron } of DEFECTOS_DE_LECTURA) {
    for (const coincidencia of texto.matchAll(patron)) {
      encontrados.add(coincidencia[0].trim())
      if (encontrados.size >= 6) return [...encontrados]
    }
  }
  return [...encontrados]
}

/** Shared by import verification, the API and cached-question grading. */
export function preguntaConLecturasDudosas(question: { stem: string; options: { text: string }[] }): boolean {
  return detectarLecturasDudosas(question.stem).length > 0
    || question.options.some(option => detectarLecturasDudosas(option.text).length > 0)
    || analizarEnunciado(question.stem).some(block => block.tipo === 'laboratorio' && block.filas.some(row => row.dudoso))
}

/** Marcadores que introducen un bloque tabular en el enunciado. */
const ENCABEZADO_TABLA = /(studies show|laboratory studies|show|shows|results?|values?|findings(?: are)?|phenotype|serum|urine|arterial blood gas analysis(?: on [^:]+)?)\s*:\s*$/i
const SUBENCABEZADO_TABLA = /^(serum|urine|arterial blood gas analysis(?: on [^:]+)?):?$/i

/** A row already transcribed as a literal label/value pair; no inferred units. */
function filaEnLinea(linea: string): FilaLaboratorio | null {
  if (linea.includes('?') || linea.includes('|') || linea.length > 160) return null
  const explicita = /^([^:]{1,80}):\s*(.{1,80})$/.exec(linea)
  const separada = /^(.{1,80}?)\s+([<>≤≥±+-]?\s*\d.{0,70}|↑|↓|↔|negative|positive|absent|present|none|normal|increased|decreased|few|red-brown)$/.exec(linea)
  const par = explicita ?? separada
  if (!par || !pareceEtiqueta(par[1]) || /[.!?]$/.test(par[2])) return null
  return { etiqueta: par[1], valor: par[2], dudoso: LECTURA_DUDOSA.test(par[2]) }
}

/** Pipe-delimited columns have explicit boundaries, including a blank corner. */
function tablaColumnas(lineas: string[], inicio: number): { bloque: BloqueTexto; fin: number } | null {
  let fin = inicio
  const celdas: string[][] = []
  while (fin < lineas.length && lineas[fin].includes('|') && !lineas[fin].includes('?') && !/^Option columns:/i.test(lineas[fin])) {
    celdas.push(lineas[fin].split('|').map(celda => celda.trim()))
    fin++
  }
  if (celdas.length < 2) return null
  const [columnas, ...filas] = celdas
  const ancho = filas[0].length
  if (!filas.every(fila => fila.length === ancho)) return null
  if (columnas.length === ancho - 1) columnas.unshift('')
  if (columnas.length !== ancho || columnas.length < 2) return null
  return { bloque: { tipo: 'tabla', columnas, filas }, fin }
}

/**
 * Correcciones tipográficas dentro de una línea. No alteran cifras ni palabras:
 * solo reparan separaciones que la extracción introdujo.
 */
export function normalizarLinea(linea: string): string {
  return linea
    // Espacios no separables y tabulaciones de la extracción.
    .replace(/[   \t]/g, ' ')
    // Comillas y guiones tipográficos desbalanceados por el OCR.
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Edades partidas: «57-year- old», «1 -year- old», «6 -month-old».
    .replace(/(\d+)\s*-\s*(year|month|week|day|hour)\s*-\s*old/gi, '$1-$2-old')
    // Palabra partida por un guión con espacios alrededor: «high- grade».
    .replace(/([a-záéíóúñ])\s*-\s+([a-záéíóúñ])/gi, '$1-$2')
    // Unidades con el exponente caído a la línea base: «mm 3» → «mm³».
    .replace(/\b(mm|cm)\s*3\b/g, '$1³')
    .replace(/\b(mm|cm|m)\s*2\b/g, '$1²')
    // Espacio introducido dentro de una unidad tras la barra: «/ mm³» → «/mm³».
    .replace(/\/\s+(mm³|mm²|mm|cm³|cm|dL|mL|L|kg|mg|µL|uL|mo?l)\b/g, '/$1')
    // Espacio sobrante antes de puntuación de cierre y de porcentaje.
    .replace(/\s+([,;:.!?%])/g, '$1')
    .replace(/\s+\)/g, ')')
    .replace(/\(\s+/g, '(')
    // Espacios múltiples y bordes.
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** Una línea que, por su forma, corresponde a la columna de valores de una tabla. */
function pareceValor(linea: string): boolean {
  const texto = linea.trim()
  if (!texto) return false
  if (CUALITATIVOS.test(texto)) return true
  // Empieza por cifra o comparador y es corta: «8 g/dL», «150,000/mm³», «<2%».
  return /^[<>≤≥+-]?\s*\d/.test(texto) && texto.length <= 60
}

/** Una línea que corresponde a la columna de etiquetas: tiene letras y no es un valor. */
function pareceEtiqueta(linea: string): boolean {
  const texto = linea.trim()
  return texto.length > 0 && texto.length <= 80 && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(texto) && !pareceValor(texto)
}

/**
 * Une los saltos que la extracción introdujo al ajustar el ancho de página.
 * Conserva los saltos que separan elementos de una tabla: no une cuando
 * cualquiera de las dos líneas tiene forma de valor, ni cuando la siguiente
 * empieza en mayúscula (una etiqueta o una frase nueva).
 */
function unirSaltosDeAjuste(lineas: string[]): string[] {
  const salida: string[] = []
  for (const linea of lineas) {
    const previa = salida[salida.length - 1]
    const continuaFrase = previa !== undefined
      && /[a-záéíóúñ,]$/.test(previa)
      && /^[a-záéíóúñ]/.test(linea)
      && !pareceValor(previa)
      && !pareceValor(linea)
    if (continuaFrase) salida[salida.length - 1] = `${previa} ${linea}`
    else salida.push(linea)
  }
  return salida
}

/**
 * Empareja un bloque de 2N líneas partido en N etiquetas seguidas de N valores.
 * Devuelve null si el bloque no encaja exactamente en esa forma: ante la duda
 * el texto se deja como está en la fuente, sin inventar correspondencias.
 */
function emparejarTabla(lineas: string[]): FilaLaboratorio[] | null {
  if (lineas.length < 4 || lineas.length % 2 !== 0) return null
  const mitad = lineas.length / 2
  const etiquetas = lineas.slice(0, mitad)
  const valores = lineas.slice(mitad)
  if (!etiquetas.every(pareceEtiqueta) || !valores.every(pareceValor)) return null
  return etiquetas.map((etiqueta, indice) => ({
    etiqueta,
    valor: valores[indice],
    dudoso: LECTURA_DUDOSA.test(valores[indice]),
  }))
}

/**
 * Convierte el enunciado en bloques presentables: párrafos de prosa y, cuando
 * la fuente lo permite reconstruir sin ambigüedad, tablas de laboratorio.
 */
export function analizarEnunciado(crudo: string): BloqueTexto[] {
  // Parse explicit rows before joining prose: a lowercase row label must never
  // become part of the preceding sentence or another table row.
  const lineas = crudo.split('\n').map(normalizarLinea).filter(linea => linea.length > 0)
  const bloques: BloqueTexto[] = []
  let indice = 0
  while (indice < lineas.length) {
    const linea = lineas[indice]
    const columnas = tablaColumnas(lineas, indice)
    if (columnas) {
      bloques.push(columnas.bloque)
      indice = columnas.fin
      continue
    }
    const encabezado = ENCABEZADO_TABLA.test(linea) || SUBENCABEZADO_TABLA.test(linea)
    if (encabezado) {
      const partes = /^(.*\S)\s+((?:Laboratory (?:studies|findings)|Serum studies|Urinalysis|Arterial blood gas analysis)[^:]*:)$/i.exec(linea)
      const agregarTabla = (filas: FilaLaboratorio[]) => {
        if (partes) bloques.push({ tipo: 'parrafo', texto: partes[1] })
        bloques.push({ tipo: 'laboratorio', encabezado: partes?.[2] ?? linea, filas })
      }
      const filasEnLinea: FilaLaboratorio[] = []
      let finEnLinea = indice + 1
      while (finEnLinea < lineas.length) {
        const fila = filaEnLinea(lineas[finEnLinea])
        if (!fila) break
        filasEnLinea.push(fila)
        finEnLinea++
      }
      if (filasEnLinea.length) {
        agregarTabla(filasEnLinea)
        indice = finEnLinea
        continue
      }
      // El bloque tabular va desde la línea siguiente hasta la frase que cierra
      // el enunciado (la pregunta) o hasta una línea de prosa larga.
      let fin = indice + 1
      while (fin < lineas.length && !lineas[fin].includes('?') && (pareceEtiqueta(lineas[fin]) || pareceValor(lineas[fin]))) fin++
      const filas = emparejarTabla(lineas.slice(indice + 1, fin))
      if (filas) {
        agregarTabla(filas)
        indice = fin
        continue
      }
    }
    bloques.push({ tipo: 'parrafo', texto: linea })
    indice++
  }
  return fusionarParrafos(bloques)
}

/** Agrupa párrafos contiguos en uno solo: la prosa del enunciado es continua. */
function fusionarParrafos(bloques: BloqueTexto[]): BloqueTexto[] {
  const salida: BloqueTexto[] = []
  for (const bloque of bloques) {
    const previo = salida[salida.length - 1]
    if (bloque.tipo === 'parrafo' && previo?.tipo === 'parrafo') {
      salida[salida.length - 1] = { tipo: 'parrafo', texto: `${previo.texto} ${bloque.texto}` }
    } else salida.push(bloque)
  }
  return salida
}

/**
 * Texto corrido para opciones, explicaciones y objetivos: misma tipografía que
 * el enunciado, sin reconstrucción tabular.
 */
export function normalizarTexto(crudo: string): string {
  return unirSaltosDeAjuste(
    crudo.split('\n').map(normalizarLinea).filter(linea => linea.length > 0),
  ).join('\n')
}

/** Preserve explicitly named option columns; fall back if any row is ambiguous. */
export function analizarColumnasOpciones(stem: string, opciones: { id: string; text: string }[]) {
  const cabecera = /\n\s*Option columns:\s*([^\n]+)\s*$/i.exec(stem)
  if (!cabecera) return null
  const columnas = cabecera[1].replace(/\.$/, '').split('|').map(s => normalizarLinea(s))
  if (columnas.length < 2 || columnas.some(s => !s)) return null
  const filas: Record<string, string[]> = {}
  for (const opcion of opciones) {
    const texto = normalizarTexto(opcion.text)
    const celdas = texto.includes('|') ? texto.split('|').map(s => s.trim())
      : texto.includes(';') ? texto.split(';').map(s => s.replace(/^[^:]+:\s*/, '').trim())
        : /^(?:positive|negative|zero)(?:\s+(?:positive|negative|zero))+$/i.test(texto) ? texto.split(/\s+/) : []
    if (celdas.length !== columnas.length || celdas.some(s => !s)) return null
    filas[opcion.id] = celdas
  }
  return { enunciado: stem.slice(0, cabecera.index), columnas, filas }
}
