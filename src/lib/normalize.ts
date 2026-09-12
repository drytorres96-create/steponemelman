/** Versión persistida con cada intento para poder revisar su calificación. */
export const EVALUADOR_VERSION = '2.2.0'

/** Normaliza la presentación sin borrar letras griegas, signos ni cifras clínicas. */
export function normalizar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/µ/g, 'μ').replace(/[−‐‑‒–—]/g, '-')
    .replace(/(\d)[.,](\d)/g, '$1\u00b7$2')        // protege el separador decimal
    .replace(/[^\p{L}\p{N}\p{S}+\-/%:\u00b7 ]/gu, ' ')
    .replace(/\u00b7/g, '.')
    .replace(/\s+/g, ' ').trim()
}

/** Distancia de Levenshtein acotada, para distinguir error ortográfico de error conceptual. */
export function distancia(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n; if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

export type Veredicto = 'correcta' | 'parcial' | 'ortografia' | 'incorrecta' | 'revision'

/**
 * Variantes de escritura de un mismo término, sin buscar coincidencias parciales.
 * Un guion entre palabras no distingue «Shine-Dalgarno» de «Shine Dalgarno»;
 * los signos de carga, los números, las negaciones y las letras griegas distintas sí.
 * Las grafías alfa/alpha y el símbolo α designan la misma letra, no un sinónimo
 * médico inferido. No sustituimos abreviaturas ambiguas como a/b ni quitamos palabras.
 */
function claveTexto(s: string): string {
  const griegas: Record<string, string> = {
    α: 'alfa', β: 'beta', γ: 'gamma', δ: 'delta', κ: 'kappa', λ: 'lambda',
  }
  return normalizar(s)
    .replace(/[αβγδκλ]/g, letra => griegas[letra])
    .replace(/\balpha\b/g, 'alfa')
    .replace(/(?<=\p{L})-(?=\p{L})/gu, ' ')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Compara la respuesta del estudiante con la canónica y sus sinónimos.
 * Sólo la respuesta exacta o un sinónimo declarado recibe crédito automático.
 * La similitud de escritura no demuestra equivalencia médica: «IgG/IgM» y
 * «hipo/hiper» pueden diferir en una letra. Lo no reconocido queda por revisar,
 * sin inventar un error conceptual ni una errata. `ortografia` se conserva para
 * historiales y para una revisión explícita del resultado.
 *
 * Excepción acotada y explícita: una única edición en un término largo, con las cifras intactas y
 * sin ambigüedad frente a los distractores cercanos, es una errata y no un error conceptual. Sin
 * esto, `ortografia` era inalcanzable, la cola de «por revisar» no se vaciaba nunca y la fijación
 * ortográfica no llegaba a mostrarse.
 */
/** Por debajo de esta longitud, una sola letra ya distingue términos distintos (IgG, alfa, K+). */
export const LONGITUD_MINIMA_ORTOGRAFIA = 6

/**
 * Letras que se confunden al ESCRIBIR en español y no cambian el término: s/z/c, b/v, g/j, y/i,
 * k/q/c, m/n. Una sustitución entre ellas es una errata. Cualquier otra sustitución puede cambiar
 * la molécula —«L-DOPA» frente a «D-DOPA»— y no se acepta.
 */
const PARES_CONFUSOS = [['s', 'z'], ['s', 'c'], ['z', 'c'], ['b', 'v'], ['g', 'j'],
                        ['y', 'i'], ['k', 'q'], ['k', 'c'], ['m', 'n']] as const

/**
 * Una errata ortográfica, no una edición cualquiera. Admite una sustitución entre letras
 * confundibles, o sobrar/faltar una hache, que en español no suena. NO admite truncamientos ni
 * inserciones de otras letras: «fenoxibenzamin» no es «fenoxibenzamina» escrita mal, es una
 * respuesta incompleta, y quien la juzgue debe ser la revisión y no el corrector.
 */
export function esErrataOrtografica(a: string, b: string): boolean {
  if (a === b || !a || !b) return false
  if (a.length === b.length) {
    let i = 0
    while (i < a.length && a[i] === b[i]) i++
    let j = a.length - 1
    while (j > i && a[j] === b[j]) j--
    if (i !== j) return false
    return PARES_CONFUSOS.some(([x, y]) => (a[i] === x && b[i] === y) || (a[i] === y && b[i] === x))
  }
  if (Math.abs(a.length - b.length) !== 1) return false
  const [corto, largo] = a.length < b.length ? [a, b] : [b, a]
  let k = 0
  while (k < corto.length && corto[k] === largo[k]) k++
  return largo[k] === 'h' && corto.slice(k) === largo.slice(k + 1)
}

export function evaluarTexto(entrada: string, canonica: string, sinonimos: string[] = [],
                             incorrectasCercanas: string[] = []): Veredicto {
  const e = claveTexto(entrada)
  if (!e) return 'revision'
  const candidatos = [canonica, ...sinonimos].map(claveTexto).filter(Boolean)
  for (const c of candidatos) if (e === c) return 'correcta'

  if (incorrectasCercanas.map(claveTexto).some(t => t && t === e)) return 'incorrecta'

  // Contrastes limitados y explícitos; nunca inferimos equivalencia por longitud.
  const negacion = /^(?:no es |no |not |not a )/
  const contrastes = [['aumenta', 'disminuye'], ['aumento', 'disminucion'], ['sube', 'baja'],
    ['↑', '↓'], ['positivo', 'negativo'], ['positive', 'negative'],
    ['hipotiroidismo', 'hipertiroidismo'], ['hipocalcemia', 'hipercalcemia'],
    ['hiponatremia', 'hipernatremia'], ['hipokalemia', 'hiperkalemia']]
  for (const c of candidatos) {
    if ((negacion.test(e) && e.replace(negacion, '') === c)
        || (negacion.test(c) && c.replace(negacion, '') === e)) return 'incorrecta'
    if (/^ig[agmed]$/.test(e) && /^ig[agmed]$/.test(c) && e !== c) return 'incorrecta'
    if (contrastes.some(([a, b]) => (e === a && c === b) || (e === b && c === a))) return 'incorrecta'
  }

  // Errata, sólo tras descartar todos los contrastes anteriores y con guardarraíles estrictos.
  const cercanas = incorrectasCercanas.map(claveTexto).filter(Boolean)
  const letras = (t: string) => t.replace(/[^\p{L} ]/gu, '')
  const cifras = (t: string) => (t.match(/\d+(?:\.\d+)?/g) ?? []).join('|')
  for (const c of candidatos) {
    if (c.length < LONGITUD_MINIMA_ORTOGRAFIA) continue      // términos cortos: una letra ya decide
    if (cifras(e) !== cifras(c)) continue                    // un dígito cambiado nunca es una errata
    if (!esErrataOrtografica(e, c)) continue                 // sólo confusiones de escritura
    if (letras(e) === letras(c)) continue                    // difieren sólo en signo o símbolo
    if (cercanas.some(t => distancia(e, t) <= 1)) continue   // igual de cerca de un distractor
    if (candidatos.some(o => o !== c && distancia(e, o) <= 1)) continue
    return 'ortografia'
  }
  return 'revision'
}

function leerCantidad(s: string): { numero: number; unidad: string } | null {
  const limpio = s.trim().replace(/−/g, '-').replace(/,/g, '.')
  const m = limpio.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:\s*\/\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+))?)\s*([^\d]*)$/i)
  if (!m) return null
  const partes = m[1].split('/').map(Number)
  const numero = partes.length === 2 ? partes[0] / partes[1] : partes[0]
  return Number.isFinite(numero) ? { numero, unidad: m[2].trim() } : null
}

/** La escala y las unidades explícitas deben coincidir; no adivinamos conversiones. */
export function evaluarNumero(entrada: string, esperado: string, tolerancia?: number | null,
                              unidadEsperada?: string | null): Veredicto {
  const a = leerCantidad(entrada), b = leerCantidad(esperado)
  if (!a || !b) return 'revision'
  const unidad = (s: string) => s.normalize('NFC').replace(/µ/g, 'μ').replace(/\s+/g, '')
  const u = unidad(unidadEsperada || b.unidad)
  if (a.unidad && !u) return 'revision'
  if (a.unidad && unidad(a.unidad) !== u) return 'incorrecta'
  // Si la interfaz muestra la unidad, introducir sólo el número usa esa unidad.
  if (unidadEsperada && b.unidad && unidad(b.unidad) !== unidad(unidadEsperada)) return 'revision'
  if (tolerancia != null && (!Number.isFinite(tolerancia) || tolerancia < 0)) return 'revision'
  const tol = tolerancia ?? Math.max(Math.abs(b.numero) * 0.02, 0.01)
  if (Math.abs(a.numero - b.numero) <= tol) return 'correcta'
  if (Math.abs(a.numero - b.numero) <= tol * 5) return 'parcial'
  return 'incorrecta'
}
