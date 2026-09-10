/** Versión persistida con cada intento para poder revisar su calificación. */
export const EVALUADOR_VERSION = '2.0.0'

/** Normaliza la presentación sin borrar letras griegas, signos ni cifras clínicas. */
export function normalizar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/µ/g, 'μ').replace(/−/g, '-')
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
 * Compara la respuesta del estudiante con la canónica y sus sinónimos.
 * Sólo la respuesta exacta o un sinónimo declarado recibe crédito automático.
 * La similitud de escritura no demuestra equivalencia médica: «IgG/IgM» y
 * «hipo/hiper» pueden diferir en una letra. Lo no reconocido queda por revisar,
 * sin inventar un error conceptual ni una errata. `ortografia` se conserva para
 * historiales y para una revisión explícita del resultado.
 */
export function evaluarTexto(entrada: string, canonica: string, sinonimos: string[] = [],
                             incorrectasCercanas: string[] = []): Veredicto {
  const e = normalizar(entrada)
  if (!e) return 'revision'
  const candidatos = [canonica, ...sinonimos].map(normalizar).filter(Boolean)
  for (const c of candidatos) if (e === c) return 'correcta'

  if (incorrectasCercanas.map(normalizar).some(t => t && t === e)) return 'incorrecta'

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
